/**
 * A Wizzad study record: `{ payload, signature }` — the signature is Ed25519
 * over the canonical JSON of the payload, base64url. The record names the
 * key that signed it (`keyId`); the key ring says whether that key is one
 * Wizzad published.
 *
 * Accepts the `/api/proof/shared/<token>` reply (`payload`, `signature`,
 * `keyId`, `algorithm`), the `/api/proof/verify` reply (`payload`,
 * `signature: { keyId, signature, algorithm }`), or a record saved from either.
 */
import { createHash, verify as nodeVerify } from 'node:crypto';
import { canonicalJson } from './canonical.js';
import { keyRing, publicKeyObject } from './keys.js';

/** The record's signature fields, whichever shape carried them. */
export function signatureOf(record) {
  const s = record?.signature;
  if (s && typeof s === 'object') return { keyId: s.keyId, signature: s.signature, algorithm: s.algorithm ?? 'Ed25519' };
  if (typeof s === 'string') return { keyId: record.keyId, signature: s, algorithm: record.algorithm ?? 'Ed25519' };
  return null;
}

/**
 * Check a record against a key ring. Pure: nothing is fetched. `valid` is
 * true only when the payload's canonical bytes verify under the key the
 * record names AND that key is in the ring.
 */
export function verifyRecord(record, keys) {
  const sig = signatureOf(record);
  if (!record || typeof record.payload !== 'object' || record.payload === null) return { valid: false, reason: 'no payload' };
  if (!sig || typeof sig.signature !== 'string') return { valid: false, reason: 'no signature' };
  if (sig.algorithm !== 'Ed25519') return { valid: false, reason: `algorithm is ${sig.algorithm}, not Ed25519` };
  let ring;
  try { ring = keys instanceof Map ? keys : keyRing(keys); } catch (err) { return { valid: false, reason: `keys: ${err.message}` }; }
  const canonical = canonicalJson(record.payload);
  const canonicalSha256 = createHash('sha256').update(canonical, 'utf8').digest('hex');
  const raw = sig.keyId ? ring.get(sig.keyId) : undefined;
  if (!raw) return { valid: false, reason: sig.keyId ? `key ${sig.keyId} is not among the published keys` : 'the record names no key', keyId: sig.keyId, canonicalSha256 };
  let bytes;
  try { bytes = Buffer.from(sig.signature, 'base64url'); } catch { return { valid: false, reason: 'signature is not base64url', keyId: sig.keyId, canonicalSha256 }; }
  if (bytes.length !== 64) return { valid: false, reason: 'signature is not 64 bytes', keyId: sig.keyId, canonicalSha256 };
  let ok = false;
  try { ok = nodeVerify(null, Buffer.from(canonical, 'utf8'), publicKeyObject(raw), bytes); } catch (err) { return { valid: false, reason: err.message, keyId: sig.keyId, canonicalSha256 }; }
  return ok ? { valid: true, keyId: sig.keyId, canonicalSha256 } : { valid: false, reason: 'the signature does not verify: the payload or the signature was changed after signing', keyId: sig.keyId, canonicalSha256 };
}
