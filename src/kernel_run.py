"""Run a notebook's code cells in a fresh Jupyter kernel, as Wizzad's re-run does (the standard, section 4.3.1).

Reads one JSON job on stdin: {"dir", "cells": [source, ...], "cellTimeout", "totalTimeout", "packages": [name, ...]}.
Writes JSON lines on stdout:
  {"runtime": {"python", "packages": {name: version}}}  first, read inside the kernel that runs the cells
  {"n", "run": {"stdout", "stderr", "results", "error"}} one per cell that ran, in order; the run stops after a raise
  {"stopped": "cell_timeout" | "too_long", "n"}         when a limit ended the run
  {"fatal": "no_jupyter" | "kernel", "detail"}          when no kernel could be had
Every cell runs in one kernel, in order, from the directory holding the notebook and its files.
"""
import json
import queue
import sys
import time


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def run_cell(km, kc, code, timeout):
    msg_id = kc.execute(code, store_history=True, allow_stdin=False)
    out = {"stdout": [], "stderr": [], "results": [], "error": None}
    deadline = time.monotonic() + timeout
    while True:
        left = deadline - time.monotonic()
        if left <= 0:
            km.interrupt_kernel()
            return out, True
        try:
            msg = kc.get_iopub_msg(timeout=min(left, 1.0))
        except queue.Empty:
            continue
        if msg.get("parent_header", {}).get("msg_id") != msg_id:
            continue
        kind, c = msg["msg_type"], msg["content"]
        if kind == "stream":
            out["stdout" if c.get("name") == "stdout" else "stderr"].append(c.get("text", ""))
        elif kind in ("execute_result", "display_data"):
            data = c.get("data", {})
            out["results"].append({
                "text": data.get("text/plain"),
                "png": data.get("image/png"),
                "jpeg": data.get("image/jpeg"),
                "svg": data.get("image/svg+xml"),
                "isMainResult": kind == "execute_result",
            })
        elif kind == "error":
            out["error"] = {"name": c.get("ename", ""), "value": c.get("evalue", ""), "traceback": "\n".join(c.get("traceback", []))}
        elif kind == "status" and c.get("execution_state") == "idle":
            return out, False


PROBE = """
import sys as _s, json as _j
try:
    from importlib import metadata as _m
except ImportError:
    _m = None
_v = {}
for _n in %s:
    try:
        _v[_n] = _m.version(_n) if _m else None
    except Exception:
        pass
print(_j.dumps({"python": _s.version.split()[0], "packages": {k: v for k, v in _v.items() if v}}))
del _s, _j, _m, _v
"""


def main():
    job = json.load(sys.stdin)
    try:
        from jupyter_client.manager import start_new_kernel
    except ImportError as e:
        emit({"fatal": "no_jupyter", "detail": str(e)})
        return 3
    try:
        km, kc = start_new_kernel(kernel_name="python3", cwd=job["dir"])
    except Exception as e:  # noqa: BLE001 — any failure to start is the same answer to the reader
        emit({"fatal": "kernel", "detail": str(e)})
        return 3
    try:
        probe, _ = run_cell(km, kc, PROBE % json.dumps(job.get("packages", [])), 30)
        try:
            emit({"runtime": json.loads("".join(probe["stdout"]).strip().splitlines()[-1])})
        except Exception:  # noqa: BLE001 — a kernel that cannot say leaves the runtime unknown
            emit({"runtime": None})
        run_cell(km, kc, "import os\nos.chdir(%s)" % json.dumps(job["dir"]), job["cellTimeout"])
        started = time.monotonic()
        total = job["totalTimeout"]
        for i, source in enumerate(job["cells"]):
            spent = time.monotonic() - started
            if spent > total:
                emit({"stopped": "too_long", "n": i + 1})
                break
            r, timed_out = run_cell(km, kc, source, min(job["cellTimeout"], max(1.0, total - spent)))
            if timed_out:
                emit({"stopped": "cell_timeout", "n": i + 1})
                break
            emit({"n": i + 1, "run": r})
            if r["error"]:
                break
    finally:
        kc.stop_channels()
        km.shutdown_kernel(now=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
