"""
Tracking / Duplicate Suppression — competitor Service 8 + Algorithm 6 (C1).

YOLO fires the same physical defect on many consecutive frames. Without tracking
that becomes N database rows and N alerts. This DeepSORT-lite (IoU + class) tracker
merges detections of the same physical component across frames into ONE event with
confidence = max and frame_count = number of supporting frames.

Pure logic — unit-tested with synthetic detections.
"""
from dataclasses import dataclass, field


def iou(a: tuple, b: tuple) -> float:
    """Intersection-over-union of two (x1,y1,x2,y2) boxes."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


@dataclass
class Track:
    track_id: int
    defect_class: str
    bbox: tuple
    confidence: float
    coach_id: str = ""
    bogie_id: int = 0
    frame_count: int = 1
    last_frame: int = 0


@dataclass
class Tracker:
    iou_threshold: float = 0.3
    max_age: int = 5                       # finalize tracks idle > max_age frames
    _next_id: int = 0
    tracks: list = field(default_factory=list)   # currently active
    closed: list = field(default_factory=list)   # finalized (idle past max_age)

    def update(self, detections: list[dict], frame_idx: int) -> None:
        """Feed one frame's detections. Each detection: {class, bbox, confidence,
        coach_id?, bogie_id?}."""
        for det in detections:
            match = self._best_match(det)
            if match is not None:
                match.confidence = max(match.confidence, det["confidence"])
                # exponential moving average on the box (stabilize)
                match.bbox = _ema_box(match.bbox, det["bbox"], 0.5)
                match.frame_count += 1
                match.last_frame = frame_idx
            else:
                self.tracks.append(Track(
                    track_id=self._next_id,
                    defect_class=det["class"],
                    bbox=tuple(det["bbox"]),
                    confidence=det["confidence"],
                    coach_id=det.get("coach_id", ""),
                    bogie_id=det.get("bogie_id", 0),
                    last_frame=frame_idx,
                ))
                self._next_id += 1
        self._prune(frame_idx)

    def _best_match(self, det: dict):
        best, best_iou = None, self.iou_threshold
        for t in self.tracks:
            if t.defect_class != det["class"]:
                continue
            if t.bogie_id != det.get("bogie_id", 0):
                continue                   # never merge across bogies
            score = iou(t.bbox, tuple(det["bbox"]))
            if score >= best_iou:
                best, best_iou = t, score
        return best

    def _prune(self, frame_idx: int) -> None:
        keep, expired = [], []
        for t in self.tracks:
            (expired if frame_idx - t.last_frame > self.max_age else keep).append(t)
        self.tracks = keep
        self.closed.extend(expired)

    def merged_events(self) -> list[Track]:
        """Distinct physical defects seen so far (one per track): finalized + active."""
        return self.closed + self.tracks


def _ema_box(old: tuple, new: tuple, alpha: float) -> tuple:
    return tuple(alpha * n + (1 - alpha) * o for o, n in zip(old, new))
