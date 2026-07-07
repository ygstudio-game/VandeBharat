"""
Defect Trajectory Matching — competitor Algorithm 8 (C4).

Uses known camera geometry + measured train speed to predict WHEN a defect seen at
one camera should appear at the next. A match within tolerance is a physics-based
confirmation stronger than confidence alone; a miss flags the event for human review.

Pure logic — unit-tested against the competitor's worked example.
"""
from dataclasses import dataclass

TRAJECTORY_TOLERANCE_MS = 20.0


@dataclass
class TrajectoryResult:
    predicted_ms: float
    delta_ms: float
    confirmed: bool


def predict_arrival_ms(t0_ms: float, distance_m: float, speed_ms: float) -> float:
    if speed_ms <= 0:
        raise ValueError("speed must be > 0")
    return t0_ms + (distance_m / speed_ms) * 1000.0


def trajectory_match(t0_ms: float, distance_m: float, speed_ms: float,
                     t_actual_ms: float, tolerance_ms: float = TRAJECTORY_TOLERANCE_MS) -> TrajectoryResult:
    predicted = predict_arrival_ms(t0_ms, distance_m, speed_ms)
    delta = abs(t_actual_ms - predicted)
    return TrajectoryResult(predicted_ms=predicted, delta_ms=delta,
                            confirmed=delta < tolerance_ms)
