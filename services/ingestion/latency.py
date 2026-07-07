"""
LatencyTracker (B5) — records end-to-end ingest->flagged-defect latencies and
reports P50/P95 against the budget. Pure logic, unit-tested.
"""
import bisect
import math


class LatencyTracker:
    def __init__(self, budget_ms: float = 10_000.0):
        self.budget_ms = budget_ms
        self._samples: list[float] = []
        self.breaches = 0          # samples over budget

    def record(self, latency_ms: float) -> None:
        self._samples.append(latency_ms)
        if latency_ms > self.budget_ms:
            self.breaches += 1

    @property
    def count(self) -> int:
        return len(self._samples)

    def percentile(self, p: float) -> float:
        if not self._samples:
            return 0.0
        s = sorted(self._samples)
        # nearest-rank percentile: rank = ceil(p/100 * N), index = rank - 1
        rank = max(1, math.ceil((p / 100.0) * len(s)))
        k = min(len(s) - 1, rank - 1)
        return s[k]

    @property
    def p50(self) -> float:
        return self.percentile(50)

    @property
    def p95(self) -> float:
        return self.percentile(95)

    def within_budget(self, p: float = 95) -> bool:
        return self.percentile(p) <= self.budget_ms

    def summary(self) -> dict:
        return {
            "count": self.count,
            "p50_ms": round(self.p50, 1),
            "p95_ms": round(self.p95, 1),
            "budget_ms": self.budget_ms,
            "breaches": self.breaches,
            "within_budget_p95": self.within_budget(95),
        }


# kept for callers that want a streaming insert without re-sorting on read
def insort(sorted_list: list[float], value: float) -> None:
    bisect.insort(sorted_list, value)
