import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, generateKeyPairSync, sign as nodeSign } from 'node:crypto';
import { verifyHostWord, hostWordsIn, hostWordLine, hostWordMethod, hostChallengeOf, keyIdOfSpki, canonicalJson, keyRing, recordingRuleWords } from '../src/index.js';

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

// ─── §4.4.2: a word given through Wizzad ─────────────────────────────────────

function wizzadWord(method, over = {}) {
  const pair = generateKeyPairSync('ed25519');
  const spki = pair.publicKey.export({ type: 'spki', format: 'der' });
  const keyId = createHash('sha256').update(spki).digest('hex').slice(0, 16);
  const keys = { keys: [{ keyId, algorithm: 'Ed25519', publicKey: spki.toString('base64') }] };
  const statement = { ...defense.supervised.attestation.statement, signedAt: '2026-10-06T16:00:00.000Z', note: null, exceptions: [], ...over.statement };
  const signature = nodeSign(null, Buffer.from(canonicalJson(statement), 'utf8'), pair.privateKey).toString('base64url');
  const att = { method, statement, signedBy: { algorithm: 'Ed25519', keyId, signature }, ...(method === 'email' ? { email: { domain: 'example.edu', confirmedAt: '2026-10-06T16:00:00.000Z' } } : {}) };
  return { att, keys, keyId, pair };
}

test('a word confirmed through the host’s Wizzad account verifies under Wizzad’s published keys, and says it is Wizzad’s word', () => {
  const { att, keys, keyId } = wizzadWord('account');
  const r = verifyHostWord(att, defense, keys);
  assert.equal(r.valid, true, r.reason);
  assert.equal(r.method, 'account');
  assert.equal(r.keyId, keyId);
  assert.equal(hostWordMethod(att), 'account');
  assert.equal(hostWordMethod(defense.supervised.attestation), 'passkey');
  // The ring form works as well as the reply form.
  assert.equal(verifyHostWord(att, defense, keyRing(keys)).valid, true);
  const line = hostWordLine({ path: 'record.defenses[0]', defense, word: att }, keys);
  assert.match(line, /confirmed through their Wizzad account 2026-10-06T16:00:00.000Z/);
  assert.match(line, /Wizzad’s signature, key/);
  assert.match(line, /VALID \(Wizzad’s word that the host gave it\)$/);
  assert.doesNotMatch(line, /signed 2026/);
});

test('a word confirmed by a link to the host’s school address names the domain the link went to', () => {
  const { att, keys } = wizzadWord('email');
  const r = verifyHostWord(att, defense, keys);
  assert.equal(r.valid, true, r.reason);
  assert.equal(r.method, 'email');
  assert.deepEqual(r.email, { domain: 'example.edu', confirmedAt: '2026-10-06T16:00:00.000Z' });
  assert.match(hostWordLine({ path: 'p', defense, word: att }, keys), /confirmed by a link to their school address at example.edu/);
  // Without the address it is not shaped.
  assert.match(verifyHostWord({ ...att, email: undefined }, defense, keys).reason, /not an attestation/);
});

test('a word given through Wizzad is never valid without the keys, under an unknown key, with a changed statement or a touched signature, or bound to another sitting', () => {
  const { att, keys } = wizzadWord('account');
  assert.match(verifyHostWord(att, defense).reason, /published keys/);
  assert.match(verifyHostWord(att, defense, { keys: [] }).reason, /not among the published keys/);
  assert.match(verifyHostWord({ ...att, statement: { ...att.statement, note: 'Changed.' } }, defense, keys).reason, /does not hold/);
  const sig = Buffer.from(att.signedBy.signature, 'base64url'); sig[3] ^= 1;
  assert.match(verifyHostWord({ ...att, signedBy: { ...att.signedBy, signature: sig.toString('base64url') } }, defense, keys).reason, /does not hold/);
  assert.match(verifyHostWord(att, { ...defense, id: 'rec-other' }, keys).reason, /another record/);
  assert.match(verifyHostWord({ ...att, signedBy: { ...att.signedBy, algorithm: 'ES256' } }, defense, keys).reason, /not an attestation/);
  assert.match(hostWordLine({ path: 'p', defense, word: att }), /NOT VALID/);
  // A passkey word ignores the keys: it carries its own.
  assert.equal(verifyHostWord(defense.supervised.attestation, defense, keys).valid, true);
});

// ─── v1.4: the window's recording rule, beside what the sitting carries ───────

test('the window’s recording rule reads beside what the sitting in fact carries, and a statement that names the rule is bound to the record’s', () => {
  const cap = { camera: { sha256: 'c'.repeat(64), bytes: 10, mime: 'video/webm', seconds: 1800 } };
  // No rule, nothing said — a record made before v1.4, or a window that recorded nothing.
  assert.equal(recordingRuleWords(defense), '');
  assert.equal(recordingRuleWords({ ...defense, supervised: { ...defense.supervised, recording: 'none' }, capture: cap }), '');
  assert.equal(recordingRuleWords({ ...defense, supervised: { ...defense.supervised, recording: 'camera_screen' }, capture: cap }), 'window required camera and screen; sitting carries the camera only');
  assert.equal(recordingRuleWords({ ...defense, supervised: { ...defense.supervised, recording: 'camera_screen' }, capture: { ...cap, screen: cap.camera } }), 'window required camera and screen; sitting carries both');
  assert.equal(recordingRuleWords({ ...defense, supervised: { ...defense.supervised, recording: 'camera_screen' } }), 'window required camera and screen; sitting carries no recording');
  assert.equal(recordingRuleWords({ ...defense, supervised: { ...defense.supervised, recording: 'camera' }, capture: cap }), 'window required the camera; sitting carries it');
  // A word given before the rule existed still checks against a record that carries one; the line carries the rule.
  const recorded = { ...defense, supervised: { ...defense.supervised, recording: 'camera_screen' }, capture: cap };
  assert.equal(verifyHostWord(defense.supervised.attestation, recorded).valid, true);
  const line = hostWordLine({ path: 'p', defense: recorded, word: defense.supervised.attestation });
  assert.match(line, /window required camera and screen; sitting carries the camera only · key/);
  assert.match(hostWordLine({ path: 'p', defense: recorded, word: null }), /sitting carries the camera only · awaiting the host’s word$/);
  // A word through Wizzad that names the rule: bound to the record's, a mismatch or an unknown rule is refused by name.
  const { att, keys } = wizzadWord('account', { statement: { recording: 'camera_screen' } });
  const r = verifyHostWord(att, recorded, keys);
  assert.equal(r.valid, true, r.reason);
  assert.equal(r.recording, 'camera_screen');
  assert.match(verifyHostWord(att, { ...recorded, supervised: { ...recorded.supervised, recording: 'camera' } }, keys).reason, /another recording rule/);
  assert.equal(verifyHostWord(att, defense, keys).valid, true, 'a record without the field binds nothing on it');
  const odd = wizzadWord('account', { statement: { recording: 'audio' } });
  assert.match(verifyHostWord(odd.att, recorded, odd.keys).reason, /unknown recording rule/);
});
