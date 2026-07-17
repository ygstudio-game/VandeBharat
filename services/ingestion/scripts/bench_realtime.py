"""
B5 full-stack latency benchmark (host-only — needs the YOLO service running).

Posts a known-defect image to the real YOLO service N times and measures the
ingest->flag latency distribution, then checks it against the <10s budget. This
is the measurement that closes the B5 Exit Gate on a machine with the stack up.

    python services/ingestion/scripts/bench_realtime.py path/to/defect.jpg --runs 20

Exit code 0 if P95 within budget AND the defect was detected on every run; else 1.
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from latency import LatencyTracker          # noqa: E402
from realtime import RealtimeProcessor      # noqa: E402
from realtime_consumer import HttpYoloInferer  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image", help="path to a known-defect frame")
    ap.add_argument("--runs", type=int, default=20)
    ap.add_argument("--budget-ms", type=float, default=10_000.0)
    ap.add_argument("--yolo-url", default=os.environ.get(
        "YOLO_SERVICE_URL", "http://127.0.0.1:5002/api/yolo/predict"))
    args = ap.parse_args()

    inferer = HttpYoloInferer(args.yolo_url)
    lt = LatencyTracker(budget_ms=args.budget_ms)
    hits = 0

    def sink(_event):
        nonlocal hits
        hits += 1

    proc = RealtimeProcessor(inferer, sink, lt, clock=lambda: time.time() * 1000.0)

    for i in range(args.runs):
        t0 = time.time() * 1000.0
        n = proc.process({"frame_ref": args.image, "ingest_timestamp_ms": t0})
        print(f"run {i+1}/{args.runs}: defects={n}")

    summary = lt.summary()
    print("LATENCY:", summary)
    no_miss = hits >= args.runs           # at least one defect detected per run
    ok = summary["within_budget_p95"] and no_miss
    print(f"RESULT: {'PASS' if ok else 'FAIL'} "
          f"(p95={summary['p95_ms']}ms budget={args.budget_ms}ms, detections={hits}/{args.runs})")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
