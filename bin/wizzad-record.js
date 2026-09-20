#!/usr/bin/env node
/**
 * wizzad-record — check a Wizzad study record without trusting Wizzad.
 *
 *   wizzad-record check <link>                          fetch the record and the published keys from the link's origin, verify
 *   wizzad-record check <record.json> --keys <keys.json>  the same, offline (keys.json = /api/proof/keys or the DID document)
 *   wizzad-record credential <credential.json> --keys <did.json|keys.json>
 *   wizzad-record file <path> <link|record.json> [--keys …]   hash a file you hold and look for it in the record
 *
 * Exit code 0 when everything checked is valid, 1 otherwise. Nothing but the
 * link's own origin is contacted, and only when a link (not a file) is given.
 */
import { readFile } from 'node:fs/promises';
import { verifyRecord, signatureOf } from '../src/record.js';
import { verifyCredential } from '../src/credential.js';
import { fingerprintFile, fingerprintsIn, matchFingerprint } from '../src/files.js';
import { fetchFromLink } from '../src/fetch.js';
import { keyRing } from '../src/keys.js';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.slice(1).filter((a, i, arr) => !a.startsWith('--') && (i === 0 || !arr[i - 1].startsWith('--')));
const isLink = (s) => /^https?:\/\//.test(s);
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

function usage() {
  console.error(`usage:
  wizzad-record check <link>
  wizzad-record check <record.json> --keys <keys.json>
  wizzad-record credential <credential.json> --keys <did.json|keys.json>
  wizzad-record file <path> <link|record.json> [--keys <keys.json>]`);
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
    console.log(`key      ${sig?.keyId ?? '(none)'} · ${ring.has(sig?.keyId) ? 'published' : 'not published'} · keys from ${from}`);
    console.log(`digest   sha256(canonical payload) = ${r.canonicalSha256 ?? '(none)'}`);
    const p = record.payload ?? {};
    if (p.issuedAt) console.log(`issued   ${p.issuedAt}`);
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
  usage();
}

main().catch((err) => { console.error(`error: ${err.message}`); process.exit(1); });
