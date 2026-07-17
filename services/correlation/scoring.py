"""
Composite Alert Score — competitor Algorithm 7 (C4).

Five independent evidence sources are combined; only events above the threshold
reach the Alert Service, the rest go to a human Review queue.

    Score = 0.35·Y + 0.20·T + 0.20·M + 0.15·Q + 0.10·O
      Y = YOLO/Bayesian-fused confidence
      T = tracking stability (frames seen / max)
      M = multi-camera agreement fraction
      Q = image quality (normalized Laplacian variance)
      O = OCR confidence (coach-association reliability)

Pure logic — unit-tested against the competitor's worked example (=> 0.886).
"""
from dataclasses import dataclass

WEIGHTS = {"Y": 0.35, "T": 0.20, "M": 0.20, "Q": 0.15, "O": 0.10}
DEFAULT_THRESHOLD = 0.92


@dataclass
class ScoreResult:
    score: float
    route: str          # "confirm" | "review"


def composite_score(Y: float, T: float, M: float, Q: float, Ocr: float) -> float:
    return (WEIGHTS["Y"] * Y + WEIGHTS["T"] * T + WEIGHTS["M"] * M
            + WEIGHTS["Q"] * Q + WEIGHTS["O"] * Ocr)


def route_event(Y, T, M, Q, Ocr, threshold: float = DEFAULT_THRESHOLD) -> ScoreResult:
    s = composite_score(Y, T, M, Q, Ocr)
    return ScoreResult(score=s, route="confirm" if s >= threshold else "review")
