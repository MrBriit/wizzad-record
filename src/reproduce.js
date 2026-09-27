/**
 * A notebook re-run, checked without Wizzad (the standard, §4.3). PURE: nothing here runs code or touches the network.
 *
 * The record's reproduction carries two digests: `outputs.submitted`, over the outputs saved in the notebook file, and
 * `outputs.ran`, over what Wizzad's run produced. This module turns a notebook, and a run of it, into the same canonical
 * text Wizzad hashes, so a reader can recompute the first from the file alone and compare a run of their own with the
 * second. The rules are the standard's §4.3.2–4.3.3, and a test pins them to its test vector.
 */
import { createHash } from 'node:crypto';

/** Text kept per output, in UTF-16 code units, as Wizzad keeps it. */
export const OUTPUT_CAP = 64 * 1024;
const CUT = `\n…[output cut at ${OUTPUT_CAP} characters]`;
const capText = (s) => (s.length > OUTPUT_CAP ? `${s.slice(0, OUTPUT_CAP)}${CUT}` : s);

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/svg+xml'];
const joined = (s) => (Array.isArray(s) ? s.join('') : typeof s === 'string' ? s : '');
const sha = (s) => createHash('sha256').update(s).digest('hex');

/** CRLF and CR to LF, trailing spaces and tabs off every line, trailing newlines off the end. */
export const tidy = (s) => s.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n+$/, '');

/** The language a notebook's kernel speaks, from its metadata; 'python' when it says nothing. */
export function notebookLanguage(json) {
  const md = json?.metadata;
  const v = md?.language_info?.name ?? md?.kernelspec?.language ?? md?.kernelspec?.name;
  const lang = typeof v === 'string' ? v.toLowerCase().trim() : '';
  if (!lang) return 'python';
  if (/^python|^ipykernel|^py\d/.test(lang)) return 'python';
  return lang;
}

/**
 * The code cells of a notebook, in order, numbered from 1, with their saved outputs. Blank code cells are not code
 * cells. `{ ok: false, reason }` for a file that is not a notebook, has no code, or is not Python.
 */
export function readNotebook(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.cells)) return { ok: false, reason: 'not_notebook' };
  const language = notebookLanguage(json);
  if (language !== 'python') return { ok: false, reason: 'unsupported_language', language };
  const cells = [];
  let markdown = 0;
  for (const c of json.cells) {
    if (!c || typeof c !== 'object') continue;
    if (c.cell_type === 'markdown') { markdown += 1; continue; }
    if (c.cell_type !== 'code') continue;
    const source = joined(c.source);
    if (!source.trim()) continue;
    cells.push({ n: cells.length + 1, source, outputs: Array.isArray(c.outputs) ? c.outputs : [] });
  }
  if (cells.length === 0) return { ok: false, reason: 'no_code' };
  return { ok: true, cells, markdown };
}

/** A rich output's plain text, unless it is a figure (then nothing at all is kept of it). */
function canonData(kind, data) {
  if (!data || IMAGE_MIMES.some((m) => typeof data[m] === 'string' && data[m].length > 0)) return [];
  if (!Object.prototype.hasOwnProperty.call(data, 'text/plain')) return [];
  const v = data['text/plain'];
  const s = Array.isArray(v) ? v.join('') : typeof v === 'string' ? v : JSON.stringify(v);
  return [{ kind, mime: 'text/plain', text: tidy(s) }];
}

/** The outputs saved in the notebook, per code cell, canonical, in the file's order — the first rule (records without `canon`). */
export function submittedOutcomes(cells) {
  return cells.map((c) => {
    const outputs = [];
    for (const o of c.outputs) {
      if (o.output_type === 'stream') {
        if (o.name === 'stderr') continue;
        const text = joined(o.text);
        const last = outputs[outputs.length - 1];
        if (last && last.kind === 'stdout') last.text += text;
        else outputs.push({ kind: 'stdout', text });
      } else if (o.output_type === 'execute_result' || o.output_type === 'display_data') {
        outputs.push(...canonData(o.output_type === 'execute_result' ? 'result' : 'display', o.data));
      } else if (o.output_type === 'error') {
        outputs.push({ kind: 'error', name: String(o.ename ?? ''), value: String(o.evalue ?? '') });
      }
    }
    return { n: c.n, outputs: outputs.map((x) => ('text' in x ? { ...x, text: capText(tidy(x.text)) } : x)) };
  });
}

/**
 * The notebook's outputs read the way a run is reported (canonical form 2, the standard §4.3.2): every line the cell
 * printed merged into one output and placed first, then each result in order, then the error — built exactly as a
 * run's are (printed text cut, then tidied, kept only when not empty; a result's text tidied, not cut). A run reports
 * printed text apart from what it displays, so the order between them is not something both sides know.
 */
