/**
 * A piece's STANDING (the Defended Work Standard v1.5, §4.6; v1.7 for reviews; v1.11 for the minimum and Awaiting
 * review), recomputed from a record alone.
 *
 * A record carries, for each piece, the places of its sittings in `record.defenses`, the credit it pooled from them,
 * and a status. This recomputes the pools from those sittings' own `results`, counts a supervised sitting only when its
 * host's word holds (src/host.js) and names no exception touching who did the work, reads which condition came first
 * from the order of `defenses` (newest first), and checks the status is one the rules allow:
 *
 *   - `not_yet_verified`, Not yet confirmed — no supervised sitting counts; or (v1.11) the ones that count earned under
 *     the standing's `minimum` share of their credit, pooled.
 *   - `verified`, Supervised sitting on record — at least one counts (v1.11: reaching the minimum), and no gap is open.
 *   - `more_evidence`, More evidence requested — one counts, and the remote share is more than 2.3 standard errors above it.
 *   - `not_verified`, Not yet confirmed, after two tries — two or more count, and the gap stays above 3.1.
 *   - `awaiting_review`, Awaiting review (v1.11) — the rules give a gap status no person at Wizzad has reviewed yet.
 *
 * A gap status reaches a student only once a person at Wizzad has reviewed it, so a record may carry a milder status
 * than the rules give: More evidence requested in place of the second gap status, or `verified` (before v1.11, what an
 * unreviewed gap showed; since, what a person releases when the supervised result stands), or (v1.11) Awaiting review —
 * never a harsher one, and never `verified` where no supervised sitting counts or (v1.11) where it is under the minimum.
 * This checks exactly that. Its line prints the pooled credit, not the gap, and never a status a review has not
 * released: shadow mode withholds the label, not the numbers, which are in the record for anyone to read (§4.6).
 *
 * A standing made under v1.11 carries `minimum`, the share its supervised pool had to reach: the Standard's own value,
 * SUPERVISED_MINIMUM, or the standing is refused. A standing without it was made before and is read by the rules then.
 *
 * A piece renamed between sittings is still one piece: the standing is titled as its NEWEST named sitting titles it,
 * and its older sittings may carry an earlier title (0.6.1; 0.6.0 wrongly refused them).
 *
 * A sitting a person's review set aside (v1.7, §4.4.3: `review.outcome: 'set_aside'`) is named among a standing's
 * defenses like any other and counts in neither pool; one whose answers a person regraded counts by the `results` the
 * record carries, which are as counted after the review.
 *
 * The arithmetic is the platform's own (apps/platform lib/defend/standing-core.ts); test/fixtures/standing-cases.json
 * holds both to one answer.
 */
import { verifyHostWord } from './host.js';

/** The practice gain the condition sat second gets anyway, in share of credit (a prior; §4.6). */
export const PRACTICE_GAIN = 0.06;
export const MORE_EVIDENCE_Z = 2.3;
export const NOT_VERIFIED_Z = 3.1;
/** The host's exceptions that keep a supervised sitting from counting. */
export const INTEGRITY_EXCEPTIONS = ['left_room', 'other_device'];
/** v1.11: the share of credit the counting supervised sittings must reach, pooled, for `verified` — half (§4.6). */
export const SUPERVISED_MINIMUM = 0.5;
/** v1.12: the graded questions the counting supervised sittings must hold, pooled, before their share is read (§4.6). */
export const SUPERVISED_FLOOR = 8;
/** v1.12: the host's note that never stops a sitting counting, but whose sittings may be left out to reach the minimum. */
export const FAULT_EXCEPTION = 'technical_fault';
/** The labels people read (v1.11, v1.12). The codes keep their names for every record made before; no label says "Verified". */
export const STATUS_WORDS = {
  not_yet_verified: 'Not yet confirmed',
  verified: 'Supervised sitting on record',
  awaiting_review: 'Awaiting review',
  more_evidence: 'More evidence requested',
  not_verified: 'Rests on supervised sittings',
};

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

/** A sitting's credit and questions: whole questions, half for a partial explanation; late and skipped asked; ungraded left out. */
export function creditOf(r = {}) {
  const credit = num(r.checkedCorrect) + num(r.explainedFull) + 0.5 * num(r.explainedPartial) + num(r.episodicAccounted) + num(r.historyConnected);
  const n = num(r.checked) + num(r.explained) + num(r.episodic) + num(r.history) + num(r.late) + num(r.skipped);
  return { credit, n };
}

