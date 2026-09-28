/**
 * The host's word on a sitting sat with a host in the room (the Defended Work Standard v1.2, §4.4.1).
 *
 * A defense carries `supervised.attestation` once the host who watched it signed what they saw with their own passkey.
 * The attestation is a STATEMENT (canonical JSON), a WebAuthn assertion whose challenge is the statement's SHA-256,
 * and the host's public key (SPKI). This checks it with Node's crypto and nothing else:
 *
 *   1. the challenge is base64url(SHA-256(canonical JSON of the statement));
 *   2. the client data is of type `webauthn.get`, names that challenge and the origin, and the origin is on the RP id;
 *   3. the authenticator data hashes the RP id and has the user-present and user-verified flags;
 *   4. the key's id is the first 16 hex of the SHA-256 of its SPKI;
 *   5. the signature over authenticatorData ‖ SHA-256(clientDataJSON) holds under that key (ES256, RS256 or EdDSA);
 *   6. the statement names the sitting it sits beside: the record id, the window, the attempt, the host's domain.
 *
 * Valid means: the holder of that passkey signed those words about that sitting. The host's name and organisation
 * are as the host entered them; the domain is of a school address Wizzad confirmed. Nothing here says who the host is.
 */
import { createHash, createPublicKey, verify as nodeVerify } from 'node:crypto';
import { canonicalJson } from './canonical.js';

export const HOST_WORD_SCHEMA = 'wizzad.host-word/v1';
export const EXCEPTION_WORDS = {
  left_room: 'the student left the room',
  other_device: 'another device was used',
  technical_fault: 'a technical fault interrupted the sitting',
};

const sha256 = (data) => createHash('sha256').update(data).digest();
const b64u = (s) => Buffer.from(String(s), 'base64url');
const str = (x) => typeof x === 'string' && x.length > 0;

/** The challenge for a statement: its canonical JSON, hashed, base64url. */
export function challengeOf(statement) {
  return sha256(canonicalJson(statement)).toString('base64url');
}

/** A key's id: the first 16 hex characters of the SHA-256 over its SPKI DER — the record's rule for every key. */
export function keyIdOfSpki(spkiBase64) {
  return sha256(Buffer.from(spkiBase64, 'base64')).toString('hex').slice(0, 16);
}

function shaped(att) {
  if (!att || typeof att !== 'object') return false;
  const s = att.statement, a = att.assertion, k = att.key;
  if (!s || !a || !k || typeof s !== 'object' || typeof a !== 'object' || typeof k !== 'object') return false;
  return s.schema === HOST_WORD_SCHEMA && str(s.recordId) && str(s.windowId) && str(s.signedAt) && s.piece && typeof s.piece.attempt === 'number'
    && s.host && str(s.host.name) && str(s.host.domain) && Array.isArray(s.exceptions)
    && str(att.challenge) && str(a.clientDataJSON) && str(a.authenticatorData) && str(a.signature)
    && str(k.spki) && ['ES256', 'RS256', 'EdDSA'].includes(k.alg) && str(k.keyId) && str(att.rpId) && str(att.origin);
}

function holds(alg, key, data, sig) {
  try {
    if (alg === 'ES256') return key.asymmetricKeyType === 'ec' && nodeVerify('sha256', data, { key, dsaEncoding: 'der' }, sig);
    if (alg === 'RS256') return key.asymmetricKeyType === 'rsa' && nodeVerify('sha256', data, key, sig);
    return key.asymmetricKeyType === 'ed25519' && nodeVerify(null, data, key, sig);
  } catch { return false; }
}

/**
 * Check a host's word. `expect` binds it to the defense it is shown beside — pass the defense itself, or
 * `{ recordId, windowId, attempt, hostDomain }`; leave a field out to skip that binding.
 * Returns `{ valid, reason?, keyId, signedAt, host, watched, exceptions, note }`.
 */