export function submittedOutcomesV2(cells) {
  return cells.map((c) => {
    const printed = [];
    const results = [];
    let error = null;
    for (const o of c.outputs) {
      if (o.output_type === 'stream') {
        if (o.name !== 'stderr') printed.push(joined(o.text));
      } else if (o.output_type === 'execute_result' || o.output_type === 'display_data') {
        results.push(...canonData(o.output_type === 'execute_result' ? 'result' : 'display', o.data));
      } else if (o.output_type === 'error' && !error) {
        error = { kind: 'error', name: String(o.ename ?? ''), value: String(o.evalue ?? '') };
      }
    }
    const outputs = [];
    const out = tidy(capText(printed.join('')));
    if (out) outputs.push({ kind: 'stdout', text: out });
    outputs.push(...results);
    if (error) outputs.push(error);
    return { n: c.n, outputs };
  });
}

/** The rule the reproduction was made with: `canon: 2` on records that say so, the first rule on every record before. */
export const CANON = 2;
export const submittedFor = (canon, cells) => (canon === 2 ? submittedOutcomesV2(cells) : submittedOutcomes(cells));

/**
 * What a run produced, per cell that ran, canonical — the shape of `outputs.ran`. A run of one cell is
 * `{ stdout: string[], stderr: string[], results: [{ text?, png?, jpeg?, svg?, isMainResult? }], error: { name, value } | null }`.
 */
export function runOutcomes(cells, runs) {
  return cells.slice(0, runs.length).map((c, i) => {
    const r = runs[i];
    const outputs = [];
    const out = tidy(capText((r.stdout ?? []).join('')));
    if (out) outputs.push({ kind: 'stdout', text: out });
    for (const x of r.results ?? []) {
      const data = {};
      if (typeof x.text === 'string') data['text/plain'] = x.text;
      if (typeof x.png === 'string') data['image/png'] = x.png;
      if (typeof x.jpeg === 'string') data['image/jpeg'] = x.jpeg;
      if (typeof x.svg === 'string') data['image/svg+xml'] = x.svg;
      outputs.push(...canonData(x.isMainResult ? 'result' : 'display', data));
    }
    if (r.error) outputs.push({ kind: 'error', name: String(r.error.name ?? ''), value: String(r.error.value ?? '') });
    return { n: c.n, outputs };
  });
}

function sortKeys(o) {
  const out = {};
  for (const k of Object.keys(o).sort()) out[k] = String(o[k]);
  return out;
}

/** One line per cell, keys sorted, values as strings, joined with a newline: the text the digests are over. */
export function canonicalOutcomes(outcomes) {
  return outcomes.map((o) => JSON.stringify({ n: o.n, outputs: o.outputs.map(sortKeys) })).join('\n');
}

export const outcomesDigest = (outcomes) => sha(canonicalOutcomes(outcomes));

/** Which cells differ between two sets of outcomes, and whether a cell raised: the record's three statuses. */
export function compareOutcomes(submitted, ran) {
  const byN = new Map(submitted.map((o) => [o.n, canonicalOutcomes([o])]));
  const differing = [];
  let failedAt = null;
  for (const o of ran) {
    if (failedAt === null && o.outputs.some((x) => x.kind === 'error')) failedAt = o.n;
    if (byN.get(o.n) !== canonicalOutcomes([o])) differing.push(o.n);
  }
  if (failedAt !== null) return { status: 'failed', differing, failedAt };
  return { status: differing.length === 0 ? 'reproduced' : 'ran', differing, failedAt: null };
}

/** The words a reader sees for each status (ACM's artifact badges). */
export const BADGE = { reproduced: 'Results reproduced', ran: 'Ran without error', failed: 'Did not run' };

/** Every reproduction in a payload, with where it sits and which defense it belongs to. */
export function reproductionsIn(payload) {
  const defenses = payload?.record?.defenses;
  if (!Array.isArray(defenses)) return [];
  const out = [];
  defenses.forEach((d, i) => {
    const r = d?.project?.reproduction;
    if (r && typeof r === 'object' && r.notebook && r.outputs) out.push({ path: `record.defenses[${i}].project.reproduction`, title: d.title ?? null, sealedOn: d.sealedOn ?? null, timeZone: typeof d.timeZone === 'string' ? d.timeZone : null, attempt: d.attempt ?? null, reproduction: r });
  });
  return out;
}

/**
 * What the record's own reproduction says of itself, checkable from the record alone: a `reproduced` run's two digests
 * are equal, and the counts agree with each other. Each problem is a sentence; none means consistent.
 */
export function reproductionProblems(r) {
  const out = [];
  const code = r?.cells?.code;
  const differing = r?.cells?.differing;
  if (r.status === 'reproduced' && r.outputs.ran !== r.outputs.submitted) out.push('the record says the results reproduced, but its two outputs digests differ');
  if (r.status === 'reproduced' && differing) out.push('the record says the results reproduced, but counts differing cells');
  if (r.status === 'ran' && !differing) out.push('the record says outputs differed, but counts no differing cell');
  if (r.status === 'failed' && (r.cells?.failedAt === null || r.cells?.failedAt === undefined)) out.push('the record says the notebook did not run, but names no cell');
  if (Array.isArray(r?.cells?.differingAt) && r.cells.differingAt.length !== differing) out.push('the record’s list of differing cells does not match its count');
  if (typeof code === 'number' && typeof differing === 'number' && differing > code) out.push('the record counts more differing cells than code cells');
  return out;
}
