import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, generateKeyPairSync, sign as nodeSign } from 'node:crypto';
import { canonicalJson, verifyStanding, standingsIn, standingLine, standingOfSittings, statusesAllowed, PRACTICE_GAIN } from '../src/index.js';

const CASES = JSON.parse(readFileSync(new URL('./fixtures/standing-cases.json', import.meta.url), 'utf8'));
const res = (r = {}) => ({ checked: 0, checkedCorrect: 0, explained: 0, explainedFull: 0, explainedPartial: 0, episodic: 0, episodicAccounted: 0, history: 0, historyConnected: 0, ungraded: 0, late: 0, skipped: 0, ...r });

test('the worked standings: the same answer as the platform', () => {
  assert.equal(PRACTICE_GAIN, CASES.practiceGain);
  for (const c of CASES.cases) {
    const s = standingOfSittings(c.sittings.map((x) => ({ ...x, results: res(x.results) })));
    assert.equal(s.status, c.expect.status, c.name);
    assert.equal(s.pending, c.expect.pending, c.name);
    if ('z' in c.expect) assert.equal(s.gap === null ? null : Math.round(s.gap.z * 100) / 100, c.expect.z, c.name);
    if (c.expect.second) assert.equal(s.gap?.second, c.expect.second, c.name);
    if (c.expect.remote) assert.deepEqual({ credit: s.remote?.credit, n: s.remote?.n }, c.expect.remote, c.name);
    if (c.expect.supervised) assert.deepEqual({ credit: s.supervised?.credit, n: s.supervised?.n }, c.expect.supervised, c.name);
    if (c.expect.keys) assert.deepEqual(s.keys, c.expect.keys, c.name);
  }
});

test('a record may carry a milder status than the rules give while unreviewed — never a harsher one', () => {
  assert.deepEqual(statusesAllowed('verified'), ['verified']);
  assert.deepEqual(statusesAllowed('not_yet_verified'), ['not_yet_verified']);
  assert.deepEqual(statusesAllowed('more_evidence'), ['more_evidence', 'verified']);
  assert.deepEqual(statusesAllowed('not_verified'), ['not_verified', 'more_evidence', 'verified']);
});

// ─── A record: two pieces, a host's word given through Wizzad under a published key ──

const pair = generateKeyPairSync('ed25519');
const spki = pair.publicKey.export({ type: 'spki', format: 'der' });
const keyId = createHash('sha256').update(spki).digest('hex').slice(0, 16);
const keys = { keys: [{ keyId, algorithm: 'Ed25519', publicKey: spki.toString('base64') }] };
const host = { name: 'Elena Marsh', organisation: 'Example College', domain: 'example.edu' };

function wordFor(defense, exceptions = []) {
  const statement = { schema: 'wizzad.host-word/v1', recordId: defense.id, sealedAt: '2026-10-06T15:20:00.000Z', payloadSha256: 'a'.repeat(64), checkinId: 'ci', windowId: defense.supervised.windowId, piece: { title: defense.title, attempt: defense.attempt }, host, watched: 'whole', exceptions, note: null, signedAt: '2026-10-06T15:24:00.000Z' };
  const signature = nodeSign(null, Buffer.from(canonicalJson(statement), 'utf8'), pair.privateKey).toString('base64url');
  return { method: 'account', statement, signedBy: { algorithm: 'Ed25519', keyId, signature } };
}
const remote = (id, title, right, of) => ({ id, title, sealedOn: '2026-10-05', attempt: 1, identity: 'session', results: res({ checked: of, checkedCorrect: right }) });
function supervised(id, title, right, of, exceptions) {
  const d = { id, title, sealedOn: '2026-10-06', attempt: 2, identity: 'session', condition: 'supervised', supervised: { windowId: 'w1', host, identityConfirmed: true }, results: res({ checked: of, checkedCorrect: right }) };
  if (exceptions) d.supervised.attestation = wordFor(d, exceptions);
  return d;
}

function record() {
  // Newest first: the supervised sitting on the osmosis lab came after its remote one.
  const defenses = [supervised('rec-3', 'Osmosis lab', 7, 10, []), remote('rec-2', 'Budget model', 6, 8), remote('rec-1', 'Osmosis lab', 10, 10)];
  const standings = [
    { title: 'Osmosis lab', defenses: [0, 2], status: 'verified', supervised: { credit: 7, n: 10, sittings: 1 }, remote: { credit: 10, n: 10, sittings: 1 } },
    { title: 'Budget model', defenses: [1], status: 'not_yet_verified', supervised: null, remote: { credit: 6, n: 8, sittings: 1 } },
  ];
  return { record: { defenses, standings } };
}

