#!/usr/bin/env node
/**
 * wizzad-record — check a Wizzad study record without trusting Wizzad.
 *
 *   wizzad-record check <link>                          fetch the record and the published keys from the link's origin, verify
 *   wizzad-record check <record.json> --keys <keys.json>  the same, offline (keys.json = /api/proof/keys or the DID document)
 *   wizzad-record credential <credential.json> --keys <did.json|keys.json>
 *   wizzad-record file <path> <link|record.json> [--keys …]   hash a file you hold and look for it in the record
 *   wizzad-record reproduce <notebook.ipynb> <link|record.json> [--keys …] [--files <dir>] [--run [--python <python>]]
 *        check the record's notebook re-run: the notebook and its files by fingerprint, the submitted outputs digest
 *        recomputed from the notebook alone, and — with --run, which EXECUTES the notebook here — a run of your own
 *
 * Exit code 0 when everything checked is valid, 1 otherwise. Nothing but the
 * link's own origin is contacted, and only when a link (not a file) is given.
 */
import { readFile } from 'node:fs/promises';
import { verifyRecord, signatureOf, timeZonesIn } from '../src/record.js';
import { verifyCredential } from '../src/credential.js';
import { fingerprintFile, fingerprintsIn, matchFingerprint } from '../src/files.js';
import { fetchFromLink } from '../src/fetch.js';
import { keyRing, revocationOf } from '../src/keys.js';
import { BADGE, canonicalOutcomes, compareOutcomes, outcomesDigest, readNotebook, reproductionProblems, reproductionsIn, runOutcomes, submittedFor } from '../src/reproduce.js';
import { runNotebook } from '../src/run.js';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
/** Flags that take a value; `--run` does not. */
const VALUE_FLAGS = new Set(['--keys', '--files', '--python']);
const positional = args.slice(1).filter((a, i, arr) => !a.startsWith('--') && !(i > 0 && VALUE_FLAGS.has(arr[i - 1])));
const isLink = (s) => /^https?:\/\//.test(s);
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

function usage() {
  console.error(`usage:
  wizzad-record check <link>
  wizzad-record check <record.json> --keys <keys.json>
  wizzad-record credential <credential.json> --keys <did.json|keys.json>
  wizzad-record file <path> <link|record.json> [--keys <keys.json>]
  wizzad-record reproduce <notebook.ipynb> <link|record.json> [--keys <keys.json>] [--files <dir>] [--run [--python <python>]]`);
  process.exit(2);
}

/** The record + keys for a link or a file, and the ring built from both key documents when a link gave both. */
async function load(target) {
  if (isLink(target)) {
    const { record, keys, did } = await fetchFromLink(target);
    const ring = keyRing(keys);
    if (did) for (const [id, raw] of keyRing(did)) if (!ring.has(id)) ring.set(id, raw);
    return { record, ring, from: 'the link’s origin' };
  }
  const record = await readJson(target);
  const keysPath = flag('--keys');
  if (!keysPath) { console.error('offline check needs --keys <keys.json> (the /api/proof/keys reply or the issuer’s DID document)'); process.exit(2); }
  return { record, ring: keyRing(await readJson(keysPath)), from: keysPath };
}

