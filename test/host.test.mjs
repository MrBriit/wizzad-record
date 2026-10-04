import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, generateKeyPairSync, sign as nodeSign } from 'node:crypto';
import { verifyHostWord, hostWordsIn, hostWordLine, hostWordMethod, hostChallengeOf, keyIdOfSpki, canonicalJson, keyRing, recordingRuleWords, entryHashOf, HOST_ROOM_WORD_SCHEMA } from '../src/index.js';

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

test('v1.9: a host a school admitted is named with the school and how it came to be one; the word still checks', () => {
  const byWizzad = { ...defense, supervised: { ...defense.supervised, school: { name: 'Example College', domain: 'example.edu', approvedBy: 'wizzad' } } };
  const byDns = { ...defense, id: 'rec-z', supervised: { ...defense.supervised, attestation: undefined, school: { name: 'Example College', domain: 'example.edu', approvedBy: 'dns' } } };
  const [signed, awaited] = hostWordsIn({ record: { defenses: [byWizzad, byDns] } });
  assert.match(hostWordLine(signed), /Elena Marsh, admitted to host by Example College \(example\.edu\), a school Wizzad approved signed /);
  assert.match(hostWordLine(signed), /VALID$/);
  assert.match(hostWordLine(awaited), /sat with Elena Marsh, admitted to host by Example College \(example\.edu\), a school added by its domain’s owner · awaiting the host’s word$/);
  // The school is beside the word, not in it: the host's signature checks as it did.
  assert.equal(verifyHostWord(byWizzad.supervised.attestation, byWizzad).valid, true);
});

test('v1.6: a sitting a reader asked for and hosted is said to be one — and read as a host at the school without the field', () => {
  const payload = { record: { defenses: [{ ...defense, supervised: { ...defense.supervised, readerHosted: true } }, { ...defense, id: 'rec-y', supervised: { ...defense.supervised, attestation: undefined, readerHosted: true } }] } };
  const [signed, awaited] = hostWordsIn(payload);
  assert.match(hostWordLine(signed), /Elena Marsh, Example College \(example\.edu, a reader who asked for it\) signed /);
  assert.match(hostWordLine(signed), /VALID$/);
  assert.match(hostWordLine(awaited), /sat with Elena Marsh, Example College \(example\.edu, a reader who asked for it\) · awaiting the host’s word$/);
  assert.doesNotMatch(hostWordLine(hostWordsIn({ record: { defenses: [defense] } })[0]), /a reader who asked/);
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

// ─── v1.10: one word for the room ────────────────────────────────────────────

/** A room of three sittings, signed once as an authenticator signs: each sitting's statement, the room over them. */
function roomWord() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const host = { name: 'E. Marsh', organisation: 'Example College', domain: 'example.edu' };
  const statementOf = (i, extra = {}) => ({ schema: 'wizzad.host-word/v1', recordId: `rec-${i}`, sealedAt: '2026-10-06T15:20:00.000Z', payloadSha256: String(i).repeat(64).slice(0, 64), checkinId: `ci-${i}`, windowId: 'w9', piece: { title: `Piece ${i}`, attempt: 1 }, host, watched: 'whole', exceptions: [], note: null, signedAt: '2026-10-06T15:40:00.000Z', recording: 'none', ...extra });
  const statements = [statementOf(1), statementOf(2, { exceptions: ['left_room'], note: 'Back in two minutes.' }), statementOf(3)];
  const room = { schema: HOST_ROOM_WORD_SCHEMA, windowId: 'w9', host, watched: 'whole', recording: 'none', signedAt: '2026-10-06T15:40:00.000Z', entries: statements.map(entryHashOf) };
  const challenge = hostChallengeOf(room);
  const cdj = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'https://wizzad.ai', crossOrigin: false }));
  const authData = Buffer.alloc(37); createHash('sha256').update('wizzad.ai').digest().copy(authData, 0); authData[32] = 0x05; authData.writeUInt32BE(9, 33);
  const signature = nodeSign('sha256', Buffer.concat([authData, createHash('sha256').update(cdj).digest()]), pair.privateKey);
  const parts = { challenge, assertion: { credentialId: 'c', clientDataJSON: cdj.toString('base64url'), authenticatorData: authData.toString('base64url'), signature: signature.toString('base64url') }, key: { spki, alg: 'ES256', keyId: keyIdOfSpki(spki) }, rpId: 'wizzad.ai', origin: 'https://wizzad.ai' };
  return { statements, room, parts, wordFor: (i) => ({ statement: statements[i], room, ...parts }) };
}
const expectFor = (i) => ({ recordId: `rec-${i + 1}`, windowId: 'w9', attempt: 1, hostDomain: 'example.edu' });

test('v1.10: a word given once for the room verifies for each sitting in it — its own statement, found in the room, under one signature', () => {
  const { wordFor, room } = roomWord();
  for (const i of [0, 1, 2]) {
    const r = verifyHostWord(wordFor(i), expectFor(i));
    assert.equal(r.valid, true, r.reason);
    assert.deepEqual(r.room, { sittings: 3 });
  }
  assert.deepEqual(verifyHostWord(wordFor(1), expectFor(1)).exceptions, ['left_room']);
  // The room names the others only by hash: nothing of another sitting is on this one's record.
  assert.equal(JSON.stringify(wordFor(0)).includes('Piece 2'), false);
  assert.equal(room.entries.length, 3);
});

