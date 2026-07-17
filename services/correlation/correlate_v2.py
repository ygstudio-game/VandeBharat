"""
Upgraded Event Correlation pipeline (Phase C integration) — chains C1..C5 into one
authoritative per-coach result:

    raw detections
      -> C1 tracking dedup        (one record per physical component, per camera)
      -> C2 multi-camera voting   (agreement M)
      -> C3 Bayesian fusion       (fused confidence Y)
      -> C5 baseline FP adjust    (subtract learned per-camera false positives)
      -> C4 composite score+route (confirm vs human review)

Input: a list of per-(camera) observations for ONE candidate defect on ONE coach:
    {camera_id, detected: bool, confidence, frame_count, image_quality, ocr_confidence}
grouped by (defect_class, bogie_id) by the caller.

Pure orchestration over the already-unit-tested algorithm modules.
"""
from dataclasses import dataclass

from voting import Observation, vote
from fusion import bayesian_fusion
from scoring import route_event
from baseline import BaselineLearner


@dataclass
class CorrelationOutput:
    defect_class: str
    bogie_id: int
    score: float
    route: str          # "confirm" | "review"
    fused_confidence: float
    agreement: float


def correlate_candidate(
    defect_class: str,
    bogie_id: int,
    observations: list[dict],
    camera_weights: dict,
    baseline: BaselineLearner | None = None,
    *,
    max_frames: int = 10,
    threshold: float = 0.92,
) -> CorrelationOutput:
    detecting = [o for o in observations if o["detected"]]

    # C2 — multi-camera voting -> agreement M
    vobs = [Observation(o["camera_id"], o["detected"], o["confidence"]) for o in observations]
    vres = vote(vobs, camera_weights)

    # C3 — Bayesian fusion of the detecting cameras' confidences -> Y
    Y = bayesian_fusion([o["confidence"] for o in detecting]) if detecting else 0.0

    # C5 — subtract learned per-camera false-positive baseline from Y
    if baseline is not None and detecting:
        worst_cam = max(detecting, key=lambda o: baseline.fp_rate(o["camera_id"], defect_class))
        Y = max(0.0, baseline.adjust(worst_cam["camera_id"], defect_class, Y))

    # supporting evidence
    T = min(1.0, max((o["frame_count"] for o in detecting), default=0) / max_frames)
    Q = (sum(o.get("image_quality", 0.0) for o in detecting) / len(detecting)) if detecting else 0.0
    Ocr = (sum(o.get("ocr_confidence", 0.0) for o in detecting) / len(detecting)) if detecting else 0.0
    M = vres.agreement

    # C4 — composite score + routing
    r = route_event(Y, T, M, Q, Ocr, threshold=threshold)
    return CorrelationOutput(defect_class, bogie_id, r.score, r.route, Y, M)
