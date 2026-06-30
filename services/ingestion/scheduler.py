"""
Smart Frame Selection / Scheduler — competitor Algo 10 adapted (B3).

Only frames likely to contain a component-of-interest are forwarded to the GPU;
inter-coach gaps are sub-sampled. v1 is motion-driven (no trigger sensors yet);
the same `decide()` interface accepts a physics-predicted signal later (B-trigger
upgrade) with no pipeline change.

State machine (per camera):
    IDLE        : waiting, sparse sampling to catch a coach onset
    ACTIVE      : a coach is passing -> process at active_stride (full-ish rate)
    INTER_COACH : between coaches -> process at inter_coach_stride (~10% rate)

Core logic is pure: it consumes a scalar `activity` in [0,1] (e.g. normalized
inter-frame motion) so it is unit-testable without cv2. A `motion_score()` helper
produces that signal in production.
"""
from dataclasses import dataclass
from enum import Enum

import numpy as np


class State(str, Enum):
    IDLE = "idle"
    ACTIVE = "active"
    INTER_COACH = "inter_coach"


class Task(str, Enum):
    OCR = "ocr"
    YOLO = "yolo"
    BOTH = "both"


@dataclass
class ScheduleDecision:
    process: bool
    task: Task | None
    state: State
    reason: str
    coach_index: int        # which coach this frame belongs to (-1 if none/gap)


def motion_score(prev_gray: np.ndarray, gray: np.ndarray) -> float:
    """Normalized mean absolute inter-frame difference in [0,1]. Production signal."""
    if prev_gray is None or prev_gray.shape != gray.shape:
        return 0.0
    diff = np.abs(gray.astype(np.float32) - prev_gray.astype(np.float32))
    return float(diff.mean() / 255.0)


class FrameScheduler:
    def __init__(self, activity_threshold: float = 0.10,
                 active_stride: int = 4, inter_coach_stride: int = 10,
                 gap_tolerance: int = 5):
        self.activity_threshold = activity_threshold
        self.active_stride = active_stride          # process 1 of N while a coach passes
        self.inter_coach_stride = inter_coach_stride  # process 1 of N between coaches
        self.gap_tolerance = gap_tolerance          # low-activity frames tolerated mid-coach
        # state
        self.state = State.IDLE
        self._coach_index = -1
        self._active_count = 0       # frames seen in current coach
        self._idle_count = 0         # consecutive low-activity frames
        self._seen = 0               # total frames seen

    def decide(self, activity: float, frame_number: int) -> ScheduleDecision:
        self._seen += 1
        is_active = activity >= self.activity_threshold

        if is_active:
            if self.state != State.ACTIVE:
                # rising edge -> a new coach begins; ALWAYS process its first frame
                self._coach_index += 1
                self.state = State.ACTIVE
                self._active_count = 0
                self._idle_count = 0
                self._active_count += 1
                return ScheduleDecision(True, Task.BOTH, self.state,
                                        "coach_onset", self._coach_index)
            # mid-coach: process every active_stride-th frame
            self._active_count += 1
            self._idle_count = 0
            if self._active_count % self.active_stride == 0:
                return ScheduleDecision(True, Task.BOTH, self.state,
                                        "active_stride", self._coach_index)
            return ScheduleDecision(False, None, self.state, "active_skip", self._coach_index)

        # low activity
        self._idle_count += 1
        if self.state == State.ACTIVE and self._idle_count <= self.gap_tolerance:
            # brief dip inside a coach — stay ACTIVE, skip
            return ScheduleDecision(False, None, self.state, "active_dip", self._coach_index)
        # transition to inter-coach / idle
        self.state = State.INTER_COACH if self._coach_index >= 0 else State.IDLE
        if self._seen % self.inter_coach_stride == 0:
            # sparse sampling so the next coach onset is caught
            return ScheduleDecision(True, Task.OCR, self.state, "gap_sample", -1)
        return ScheduleDecision(False, None, self.state, "gap_skip", -1)

    @property
    def coaches_detected(self) -> int:
        return self._coach_index + 1

    @classmethod
    def from_config(cls, cfg: dict) -> "FrameScheduler":
        s = cfg.get("scheduler", {}) if "scheduler" in cfg else cfg
        return cls(
            activity_threshold=float(s.get("activity_threshold", 0.10)),
            active_stride=int(s.get("active_stride", 4)),
            inter_coach_stride=int(s.get("inter_coach_stride", 10)),
            gap_tolerance=int(s.get("gap_tolerance", 5)),
        )


def make_motion_selector(scheduler: "FrameScheduler"):
    """Production select() hook: decode JPEG -> gray -> motion vs previous frame ->
    scheduler.decide(). Returns (process, task, reason). cv2 imported lazily."""
    state = {"prev": None, "n": 0}

    def select(payload: bytes):
        import cv2
        arr = np.frombuffer(payload, dtype=np.uint8)
        gray = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        activity = motion_score(state["prev"], gray) if gray is not None else 0.0
        state["prev"] = gray
        d = scheduler.decide(activity, state["n"])
        state["n"] += 1
        return d.process, d.task, d.reason

    return select
