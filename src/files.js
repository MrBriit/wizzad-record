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

/**
 * Fingerprints a record carries under a name of their own rather than `sha256` — the rest of what the record's own
 * page lists as files a reader can check (its Part III): a science project's lab-notebook photo, a notebook re-run's
 * outputs as submitted and when re-run, and each live run's code as run and output as kept. Each rule names the object
 * the field sits in, anchored on the project, so no other 64-hex value (a signature, a key, a record id) is taken for a file.
 */
const NAMED = [
  [/(^|\.)project\.entries\[\d+\]$/, 'photo'],
  [/(^|\.)project\.reproduction\.outputs$/, 'submitted'],
  [/(^|\.)project\.reproduction\.outputs$/, 'ran'],
  [/(^|\.)project\.liveRuns\[\d+\]$/, 'code'],
  [/(^|\.)project\.liveRuns\[\d+\]$/, 'output'],
];
/** A lab-notebook entry's own `sha256` is over its moment and its words, which the record does not carry: not a file, and the record's page does not list it as one. */
const NOT_A_FILE = /(^|\.)project\.entries\[\d+\]$/;
const HEX64 = /^[0-9a-f]{64}$/i;

/**
 * Every file fingerprint the payload carries, with the path it sits at: an object's `sha256` by the object's path
 * ('record.defenses[0].elsewhere'), a named one by its own ('record.defenses[0].project.entries[1].photo').
 */
export function fingerprintsIn(payload) {
  const out = [];
  const walk = (v, path) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    for (const [k, x] of Object.entries(v)) {
      if (k === 'sha256' && typeof x === 'string') { if (!NOT_A_FILE.test(path)) out.push({ path, sha256: x.toLowerCase() }); }
      else if (typeof x === 'string' && HEX64.test(x) && NAMED.some(([at, key]) => key === k && at.test(path))) out.push({ path: path ? `${path}.${k}` : k, sha256: x.toLowerCase() });
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