async function main() {
  if (cmd === 'check' && positional[0]) {
    const { record, ring, from } = await load(positional[0]);
    const sig = signatureOf(record);
    const r = verifyRecord(record, ring);
    console.log(`record   ${r.valid ? 'VALID' : 'NOT VALID'}${r.reason ? ` — ${r.reason}` : ''}`);
    console.log(`key      ${sig?.keyId ?? '(none)'} · ${revocationOf(sig?.keyId, ring) ? `revoked from ${revocationOf(sig?.keyId, ring).revokedFrom}` : ring.has(sig?.keyId) ? 'published' : 'not published'} · keys from ${from}`);
    console.log(`digest   sha256(canonical payload) = ${r.canonicalSha256 ?? '(none)'}`);
    const p = record.payload ?? {};
    if (p.issuedAt) console.log(`issued   ${p.issuedAt}`);
    // The zones the record names (§3.1): the days beside each are days in it; none named means UTC days.
    const zones = timeZonesIn(p);
    console.log(`zones    ${zones.length ? zones.map((z) => `${z.path} = ${z.timeZone}`).join('; ') : 'none named: every day in the record is a UTC day'}`);
    if (p.recordId) console.log(`record   ${p.recordId}`);
    const fps = fingerprintsIn(p);
    if (fps.length) console.log(`files    ${fps.length} fingerprint(s) on record: ${fps.map((f) => `${f.path} = ${f.sha256.slice(0, 12)}…`).join('; ')}`);
    process.exit(r.valid ? 0 : 1);
  }
  if (cmd === 'credential' && positional[0]) {
    const keysPath = flag('--keys');
    if (!keysPath) { console.error('credential check needs --keys <did.json|keys.json>'); process.exit(2); }
    const [credential, keys] = await Promise.all([readJson(positional[0]), readJson(keysPath)]);
    const r = await verifyCredential(credential, keys);
    console.log(`credential ${r.valid ? 'VALID' : 'NOT VALID'}${r.reason ? ` — ${r.reason}` : ''}`);
    console.log(`method     ${credential?.proof?.verificationMethod ?? '(none)'}`);
    console.log(`issuer     ${credential?.issuer?.id ?? credential?.issuer ?? '(none)'} · issued ${credential?.validFrom ?? credential?.issuanceDate ?? '(unknown)'}`);
    if (credential?.credentialSubject?.achievement?.name) console.log(`achievement ${credential.credentialSubject.achievement.name}`);
    process.exit(r.valid ? 0 : 1);
  }
  if (cmd === 'file' && positional[0] && positional[1]) {
    const hex = await fingerprintFile(positional[0]);
    const { record, ring } = await load(positional[1]);
    const r = verifyRecord(record, ring);
    const hits = matchFingerprint(record.payload ?? {}, hex);
    console.log(`file     sha256 = ${hex}`);
    console.log(`record   ${r.valid ? 'VALID' : 'NOT VALID'}${r.reason ? ` — ${r.reason}` : ''}`);
    console.log(hits.length ? `match    on record at ${hits.map((h) => h.path).join(', ')}` : 'match    NONE — the record does not vouch for this file');
    process.exit(r.valid && hits.length ? 0 : 1);
  }
  if (cmd === 'reproduce' && positional[0] && positional[1]) process.exit(await reproduce(positional[0], positional[1]));
  usage();
}

const short = (hex) => `${hex.slice(0, 12)}…`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const cellList = (ns) => (ns.length === 1 ? `code cell ${ns[0]}` : `code cells ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`);
/** The first line of a cell's first differing output, for the eye. */
const glimpse = (o) => {
  const x = o?.outputs?.[0];
  if (!x) return '(nothing)';
  const t = x.kind === 'error' ? `${x.name}: ${x.value}` : x.text;
  const line = String(t).split('\n')[0];
  return `${x.kind === 'error' ? 'error ' : ''}${line.length > 70 ? `${line.slice(0, 69)}…` : line}${String(t).includes('\n') ? ' …' : ''}`;
};

/** The record's sentence about a reproduction, in the words its own page uses. */
function recordSays(r) {
  const how = [r.ranOn ? `on ${r.ranOn}` : null, r.network === 'none' ? 'no network' : r.network === 'open' ? 'with network' : null, r.runtime?.python ? `Python ${r.runtime.python}` : null].filter(Boolean).join(', ');
  const code = r.cells?.code ?? 0;
  const what = r.status === 'reproduced' ? `every one of its ${plural(code, 'code cell')} gave the outputs submitted`
    : r.status === 'ran' ? `${code - (r.cells?.differing ?? 0)} of ${plural(code, 'code cell')} matched${Array.isArray(r.cells?.differingAt) && r.cells.differingAt.length ? ` (${cellList(r.cells.differingAt)} differed)` : ''}`
    : `code cell ${r.cells?.failedAt ?? '?'} raised an error`;
  return `${BADGE[r.status] ?? r.status}: ${what}. Wizzad’s run${how ? `, ${how}` : ''}.`;
}

