// A notebook re-run, checked without Wizzad: the canonical outputs match the standard's test vector and its rules; a
// record's reproduction is found by the notebook's fingerprint; the files beside it are checked by name and hash; and a
// run of one's own (when this machine has a Jupyter kernel) agrees with the record's, cell for cell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/index.js';
import {
  OUTPUT_CAP, canonicalOutcomes, compareOutcomes, notebookLanguage, outcomesDigest, readNotebook, reproductionProblems, reproductionsIn, runOutcomes, submittedFor, submittedOutcomes,
} from '../src/reproduce.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'fixtures', 'reproduction');
const BIN = join(HERE, '..', 'bin', 'wizzad-record.js');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const nb = (name) => JSON.parse(readFileSync(join(FIX, name), 'utf8'));
const code = (source, outputs = []) => ({ cell_type: 'code', source, outputs });

test('the standard’s test vector: the canonical text and the digest PROFILE.md prints', () => {
  const profile = readFileSync(join(HERE, '..', 'PROFILE.md'), 'utf8');
  const at = profile.indexOf('**Test vector.**');
  const section = profile.slice(at, profile.indexOf('#### 4.3.4', at));
  const block = /```\n([\s\S]*?)\n```/.exec(section)[1];
  const [file, digest] = [...section.matchAll(/`([0-9a-f]{64})`/g)].map((m) => m[1]);
  assert.equal(sha(readFileSync(join(FIX, 'example.ipynb'))), file);
  const read = readNotebook(nb('example.ipynb'));
  assert.equal(read.ok, true);
  assert.equal(read.markdown, 1);
  assert.equal(canonicalOutcomes(submittedOutcomes(read.cells)), block);
  assert.equal(outcomesDigest(submittedOutcomes(read.cells)), digest);
});

