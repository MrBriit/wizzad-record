import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, generateKeyPairSync, sign as nodeSign } from 'node:crypto';
import { verifyHostWord, hostWordsIn, hostWordLine, hostChallengeOf, keyIdOfSpki, canonicalJson } from '../src/index.js';

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
// A sitting the platform's own integration run sealed and a host signed (a real assertion from a real key pair):
// apps/platform/src/lib/defend/__tests__/supervised.integration.test.ts writes it when HOST_WORD_FIXTURE names the path.
const { defense } = fx('host-word.json');

test('a host’s word from the platform verifies under the host’s carried key, bound to the sitting it sits beside', () => {
  const r = verifyHostWord(defense.supervised.attestation, defense);
  assert.equal(r.valid, true, r.reason);
  assert.equal(r.keyId, defense.supervised.attestation.key.keyId);
  assert.equal(r.host.domain, defense.supervised.host.domain);
  assert.deepEqual(r.exceptions, ['left_room']);
  assert.equal(r.note, 'Left for two minutes; came back.');
  assert.equal(r.signedAt, defense.supervised.attestation.statement.signedAt);
  // The challenge is the statement's canonical JSON, hashed — nothing else was signed.
  assert.equal(defense.supervised.attestation.challenge, createHash('sha256').update(canonicalJson(defense.supervised.attestation.statement)).digest('base64url'));
  assert.equal(hostChallengeOf(defense.supervised.attestation.statement), defense.supervised.attestation.challenge);
});

test('one changed word in the statement, one touched byte in the signature, a cleared flag, another key — and it is not valid, and says why', () => {
  const att = defense.supervised.attestation;
  assert.match(verifyHostWord({ ...att, statement: { ...att.statement, note: 'Nothing to report.' } }, defense).reason, /challenge/);
  const sig = Buffer.from(att.assertion.signature, 'base64url'); sig[10] ^= 1;
  assert.match(verifyHostWord({ ...att, assertion: { ...att.assertion, signature: sig.toString('base64url') } }, defense).reason, /signature/);
  const ad = Buffer.from(att.assertion.authenticatorData, 'base64url'); ad[32] &= ~0x04;
  assert.match(verifyHostWord({ ...att, assertion: { ...att.assertion, authenticatorData: ad.toString('base64url') } }, defense).reason, /verification/);
  const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  assert.match(verifyHostWord({ ...att, key: { ...att.key, spki: other, keyId: keyIdOfSpki(other) } }, defense).reason, /signature/);
  assert.match(verifyHostWord({ ...att, key: { ...att.key, keyId: '0000000000000000' } }, defense).reason, /key id/);
  // Presented beside another sitting.
  assert.match(verifyHostWord(att, { ...defense, id: 'another' }).reason, /another record/);
  assert.match(verifyHostWord(att, { ...defense, attempt: defense.attempt + 1 }).reason, /another attempt/);
  assert.equal(verifyHostWord(null).valid, false);
});

test('a word made here, as an authenticator makes one, verifies too — the check does not depend on the platform', () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const statement = { schema: 'wizzad.host-word/v1', recordId: 'rec-9', sealedAt: '2026-10-06T15:20:00.000Z', payloadSha256: 'a'.repeat(64), checkinId: 'ci-9', windowId: 'w9', piece: { title: 'T', attempt: 1 }, host: { name: 'E. Marsh', organisation: null, domain: 'example.edu' }, watched: 'whole', exceptions: [], note: null, signedAt: '2026-10-06T15:24:00.000Z' };
  const challenge = hostChallengeOf(statement);
  const cdj = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'https://wizzad.ai', crossOrigin: false }));
  const authData = Buffer.alloc(37); createHash('sha256').update('wizzad.ai').digest().copy(authData, 0); authData[32] = 0x05; authData.writeUInt32BE(7, 33);
  const signature = nodeSign('sha256', Buffer.concat([authData, createHash('sha256').update(cdj).digest()]), pair.privateKey);
  const att = { statement, challenge, assertion: { credentialId: 'c', clientDataJSON: cdj.toString('base64url'), authenticatorData: authData.toString('base64url'), signature: signature.toString('base64url') }, key: { spki, alg: 'ES256', keyId: keyIdOfSpki(spki) }, rpId: 'wizzad.ai', origin: 'https://wizzad.ai' };
  assert.equal(verifyHostWord(att, { recordId: 'rec-9', windowId: 'w9', attempt: 1, hostDomain: 'example.edu' }).valid, true);
  assert.match(verifyHostWord(att, { recordId: 'rec-9', windowId: 'w9', attempt: 1, hostDomain: 'other.edu' }).reason, /another host/);
});

test('the sittings sat with a host in a proof payload, each with its word or awaiting it, in one line each', () => {
  const payload = { record: { defenses: [{ title: 'Remote', attempt: 1 }, defense, { ...defense, id: 'rec-x', supervised: { ...defense.supervised, attestation: undefined } }] } };
  const entries = hostWordsIn(payload);
  assert.deepEqual(entries.map((e) => [e.path, Boolean(e.word)]), [['record.defenses[1]', true], ['record.defenses[2]', false]]);
  assert.match(hostWordLine(entries[0]), /VALID$/);
  assert.match(hostWordLine(entries[0]), /watched the whole sitting, though the student left the room/);
  assert.match(hostWordLine(entries[1]), /awaiting the host’s word$/);
  assert.match(hostWordLine({ ...entries[0], word: { ...entries[0].word, challenge: 'x' } }), /NOT VALID/);
});