/** credit / n with its standard error (a half added to credit and one to n). */
export function scoreOf(credit, n) {
  if (n <= 0) return { credit, n, share: null, se: null };
  const smoothed = (credit + 0.5) / (n + 1);
  return { credit, n, share: credit / n, se: Math.sqrt((smoothed * (1 - smoothed)) / n) };
}

function pool(sittings) {
  if (sittings.length === 0) return null;
  let credit = 0;
  let n = 0;
  for (const s of sittings) {
    const c = creditOf(s.results);
    credit += c.credit;
    n += c.n;
  }
  const score = scoreOf(credit, n);
  return score.share === null ? null : { ...score, sittings: sittings.length };
}

/**
 * Whether a supervised sitting counts: its host's word given, no exception touching who did the work, and (v1.6) not
 * hosted by a reader who asked for it — such a sitting is named, never counted (§4.6).
 */
export function supervisedCounts(s) {
  return s.condition === 'supervised' && s.readerHosted !== true && !!s.word?.given && !(s.word.exceptions ?? []).some((e) => INTEGRITY_EXCEPTIONS.includes(e));
}

/**
 * The standing of one piece from its sittings `{ key, condition: 'remote'|'supervised', sealedAt, results, word?,
 * readerHosted?, setAside? }`, `sealedAt` being any key that orders them. A sitting in which no question counted is left
 * out, as is one a person's review set aside (v1.7). `minimum` (v1.11): the share the supervised pool must reach, or
 * null for a standing made before v1.11. `floor` (v1.12): the graded questions it must hold first, or null for a
 * standing made before v1.12 — and with it, the minimum is also reached by the sittings whose host noted no technical
 * fault, on their own.
 */
export function standingOf(all, gain = PRACTICE_GAIN, minimum = null, floor = null) {
  // v1.7: a sitting set aside by a person's review counts toward nothing.
  const sittings = all.filter((s) => s.setAside !== true && creditOf(s.results).n > 0);
  const counting = sittings.filter(supervisedCounts);
  const remoteSittings = sittings.filter((s) => s.condition === 'remote');
  const supervised = pool(counting);
  const remote = pool(remoteSittings);
  const keys = { supervised: counting.map((s) => s.key), remote: remoteSittings.map((s) => s.key) };
  if (!supervised) {
    const any = sittings.filter((s) => s.condition === 'supervised');
    const admitted = any.filter((s) => s.readerHosted !== true);
    const pending = any.length === 0 ? 'no_supervised' : admitted.some((s) => !s.word?.given) ? 'awaiting_word' : admitted.length === 0 ? 'reader_hosted' : 'exception';
    return { status: 'not_yet_verified', pending, supervised: null, remote, gap: null, keys };
  }
  // v1.12: too few graded questions to read a share from; their numbers stay on the record.
  if (floor !== null && supervised.n < floor) return { status: 'not_yet_verified', pending: 'too_few_questions', supervised, remote, gap: null, keys };
  // v1.11: under the minimum, the supervised sittings confirm nothing yet; their numbers stay on the record. v1.12: unless
  // the sittings whose host noted no technical fault reach it on their own, with the floor's questions.
  const clean = floor !== null ? pool(counting.filter((s) => !(s.word?.exceptions ?? []).includes(FAULT_EXCEPTION))) : null;
  const cleanReaches = !!clean && clean.n >= floor && clean.share >= minimum;
  if (minimum !== null && supervised.share < minimum && !cleanReaches) return { status: 'not_yet_verified', pending: 'below_minimum', supervised, remote, gap: null, keys };
  if (!remote) return { status: 'verified', pending: null, supervised, remote: null, gap: null, keys };
  const firstSup = Math.min(...counting.map((s) => s.sealedAt));
  const firstRem = Math.min(...remoteSittings.map((s) => s.sealedAt));
  const second = firstSup > firstRem ? 'supervised' : 'remote';
  const diff = remote.share - supervised.share;
  const adjusted = second === 'supervised' ? diff + gain : diff - gain;
  const z = adjusted / Math.sqrt(remote.se ** 2 + supervised.se ** 2);
  const status = counting.length >= 2 ? (z > NOT_VERIFIED_Z ? 'not_verified' : 'verified') : (z > MORE_EVIDENCE_Z ? 'more_evidence' : 'verified');
  return { status, pending: null, supervised, remote, gap: { diff, adjusted, z, second }, keys };
}

