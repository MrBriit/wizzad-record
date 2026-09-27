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

// ─── The zone a record's days are in (PROFILE §3.1) ─────────────────────────

import { sign as nodeSign } from 'node:crypto';
import { timeZonesIn, reproductionsIn } from '../src/index.js';

/** A record signed with a fresh key, for shapes no real record fixture has yet. */
function signed(payload) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ type: 'spki', format: 'der' });
  const ring = keyRing([{ algorithm: 'Ed25519', publicKey: der.toString('base64') }]);
  const keyId = [...ring.keys()][0];
  const signature = nodeSign(null, Buffer.from(canonicalJson(payload), 'utf8'), privateKey).toString('base64url');
  return { record: { status: 'ok', payload, signature, algorithm: 'Ed25519', keyId }, ring };
}

const defense = (over = {}) => ({ id: 'd1', title: 'Osmosis lab', sealedOn: '2026-09-26', attempt: 1, identity: 'session', results: { checked: 3, checkedCorrect: 3 }, ...over });

test('a record with time zones and one without both verify: the zone is metadata, covered by the signature', () => {
  const zoned = signed({ schema: 'wizzad.proof/v1', recordId: 'r', issuedAt: '2026-09-27T02:00:00.000Z', windowDays: 30, record: { timeZone: 'America/New_York', defenses: [defense({ timeZone: 'America/New_York', project: { brief: { enteredOn: '2026-09-26', timeZone: 'America/New_York' }, deliverables: [{ file: 'a.csv', handedInOn: '2026-09-27', timeZone: 'Europe/London' }] } })] } });
  assert.equal(verifyRecord(zoned.record, zoned.ring).valid, true);
  assert.deepEqual(timeZonesIn(zoned.record.payload).map((z) => z.path), ['record.timeZone', 'record.defenses[0].timeZone', 'record.defenses[0].project.brief.timeZone', 'record.defenses[0].project.deliverables[0].timeZone']);
  // Changing the zone is changing the record.
  const moved = structuredClone(zoned.record);
  moved.payload.record.defenses[0].timeZone = 'Asia/Tokyo';
  assert.equal(verifyRecord(moved, zoned.ring).valid, false);
  // A record from before zones: nothing named, every day a UTC day — and it verifies as it always did.
  const plain = signed({ schema: 'wizzad.proof/v1', recordId: 'r', issuedAt: '2026-09-27T02:00:00.000Z', windowDays: 30, record: { defenses: [defense({ sealedOn: '2026-09-27' })] } });
  assert.equal(verifyRecord(plain.record, plain.ring).valid, true);
  assert.deepEqual(timeZonesIn(plain.record.payload), []);
  assert.deepEqual(timeZonesIn(record.payload), []);
});

test('a re-run found in the record says which zone its sitting’s day is in, or none', () => {
  const r = { status: 'reproduced', notebook: { file: 'a.ipynb', sha256: 'a'.repeat(64) }, outputs: { submitted: 'x', ran: 'x' }, cells: { code: 1, differing: 0 } };
  const [zoned] = reproductionsIn({ record: { defenses: [defense({ timeZone: 'America/New_York', project: { reproduction: r } })] } });
  assert.equal(zoned.sealedOn, '2026-09-26');
  assert.equal(zoned.timeZone, 'America/New_York');
  const [plain] = reproductionsIn({ record: { defenses: [defense({ project: { reproduction: r } })] } });
  assert.equal(plain.timeZone, null);
});