export function verifyHostWord(att, expect = {}) {
  const fail = (reason) => ({ valid: false, reason });
  if (!shaped(att)) return fail('not an attestation');
  const s = att.statement;
  const expected = challengeOf(s);
  if (att.challenge !== expected) return fail('the challenge is not the statement’s hash');
  let cd;
  const cdj = b64u(att.assertion.clientDataJSON);
  try { cd = JSON.parse(cdj.toString('utf8')); } catch { return fail('client data does not parse'); }
  if (!cd || cd.type !== 'webauthn.get') return fail('client data is not a webauthn.get');
  if (cd.challenge !== expected) return fail('client data names another challenge');
  let host = null;
  try { host = new URL(att.origin).hostname; } catch { host = null; }
  if (cd.origin !== att.origin || !host || !(host === att.rpId || host.endsWith(`.${att.rpId}`))) return fail('the origin is not the attestation’s, or not on its RP id');
  const authData = b64u(att.assertion.authenticatorData);
  if (authData.length < 37) return fail('authenticator data too short');
  if (!authData.subarray(0, 32).equals(sha256(att.rpId))) return fail('authenticator data hashes another RP id');
  const flags = authData[32];
  if ((flags & 0x01) === 0) return fail('user presence flag not set');
  if ((flags & 0x04) === 0) return fail('user verification flag not set');
  let key;
  try { key = createPublicKey({ key: Buffer.from(att.key.spki, 'base64'), format: 'der', type: 'spki' }); } catch { return fail('the key does not parse'); }
  if (keyIdOfSpki(att.key.spki) !== att.key.keyId) return fail('the key id is not the key’s');
  if (!holds(att.key.alg, key, Buffer.concat([authData, sha256(cdj)]), b64u(att.assertion.signature))) return fail('the signature does not hold');
  const e = expect?.supervised ? { recordId: expect.id, windowId: expect.supervised.windowId, attempt: expect.attempt, hostDomain: expect.supervised.host?.domain } : expect;
  if (e.recordId !== undefined && s.recordId !== e.recordId) return fail('names another record');
  if (e.windowId !== undefined && s.windowId !== e.windowId) return fail('names another window');
  if (e.attempt !== undefined && s.piece.attempt !== e.attempt) return fail('names another attempt');
  if (e.hostDomain !== undefined && e.hostDomain !== null && s.host.domain !== e.hostDomain) return fail('names another host');
  return { valid: true, keyId: att.key.keyId, signedAt: s.signedAt, host: s.host, watched: s.watched, exceptions: s.exceptions, note: s.note ?? null };
}

/** Every sitting sat with a host in a proof payload, with its word where given: `[{ path, defense, word }]`. */
export function hostWordsIn(payload) {
  const out = [];
  const defenses = payload?.record?.defenses ?? [];
  defenses.forEach((d, i) => {
    if (d?.condition !== 'supervised') return;
    out.push({ path: `record.defenses[${i}]`, defense: d, word: d.supervised?.attestation ?? null });
  });
  return out;
}

/** The host's word in one line, for the eye. */
export function hostWordLine(entry) {
  const d = entry.defense;
  const h = d.supervised?.host;
  const who = h ? `${h.name}${h.organisation ? `, ${h.organisation}` : ''} (${h.domain})` : 'a host';
  if (!entry.word) return `${entry.path} · sat with ${who} · awaiting the host’s word`;
  const r = verifyHostWord(entry.word, d);
  if (!r.valid) return `${entry.path} · sat with ${who} · host’s word NOT VALID — ${r.reason}`;
  const ex = r.exceptions.map((x) => EXCEPTION_WORDS[x] ?? x);
  return `${entry.path} · ${who} signed ${r.signedAt} · watched the whole sitting${ex.length ? `, though ${ex.join('; ')}` : ''}${r.note ? ` · note: “${r.note}”` : ''} · key ${r.keyId} · VALID`;
}
