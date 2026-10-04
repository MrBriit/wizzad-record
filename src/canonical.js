/**
 * The canonical form of a record's payload: JSON with object keys sorted at
 * every depth, no whitespace. This is exactly what Wizzad signs, so any
 * re-serialisation of the record — pretty-printed, re-ordered, re-encoded —
 * canonicalises back to the same bytes.
 */
export function canonicalJson(value) {
  const visit = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(visit);
    // A null-prototype copy: on a plain {} an own "__proto__" key (JSON.parse makes one) would set the prototype and
    // vanish from the bytes, so two different payloads would share a signature. Key order is unchanged, so every value
    // without such a key canonicalises exactly as before.
    const out = Object.create(null);
    for (const k of Object.keys(v).sort()) out[k] = visit(v[k]);
    return out;
  };
  return JSON.stringify(visit(value));
}
