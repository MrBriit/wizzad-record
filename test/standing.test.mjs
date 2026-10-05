import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, generateKeyPairSync, sign as nodeSign } from 'node:crypto';
import { canonicalJson, verifyStanding, standingsIn, standingLine, standingOfSittings, statusesAllowed, standingBand, PRACTICE_GAIN, STANDING_NOTES } from '../src/index.js';

const CASES = JSON.parse(readFileSync(new URL('./fixtures/standing-cases.json', import.meta.url), 'utf8'));
const res = (r = {}) => ({ checked: 0, checkedCorrect: 0, explained: 0, explainedFull: 0, explainedPartial: 0, episodic: 0, episodicAccounted: 0, history: 0, historyConnected: 0, ungraded: 0, late: 0, skipped: 0, ...r });

test('the worked standings: the same answer as the platform', () => {
  assert.equal(PRACTICE_GAIN, CASES.practiceGain);
  for (const c of CASES.cases) {
    const s = standingOfSittings(c.sittings.map((x) => ({ ...x, results: res(x.results) })), PRACTICE_GAIN, c.minimum ?? null);
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
  // v1.11: Awaiting review stands in for an unreviewed gap status — and only for one.
  assert.deepEqual(statusesAllowed('more_evidence', true), ['more_evidence', 'verified', 'awaiting_review']);
  assert.deepEqual(statusesAllowed('not_verified', true), ['not_verified', 'more_evidence', 'verified', 'awaiting_review']);
  assert.deepEqual(statusesAllowed('verified', true), ['verified']);
  assert.deepEqual(statusesAllowed('not_yet_verified', true), ['not_yet_verified']);
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
  // The pools, not the gap (0.6.1): the line never states what a review has not released.
  assert.match(line, /^record\.standings\[0\] · Osmosis lab · Supervised sitting on record · supervised 7 of 10 \(1 sitting\) · remote 10 of 10 \(1 sitting\) · MATCHES its sittings$/);
  assert.doesNotMatch(line, /gap|SE/);
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
  // Another piece's sitting in the list: its credit is not this standing's.
  assert.match(verifyStanding({ ...osmosis, defenses: [0, 1] }, p.record.defenses, keys).reason, /credit/);
  assert.match(verifyStanding({ ...osmosis, defenses: [0, 0, 2] }, p.record.defenses, keys).reason, /twice/);
  assert.match(verifyStanding({ ...osmosis, title: 'Something else' }, p.record.defenses, keys).reason, /newest sitting/);
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

test('v1.6: a sitting hosted by the reader who asked for it — a word given, nothing noted — counts in neither pool; a standing that counts it is not valid', () => {
  const p = record();
  const [osmosis] = p.record.standings;
  const hosted = structuredClone(p.record.defenses);
  hosted[0].supervised.readerHosted = true;
  // Claimed as Verified on it: the sittings give no supervised pool.
  assert.match(verifyStanding(osmosis, hosted, keys).reason, /supervised credit|needs a supervised sitting/);
  // Carried as not yet verified, with no supervised pool: valid — and the sitting is in neither pool.
  const r = verifyStanding({ ...osmosis, status: 'not_yet_verified', supervised: null }, hosted, keys);
  assert.equal(r.valid, true, r.reason);
  // The same sitting from an admitted host counts as before.
  assert.equal(verifyStanding(osmosis, p.record.defenses, keys).valid, true);
});

test('v1.7: a sitting a person’s review set aside counts in neither pool; one whose answers were regraded counts by the results the record carries', () => {
  const p = record();
  const [osmosis] = p.record.standings;
  const review = { outcome: 'set_aside', decidedAt: '2026-10-08T10:00:00.000Z', reviewer: { name: 'Ama Owusu', role: 'Wizzad' }, about: 'heard' };
  // The supervised sitting set aside: its host's word still holds, and it moves nothing.
  const aside = structuredClone(p.record.defenses);
  aside[0].review = review;
  assert.match(verifyStanding(osmosis, aside, keys).reason, /supervised credit|needs a supervised sitting/);
  const r = verifyStanding({ ...osmosis, status: 'not_yet_verified', supervised: null }, aside, keys);
  assert.equal(r.valid, true, r.reason);
  // The remote sitting set aside: the piece stands on its supervised sitting alone.
  const remoteAside = structuredClone(p.record.defenses);
  remoteAside[2].review = review;
  assert.match(verifyStanding(osmosis, remoteAside, keys).reason, /remote credit/);
  assert.equal(verifyStanding({ ...osmosis, remote: null }, remoteAside, keys).valid, true);
  // Regraded: the results carried are the ones counted — 8 of 10 after the review, 7 of 10 as sealed.
  const regraded = structuredClone(p.record.defenses);
  regraded[0].review = { outcome: 'corrected', decidedAt: review.decidedAt, reviewer: review.reviewer, about: 'grade', regraded: 1, resultsAsSealed: regraded[0].results };
  regraded[0].results = { ...regraded[0].results, checkedCorrect: 8 };
  assert.match(verifyStanding(osmosis, regraded, keys).reason, /supervised credit/);
  assert.equal(verifyStanding({ ...osmosis, supervised: { credit: 8, n: 10, sittings: 1 } }, regraded, keys).valid, true);
});

test('shadow mode: a remote score far above the supervised one may be carried as Verified until reviewed, and as More evidence requested once released — never harsher', () => {
  const defenses = [supervised('rec-3', 'Osmosis lab', 3, 10, []), remote('rec-1', 'Osmosis lab', 10, 10)];
  const base = { title: 'Osmosis lab', defenses: [0, 1], supervised: { credit: 3, n: 10, sittings: 1 }, remote: { credit: 10, n: 10, sittings: 1 } };
  assert.equal(verifyStanding({ ...base, status: 'verified' }, defenses, keys).valid, true);
  assert.equal(verifyStanding({ ...base, status: 'more_evidence' }, defenses, keys).valid, true);
  assert.match(verifyStanding({ ...base, status: 'not_verified' }, defenses, keys).reason, /status/);
  // The line prints the numbers, never the status a review has not released.
  const line = standingLine({ path: 'p', standing: { ...base, status: 'verified' } }, defenses, keys);
  // v1.11 audit: made before v1.11 (no minimum), it says which rule has changed since — 3 of 10 is under half.
  assert.ok(line.includes(`supervised 3 of 10 (1 sitting) · remote 10 of 10 (1 sitting) · ${STANDING_NOTES.below_minimum} · MATCHES`), line);
  assert.doesNotMatch(line, /More evidence|gap/);
});

test('0.6.1: a piece renamed between sittings is one standing, titled as its newest sitting — its older sittings keep their earlier title', () => {
  const renamed = [supervised('rec-3', 'Osmosis lab', 7, 10, []), remote('rec-1', 'Untitled', 10, 10)];
  const standing = { title: 'Osmosis lab', defenses: [0, 1], status: 'verified', supervised: { credit: 7, n: 10, sittings: 1 }, remote: { credit: 10, n: 10, sittings: 1 } };
  const r = verifyStanding(standing, renamed, keys);
  assert.equal(r.valid, true, r.reason);
  // Titled by the older name, it is not the record's standing.
  assert.match(verifyStanding({ ...standing, title: 'Untitled' }, renamed, keys).reason, /newest sitting carries \("Osmosis lab"\)/);
});

test('v1.8: the band, from the pools — the same answer as the platform, and printed only from three sittings', () => {
  for (const c of CASES.bands) assert.deepEqual(standingBand(c), c.expect, c.name);
  const line = standingLine({ path: 'p', standing: { title: 'Osmosis lab', defenses: [0, 1, 2], status: 'verified', supervised: { credit: 7, n: 10, sittings: 1 }, remote: { credit: 16, n: 20, sittings: 2 } } },
    [supervised('rec-3', 'Osmosis lab', 7, 10, []), remote('rec-2', 'Osmosis lab', 8, 10), remote('rec-1', 'Osmosis lab', 8, 10)], keys);
  assert.match(line, /band: three quarters or more across 3 sittings · MATCHES/);
  const p = record();
  assert.doesNotMatch(standingLine({ path: 'p', standing: p.record.standings[0] }, p.record.defenses, keys), /band:/);
});

// ─── v1.11: the minimum, and Awaiting review ──────────────────────────────────

test('v1.11: a standing with the minimum is read by it — under half its credit, the supervised sitting confirms nothing yet', () => {
  // Newest first: a supervised sitting at 3 of 10 after a remote one at 9 of 10.
  const defenses = [supervised('rec-3', 'Osmosis lab', 3, 10, []), remote('rec-1', 'Osmosis lab', 9, 10)];
  const st = { title: 'Osmosis lab', defenses: [0, 1], supervised: { credit: 3, n: 10, sittings: 1 }, remote: { credit: 9, n: 10, sittings: 1 } };
  // Made under v1.11: on the record with its numbers, not yet confirmed — and never "on record" as confirmed.
  const ok = verifyStanding({ ...st, status: 'not_yet_verified', minimum: 0.5 }, defenses, keys);
  assert.equal(ok.valid, true, ok.reason);
  assert.match(verifyStanding({ ...st, status: 'verified', minimum: 0.5 }, defenses, keys).reason, /reach 50% of their credit/);
  // No gap is read under the minimum, so Awaiting review does not apply either.
  assert.equal(verifyStanding({ ...st, status: 'awaiting_review', minimum: 0.5 }, defenses, keys).valid, false);
  // The same standing made before v1.11 (no minimum) is read by the rules then: an unreviewed gap showed as verified.
  assert.equal(verifyStanding({ ...st, status: 'verified' }, defenses, keys).valid, true);
});

test('v1.11: only the Standard’s own minimum, and Awaiting review only under the v1.11 rules', () => {
  const defenses = [supervised('rec-3', 'Osmosis lab', 6, 12, []), remote('rec-2', 'Osmosis lab', 10, 10), remote('rec-1', 'Osmosis lab', 10, 10), remote('rec-0', 'Osmosis lab', 10, 10)];
  const st = { title: 'Osmosis lab', defenses: [0, 1, 2, 3], supervised: { credit: 6, n: 12, sittings: 1 }, remote: { credit: 30, n: 30, sittings: 3 } };
  // The rules give more evidence (z 3.83): unreviewed it is Awaiting review; released, More evidence requested; cleared, on record.
  for (const status of ['awaiting_review', 'more_evidence', 'verified']) {
    const r = verifyStanding({ ...st, status, minimum: 0.5 }, defenses, keys);
    assert.equal(r.valid, true, `${status}: ${r.reason}`);
  }
  // Never harsher than the rules.
  assert.equal(verifyStanding({ ...st, status: 'not_verified', minimum: 0.5 }, defenses, keys).valid, false);
  // A record may not lower its own bar.
  assert.match(verifyStanding({ ...st, status: 'verified', minimum: 0.1 }, defenses, keys).reason, /not the one the Standard sets/);
  // Awaiting review without the minimum is a status the rules it was made under do not have.
  assert.match(verifyStanding({ ...st, status: 'awaiting_review' }, defenses, keys).reason, /v1\.11/);
  const line = standingLine({ path: 'record.standings[0]', standing: { ...st, status: 'awaiting_review', minimum: 0.5 } }, defenses, keys);
  assert.match(line, / · Awaiting review · supervised 6 of 12 \(1 sitting\) · remote 30 of 30 \(3 sittings\)/);
  assert.doesNotMatch(line, /gap|Verified/);
});

test('v1.11 audit: a person’s clear is said to be their word; a standing made before v1.11 says where the rules since read it otherwise', () => {
  const defenses = [supervised('rec-3', 'Osmosis lab', 6, 12, []), remote('rec-2', 'Osmosis lab', 10, 10), remote('rec-1', 'Osmosis lab', 10, 10), remote('rec-0', 'Osmosis lab', 10, 10)];
  const st = { title: 'Osmosis lab', defenses: [0, 1, 2, 3], status: 'verified', supervised: { credit: 6, n: 12, sittings: 1 }, remote: { credit: 30, n: 30, sittings: 3 } };
  const cleared = verifyStanding({ ...st, minimum: 0.5 }, defenses, keys);
  assert.equal(cleared.valid, true, cleared.reason);
  assert.equal(cleared.cleared, true);
  assert.ok(standingLine({ path: 'p', standing: { ...st, minimum: 0.5 } }, defenses, keys).includes(` · ${STANDING_NOTES.cleared} · MATCHES`));
  // The same standing made before v1.11: no clear existed then — an unreviewed difference was carried as verified.
  const before = verifyStanding(st, defenses, keys);
  assert.equal(before.cleared, false);
  assert.equal(before.earlier, 'unreviewed_gap');
  assert.ok(standingLine({ path: 'p', standing: st }, defenses, keys).includes(` · ${STANDING_NOTES.unreviewed_gap} · MATCHES`));
  // A standing the rules give `verified` outright says nothing more.
  const plain = [supervised('rec-3', 'Osmosis lab', 8, 10, [])];
  const r = verifyStanding({ title: 'Osmosis lab', defenses: [0], status: 'verified', supervised: { credit: 8, n: 10, sittings: 1 }, remote: null, minimum: 0.5 }, plain, keys);
  assert.deepEqual([r.valid, r.cleared, r.earlier], [true, false, null]);
  for (const note of Object.values(STANDING_NOTES)) assert.doesNotMatch(note, /\bgap\b|Verified/);
  // Under the minimum, any status claiming more than Not yet confirmed is refused for the minimum's own reason.
  const low = [supervised('rec-3', 'Osmosis lab', 3, 10, []), remote('rec-1', 'Osmosis lab', 10, 10)];
  const lowSt = { title: 'Osmosis lab', defenses: [0, 1], supervised: { credit: 3, n: 10, sittings: 1 }, remote: { credit: 10, n: 10, sittings: 1 }, minimum: 0.5 };
  for (const status of ['verified', 'awaiting_review', 'more_evidence']) assert.match(verifyStanding({ ...lowSt, status }, low, keys).reason, /reach 50% of their credit/, status);
});
