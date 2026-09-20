/**
 * A task's Open Badges 3.0 credential: a W3C Verifiable Credential (v2)
 * with a Data Integrity proof, cryptosuite `eddsa-rdfc-2022`:
 *
 *   1. take the proof off the document; take `proofValue` off the proof;
 *   2. canonicalise both (RDFC-1.0, N-Quads) with the credential's own
 *      `@context` — the two contexts it names are bundled here, and any
 *      other is refused rather than fetched;
 *   3. sign-bytes = sha256(proof config) ‖ sha256(document);
 *   4. `proofValue` (multibase base58-btc) is an Ed25519 signature over
 *      those bytes, under the key `verificationMethod` names.
 *
 * The key is found by the fragment of `verificationMethod` (`did:web:…#<keyId>`)
 * in the key ring — the issuer's DID document, or `/api/proof/keys`.
 */
import { createHash, verify as nodeVerify } from 'node:crypto';
import { createRequire } from 'node:module';
import { keyRing, publicKeyObject, fromMultibase58 } from './keys.js';

const require = createRequire(import.meta.url);
const jsonld = require('jsonld');
const CONTEXTS = {
  'https://www.w3.org/ns/credentials/v2': require('../contexts/credentials-v2.json'),
  'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json': require('../contexts/ob-v3p0-3.0.3.json'),
};
export const CRYPTOSUITE = 'eddsa-rdfc-2022';

const documentLoader = async (url) => {
  const document = CONTEXTS[url];
  if (!document) throw new Error(`context not bundled, not fetched: ${url}`);
  return { contextUrl: null, documentUrl: url, document };
};

async function canonize(doc) {
  return jsonld.canonize(doc, { canonizeOptions: { algorithm: 'RDFC-1.0' }, documentLoader, safe: true });
}
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest();

/** The bytes the issuer signed: sha256(proof config) ‖ sha256(document), each canonicalised. */
export async function hashData(unsecured, proofConfig) {
  const [config, doc] = await Promise.all([canonize({ '@context': unsecured['@context'], ...proofConfig }), canonize(unsecured)]);
  return Buffer.concat([sha256(config), sha256(doc)]);
}

/** Check a credential against a key ring. Pure over its inputs: nothing is fetched. */
export async function verifyCredential(credential, keys) {
  if (!credential || typeof credential !== 'object') return { valid: false, reason: 'not a credential' };
  const { proof, ...unsecured } = credential;
  if (!proof || proof.type !== 'DataIntegrityProof' || proof.cryptosuite !== CRYPTOSUITE) return { valid: false, reason: `not a DataIntegrityProof with ${CRYPTOSUITE}` };
  if (proof.proofPurpose !== 'assertionMethod') return { valid: false, reason: 'proof purpose is not assertionMethod' };
  const { proofValue, ...config } = proof;
  const keyId = typeof proof.verificationMethod === 'string' ? proof.verificationMethod.split('#').pop() : undefined;
  // Only the contexts bundled here are honoured: a credential naming another is refused before anything is resolved.
  const ctx = Array.isArray(unsecured['@context']) ? unsecured['@context'] : [unsecured['@context']];
  const foreign = ctx.find((c) => typeof c !== 'string' || !CONTEXTS[c]);
  if (foreign !== undefined) return { valid: false, reason: `context not bundled, not fetched: ${typeof foreign === 'string' ? foreign : 'an inline context'}`, keyId };
  let ring;
  try { ring = keys instanceof Map ? keys : keyRing(keys); } catch (err) { return { valid: false, reason: `keys: ${err.message}`, keyId }; }
  const raw = keyId ? ring.get(keyId) : undefined;
  if (!raw) return { valid: false, reason: keyId ? `key ${keyId} (from verificationMethod) is not among the published keys` : 'no verificationMethod', keyId };
  let signature;
  try { signature = fromMultibase58(proofValue); } catch { return { valid: false, reason: 'proofValue is not multibase base58-btc', keyId }; }
  if (signature.length !== 64) return { valid: false, reason: 'proofValue is not a 64-byte signature', keyId };
  let data;
  try { data = await hashData(unsecured, config); } catch (err) { return { valid: false, reason: `could not canonicalise: ${err.message}`, keyId }; }
  const ok = nodeVerify(null, data, publicKeyObject(raw), signature);
  return ok ? { valid: true, keyId, verificationMethod: proof.verificationMethod } : { valid: false, reason: 'the proof does not verify: the credential was changed after it was issued', keyId };
}