test('the standard’s second test vector: rule 2 reads a cell that displays before it prints as a run reports it; rule 1 did not', () => {
  const profile = readFileSync(join(HERE, '..', 'PROFILE.md'), 'utf8');
  const at = profile.indexOf('**Second test vector.**');
  const section = profile.slice(at, profile.indexOf('#### 4.3.4', at));
  const [two, one] = [...section.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  const [file, digest2, digest1] = [...section.matchAll(/`([0-9a-f]{64})`/g)].map((m) => m[1]);
  assert.equal(sha(readFileSync(join(FIX, 'interleaved.ipynb'))), file);
  const read = readNotebook(nb('interleaved.ipynb'));
  assert.equal(canonicalOutcomes(submittedFor(2, read.cells)), two);
  assert.equal(outcomesDigest(submittedFor(2, read.cells)), digest2);
  assert.equal(canonicalOutcomes(submittedFor(undefined, read.cells)), one);
  assert.equal(outcomesDigest(submittedFor(undefined, read.cells)), digest1);
  // The first vector's notebook reads the same under both rules.
  const ex = readNotebook(nb('example.ipynb'));
  assert.equal(outcomesDigest(submittedFor(2, ex.cells)), outcomesDigest(submittedOutcomes(ex.cells)));
});

test('rule 2: printed text merged and first, then results, then the error; cut then tidied; an empty print dropped', () => {
  const cells = readNotebook({ cells: [code('x', [
    { output_type: 'display_data', data: { 'text/plain': 't' } },
    { output_type: 'stream', name: 'stdout', text: 'a  \n' },
    { output_type: 'stream', name: 'stderr', text: 'w\n' },
    { output_type: 'stream', name: 'stdout', text: ['b', '\n'] },
    { output_type: 'error', ename: 'E', evalue: 'v' },
  ]), code('y', [{ output_type: 'stream', name: 'stdout', text: '\n' }, { output_type: 'execute_result', data: { 'text/plain': 'r' } }])] }).cells;
  assert.equal(canonicalOutcomes(submittedFor(2, cells)), [
    '{"n":1,"outputs":[{"kind":"stdout","text":"a\\nb"},{"kind":"display","mime":"text/plain","text":"t"},{"kind":"error","name":"E","value":"v"}]}',
    '{"n":2,"outputs":[{"kind":"result","mime":"text/plain","text":"r"}]}',
  ].join('\n'));
  // Exactly a run's reading of the same cells.
  const ran = runOutcomes(cells, [{ stdout: ['a  \n', 'b\n'], stderr: [], results: [{ text: 't' }], error: { name: 'E', value: 'v' } }, { stdout: ['\n'], stderr: [], results: [{ text: 'r', isMainResult: true }], error: null }]);
  assert.equal(canonicalOutcomes(ran), canonicalOutcomes(submittedFor(2, cells)));
});

test('only Python notebooks are read; blank code cells are not code cells', () => {
  assert.equal(notebookLanguage({}), 'python');
  assert.equal(notebookLanguage({ metadata: { kernelspec: { name: 'ipykernel' } } }), 'python');
  assert.equal(notebookLanguage({ metadata: { language_info: { name: 'Py3' } } }), 'python');
  assert.deepEqual(readNotebook({ metadata: { language_info: { name: 'R' } }, cells: [code('x <- 1')] }), { ok: false, reason: 'unsupported_language', language: 'r' });
  assert.deepEqual(readNotebook({ cells: [code('  \n')] }), { ok: false, reason: 'no_code' });
  assert.deepEqual(readNotebook([]), { ok: false, reason: 'not_notebook' });
  const r = readNotebook({ cells: [code(''), code(['a = 1\n', 'a']), code('b')] });
  assert.deepEqual(r.cells.map((c) => [c.n, c.source]), [[1, 'a = 1\na'], [2, 'b']]);
});

test('a long output is cut the way Wizzad cuts it, on both sides', () => {
  const long = 'x'.repeat(OUTPUT_CAP + 10);
  const cells = readNotebook({ cells: [code('print(s)', [{ output_type: 'stream', name: 'stdout', text: long }])] }).cells;
  const cut = `${'x'.repeat(OUTPUT_CAP)}\n…[output cut at 65536 characters]`;
  assert.equal(submittedOutcomes(cells)[0].outputs[0].text, cut);
  assert.equal(runOutcomes(cells, [{ stdout: [long.slice(0, 40000), long.slice(40000)], stderr: [], results: [], error: null }])[0].outputs[0].text, cut);
});

test('a run is read into the same shape: printed text first, then results, then the error; figures and stderr never', () => {
  const cells = readNotebook({ cells: [code('a'), code('b'), code('c')] }).cells;
  const ran = runOutcomes(cells, [
    { stdout: ['n = 5  \n', 'ok\n'], stderr: ['warning\n'], results: [{ text: '<Figure>', png: 'iVBOR' }, { text: '42', isMainResult: true }], error: null },
    { stdout: [], stderr: [], results: [{ text: "{'a': 1}" }], error: null },
    { stdout: [], stderr: [], results: [], error: { name: 'KeyError', value: "'depth'", traceback: '…' } },
  ]);
  assert.equal(canonicalOutcomes(ran), [
    '{"n":1,"outputs":[{"kind":"stdout","text":"n = 5\\nok"},{"kind":"result","mime":"text/plain","text":"42"}]}',
    '{"n":2,"outputs":[{"kind":"display","mime":"text/plain","text":"{\'a\': 1}"}]}',
    '{"n":3,"outputs":[{"kind":"error","name":"KeyError","value":"\'depth\'"}]}',
  ].join('\n'));
  // A cell after a raise is never reached, so never compared.
  assert.deepEqual(compareOutcomes(ran, ran), { status: 'failed', differing: [], failedAt: 3 });
  assert.deepEqual(compareOutcomes(ran, ran.slice(0, 2)), { status: 'reproduced', differing: [], failedAt: null });
  assert.deepEqual(compareOutcomes(ran, [ran[0], { n: 2, outputs: [] }]), { status: 'ran', differing: [2], failedAt: null });
});

test('a record’s reproduction is found, and read for consistency from the record alone', () => {
  const r = { status: 'reproduced', notebook: { file: 'a.ipynb', sha256: 'a'.repeat(64) }, inputs: [], outputs: { submitted: 'b'.repeat(64), ran: 'b'.repeat(64) }, cells: { code: 4, differing: 0, failedAt: null } };
  const payload = { record: { defenses: [{ title: 'Essay', sealedOn: '2026-09-20' }, { title: 'Road salt', sealedOn: '2026-09-24', attempt: 2, project: { reproduction: r } }, { project: { reproduction: null } }] } };
  // A record from before zones names none: its sitting's day is a UTC day, and the find says so (null).
  assert.deepEqual(reproductionsIn(payload), [{ path: 'record.defenses[1].project.reproduction', title: 'Road salt', sealedOn: '2026-09-24', timeZone: null, attempt: 2, reproduction: r }]);
  assert.deepEqual(reproductionProblems(r), []);
  assert.equal(reproductionProblems({ ...r, outputs: { submitted: 'b'.repeat(64), ran: 'c'.repeat(64) } }).length, 1);
  assert.equal(reproductionProblems({ ...r, status: 'ran', cells: { code: 4, differing: 2, failedAt: null, differingAt: [2] } }).length, 1);
  assert.deepEqual(reproductionProblems({ ...r, status: 'failed', cells: { code: 4, differing: 0, failedAt: 3 } }), []);
});

// ─── The command, end to end, against a record signed here ─────────────────

/** A signed record whose one defense carries a reproduction of `run.ipynb` beside `data.csv`, and its keys document. */
function signedRecord(dir, reproduction) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const keyId = sha(spki).slice(0, 16);
  const payload = { schema: 'wizzad.proof/v1', recordId: 'r'.repeat(32), issuedAt: '2026-09-26T00:00:00.000Z', windowDays: 30, subject: { ownerTag: 't'.repeat(16) }, record: { defenses: [{ id: 'd1', title: 'Road salt', sealedOn: '2026-09-24', attempt: 1, identity: 'session', project: { reproduction } }] } };
  const signature = sign(null, Buffer.from(canonicalJson(payload), 'utf8'), privateKey).toString('base64url');
  writeFileSync(join(dir, 'record.json'), JSON.stringify({ status: 'ok', payload, signature, algorithm: 'Ed25519', keyId }));
  writeFileSync(join(dir, 'keys.json'), JSON.stringify({ keys: [{ keyId, algorithm: 'Ed25519', publicKey: spki.toString('base64') }] }));
}

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'wr-repro-test-'));
  for (const f of ['run.ipynb', 'data.csv', 'example.ipynb']) copyFileSync(join(FIX, f), join(dir, f));
  const read = readNotebook(nb('run.ipynb'));
  const digest = outcomesDigest(submittedOutcomes(read.cells));
  const reproduction = {
    ranOn: '2026-09-24', status: 'reproduced', notebook: { file: 'run.ipynb', sha256: sha(readFileSync(join(FIX, 'run.ipynb'))) },
    inputs: [{ file: 'data.csv', sha256: sha(readFileSync(join(FIX, 'data.csv'))) }],
    outputs: { submitted: digest, ran: digest }, cells: { code: read.cells.length, differing: 0, failedAt: null },
    environment: 'a fresh E2B code-interpreter sandbox (Python 3)', network: 'none', runtime: { python: '3.10.12', packages: [] },
  };
  signedRecord(dir, reproduction);
  return dir;
}
const cli = (dir, ...a) => spawnSync(process.execPath, [BIN, 'reproduce', ...a, join(dir, 'record.json'), '--keys', join(dir, 'keys.json')], { encoding: 'utf8', timeout: 120_000 });

