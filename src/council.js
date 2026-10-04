/**
 * The COUNCIL of AI graders, as a record carries it (the Defended Work Standard v1.8, §4.4).
 *
 * A defense may carry `council` = { graders, of, unanimousBlind, conferred, unanimousAfter }: how many AI graders read
 * the explanations, how many answers at least two of them read, how many of those were unanimous blind, on how many the
 * graders conferred, and how many were unanimous after. A verifier computes nothing from it: it is a count the record
 * carries, printed so a reader sees how often the graders agreed. A record made before v1.8 carries none.
 */
const KEYS = ['graders', 'of', 'unanimousBlind', 'conferred', 'unanimousAfter'];
const isCount = (x) => Number.isInteger(x) && x >= 0;

/** Every defense in a proof payload that carries a council: `[{ path, defense, council }]`. */
export function councilsIn(payload) {
  const out = [];
  (payload?.record?.defenses ?? []).forEach((defense, i) => { if (defense && defense.council !== undefined) out.push({ path: `record.defenses[${i}]`, defense, council: defense.council }); });
  return out;
}

/** Whether a council has the shape §4.4 gives, and its counts are consistent. */
export function verifyCouncil(c) {
  const fail = (reason) => ({ valid: false, reason });
  if (!c || typeof c !== 'object') return fail('not a council');
  for (const k of KEYS) if (!isCount(c[k])) return fail(`${k} is not a count`);
  if (c.graders < 2 || c.graders > 3) return fail('a council is two or three graders');
  if (c.of === 0) return fail('names no answer read by two graders');
  if (c.unanimousBlind > c.of || c.conferred > c.of || c.unanimousAfter > c.of) return fail('a count exceeds the answers read');
  if (c.unanimousBlind + c.conferred !== c.of) return fail('every answer read by two graders was unanimous blind or conferred on, never both, never neither');
  if (c.unanimousAfter < c.unanimousBlind) return fail('agreement cannot fall by conferring: a grader that does not answer keeps its blind grade');
  return { valid: true, ...Object.fromEntries(KEYS.map((k) => [k, c[k]])) };
}

/** A council in one line, for the eye. */
export function councilLine(entry) {
  const r = verifyCouncil(entry.council);
  if (!r.valid) return `${entry.path} · graders NOT VALID — ${r.reason}`;
  const who = r.graders === 3 ? 'three AI graders' : 'two AI graders';
  const conferred = r.conferred > 0 ? `, conferred on ${r.conferred} and agreed on ${r.unanimousAfter} of ${r.of} after` : ' — none needed conferring';
  return `${entry.path} · ${who} read ${r.of} answer${r.of === 1 ? '' : 's'} · agreed blind on ${r.unanimousBlind} of ${r.of}${conferred}`;
}