/** v1.8: a standing's band — the share of credit across every sitting that counts, once three or more do (§4.6). */
export const BAND_MIN_SITTINGS = 3;
export const BAND_WORDS = { below_half: 'under half', half_to_three_quarters: 'between half and three quarters', three_quarters_up: 'three quarters or more' };
export function bandOf(share) {
  return share < 0.5 ? 'below_half' : share < 0.75 ? 'half_to_three_quarters' : 'three_quarters_up';
}
export function standingBand(p) {
  const sittings = (p.supervised?.sittings ?? 0) + (p.remote?.sittings ?? 0);
  const n = (p.supervised?.n ?? 0) + (p.remote?.n ?? 0);
  const credit = (p.supervised?.credit ?? 0) + (p.remote?.credit ?? 0);
  return { sittings, band: sittings >= BAND_MIN_SITTINGS && n > 0 ? bandOf(credit / n) : null };
}

/**
 * The statuses a record may carry for a status the rules give: the same, or a milder one a review allows — and, on a
 * standing made under v1.11 (`v111`), Awaiting review in place of a gap status no person has reviewed.
 */
export function statusesAllowed(status, v111 = false) {
  const review = v111 ? ['awaiting_review'] : [];
  if (status === 'not_verified') return ['not_verified', 'more_evidence', 'verified', ...review];
  if (status === 'more_evidence') return ['more_evidence', 'verified', ...review];
  return [status];
}

/** Every standing in a proof payload: `[{ path, standing }]`. */
export function standingsIn(payload) {
  const out = [];
  (payload?.record?.standings ?? []).forEach((standing, i) => out.push({ path: `record.standings[${i}]`, standing }));
  return out;
}

const samePool = (a, b) => (a === null || a === undefined) ? (b === null) : (!!b && a.credit === b.credit && a.n === b.n && a.sittings === b.sittings);

/**
 * Check one standing against the record's defenses. `keys` — Wizzad's published keys — are needed when a host's word
 * was given through Wizzad (§4.4.2). Returns `{ valid, reason?, status, supervised, remote, gap }`.
 */
export function verifyStanding(standing, defenses, keys = null) {
  const fail = (reason) => ({ valid: false, reason });
  if (!standing || typeof standing !== 'object' || typeof standing.title !== 'string' || !Array.isArray(standing.defenses) || !STATUS_WORDS[standing.status]) return fail('not a standing');
  // v1.11: a standing that carries a minimum is read by it — and only the Standard's own: a record may not lower its bar.
  const v111 = standing.minimum !== undefined;
  if (v111 && standing.minimum !== SUPERVISED_MINIMUM) return fail(`its minimum (${standing.minimum}) is not the one the Standard sets (${SUPERVISED_MINIMUM})`);
  // v1.12: a floor, only the Standard's own, and only beside the minimum it was made with.
  const v112 = standing.floor !== undefined;
  if (v112 && standing.floor !== SUPERVISED_FLOOR) return fail(`its floor (${standing.floor}) is not the one the Standard sets (${SUPERVISED_FLOOR})`);
  if (v112 && !v111) return fail('it carries a floor (v1.12) without the minimum the same rules set');
  if (!v111 && standing.status === 'awaiting_review') return fail('Awaiting review is a status of the v1.11 rules, and this standing carries no minimum');
  const list = Array.isArray(defenses) ? defenses : [];
  if (standing.defenses.length === 0) return fail('names no defense');
  if (new Set(standing.defenses).size !== standing.defenses.length) return fail('names a defense twice');
  const sittings = [];
  for (const i of standing.defenses) {
    const d = Number.isInteger(i) ? list[i] : undefined;
    if (!d) return fail(`names a defense the record does not carry (${i})`);
    const supervised = d.condition === 'supervised';
    let word;
    if (supervised) {
      const att = d.supervised?.attestation ?? null;
      if (!att) word = { given: false, exceptions: [] };
      else {
        const w = verifyHostWord(att, d, keys);
        if (!w.valid && /--keys|published keys/.test(w.reason ?? '')) return fail(`the host’s word on defense ${i} was given through Wizzad: pass Wizzad’s published keys (--keys) to count it`);
        word = { given: w.valid, exceptions: w.valid ? (w.exceptions ?? []) : [] };
      }
    }
    sittings.push({ key: i, condition: supervised ? 'supervised' : 'remote', sealedAt: list.length - i, results: d.results, ...(word ? { word } : {}), ...(supervised && d.supervised?.readerHosted === true ? { readerHosted: true } : {}), ...(d.review?.outcome === 'set_aside' ? { setAside: true } : {}) });
  }
  // Titled as its newest named sitting (the lowest place: `defenses` is newest first) titles the piece.
  const newest = list[Math.min(...standing.defenses)];
  if (newest.title !== standing.title) return fail(`its title is not the one its newest sitting carries ("${newest.title}")`);
  const s = standingOf(sittings, PRACTICE_GAIN, v111 ? SUPERVISED_MINIMUM : null, v112 ? SUPERVISED_FLOOR : null);
  const pick = (p) => (p ? { credit: p.credit, n: p.n, sittings: p.sittings } : null);
  const out = { status: standing.status, supervised: pick(s.supervised), remote: pick(s.remote), gap: s.gap };
  if (!samePool(standing.supervised, out.supervised)) return { ...out, ...fail('its supervised credit is not what its sittings give') };
  if (!samePool(standing.remote, out.remote)) return { ...out, ...fail('its remote credit is not what its sittings give') };
  if (!statusesAllowed(s.status, v111).includes(standing.status)) {
    const why = s.pending === 'too_few_questions' && standing.status !== 'not_yet_verified' ? `its status needs at least ${SUPERVISED_FLOOR} graded questions in the supervised sittings that count`
      : s.pending === 'below_minimum' && standing.status !== 'not_yet_verified' ? `its status needs the supervised sittings that count to reach ${SUPERVISED_MINIMUM * 100}% of their credit`
      : ['verified', 'more_evidence', 'not_verified', 'awaiting_review'].includes(standing.status) ? 'its status needs a supervised sitting that counts, and the gap its sittings give'
      : 'its status is not the one its sittings give';
    return { ...out, ...fail(why) };
  }
  // v1.11: `verified` where the rules give a gap is a person's clear — Wizzad's word, not the rules' reading (§4.6).
  const cleared = v111 && standing.status === 'verified' && (s.status === 'more_evidence' || s.status === 'not_verified');
  // A standing made before v1.11 keeps its `verified`; where the rules since would not give it, say which rule changed.
  let earlier = null;
  if (!v112 && standing.status === 'verified') {
    const now = standingOf(sittings, PRACTICE_GAIN, SUPERVISED_MINIMUM, SUPERVISED_FLOOR);
    earlier = now.pending === 'too_few_questions' ? 'too_few_questions'
      : v111 ? null
      : now.pending === 'below_minimum' ? 'below_minimum' : (now.status === 'more_evidence' || now.status === 'not_verified') ? 'unreviewed_gap' : null;
  }
  return { valid: true, ...out, cleared, earlier };
}