test('reproduce: the notebook, its file and its submitted outputs are the ones the record names', () => {
  const dir = workspace();
  const r = cli(dir, join(dir, 'run.ipynb'));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /record {4}VALID/);
  assert.match(r.stdout, /input {5}data\.csv · matches/);
  assert.match(r.stdout, /submitted [0-9a-f]{12}… · MATCHES the record — recomputed from the notebook alone \(4 code cells, canonical form 1\)/);
  assert.match(r.stdout, /says {6}Results reproduced: every one of its 4 code cells gave the outputs submitted\. Wizzad’s run, on 2026-09-24, no network, Python 3\.10\.12\./);
});

test('reproduce: a changed data file, a missing one, and a notebook the record never re-ran are each said plainly', () => {
  const dir = workspace();
  writeFileSync(join(dir, 'data.csv'), 'site,salt,uS\nA,0.0,999\n');
  let r = cli(dir, join(dir, 'run.ipynb'));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /input {5}data\.csv · DIFFERS/);
  r = cli(dir, join(dir, 'run.ipynb'), '--run');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Not run: a run without every file on record/);
  r = cli(dir, join(dir, 'run.ipynb'), '--files', join(dir, 'nowhere'));
  assert.match(r.stdout, /input {5}data\.csv · MISSING/);
  r = cli(dir, join(dir, 'example.ipynb'));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /does not vouch for this notebook; it carries 1 re-run of other notebooks/);
});

