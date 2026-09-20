import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyRing, keyIdOfRaw, rawFromMultikey, rawFromSpkiBase64 } from '../src/index.js';

// Captured from wizzad.ai on 20 September 2026, just after a key rotation:
// the key that signs today first, the retired key second — in both documents.
const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const keys = fx('prod-keys.json');
const did = fx('prod-did.json');

test('production publishes its keys twice — the keys list and the did:web document — and they are the same keys in the same order', () => {
  assert.equal(did.id, 'did:web:wizzad.ai:proof:issuer');
  const a = keyRing(keys), b = keyRing(did);
  assert.deepEqual([...a.keys()], ['798e24827da46e0d', '2624cf0b6019071d']);
  assert.deepEqual([...b.keys()], [...a.keys()]);
  for (const id of a.keys()) assert.deepEqual(Buffer.from(a.get(id)), Buffer.from(b.get(id)));
});

test('after a rotation the retired key stays published, so records signed under it keep verifying; every id recomputes from its bytes', () => {
  for (const k of keys.keys) assert.equal(keyIdOfRaw(rawFromSpkiBase64(k.publicKey)), k.keyId);
  for (const m of did.verificationMethod) assert.equal(keyIdOfRaw(rawFromMultikey(m.publicKeyMultibase)), m.id.split('#')[1]);
  assert.equal(keys.keys[0].keyId, '798e24827da46e0d', 'the key that signs today comes first');
  assert.equal(keys.keys[1].keyId, '2624cf0b6019071d', 'the retired key follows');
});
