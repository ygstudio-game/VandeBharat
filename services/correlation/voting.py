"""
Multi-Camera Voting — competitor Algorithm 4 (C2).

A defect confirmed by several cameras is far more reliable than one camera's call.
Cameras are weighted by angle/distance to the component (configured per install).
Produces a weighted confidence and a weighted agreement fraction.

Pure logic — unit-tested against the competitor's worked example (=> 0.743).
"""
from dataclasses import dataclass


@dataclass
class Observation:
    camera_id: str
    detected: bool      # did this camera see the defect?
    confidence: float   # camera's confidence in its own call


@dataclass
class VoteResult:
    weighted_confidence: float   # Σ w·(conf if detected else 1-conf)
    agreement: float             # Σ w[detected] / Σ w   (fraction of weight agreeing)
    n_cameras: int


def vote(observations: list[Observation], weights: dict[str, float]) -> VoteResult:
    present = [o for o in observations if o.camera_id in weights]
    total_w = sum(weights[o.camera_id] for o in present)
    if total_w <= 0:
        return VoteResult(0.0, 0.0, 0)

    wconf = 0.0
    agree_w = 0.0
    for o in present:
        w = weights[o.camera_id]
        wconf += w * (o.confidence if o.detected else (1.0 - o.confidence))
        if o.detected:
            agree_w += w
    # normalize by present weight so a missing camera degrades gracefully
    return VoteResult(
        weighted_confidence=wconf / total_w,
        agreement=agree_w / total_w,
        n_cameras=len(present),
    )
