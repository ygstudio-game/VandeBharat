"""
Per-Camera False-Positive Baseline / Inter-Train Learning — competitor Algorithm 13 (C5).

Some detections are persistent false positives from a fixed cause (a track shadow,
a lens smudge) — the SAME (camera, defect_class) fires on many *clean* trains. After
each clean train we update a rolling baseline FP-rate and subtract it from future
confidences, suppressing the phantom while leaving genuine defects untouched.

    fp_rate[cam][class] = (# of last-N clean trains in which class fired) / N
    adjusted_confidence = yolo_confidence - fp_rate[cam][class]
    adjusted < 0  =>  treat as false positive

Pure logic — unit-tested. Reset when a camera is recalibrated / lens cleaned.
"""
from collections import deque
from dataclasses import dataclass, field


@dataclass
class BaselineLearner:
    window: int = 20                       # last N clean trains
    # per camera: a bounded history of sets of classes that fired on each clean train
    _history: dict = field(default_factory=dict)

    def observe_clean_train(self, camera_id, classes_detected) -> None:
        """Record the classes that fired for this camera on a CLEAN train."""
        dq = self._history.setdefault(camera_id, deque(maxlen=self.window))
        dq.append(set(classes_detected))

    def fp_rate(self, camera_id, defect_class) -> float:
        dq = self._history.get(camera_id)
        if not dq:
            return 0.0
        hits = sum(1 for rec in dq if defect_class in rec)
        return hits / len(dq)

    def adjust(self, camera_id, defect_class, confidence) -> float:
        return confidence - self.fp_rate(camera_id, defect_class)

    def is_false_positive(self, camera_id, defect_class, confidence) -> bool:
        return self.adjust(camera_id, defect_class, confidence) < 0.0

    def reset(self, camera_id) -> None:
        """Clear baseline after recalibration / lens cleaning."""
        self._history.pop(camera_id, None)
