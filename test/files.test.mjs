// Every file the record's own page lists (its Part III) is found by the checker, by a readable path — and nothing else is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprintsIn, matchFingerprint, fingerprintFile } from '../src/index.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const hex = (c) => c.repeat(64);

// A science project's defense as a shared record carries it: the brief, a lab notebook (one entry with a photo, one
// without), the files handed in, a notebook re-run and a live run — beside values that look like fingerprints and are not.
const PHOTO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const CODE = 'df["uS25"] = df.uS / (1 + 0.02 * (df.temp - 25))\n';
const OUTPUT = 'mean excess +2029 vs +357\n';
const payload = {
  schema: 'wizzad.proof/v1',
  recordId: hex('d'),
  subject: { ownerTag: hex('e'), photo: hex('f') },
  record: {
    defenses: [
      {
        id: 'r1',
        project: {
          pack: 'science',
          brief: { text: 'Road salt in the campus stream', setBy: null, sha256: hex('a'), enteredOn: '2026-09-23', source: 'student' },
          pages: 0,
          entries: [
            { on: '2026-09-23', sha256: hex('1'), photo: null },
            { on: '2026-09-24', sha256: hex('2'), photo: sha(PHOTO) },
          ],
          deliverables: [{ file: 'stream-conductivity.csv', role: 'data', bytes: 2100, sha256: hex('b'), handedInOn: '2026-09-24' }],
          reproduction: { ranOn: '2026-09-24', status: 'reproduced', notebook: { file: 'salt-analysis.ipynb', sha256: hex('c') }, inputs: [], outputs: { submitted: hex('3'), ran: hex('4') }, cells: { code: 4, differing: 0, failedAt: null } },
          liveRuns: [{ cell: 3, code: sha(CODE), output: sha(OUTPUT), raised: false }],
        },
        capture: { clips: [{ itemId: 'i1', sha256: hex('5') }] },
      },
    ],
  },
  // Not files: a fingerprint-like value under a name the record's page does not list, or outside a project.
  signature: { algorithm: 'Ed25519', keyId: 'k1', signature: hex('6') },
  code: hex('7'),
  outputs: { submitted: hex('8'), ran: hex('9') },
  liveRuns: [{ code: hex('0'), output: hex('0') }],
};

test('every file the record’s page lists is found, each by a readable path', () => {
  const at = Object.fromEntries(fingerprintsIn(payload).map((f) => [f.path, f.sha256]));
  assert.deepEqual(at, {
    'record.defenses[0].project.brief': hex('a'),
    'record.defenses[0].project.entries[1].photo': sha(PHOTO),
    'record.defenses[0].project.deliverables[0]': hex('b'),
    'record.defenses[0].project.reproduction.notebook': hex('c'),
    'record.defenses[0].project.reproduction.outputs.submitted': hex('3'),
    'record.defenses[0].project.reproduction.outputs.ran': hex('4'),
    'record.defenses[0].project.liveRuns[0].code': sha(CODE),
    'record.defenses[0].project.liveRuns[0].output': sha(OUTPUT),
    'record.defenses[0].capture.clips[0]': hex('5'),
  });
});

test('a lab-notebook photo, a live run’s code and its output, held as files, match where they sit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wizzad-record-files-'));
  const cases = [
    ['bench.jpg', PHOTO, 'record.defenses[0].project.entries[1].photo'],
    ['cell-3.py', CODE, 'record.defenses[0].project.liveRuns[0].code'],
    ['cell-3-output.txt', OUTPUT, 'record.defenses[0].project.liveRuns[0].output'],
  ];
  for (const [name, bytes, path] of cases) {
    const p = join(dir, name);
    writeFileSync(p, bytes);
    assert.deepEqual(matchFingerprint(payload, await fingerprintFile(p)), [{ path, sha256: sha(bytes) }]);
  }
  // A re-run's outputs, by their digest as the record gives it (any case).
  assert.deepEqual(matchFingerprint(payload, hex('4').toUpperCase()), [{ path: 'record.defenses[0].project.reproduction.outputs.ran', sha256: hex('4') }]);
});

test('nothing that is not a file is taken for one', () => {
  const found = new Set(fingerprintsIn(payload).map((f) => f.sha256));
  // A signature, a record id, an owner tag, a photo field outside a lab notebook, and outputs or runs outside a project.
  for (const c of ['6', 'd', 'e', 'f', '7', '8', '9', '0']) assert.equal(found.has(hex(c)), false, `hex('${c}') is not a file`);
  // A lab-notebook entry's own fingerprint is over its moment and words, not a file: the record's page does not list it.
  assert.equal(found.has(hex('1')), false);
  assert.equal(found.has(hex('2')), false);
  assert.equal(matchFingerprint(payload, hex('6')).length, 0);
  // A named field whose value is not a fingerprint is not one.
  const odd = { project: { entries: [{ on: '2026-09-24', sha256: hex('1'), photo: 'bench.jpg' }], liveRuns: [{ cell: 1, code: 'print(1)', output: '', raised: false }], reproduction: { outputs: { submitted: null, ran: 42 } } } };
  assert.deepEqual(fingerprintsIn(odd), []);
});

test('a defense record carries its project at the top: the same paths, from there', () => {
  const top = { schema: 'wizzad.defense/v1', project: payload.record.defenses[0].project };
  const paths = fingerprintsIn(top).map((f) => f.path);
  assert.ok(paths.includes('project.entries[1].photo'));
  assert.ok(paths.includes('project.liveRuns[0].code'));
  assert.ok(paths.includes('project.reproduction.outputs.submitted'));
});

test('the web page finds exactly what the library finds', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const src = html.slice(html.indexOf('/* fingerprints:begin'), html.indexOf('/* fingerprints:end */'));
  assert.ok(src.includes('const fingerprints ='));
  const webFingerprints = new Function(`${src}; return fingerprints;`)();
  const record = JSON.parse(readFileSync(new URL('./fixtures/record.json', import.meta.url), 'utf8'));
  for (const p of [payload, record.payload, { schema: 'wizzad.defense/v1', project: payload.record.defenses[0].project }]) assert.deepEqual(webFingerprints(p), fingerprintsIn(p));
});
