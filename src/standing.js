/**
 * A piece's STANDING (the Defended Work Standard v1.5, §4.6), recomputed from a record alone.
 *
 * A record carries, for each piece, the places of its sittings in `record.defenses`, the credit it pooled from them,
 * and a status. This recomputes the pools from those sittings' own `results`, counts a supervised sitting only when its
 * host's word holds (src/host.js) and names no exception touching who did the work, reads which condition came first
 * from the order of `defenses` (newest first), and checks the status is one the rules allow:
 *
 *   - Not yet verified — no supervised sitting counts.
 *   - Verified — at least one counts, and no request for more evidence is open.
 *   - More evidence requested — one counts, and the remote share is more than 2.3 standard errors above it.
 *   - Not yet verified, after two tries — two or more count, and the gap stays above 3.1.
 *
 * A gap status reaches a student only once a person at Wizzad has reviewed it, so a record may carry a milder status
 * than the rules give (Verified in place of either gap status; More evidence requested in place of the second) — never
 * a harsher one, and never Verified where no supervised sitting counts. This checks exactly that. Its line prints the
 * pooled credit, not the gap, and never a status a review has not released: shadow mode withholds the label, not the
 * numbers, which are in the record for anyone to read (§4.6).
 *
 * A piece renamed between sittings is still one piece: the standing is titled as its NEWEST named sitting titles it,
 * and its older sittings may carry an earlier title (0.6.1; 0.6.0 wrongly refused them).
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
export const STATUS_WORDS = {
  not_yet_verified: 'Not yet verified',
  verified: 'Verified',
  more_evidence: 'More evidence requested',
  not_verified: 'Not yet verified, after two tries',
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
 * The standing of one piece from its sittings `{ key, condition: 'remote'|'supervised', sealedAt, results, word? }`,
 * `sealedAt` being any key that orders them. A sitting in which no question counted is left out.
 */
export function standingOf(all, gain = PRACTICE_GAIN) {
  const sittings = all.filter((s) => creditOf(s.results).n > 0);
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

/** The statuses a record may carry for a status the rules give: the same, or a milder one while unreviewed. */
export function statusesAllowed(status) {
  if (status === 'not_verified') return ['not_verified', 'more_evidence', 'verified'];
  if (status === 'more_evidence') return ['more_evidence', 'verified'];
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
    sittings.push({ key: i, condition: supervised ? 'supervised' : 'remote', sealedAt: list.length - i, results: d.results, ...(word ? { word } : {}), ...(supervised && d.supervised?.readerHosted === true ? { readerHosted: true } : {}) });
  }
  // Titled as its newest named sitting (the lowest place: `defenses` is newest first) titles the piece.
  const newest = list[Math.min(...standing.defenses)];
  if (newest.title !== standing.title) return fail(`its title is not the one its newest sitting carries ("${newest.title}")`);
  const s = standingOf(sittings);
  const pick = (p) => (p ? { credit: p.credit, n: p.n, sittings: p.sittings } : null);
  const out = { status: standing.status, supervised: pick(s.supervised), remote: pick(s.remote), gap: s.gap };
  if (!samePool(standing.supervised, out.supervised)) return { ...out, ...fail('its supervised credit is not what its sittings give') };
  if (!samePool(standing.remote, out.remote)) return { ...out, ...fail('its remote credit is not what its sittings give') };
  if (!statusesAllowed(s.status).includes(standing.status)) {
    return { ...out, ...fail(standing.status === 'verified' || standing.status === 'more_evidence' || standing.status === 'not_verified' ? 'its status needs a supervised sitting that counts, and the gap its sittings give' : 'its status is not the one its sittings give') };
  }
  return { valid: true, ...out };
}

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
  return r.valid ? `${head} · ${pools} · MATCHES its sittings` : `${head} · NOT VALID — ${r.reason}`;
}
