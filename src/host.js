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
 *
 * Since v1.3 a host may instead give their word THROUGH WIZZAD (§4.4.2): signed in, they confirm the statement
 * (`method: 'account'`), or they open a one-time link sent to their confirmed school address (`method: 'email'`), and
 * Wizzad signs the statement with the record's own Ed25519 key. Such a word is checked under Wizzad's published keys
 * (pass them in, as for the record itself); *valid* then means: Wizzad signed these words, and says the host gave them
 * that way. It is Wizzad's word, not the host's key, and the line says so.
 */
import { createHash, createPublicKey, verify as nodeVerify } from 'node:crypto';
import { canonicalJson } from './canonical.js';
import { keyRing, publicKeyObject, revocationOf } from './keys.js';

export const HOST_WORD_SCHEMA = 'wizzad.host-word/v1';
export const EXCEPTION_WORDS = {
  left_room: 'the student left the room',
  other_device: 'another device was used',
  technical_fault: 'a technical fault interrupted the sitting',
};

const sha256 = (data) => createHash('sha256').update(data).digest();
const b64u = (s) => Buffer.from(String(s), 'base64url');
const str = (x) => typeof x === 'string' && x.length > 0;

/** How the word was given: the host's own passkey (no `method`, the original form), or through Wizzad. */
export function wordMethod(att) {
  return att?.method === 'account' ? 'account' : att?.method === 'email' ? 'email' : 'passkey';
}

function statementShaped(s) {
  return !!s && typeof s === 'object' && s.schema === HOST_WORD_SCHEMA && str(s.recordId) && str(s.windowId) && str(s.signedAt) && s.piece && typeof s.piece.attempt === 'number'
    && s.host && str(s.host.name) && str(s.host.domain) && Array.isArray(s.exceptions);
}

function shapedWizzad(att) {
  if (!att || typeof att !== 'object' || (att.method !== 'account' && att.method !== 'email')) return false;
  const b = att.signedBy;
  if (!statementShaped(att.statement) || !b || typeof b !== 'object' || b.algorithm !== 'Ed25519' || !str(b.keyId) || !str(b.signature)) return false;
  if (att.method === 'email') return !!att.email && typeof att.email === 'object' && str(att.email.domain) && str(att.email.confirmedAt);
  return true;
}

const RECORDINGS = ['none', 'camera', 'camera_screen'];

function bound(s, e) {
  if (e.recordId !== undefined && s.recordId !== e.recordId) return 'names another record';
  if (e.windowId !== undefined && s.windowId !== e.windowId) return 'names another window';
  if (e.attempt !== undefined && s.piece.attempt !== e.attempt) return 'names another attempt';
  // Since v1.4 the statement may name the window's recording rule; where both it and the record do, they agree.
  if (s.recording !== undefined && !RECORDINGS.includes(s.recording)) return 'names an unknown recording rule';
  if (s.recording !== undefined && e.recording !== undefined && e.recording !== null && s.recording !== e.recording) return 'names another recording rule';
  if (e.hostDomain !== undefined && e.hostDomain !== null && s.host.domain !== e.hostDomain) return 'names another host';
  return null;
}

/** A word given through Wizzad: Wizzad's Ed25519 signature over the statement's canonical JSON, under a published key. */
function verifyWizzadWord(att, expect, keys) {
  const fail = (reason) => ({ valid: false, reason });
  if (!shapedWizzad(att)) return fail('not an attestation');
  if (!keys) return fail('a word given through Wizzad is checked under Wizzad’s published keys: pass them (--keys)');
  let ring;
  try { ring = keys instanceof Map ? keys : keyRing(keys); } catch (err) { return fail(`keys: ${err.message}`); }
  const keyId = att.signedBy.keyId;
  const revoked = revocationOf(keyId, ring);
  if (revoked) return fail(`key ${keyId} was revoked by Wizzad from ${revoked.revokedFrom}: ${revoked.reason}`);
  const raw = ring.get(keyId);
  if (!raw) return fail(`key ${keyId} is not among the published keys`);
  const bytes = b64u(att.signedBy.signature);
  if (bytes.length !== 64) return fail('signature is not 64 bytes');
  let ok = false;
  try { ok = nodeVerify(null, Buffer.from(canonicalJson(att.statement), 'utf8'), publicKeyObject(raw), bytes); } catch { ok = false; }
  if (!ok) return fail('the signature does not hold');
  const s = att.statement;
  const e = expect?.supervised ? { recordId: expect.id, windowId: expect.supervised.windowId, attempt: expect.attempt, hostDomain: expect.supervised.host?.domain, recording: expect.supervised.recording } : expect ?? {};
  const b = bound(s, e);
  if (b) return fail(b);
  return { valid: true, method: att.method, keyId, signedAt: s.signedAt, host: s.host, watched: s.watched, exceptions: s.exceptions, note: s.note ?? null, recording: s.recording ?? null, email: att.email ?? null };
}

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
 * `{ recordId, windowId, attempt, hostDomain }`; leave a field out to skip that binding. `keys` — Wizzad's published
 * keys, as for the record — are needed only for a word given through Wizzad (§4.4.2).
 * Returns `{ valid, reason?, method, keyId, signedAt, host, watched, exceptions, note, email? }`.
 */
