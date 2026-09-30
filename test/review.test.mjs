import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewsIn, verifyReview, reviewLine } from '../src/index.js';

const results = { checked: 6, checkedCorrect: 4, explained: 5, explainedFull: 2, explainedPartial: 1, episodic: 0, episodicAccounted: 0, history: 0, historyConnected: 0, ungraded: 0, late: 0, skipped: 0 };
const reviewer = { name: 'Ama Owusu', role: 'Wizzad' };
const corrected = { outcome: 'corrected', decidedAt: '2026-10-02T09:30:00.000Z', reviewer, about: 'grade', regraded: 2, resultsAsSealed: results };
const setAside = { outcome: 'set_aside', decidedAt: '2026-10-02T09:30:00.000Z', reviewer, about: 'heard' };

test('v1.7: the reviews a record carries are found on their defenses, and only there', () => {
  const payload = { record: { defenses: [{ id: 'a', results, review: corrected }, { id: 'b', results }, { id: 'c', results, review: setAside }] } };
  const found = reviewsIn(payload);
  assert.deepEqual(found.map((e) => e.path), ['record.defenses[0]', 'record.defenses[2]']);
  assert.deepEqual(reviewsIn({ record: {} }), []);
  assert.deepEqual(reviewsIn(null), []);
});

test('v1.7: a well-formed review checks; its line says what changed and whose word it is', () => {
  assert.deepEqual(verifyReview(corrected), { valid: true, outcome: 'corrected', reviewer, decidedAt: corrected.decidedAt, regraded: 2 });
  assert.equal(verifyReview(setAside).valid, true);
  const c = reviewLine({ path: 'record.defenses[0]', review: corrected });
  assert.match(c, /reviewed by Ama Owusu, Wizzad on 2026-10-02 · 2 answers regraded by that person: results are as counted after the review/);
  assert.match(c, /Wizzad’s word, signed with the record/);
  const a = reviewLine({ path: 'record.defenses[2]', review: setAside });
  assert.match(a, /set aside: carried as sealed, counts toward nothing/);
  assert.match(reviewLine({ path: 'p', review: { ...corrected, regraded: 1 } }), /1 answer regraded/);
  // In a record that does not verify, a review is nobody's signed word, and the line says so.
  const unsigned = reviewLine({ path: 'p', review: setAside }, { recordValid: false });
  assert.match(unsigned, /NOT a signed word: the record that carries it does not verify/);
  assert.doesNotMatch(unsigned, /Wizzad’s word/);
  assert.match(reviewLine({ path: 'p', review: setAside }, { recordValid: true }), /Wizzad’s word, signed with the record/);
});

test('v1.7: a review that is not one a record carries is refused, and said', () => {
  // An upheld review changes nothing and is never carried.
  assert.match(verifyReview({ ...setAside, outcome: 'upheld' }).reason, /outcome/);
  assert.match(verifyReview({ ...setAside, about: 'mood' }).reason, /about/);
  assert.match(verifyReview({ ...setAside, reviewer: { name: '', role: 'Wizzad' } }).reason, /reviewer/);
  assert.match(verifyReview({ ...setAside, decidedAt: 'yesterday' }).reason, /day it was decided/);
  assert.match(verifyReview({ ...corrected, regraded: 0 }).reason, /how many answers/);
  assert.match(verifyReview({ ...corrected, resultsAsSealed: undefined }).reason, /results as sealed/);
  assert.match(verifyReview(null).reason, /not a review/);
  assert.match(reviewLine({ path: 'p', review: { outcome: 'upheld' } }), /review NOT VALID/);
});
