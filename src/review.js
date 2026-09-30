/**
 * A person's REVIEW of a sitting, as a record carries it (the Defended Work Standard v1.7, §4.4.3).
 *
 * Questions are made by an AI and explanations graded by AIs. A student may ask for a person to review a sitting. A
 * review that changes something is carried on the defense it is of, as `review`:
 *
 *   corrected   the person regraded answers: the defense's `results` are as counted after the review, and
 *               `review.resultsAsSealed` keeps the results the sealed sitting counted;
 *   set_aside   the sitting had a fault in how it was asked, heard or arranged: it is carried as it was sealed, and
 *               counts toward nothing (src/standing.js leaves it out of both pools).
 *
 * A review that left the result as it was is not carried. The review is part of the signed record: it is Wizzad's word
 * that the person it names decided this — the same trust as the record itself, and no more. The reviewer's name and
 * role are as Wizzad entered them.
 */
export const REVIEW_OUTCOMES = ['corrected', 'set_aside'];
export const REVIEW_ABOUT = ['grade', 'question', 'heard', 'arrangement', 'status', 'other'];

const RESULT_KEYS = ['checked', 'checkedCorrect', 'explained', 'explainedFull', 'explainedPartial'];
const isCount = (x) => Number.isInteger(x) && x >= 0;

/** Every defense in a proof payload that carries a review: `[{ path, defense, review }]`. */
export function reviewsIn(payload) {
  const out = [];
  (payload?.record?.defenses ?? []).forEach((defense, i) => { if (defense && defense.review !== undefined) out.push({ path: `record.defenses[${i}]`, defense, review: defense.review }); });
  return out;
}

/** Whether a review has the shape §4.4.3 gives. Returns `{ valid, reason?, outcome, reviewer, decidedAt, regraded }`. */
export function verifyReview(review) {
  const fail = (reason) => ({ valid: false, reason });
  if (!review || typeof review !== 'object') return fail('not a review');
  if (!REVIEW_OUTCOMES.includes(review.outcome)) return fail('its outcome is not one a record carries');
  if (!REVIEW_ABOUT.includes(review.about)) return fail('it does not say what it was about');
  const by = review.reviewer;
  if (!by || typeof by.name !== 'string' || !by.name.trim() || typeof by.role !== 'string' || !by.role.trim()) return fail('it names no reviewer');
  if (typeof review.decidedAt !== 'string' || !Number.isFinite(Date.parse(review.decidedAt))) return fail('it carries no day it was decided');
  if (review.outcome === 'corrected') {
    if (!isCount(review.regraded) || review.regraded < 1) return fail('it does not say how many answers were regraded');
    const sealed = review.resultsAsSealed;
    if (!sealed || typeof sealed !== 'object' || !RESULT_KEYS.every((k) => isCount(sealed[k]))) return fail('it does not keep the results as sealed');
  }
  return { valid: true, outcome: review.outcome, reviewer: { name: by.name, role: by.role }, decidedAt: review.decidedAt, regraded: review.outcome === 'corrected' ? review.regraded : 0 };
}

/**
 * A review in one line, for the eye. `recordValid: false` — the record it is in did not verify — and the line says the
 * review is then nobody's signed word: a review is only ever as good as the signature over the record that carries it.
 */
export function reviewLine(entry, { recordValid } = {}) {
  const r = verifyReview(entry.review);
  if (!r.valid) return `${entry.path} · review NOT VALID — ${r.reason}`;
  const word = recordValid === false ? 'NOT a signed word: the record that carries it does not verify' : 'Wizzad’s word, signed with the record';
  const who = `${r.reviewer.name}, ${r.reviewer.role}`;
  const day = r.decidedAt.slice(0, 10);
  return r.outcome === 'corrected'
    ? `${entry.path} · reviewed by ${who} on ${day} · ${r.regraded} answer${r.regraded === 1 ? '' : 's'} regraded by that person: results are as counted after the review; the results as sealed are kept beside them · ${word}`
    : `${entry.path} · reviewed by ${who} on ${day} · set aside: carried as sealed, counts toward nothing · ${word}`;
}