async function reproduce(notebookPath, target) {
  const { record, ring } = await load(target);
  const v = verifyRecord(record, ring);
  console.log(`record    ${v.valid ? 'VALID' : 'NOT VALID'}${v.reason ? ` — ${v.reason}` : ''}${v.keyId ? ` · key ${v.keyId}` : ''}`);
  if (!v.valid) { console.log('result    Not checked further: a re-run is only worth comparing with a record that verifies.'); return 1; }

  const bytes = await readFile(notebookPath);
  const hex = createHash('sha256').update(bytes).digest('hex');
  const payload = record.payload ?? {};
  const all = reproductionsIn(payload);
  const mine = all.filter((x) => String(x.reproduction.notebook.sha256).toLowerCase() === hex);
  if (mine.length === 0) {
    const named = all.find((x) => x.reproduction.notebook.file === notebookPath.split(/[\\/]/).pop());
    const held = matchFingerprint(payload, hex);
    console.log(`notebook  sha256 ${short(hex)}`);
    if (named) console.log(`result    NOT THIS FILE — the record re-ran a notebook named ${named.reproduction.notebook.file}, whose fingerprint is ${short(named.reproduction.notebook.sha256)}.`);
    else if (held.length) console.log(`result    The record holds this notebook (${held.map((h) => h.path).join(', ')}) but carries no re-run of it.`);
    else console.log(`result    The record does not vouch for this notebook${all.length ? `; it carries ${plural(all.length, 're-run')} of other notebooks` : ', and carries no re-run'}.`);
    return 1;
  }
  // Attempts at one project carry the same reproduction; each distinct one is checked once.
  const distinct = [...new Map(mine.map((x) => [JSON.stringify(x.reproduction), x])).values()];
  const r = distinct[0].reproduction;
  const where = mine.map((x) => `${x.title ? `“${x.title}”` : x.path}${x.sealedOn ? ` sealed ${x.sealedOn}${x.timeZone ? ` (${x.timeZone})` : ' (UTC)'}` : ''}`);
  console.log(`notebook  ${r.notebook.file} · sha256 ${short(hex)} · the notebook the record’s re-run used (${[...new Set(where)].join('; ')})`);
  if (distinct.length > 1) console.log(`note      The record carries ${distinct.length} different re-runs of this notebook; the first is checked here.`);

  // The files beside it, by the names the record gives them.
  const dir = flag('--files') ?? dirname(notebookPath);
  let filesOk = true;
  const files = [{ name: r.notebook.file, path: notebookPath }];
  for (const inp of r.inputs ?? []) {
    const p = join(dir, inp.file);
    if (!existsSync(p)) { filesOk = false; console.log(`input     ${inp.file} · MISSING — not found in ${dir}`); continue; }
    const got = await fingerprintFile(p);
    if (got !== String(inp.sha256).toLowerCase()) { filesOk = false; console.log(`input     ${inp.file} · DIFFERS — sha256 ${short(got)} is not the record’s ${short(inp.sha256)}`); continue; }
    console.log(`input     ${inp.file} · matches`);
    files.push({ name: inp.file, path: p });
  }

  // The submitted outputs, from the notebook alone.
  let json;
  try { json = JSON.parse(bytes.toString('utf8')); } catch { console.log('result    That file is not JSON, so not a notebook.'); return 1; }
  const read = readNotebook(json);
  if (!read.ok) { console.log(`result    The notebook could not be read: ${read.reason === 'unsupported_language' ? `its language is ${read.language}; only Python notebooks are re-run` : read.reason === 'no_code' ? 'it has no code cells' : 'it is not a notebook'}.`); return 1; }
  // Read with the rule the record's run used: `canon: 2`, or the first rule on a record that does not say.
  const submitted = submittedFor(r.canon, read.cells);
  const subDigest = outcomesDigest(submitted);
  const subOk = subDigest === String(r.outputs.submitted).toLowerCase();
  console.log(`submitted ${short(subDigest)} · ${subOk ? 'MATCHES the record' : `DIFFERS from the record’s ${short(r.outputs.submitted)}`} — recomputed from the notebook alone (${plural(read.cells.length, 'code cell')}, canonical form ${r.canon === 2 ? 2 : 1})`);
  const problems = reproductionProblems(r);
  for (const p of problems) console.log(`record    INCONSISTENT — ${p}`);
  console.log(`says      ${recordSays(r)}`);

  if (!args.includes('--run')) {
    const ok = filesOk && subOk && problems.length === 0;
    console.log(`result    ${ok ? 'The notebook, its files and its submitted outputs are the ones the record’s re-run used.' : 'Something above does not match the record.'} Add --run to run it yourself.`);
    return ok ? 0 : 1;
  }

  console.log('warning   --run executes this notebook’s code on this machine, with your permissions and your network.');
  if (!filesOk) { console.log('result    Not run: a run without every file on record, unchanged, would not be a run of what the record names.'); return 1; }
  const want = (r.runtime?.packages ?? []).filter((p) => !Array.isArray(r.runtime?.imported) || r.runtime.imported.length === 0 || r.runtime.imported.includes(String(p.name).toLowerCase()));
  const run = await runNotebook({ cells: read.cells, files, python: flag('--python') ?? 'python3', packages: want.map((p) => p.name) });
  if (run.fatal) {
    console.log(`result    Could not run it: ${run.fatal.reason === 'no_jupyter' ? 'this Python has no Jupyter kernel — pip install jupyter_client ipykernel' : run.fatal.reason === 'no_python' ? `no Python at “${flag('--python') ?? 'python3'}” — name one with --python` : `the kernel did not start (${run.fatal.detail})`}.`);
    return 1;
  }
  if (run.runtime) {
    const vs = want.map((p) => { const mine = run.runtime.packages?.[p.name]; return `${p.name} ${mine ?? 'not installed'}${mine === p.version ? '' : ` (record ${p.version})`}`; });
    console.log(`your run  Python ${run.runtime.python}${r.runtime?.python && r.runtime.python !== run.runtime.python ? ` (record ${r.runtime.python})` : ''}${vs.length ? ` · ${vs.join(' · ')}` : ''}`);
  }
  const ran = runOutcomes(read.cells, run.runs);
  const byN = new Map(submitted.map((o) => [o.n, o]));
  for (const o of ran) {
    const s = byN.get(o.n);
    const same = canonicalOutcomes([s]) === canonicalOutcomes([o]);
    console.log(`cell ${String(o.n).padEnd(5)}${same ? 'same' : 'DIFFERS'}`);
    if (!same) { console.log(`          submitted: ${glimpse(s)}`); console.log(`          your run:  ${glimpse(o)}`); }
  }
  if (run.stopped) {
    console.log(`result    Your run stopped at code cell ${run.stopped.n}: ${run.stopped.reason === 'cell_timeout' ? 'it took longer than the 120 seconds a cell is allowed' : 'the notebook took longer than the 10 minutes a re-run is allowed'}. Nothing to compare as a whole.`);
    return 1;
  }
  const cmp = compareOutcomes(submitted, ran);
  const ranDigest = outcomesDigest(ran);
  const same = ranDigest === String(r.outputs.ran).toLowerCase();
  console.log(`ran       yours ${short(ranDigest)} · the record’s ${short(r.outputs.ran)} · ${same ? 'THE SAME' : 'DIFFERENT'}`);
  const yours = cmp.status === 'reproduced' ? `Results reproduced — all ${plural(read.cells.length, 'code cell')} gave the outputs submitted`
    : cmp.status === 'ran' ? `Ran without error — ${read.cells.length - cmp.differing.length} of ${plural(read.cells.length, 'code cell')} matched (${cellList(cmp.differing)} differed)`
    : `Did not run — code cell ${cmp.failedAt} raised an error`;
  console.log(`result    Your run: ${yours}. ${same ? 'It agrees with Wizzad’s run, cell for cell.' : `Wizzad’s run: ${BADGE[r.status] ?? r.status}. Where the two runs differ, look at the environment first — a package version, a random draw with no seed, a clock.`}`);
  return filesOk && subOk && problems.length === 0 && same ? 0 : 1;
}

main().catch((err) => { console.error(`error: ${err.message}`); process.exit(1); });
