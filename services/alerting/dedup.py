"""
Dedup window (D1) — one alert per defect per coach within a time window, not one
per detection. Competitor Alert Service rule (60 s default).

Pure logic, unit-tested. Key = (coach_id, defect_class).
"""


class DedupWindow:
    def __init__(self, window_sec: float = 60.0):
        self.window_sec = window_sec
        self._last: dict[tuple, float] = {}

    def key(self, coach_id: str, defect_class: str) -> tuple:
        return (coach_id, defect_class)

    def should_send(self, coach_id: str, defect_class: str, now_s: float) -> bool:
        k = self.key(coach_id, defect_class)
        last = self._last.get(k)
        if last is not None and (now_s - last) < self.window_sec:
            return False
        self._last[k] = now_s
        return True