/** What `standingLine` says beside a standing a person cleared, or one made before v1.11 that the rules since read otherwise. */
export const STANDING_NOTES = {
  cleared: 'a person at Wizzad looked at how the remote and supervised results compare and let the supervised result stand (their word)',
  below_minimum: 'made before v1.11, when any supervised sitting that counted read so; under v1.11 these, under half their credit, read Not yet confirmed',
  unreviewed_gap: 'made before v1.11, when this status was also given where no person had looked at how the remote and supervised results compare; under v1.11 it reads Awaiting review',
  too_few_questions: `made before v1.12, when a standing was read from any number of graded questions; under v1.12, fewer than ${SUPERVISED_FLOOR} read Not yet confirmed`,
};

/** One standing in one line, for the eye. */
export function standingLine(entry, defenses, keys = null) {
  const st = entry.standing ?? {};
  const r = verifyStanding(st, defenses, keys);
  // The pools, not the gap: a line that printed a gap past a threshold would say a status no review has released.
  const pools = [
    r.supervised ? `supervised ${r.supervised.credit} of ${r.supervised.n} (${r.supervised.sittings} sitting${r.supervised.sittings === 1 ? '' : 's'})` : 'no supervised sitting counts',
    r.remote ? `remote ${r.remote.credit} of ${r.remote.n} (${r.remote.sittings} sitting${r.remote.sittings === 1 ? '' : 's'})` : null,
  ].filter(Boolean).join(' · ');
  const head = `${entry.path} · ${st.title ?? '?'} · ${STATUS_WORDS[st.status] ?? st.status}`;
  // v1.8: the band, read from the pools just recomputed — never from anything the record says of it.
  const b = r.valid ? standingBand(r) : null;
  const band = b?.band ? ` · band: ${BAND_WORDS[b.band]} across ${b.sittings} sittings` : '';
  const note = r.valid ? (r.cleared ? ` · ${STANDING_NOTES.cleared}` : r.earlier ? ` · ${STANDING_NOTES[r.earlier]}` : '') : '';
  return r.valid ? `${head} · ${pools}${band}${note} · MATCHES its sittings` : `${head} · NOT VALID — ${r.reason}`;
}
