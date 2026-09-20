import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyCredential } from '../src/index.js';

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const credential = fx('credential.json'); // a real task credential issued through a real link
const did = fx('did.json');
const keys = fx('keys.json');

test('a real Open Badges 3.0 credential verifies under the DID document’s key, and under the keys list', async () => {
  const r = await verifyCredential(credential, did);
  assert.equal(r.valid, true, r.reason);
  assert.equal(r.keyId, '1b08271a2234fbce');
  assert.equal((await verifyCredential(credential, keys)).valid, true);
  assert.deepEqual(credential['@context'], ['https://www.w3.org/ns/credentials/v2', 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json']);
});

test('a changed achievement name, a changed proof value, or an unknown key: not valid', async () => {
  const renamed = structuredClone(credential);
  renamed.credentialSubject.achievement.name += ' (edited)';
  assert.match((await verifyCredential(renamed, did)).reason, /changed after it was issued/);
  const flipped = structuredClone(credential);
  flipped.proof.proofValue = flipped.proof.proofValue.slice(0, -1) + (flipped.proof.proofValue.endsWith('1') ? '2' : '1');
  assert.equal((await verifyCredential(flipped, did)).valid, false);
  const elsewhere = structuredClone(credential);
  elsewhere.proof.verificationMethod = 'did:web:example.org#ffffffffffffffff';
  assert.match((await verifyCredential(elsewhere, did)).reason, /not among the published keys/);
});

test('a credential that names a context we do not bundle is refused rather than fetched', async () => {
  const other = structuredClone(credential);
  other['@context'] = [...other['@context'], 'https://example.org/another-context.json'];
  const r = await verifyCredential(other, did);
  assert.equal(r.valid, false);
  assert.match(r.reason, /not bundled, not fetched/);
});

test('a proof of another suite or purpose is not accepted as this one', async () => {
  const jws = structuredClone(credential); jws.proof.cryptosuite = 'ecdsa-rdfc-2019';
  assert.match((await verifyCredential(jws, did)).reason, /not a DataIntegrityProof/);
  const auth = structuredClone(credential); auth.proof.proofPurpose = 'authentication';
  assert.match((await verifyCredential(auth, did)).reason, /assertionMethod/);
});
