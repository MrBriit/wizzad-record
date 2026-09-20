/**
 * Files the record vouches for — a piece brought in as a Word file, a
 * recording — appear in the payload as SHA-256 fingerprints. A reader who
 * holds a copy hashes it and looks for the same code; the file itself goes
 * nowhere.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** SHA-256 of a file's exact bytes, hex. */
export function fingerprintFile(path) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

/** Every `sha256` the payload carries, with the path it sits at. */
export function fingerprintsIn(payload) {
  const out = [];
  const walk = (v, path) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    for (const [k, x] of Object.entries(v)) {
      if (k === 'sha256' && typeof x === 'string') out.push({ path, sha256: x.toLowerCase() });
      else walk(x, path ? `${path}.${k}` : k);
    }
  };
  walk(payload, '');
  return out;
}

/** Where a fingerprint appears in the payload — empty when the record does not vouch for that file. */
export function matchFingerprint(payload, sha256hex) {
  const want = String(sha256hex).toLowerCase();
  return fingerprintsIn(payload).filter((f) => f.sha256 === want);
}
