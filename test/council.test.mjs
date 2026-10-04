import { test } from 'node:test';
import assert from 'node:assert/strict';
import { councilsIn, verifyCouncil, councilLine } from '../src/index.js';

const three = { graders: 3, of: 7, unanimousBlind: 5, conferred: 2, unanimousAfter: 7 };
const two = { graders: 2, of: 4, unanimousBlind: 4, conferred: 0, unanimousAfter: 4 };

test('v1.8: the councils a record carries are found on their defenses; a record made before carries none', () => {
  const payload = { record: { defenses: [{ id: 'a', council: three }, { id: 'b' }, { id: 'c', council: two }] } };
  assert.deepEqual(councilsIn(payload).map((e) => e.path), ['record.defenses[0]', 'record.defenses[2]']);
  assert.deepEqual(councilsIn({ record: {} }), []);
});

test('v1.8: a council’s counts hang together, and its line says how often the graders agreed', () => {
  assert.equal(verifyCouncil(three).valid, true);
  assert.equal(councilLine({ path: 'record.defenses[0]', council: three }), 'record.defenses[0] · three AI graders read 7 answers · agreed blind on 5 of 7, conferred on 2 and agreed on 7 of 7 after');
  assert.equal(councilLine({ path: 'p', council: two }), 'p · two AI graders read 4 answers · agreed blind on 4 of 4 — none needed conferring');
  assert.equal(councilLine({ path: 'p', council: { ...two, of: 1, unanimousBlind: 1, unanimousAfter: 1 } }), 'p · two AI graders read 1 answer · agreed blind on 1 of 1 — none needed conferring');
});

test('v1.8: a council that could not have happened is refused, and said', () => {
  assert.match(verifyCouncil({ ...three, graders: 1 }).reason, /two or three graders/);
  assert.match(verifyCouncil({ ...three, of: 0, unanimousBlind: 0, conferred: 0, unanimousAfter: 0 }).reason, /names no answer/);
  assert.match(verifyCouncil({ ...three, unanimousAfter: 9 }).reason, /exceeds/);
  assert.match(verifyCouncil({ ...three, conferred: 1 }).reason, /unanimous blind or conferred on/);
  assert.match(verifyCouncil({ ...three, unanimousAfter: 4 }).reason, /cannot fall/);
  assert.match(verifyCouncil({ ...three, graders: '3' }).reason, /not a count/);
  assert.match(councilLine({ path: 'p', council: null }), /NOT VALID/);
});