test('a record’s standings recompute from its sittings, with the host’s word checked under the published keys', () => {
  const p = record();
  const entries = standingsIn(p);
  assert.deepEqual(entries.map((e) => e.path), ['record.standings[0]', 'record.standings[1]']);
  const r0 = verifyStanding(entries[0].standing, p.record.defenses, keys);
  assert.equal(r0.valid, true, r0.reason);
  assert.equal(r0.gap.second, 'supervised');
  assert.equal(Math.round(r0.gap.z * 100) / 100, 2.23); // by hand: (0.30 + 0.06) / 0.1613 — just under 2.3, so Verified
  assert.equal(verifyStanding(entries[1].standing, p.record.defenses, keys).valid, true);
  const line = standingLine(entries[0], p.record.defenses, keys);
  assert.match(line, /^record\.standings\[0\] · Osmosis lab · Verified · supervised 7 of 10 \(1 sitting\) · remote 10 of 10 \(1 sitting\) · gap \+2\.23 SE, supervised sat second · MATCHES its sittings$/);
});

test('a standing is not valid when it claims more than its sittings give, names the wrong sittings, or its word cannot be counted', () => {
  const p = record();
  const [osmosis, budget] = p.record.standings;
  // Verified with no supervised sitting that counts.
  assert.match(verifyStanding({ ...budget, status: 'verified' }, p.record.defenses, keys).reason, /needs a supervised sitting/);
  // Credit that is not the sittings' own.
  assert.match(verifyStanding({ ...osmosis, supervised: { credit: 9, n: 10, sittings: 1 } }, p.record.defenses, keys).reason, /supervised credit/);
  assert.match(verifyStanding({ ...osmosis, remote: null }, p.record.defenses, keys).reason, /remote credit/);
  // A place the record does not have, or another piece's sitting.
  assert.match(verifyStanding({ ...osmosis, defenses: [0, 9] }, p.record.defenses, keys).reason, /does not carry/);
  assert.match(verifyStanding({ ...osmosis, defenses: [0, 1] }, p.record.defenses, keys).reason, /another piece/);
  // A host's word given through Wizzad needs the published keys to count.
  assert.match(verifyStanding(osmosis, p.record.defenses, null).reason, /published keys/);
  // A touched word does not hold, so the sitting does not count, so Verified does not hold either.
  const touched = structuredClone(p.record.defenses);
  touched[0].supervised.attestation.statement.note = 'changed';
  assert.match(verifyStanding({ ...osmosis, supervised: null }, touched, keys).reason ?? '', /status/);
  // A host who noted another device: the sitting does not count.
  const other = [supervised('rec-3', 'Osmosis lab', 7, 10, ['other_device']), p.record.defenses[1], p.record.defenses[2]];
  assert.match(verifyStanding(osmosis, other, keys).reason, /supervised credit/);
  assert.equal(verifyStanding({ ...osmosis, status: 'not_yet_verified', supervised: null }, other, keys).valid, true);
  assert.equal(verifyStanding(null, p.record.defenses, keys).valid, false);
});

test('shadow mode: a remote score far above the supervised one may be carried as Verified until reviewed, and as More evidence requested once released — never harsher', () => {
  const defenses = [supervised('rec-3', 'Osmosis lab', 3, 10, []), remote('rec-1', 'Osmosis lab', 10, 10)];
  const base = { title: 'Osmosis lab', defenses: [0, 1], supervised: { credit: 3, n: 10, sittings: 1 }, remote: { credit: 10, n: 10, sittings: 1 } };
  assert.equal(verifyStanding({ ...base, status: 'verified' }, defenses, keys).valid, true);
  assert.equal(verifyStanding({ ...base, status: 'more_evidence' }, defenses, keys).valid, true);
  assert.match(verifyStanding({ ...base, status: 'not_verified' }, defenses, keys).reason, /status/);
  // The line prints the numbers, never the status a review has not released.
  const line = standingLine({ path: 'p', standing: { ...base, status: 'verified' } }, defenses, keys);
  assert.match(line, /gap \+4\.71 SE/);
  assert.doesNotMatch(line, /More evidence/);
});
