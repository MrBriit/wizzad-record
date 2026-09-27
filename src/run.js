/**
 * Running a notebook on the reader's own machine, the way Wizzad's re-run does: the notebook and the files on record
 * copied into an empty directory, the code cells run in order in one fresh Jupyter kernel from that directory, 120
 * seconds a cell and 10 minutes in all, stopping at the first cell that raises. The copy is removed afterwards.
 *
 * This RUNS THE NOTEBOOK'S CODE with the reader's permissions and network. The command only does it when asked to.
 */
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CELL_TIMEOUT_MS = 120_000;
export const TOTAL_TIMEOUT_MS = 10 * 60_000;
const DRIVER = fileURLToPath(new URL('./kernel_run.py', import.meta.url));

/**
 * Run `cells` (the notebook's code cells, as readNotebook gives them) against `files` ([{ name, path }], the notebook
 * among them, each copied in under the name the record gives it).
 * Resolves `{ runs, runtime, stopped, fatal }`: one run per cell that ran; the kernel's Python and the versions of the
 * named `packages`; why the run stopped early, if a limit ended it; or why no kernel could be had.
 */
export async function runNotebook({ cells, files, python = 'python3', packages = [], cellTimeoutMs = CELL_TIMEOUT_MS, totalTimeoutMs = TOTAL_TIMEOUT_MS }) {
  const dir = await mkdtemp(join(tmpdir(), 'wizzad-reproduce-'));
  try {
    for (const f of files) await copyFile(f.path, join(dir, basename(f.name)));
    const job = { dir, cells: cells.map((c) => c.source), cellTimeout: cellTimeoutMs / 1000, totalTimeout: totalTimeoutMs / 1000, packages };
    const lines = await driver(python, job, totalTimeoutMs + 120_000);
    const out = { runs: [], runtime: null, stopped: null, fatal: null };
    for (const l of lines) {
      if ('fatal' in l) out.fatal = { reason: l.fatal, detail: l.detail ?? '' };
      else if ('runtime' in l) out.runtime = l.runtime;
      else if ('stopped' in l) out.stopped = { reason: l.stopped, n: l.n };
      else if ('run' in l) out.runs.push(l.run);
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** The driver's JSON lines, or a `fatal` line when Python itself could not be started. */
function driver(python, job, killAfterMs) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(python, [DRIVER], { stdio: ['pipe', 'pipe', 'pipe'] }); } catch (err) { resolve([{ fatal: 'no_python', detail: err.message }]); return; }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), killAfterMs);
    child.stdout.on('data', (b) => { stdout += b; });
    child.stderr.on('data', (b) => { stderr += b; });
    child.on('error', (err) => { clearTimeout(timer); resolve([{ fatal: 'no_python', detail: err.message }]); });
    child.on('close', () => {
      clearTimeout(timer);
      const lines = [];
      for (const l of stdout.split('\n')) { if (!l.trim()) continue; try { lines.push(JSON.parse(l)); } catch { /* a line the driver did not write */ } }
      if (!lines.some((l) => 'runtime' in l || 'fatal' in l)) lines.push({ fatal: 'kernel', detail: stderr.trim().split('\n').slice(-3).join(' ') || 'the driver said nothing' });
      resolve(lines);
    });
    child.stdin.end(JSON.stringify(job));
  });
}
