#!/usr/bin/env python3
"""
DAQ Pipeline Demo Runner
========================
Proves end-to-end pipeline in one command:

    python demo_run.py

What it does
------------
1. (Optional) starts Docker Compose stack
2. Waits for frame_fetcher /health to return 200
3. Waits until enough frames are indexed in PostgreSQL
4. Retrieves several frames via GET /frames/{id}
5. Saves each as a PNG to /tmp/daq_demo_frame_<id>.png
6. Prints a pass/fail report and the Grafana URL

Flags
-----
    --no-start          skip `docker compose up` (containers already running)
    --duration N        seconds to let ingestion run before retrieving (default 120)
    --frames 1,500,1000 comma-separated frame IDs to retrieve (default: auto-picked)
    --out-dir /tmp      directory for saved PNGs (default /tmp)

Run from the frameinput/ directory:
    python demo_run.py
    python demo_run.py --no-start --duration 60
"""
import argparse
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

FETCHER_BASE = "http://localhost:8000"
COMPOSE_FILE = Path(__file__).parent / "docker-compose.yml"


# ── HTTP helpers (stdlib only — no requests needed on the host) ───────────────

def _get(url: str, timeout: int = 5):
    """Return (status_code, body_bytes).  Never raises on HTTP errors."""
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception:
        return 0, b""


def _wait_for_health(url: str, label: str, timeout: int = 120) -> bool:
    print(f"  Waiting for {label} ...", end="", flush=True)
    deadline = time.time() + timeout
    while time.time() < deadline:
        status, _ = _get(url)
        if status == 200:
            print(" ready")
            return True
        print(".", end="", flush=True)
        time.sleep(2)
    print(" TIMEOUT")
    return False


def _frame_count() -> int:
    status, body = _get(f"{FETCHER_BASE}/stats")
    if status != 200:
        return 0
    import json
    try:
        return json.loads(body).get("total_frames_indexed", 0)
    except Exception:
        return 0


# ── docker compose helpers ────────────────────────────────────────────────────

def start_stack() -> None:
    print("Starting Docker Compose stack ...")
    subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE_FILE), "up", "-d", "--build"],
        check=True,
    )
    print("  docker compose up complete")


def running_containers() -> list[str]:
    result = subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE_FILE), "ps", "--services", "--filter", "status=running"],
        capture_output=True, text=True,
    )
    return [s.strip() for s in result.stdout.splitlines() if s.strip()]


# ── frame retrieval ───────────────────────────────────────────────────────────

def retrieve_frame(frame_id: int, out_dir: str) -> dict:
    url    = f"{FETCHER_BASE}/frames/{frame_id}?format=png"
    t0     = time.perf_counter()
    status, body = _get(url, timeout=30)
    elapsed = time.perf_counter() - t0

    result = {
        "frame_id": frame_id,
        "status":   status,
        "size":     len(body),
        "elapsed":  round(elapsed * 1000),
        "path":     None,
        "ok":       False,
    }

    if status == 200 and body[:4] == b"\x89PNG":
        out_path = os.path.join(out_dir, f"daq_demo_frame_{frame_id}.png")
        with open(out_path, "wb") as f:
            f.write(body)
        result["path"] = out_path
        result["ok"]   = True

    return result


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="DAQ Pipeline Demo Runner")
    parser.add_argument("--no-start",  action="store_true",
                        help="Skip docker compose up (assume containers running)")
    parser.add_argument("--duration",  type=int, default=120,
                        help="Seconds to let ingestion run before retrieving (default 120)")
    parser.add_argument("--frames",    type=str, default="",
                        help="Comma-separated frame IDs to retrieve (default: auto)")
    parser.add_argument("--out-dir",   type=str, default="/tmp",
                        help="Directory to save retrieved PNGs (default /tmp)")
    args = parser.parse_args()

    print()
    print("=" * 60)
    print("  DAQ Pipeline Demo")
    print("=" * 60)

    # ── 1. Start stack ────────────────────────────────────────────────────────
    if not args.no_start:
        start_stack()
    else:
        print("Skipping docker compose up (--no-start)")

    # ── 2. Wait for frame_fetcher ─────────────────────────────────────────────
    print()
    print("Checking service health ...")
    if not _wait_for_health(f"{FETCHER_BASE}/health", "frame_fetcher"):
        print("\nERROR: frame_fetcher did not become healthy.")
        print("       Run: docker compose logs frame_fetcher")
        return 1

    running = running_containers()
    print(f"  Running containers: {', '.join(running) if running else 'unknown'}")

    # ── 3. Let ingestion run ──────────────────────────────────────────────────
    print()
    print(f"Ingestion running for {args.duration}s ...")
    print("  Watch live stats:  docker compose logs -f ingestion")
    print("  Grafana dashboard: http://localhost:3000  (admin / admin)")
    print()

    deadline = time.time() + args.duration
    min_frames_needed = max(1000, 10)  # need at least this many before retrieving
    last_report = time.time()

    while time.time() < deadline:
        count = _frame_count()
        now   = time.time()
        if now - last_report >= 10:
            remaining = max(0, int(deadline - now))
            print(f"  [{remaining:3d}s left]  frames indexed: {count:,}", flush=True)
            last_report = now
        time.sleep(2)

    total_indexed = _frame_count()
    print(f"\n  Ingest window complete — total frames indexed: {total_indexed:,}")

    if total_indexed == 0:
        print("\nERROR: No frames indexed in PostgreSQL.")
        print("       Check: docker compose logs ingestion")
        return 1

    # ── 4. Pick frame IDs to retrieve ─────────────────────────────────────────
    if args.frames:
        frame_ids = [int(x.strip()) for x in args.frames.split(",")]
    else:
        # Auto-pick: first frame, a middle frame, a late frame
        mid  = total_indexed // 2
        late = max(1, total_indexed - 100)
        frame_ids = sorted({1, mid, late})

    print()
    print(f"Retrieving {len(frame_ids)} frames: {frame_ids}")

    os.makedirs(args.out_dir, exist_ok=True)
    results = []
    for fid in frame_ids:
        r = retrieve_frame(fid, args.out_dir)
        results.append(r)
        tag = "[OK]" if r["ok"] else "[!!]"
        if r["ok"]:
            print(f"  {tag}  frame {fid:8d}  →  {r['path']}  "
                  f"({r['size'] / 1024:.0f} KB,  {r['elapsed']} ms)")
        else:
            print(f"  {tag}  frame {fid:8d}  →  HTTP {r['status']}")

    # ── 5. Summary ────────────────────────────────────────────────────────────
    passed = sum(1 for r in results if r["ok"])
    failed = len(results) - passed

    print()
    print("=" * 60)
    print(f"  Result: {passed}/{len(results)} frames retrieved successfully")
    if failed:
        print(f"  WARNING: {failed} frame(s) failed")
    print()
    print("  Verify images:")
    for r in results:
        if r["path"]:
            print(f"    {r['path']}")
    print()
    print("  Grafana:       http://localhost:3000          (admin / admin)")
    print("  Frame API:     http://localhost:8000/frames/1")
    print("  Prometheus:    http://localhost:9090")
    print("  Metrics:       http://localhost:9100/metrics")
    print("=" * 60)
    print()

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