export function verifyHostWord(att, expect = {}, keys = null) {
  if (att && (att.method === 'account' || att.method === 'email')) return verifyWizzadWord(att, expect, keys);
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
  const e = expect?.supervised ? { recordId: expect.id, windowId: expect.supervised.windowId, attempt: expect.attempt, hostDomain: expect.supervised.host?.domain, recording: expect.supervised.recording } : expect;
  const b = bound(s, e);
  if (b) return fail(b);
  return { valid: true, method: 'passkey', keyId: att.key.keyId, signedAt: s.signedAt, host: s.host, watched: s.watched, exceptions: s.exceptions, note: s.note ?? null, recording: s.recording ?? null };
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

/**
 * The window's recording rule beside what the sitting in fact carries (§4.4.1, since v1.4): "window required camera and
 * screen; sitting carries both" — or, honestly, "carries the camera only", "carries no recording". Empty where the
 * window recorded nothing.
 */
export function recordingRuleWords(defense) {
  const rule = defense?.supervised?.recording;
  if (!rule || rule === 'none') return '';
  const c = defense.capture ?? {};
  const has = [c.camera ? 'camera' : null, c.screen ? 'screen' : null].filter(Boolean);
  const required = rule === 'camera' ? 'the camera' : 'camera and screen';
  const carries = has.length === 0 ? 'carries no recording'
    : has.length === 2 ? (rule === 'camera' ? 'carries both the camera and the screen' : 'carries both')
    : rule === 'camera' && has[0] === 'camera' ? 'carries it'
    : `carries the ${has[0]} only`;
  return `window required ${required}; sitting ${carries}`;
}

/** The host's word in one line, for the eye. `keys` as for verifyHostWord. */
export function hostWordLine(entry, keys = null) {
  const d = entry.defense;
  const h = d.supervised?.host;
  // v1.6: a reader of the record who asked for this sitting and hosted it is said to be one.
  const reader = d.supervised?.readerHosted === true ? ', a reader who asked for it' : '';
  const who = h ? `${h.name}${h.organisation ? `, ${h.organisation}` : ''} (${h.domain}${reader})` : `a host${reader}`;
  const rule = recordingRuleWords(d);
  if (!entry.word) return `${entry.path} · sat with ${who}${rule ? ` · ${rule}` : ''} · awaiting the host’s word`;
  const r = verifyHostWord(entry.word, d, keys);
  if (!r.valid) return `${entry.path} · sat with ${who} · host’s word NOT VALID — ${r.reason}`;
  const ex = r.exceptions.map((x) => EXCEPTION_WORDS[x] ?? x);
  const saw = `watched the whole sitting${ex.length ? `, though ${ex.join('; ')}` : ''}${r.note ? ` · note: “${r.note}”` : ''}${rule ? ` · ${rule}` : ''}`;
  if (r.method === 'passkey') return `${entry.path} · ${who} signed ${r.signedAt} · ${saw} · key ${r.keyId} · VALID`;
  const how = r.method === 'account' ? 'confirmed through their Wizzad account' : `confirmed by a link to their school address at ${r.email?.domain ?? h?.domain ?? '?'}`;
  return `${entry.path} · ${who} ${how} ${r.signedAt} · ${saw} · Wizzad’s signature, key ${r.keyId} · VALID (Wizzad’s word that the host gave it)`;
}
