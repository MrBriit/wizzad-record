import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { verifyRecord, signatureOf, keyRing, keyIdOfRaw, rawFromMultikey, rawFromSpkiBase64, canonicalJson, fingerprintsIn, matchFingerprint, fingerprintFile, partsOfLink } from '../src/index.js';

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const record = fx('record.json');   // the /api/proof/shared/<token> reply of a real record
const keys = fx('keys.json');       // the /api/proof/keys reply of the same deployment
const did = fx('did.json');         // its did:web document

test('a real record verifies under the key it names, and the digest is the one the issuer reports', () => {
  const r = verifyRecord(record, keys);
  assert.equal(r.valid, true, r.reason);
  assert.equal(r.keyId, '1b08271a2234fbce');
  assert.equal(r.canonicalSha256, createHash('sha256').update(canonicalJson(record.payload)).digest('hex'));
});

test('the same key from the DID document (a Multikey) and from the keys list (SPKI) are the same 32 bytes with the same id', () => {
  const fromDid = rawFromMultikey(did.verificationMethod[0].publicKeyMultibase);
  const fromKeys = rawFromSpkiBase64(keys.keys[0].publicKey);
  assert.deepEqual(Buffer.from(fromDid), Buffer.from(fromKeys));
  assert.equal(keyIdOfRaw(fromDid), keys.keys[0].keyId);
  assert.equal(verifyRecord(record, did).valid, true);
});

/** The same value with every object's keys in reverse order — what a careless re-serialisation might do. */
const reversed = (v) => (Array.isArray(v) ? v.map(reversed) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().reverse().map((k) => [k, reversed(v[k])])) : v);

test('canonical JSON ignores key order and whitespace — a re-serialised record still verifies', () => {
  const reordered = JSON.parse(JSON.stringify(reversed(record.payload), null, 2));
  assert.notEqual(JSON.stringify(reordered), JSON.stringify(record.payload));
  assert.equal(canonicalJson(reordered), canonicalJson(record.payload));
  assert.equal(verifyRecord({ ...record, payload: reordered }, keys).valid, true);
});

test('one changed character in the payload, or in the signature, and the record is not valid', () => {
  const tampered = structuredClone(record);
  tampered.payload.record.defenses[0].results.checkedCorrect += 1;
  const r = verifyRecord(tampered, keys);
  assert.equal(r.valid, false);
  assert.match(r.reason, /changed after signing/);
  const sig = signatureOf(record).signature;
  const flipped = { ...record, signature: (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1) };
  assert.equal(verifyRecord(flipped, keys).valid, false);
});

test('a key the deployment did not publish is refused, and a key document that lies about an id is refused', () => {
  const strangerDer = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' });
  const stranger = keyRing([{ algorithm: 'Ed25519', publicKey: strangerDer.toString('base64') }]);
  assert.match(verifyRecord(record, stranger).reason, /not among the published keys/);
  assert.throws(() => keyRing([{ ...keys.keys[0], keyId: 'ffffffffffffffff' }]), /does not match its bytes/);
  assert.equal(verifyRecord({ ...record, keyId: 'ffffffffffffffff' }, keys).reason, 'key ffffffffffffffff is not among the published keys');
});

test('the verify reply’s shape (signature as an object) is accepted too', () => {
  const asObject = { payload: record.payload, signature: { algorithm: 'Ed25519', keyId: record.keyId, signature: record.signature } };
  assert.equal(verifyRecord(asObject, keys).valid, true);
});

test('the record’s fingerprints are found by path; a file you hold matches only if its bytes hash to one of them', async () => {
  const fps = fingerprintsIn(record.payload);
  assert.ok(fps.length >= 1);
  assert.ok(fps.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)));
  const dir = mkdtempSync(join(tmpdir(), 'wizzad-record-'));
  const p = join(dir, 'piece.txt');
  writeFileSync(p, 'the exact bytes of a file the record vouches for');
  const hex = await fingerprintFile(p);
  assert.equal(matchFingerprint(record.payload, hex).length, 0);
  assert.deepEqual(matchFingerprint({ a: { sha256: hex.toUpperCase() } }, hex), [{ path: 'a', sha256: hex }]);
});

test('a link is taken apart into its origin and token', () => {
  assert.deepEqual(partsOfLink('https://wizzad.ai/proof/S1AArjQA1rYQflQTYUDDv2z-'), { origin: 'https://wizzad.ai', token: 'S1AArjQA1rYQflQTYUDDv2z-' });
  assert.throws(() => partsOfLink('https://wizzad.ai/myspace'), /not a record link/);
});
