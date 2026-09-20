/**
 * Wizzad's public keys, in every form they are published:
 *
 *   - `/api/proof/keys` — `{ keys: [{ keyId, algorithm: 'Ed25519', publicKey (SPKI DER, base64), publicKeyPem }] }`
 *   - `/proof/issuer/did.json` — a did:web document whose `verificationMethod`s are Multikeys (`z6Mk…`)
 *   - a single key object of either kind, or a bare PEM / SPKI base64 / Multikey string
 *
 * Every form reduces to the same 32 raw Ed25519 bytes. A key's id is the
 * first 16 hex characters of SHA-256 over its SPKI DER encoding, so an id
 * can be checked against the key it names, whichever document carried it.
 */
import { createHash, createPublicKey } from 'node:crypto';

/** The DER prefix of an Ed25519 SubjectPublicKeyInfo; the 32 key bytes follow it. */
export const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function rawFromSpkiDer(der) {
  const b = Buffer.from(der);
  if (b.length !== SPKI_ED25519_PREFIX.length + 32 || !b.subarray(0, SPKI_ED25519_PREFIX.length).equals(SPKI_ED25519_PREFIX)) {
    throw new Error('not an Ed25519 SPKI key');
  }
  return b.subarray(SPKI_ED25519_PREFIX.length);
}

export function rawFromSpkiBase64(b64) {
  return rawFromSpkiDer(Buffer.from(b64, 'base64'));
}

export function rawFromPem(pem) {
  const body = String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return rawFromSpkiBase64(body);
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Multibase base58-btc (a leading `z`) to bytes. */
export function fromMultibase58(s) {
  if (typeof s !== 'string' || s[0] !== 'z') throw new Error('not multibase base58-btc');
  let n = 0n;
  for (const ch of s.slice(1)) {
    const i = B58.indexOf(ch);
    if (i < 0) throw new Error('not base58');
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n % 256n)); n /= 256n; }
  let zeros = 0;
  for (const ch of s.slice(1)) { if (ch === '1') zeros++; else break; }
  return Buffer.from([...new Array(zeros).fill(0), ...bytes]);
}

/** A Multikey (`z6Mk…`, multicodec 0xed01 + 32 bytes) to the raw Ed25519 key. */
export function rawFromMultikey(multikey) {
  const b = fromMultibase58(multikey);
  if (b.length !== 34 || b[0] !== 0xed || b[1] !== 0x01) throw new Error('not an Ed25519 Multikey');
  return b.subarray(2);
}

/** The id Wizzad gives a key: SHA-256 over the SPKI DER, first 16 hex characters. */
export function keyIdOfRaw(raw) {
  return createHash('sha256').update(Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(raw)])).digest('hex').slice(0, 16);
}

/** A Node public-key object for the raw 32 bytes. */
export function publicKeyObject(raw) {
  return createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(raw)]), format: 'der', type: 'spki' });
}

/** One key from whatever form it arrived in: raw 32 bytes. */
export function rawFromAny(k) {
  if (k instanceof Uint8Array) { if (k.length !== 32) throw new Error('raw key is not 32 bytes'); return Buffer.from(k); }
  if (typeof k === 'string') {
    if (k.includes('BEGIN')) return rawFromPem(k);
    if (k.startsWith('z')) return rawFromMultikey(k);
    return rawFromSpkiBase64(k);
  }
  if (k && typeof k === 'object') {
    if (typeof k.publicKeyMultibase === 'string') return rawFromMultikey(k.publicKeyMultibase);
    if (typeof k.publicKey === 'string') return rawFromSpkiBase64(k.publicKey);
    if (typeof k.publicKeyPem === 'string') return rawFromPem(k.publicKeyPem);
  }
  throw new Error('unrecognised key form');
}

/**
 * A key ring: every key in the document, by id. Accepts the `/api/proof/keys`
 * reply, a DID document, an array of either's entries, or one key. The id is
 * recomputed from the bytes — a document cannot claim an id its key does not have.
 */
export function keyRing(source) {
  const entries = Array.isArray(source) ? source
    : source && Array.isArray(source.keys) ? source.keys
    : source && Array.isArray(source.verificationMethod) ? source.verificationMethod
    : [source];
  const ring = new Map();
  for (const e of entries) {
    const raw = rawFromAny(e);
    const id = keyIdOfRaw(raw);
    const claimed = typeof e === 'object' && e ? (e.keyId ?? (typeof e.id === 'string' ? e.id.split('#').pop() : undefined)) : undefined;
    if (claimed !== undefined && claimed !== id) throw new Error(`key ${claimed} does not match its bytes (which hash to ${id})`);
    ring.set(id, raw);
  }
  return ring;
}