const hasJupyter = (() => { try { execFileSync('python3', ['-c', 'import jupyter_client, ipykernel'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test('reproduce --run: a run of one’s own agrees with the record, cell for cell', { skip: !hasJupyter && 'no python3 with jupyter_client + ipykernel here' }, () => {
  const dir = workspace();
  const r = cli(dir, join(dir, 'run.ipynb'), '--run');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /warning {3}--run executes this notebook’s code on this machine/);
  assert.match(r.stdout, /your run {2}Python \d+\.\d+/);
  for (const n of [1, 2, 3, 4]) assert.match(r.stdout, new RegExp(`cell ${n} {4}same`));
  assert.match(r.stdout, /ran {7}yours [0-9a-f]{12}… · the record’s [0-9a-f]{12}… · THE SAME/);
  assert.match(r.stdout, /Your run: Results reproduced — all 4 code cells gave the outputs submitted\. It agrees with Wizzad’s run, cell for cell\./);
});

/** A signed record whose reproduction is of `interleaved.ipynb`, made under `canon` (2, or the first rule when absent) and reproduced. */
function interleavedWorkspace(canon) {
  const dir = mkdtempSync(join(tmpdir(), 'wr-canon-test-'));
  copyFileSync(join(FIX, 'interleaved.ipynb'), join(dir, 'interleaved.ipynb'));
  const read = readNotebook(nb('interleaved.ipynb'));
  const digest = outcomesDigest(submittedFor(canon, read.cells));
  signedRecord(dir, {
    ranOn: '2026-09-26', status: 'reproduced', notebook: { file: 'interleaved.ipynb', sha256: sha(readFileSync(join(FIX, 'interleaved.ipynb'))) }, inputs: [],
    outputs: { submitted: digest, ran: digest }, cells: { code: read.cells.length, differing: 0, failedAt: null }, environment: 'e2b', network: 'none',
    ...(canon === 2 ? { canon: 2 } : {}),
  });
  return dir;
}

test('reproduce: the submitted digest is recomputed by the record’s own rule, and says which', () => {
  for (const canon of [2, undefined]) {
    const dir = interleavedWorkspace(canon);
    const r = cli(dir, join(dir, 'interleaved.ipynb'));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(`submitted [0-9a-f]{12}… · MATCHES the record — recomputed from the notebook alone \\(4 code cells, canonical form ${canon === 2 ? 2 : 1}\\)`));
  }
});

test('reproduce --run: under rule 2, a notebook that displays before it prints reproduces cell for cell; under rule 1 it read as differing', { skip: !hasJupyter && 'no python3 with jupyter_client + ipykernel here' }, () => {
  const two = interleavedWorkspace(2);
  let r = cli(two, join(two, 'interleaved.ipynb'), '--run');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const n of [1, 2, 3, 4]) assert.match(r.stdout, new RegExp(`cell ${n} {4}same`));
  assert.match(r.stdout, /THE SAME/);
  // The same notebook against a first-rule record: cells 2 and 3 are the false difference rule 2 removes.
  const one = interleavedWorkspace(undefined);
  r = cli(one, join(one, 'interleaved.ipynb'), '--run');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /cell 2 {4}DIFFERS/);
  assert.match(r.stdout, /cell 3 {4}DIFFERS/);
  assert.match(r.stdout, /cell 1 {4}same/);
});