test('v1.10: a room word is refused for a sitting not in it, a statement changed, a room changed, or a statement that disagrees with its room', () => {
  const { wordFor, statements, room, parts } = roomWord();
  const w = wordFor(1);
  // The note changed after signing: its hash is not one of the room's.
  assert.match(verifyHostWord({ ...w, statement: { ...w.statement, note: 'Nothing to report.' } }, expectFor(1)).reason, /not one of its room/);
  // A sitting of another room, carried beside this room's signature.
  const stranger = { ...statements[0], recordId: 'rec-x', checkinId: 'ci-x' };
  assert.match(verifyHostWord({ statement: stranger, room, ...parts }, { recordId: 'rec-x' }).reason, /not one of its room/);
  // The room changed (one entry dropped): the challenge is no longer its hash.
  assert.match(verifyHostWord({ ...w, room: { ...room, entries: [room.entries[1]] } }, expectFor(1)).reason, /room’s hash/);
  // The sitting's statement names another time than its room.
  assert.match(verifyHostWord({ ...w, statement: { ...w.statement, signedAt: '2026-10-06T15:41:00.000Z' } }, expectFor(1)).reason, /disagrees/);
  assert.match(verifyHostWord({ ...w, room: { ...room, schema: 'nope' } }, expectFor(1)).reason, /not one/);
});

test('v1.10: a room word confirmed through the host’s account verifies under Wizzad’s published keys; its line says it covered the room', () => {
  const { statements, room } = roomWord();
  const pair = generateKeyPairSync('ed25519');
  const spki = pair.publicKey.export({ type: 'spki', format: 'der' });
  const keyId = createHash('sha256').update(spki).digest('hex').slice(0, 16);
  const keys = { keys: [{ keyId, algorithm: 'Ed25519', publicKey: spki.toString('base64') }] };
  const signature = nodeSign(null, Buffer.from(canonicalJson(room), 'utf8'), pair.privateKey).toString('base64url');
  const att = { method: 'account', statement: statements[2], room, signedBy: { algorithm: 'Ed25519', keyId, signature } };
  const r = verifyHostWord(att, expectFor(2), keys);
  assert.equal(r.valid, true, r.reason);
  assert.deepEqual(r.room, { sittings: 3 });
  // Over the statement alone instead of the room, the signature does not hold.
  const wrong = nodeSign(null, Buffer.from(canonicalJson(statements[2]), 'utf8'), pair.privateKey).toString('base64url');
  assert.match(verifyHostWord({ ...att, signedBy: { ...att.signedBy, signature: wrong } }, expectFor(2), keys).reason, /does not hold/);
  // A link to the school address does not carry a room.
  assert.match(verifyHostWord({ ...att, method: 'email', email: { domain: 'example.edu', confirmedAt: 't' } }, expectFor(2), keys).reason, /passkey or through/);
  const defense = { id: 'rec-3', attempt: 1, condition: 'supervised', supervised: { windowId: 'w9', host: statements[2].host, attestation: att } };
  assert.match(hostWordLine({ path: 'record.defenses[0]', defense, word: att }, keys), /one word for the 3 sittings in the room · Wizzad’s signature/);
});


// Two sittings the platform's integration run sealed in one window and a host signed for in one passkey ceremony:
// supervised.integration.test.ts writes them when HOST_ROOM_WORD_FIXTURE names the path.
test('v1.10: a room word from the platform verifies on each record, under the one signature, each record holding only its own sitting', () => {
  const { defenses } = fx('room-word.json');
  assert.equal(defenses.length, 2);
  const [a, b] = defenses;
  for (const d of defenses) {
    const r = verifyHostWord(d.supervised.attestation, d);
    assert.equal(r.valid, true, r.reason);
    assert.deepEqual(r.room, { sittings: 2 });
    assert.equal(d.supervised.attestation.statement.recordId, d.id);
    assert.match(hostWordLine({ path: 'record.defenses[0]', defense: d, word: d.supervised.attestation }), /one word for the 2 sittings in the room/);
  }
  assert.equal(a.supervised.attestation.assertion.signature, b.supervised.attestation.assertion.signature);
  assert.deepEqual(a.supervised.attestation.room, b.supervised.attestation.room);
  assert.equal(JSON.stringify(a).includes(b.id), false);
  assert.deepEqual(verifyHostWord(b.supervised.attestation, b).exceptions, ['left_room']);
  // One record's word carried onto the other is not that record's.
  assert.equal(verifyHostWord(a.supervised.attestation, b).valid, false);
});

// Build 3 audit: a room word's statement is exactly its entry plus what the room fixes — nothing unsigned rides on it.
test('v1.10: a sitting that carries a field its room did not sign is refused — at the top, or in host', () => {
  const { defenses } = fx('room-word.json');
  const d = defenses[0];
  const att = d.supervised.attestation;
  assert.equal(verifyHostWord(att, d).valid, true);
  for (const statement of [{ ...att.statement, verifiedBy: 'Wizzad' }, { ...att.statement, host: { ...att.statement.host, title: 'Dean of Admissions' } }]) {
    const r = verifyHostWord({ ...att, statement }, d);
    assert.equal(r.valid, false);
    assert.match(r.reason, /did not sign|disagrees/);
  }
});

test('v1.10: a room past sixty sittings, or whose host has no organisation key, is not a room', () => {
  const { wordFor, room } = roomWord();
  const w = wordFor(0);
  const many = { ...room, entries: Array.from({ length: 61 }, (_, i) => createHash('sha256').update(String(i)).digest('base64url')) };
  assert.match(verifyHostWord({ ...w, room: many }, expectFor(0)).reason, /not one/);
  const { organisation: _o, ...hostWithout } = room.host;
  assert.match(verifyHostWord({ ...w, room: { ...room, host: hostWithout } }, expectFor(0)).reason, /not one/);
});
