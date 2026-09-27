import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyRing, keyIdOfRaw, rawFromMultikey, rawFromSpkiBase64, verifyRecord, revocations } from '../src/index.js';
import { verifyCredential } from '../src/credential.js';

// Captured from wizzad.ai on 20 September 2026, just after a key rotation:
// the key that signs today first, the retired key second — in both documents.
// That retired key, 2624cf0b6019071d, was on the server compromised on
// 15 September 2026 and has since been REVOKED: these documents still list
// it, and the checker must refuse it anyway.
const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const keys = fx('prod-keys.json');
const did = fx('prod-did.json');
const REVOKED = '2624cf0b6019071d';

test('production publishes its keys twice — the keys list and the did:web document — and they are the same keys in the same order', () => {
  assert.equal(did.id, 'did:web:wizzad.ai:proof:issuer');
  assert.deepEqual(keys.keys.map((k) => k.keyId), ['798e24827da46e0d', REVOKED]);
  assert.deepEqual(did.verificationMethod.map((m) => m.id.split('#')[1]), keys.keys.map((k) => k.keyId));
  const a = keyRing(keys), b = keyRing(did);
  assert.deepEqual([...b.keys()], [...a.keys()]);
  for (const id of a.keys()) assert.deepEqual(Buffer.from(a.get(id)), Buffer.from(b.get(id)));
});

test('every id recomputes from its bytes; the key that signs today comes first', () => {
  for (const k of keys.keys) assert.equal(keyIdOfRaw(rawFromSpkiBase64(k.publicKey)), k.keyId);
  for (const m of did.verificationMethod) assert.equal(keyIdOfRaw(rawFromMultikey(m.publicKeyMultibase)), m.id.split('#')[1]);
  assert.equal(keys.keys[0].keyId, '798e24827da46e0d', 'the key that signs today comes first');
});

test('the revoked key is left out of the ring even though these documents still list it', () => {
  assert.deepEqual([...keyRing(keys).keys()], ['798e24827da46e0d']);
  assert.deepEqual([...keyRing(did).keys()], ['798e24827da46e0d']);
});

test('a record naming the revoked key fails, and says why, before any signature is checked', () => {
  const r = verifyRecord({ payload: { schema: 'wizzad.proof/v1' }, signature: 'A'.repeat(86), keyId: REVOKED }, keys);
  assert.equal(r.valid, false);
  assert.equal(r.revoked, true);
  assert.match(r.reason, /revoked by Wizzad from 2026-09-15: The server holding this key was compromised/);
});

test('a credential whose proof names the revoked key fails the same way', async () => {
  const c = structuredClone(fx('credential.json'));
  c.proof.verificationMethod = `${did.id}#${REVOKED}`;
  const r = await verifyCredential(c, did);
  assert.equal(r.valid, false);
  assert.equal(r.revoked, true);
});

test('a keys document can name further revocations, and they are honoured', () => {
  const extra = { ...keys, revoked: [{ keyId: '798e24827da46e0d', revokedFrom: '2027-01-01', reason: 'test' }] };
  assert.deepEqual([...keyRing(extra).keys()], []);
  assert.equal(revocations(extra).get('798e24827da46e0d').revokedFrom, '2027-01-01');
  assert.equal(verifyRecord({ payload: {}, signature: 'A'.repeat(86), keyId: '798e24827da46e0d' }, extra).revoked, true);
});
