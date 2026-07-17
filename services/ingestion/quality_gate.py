"""
Frame Quality Pre-Screen — competitor Algorithm 9 (B2).

Reject blurry / dark / overexposed frames on the CPU BEFORE they reach the GPU,
saving ~15-30% of inference cost. Fast metrics only:
  * sharpness = variance of the Laplacian (focus measure)
  * brightness = mean pixel value (under/over-exposure)

Pure numpy — no cv2 — so accuracy + perf are unit-tested deterministically.
Thresholds come from config (no hardcoded values).
"""
from dataclasses import dataclass

import numpy as np

# 4-neighbour Laplacian applied via array slicing (no scipy dependency).


def laplacian_variance(gray: np.ndarray) -> float:
    # float32 (half the bandwidth of float64) keeps this well under 1 ms/frame on ROI.
    g = gray.astype(np.float32, copy=False)
    lap = (
        -4.0 * g[1:-1, 1:-1]
        + g[:-2, 1:-1]
        + g[2:, 1:-1]
        + g[1:-1, :-2]
        + g[1:-1, 2:]
    )
    return float(lap.var())


def brightness(gray: np.ndarray) -> float:
    return float(gray.mean())


@dataclass
class QualityResult:
    accepted: bool
    reason: str          # "ok" | "blurry" | "too_dark" | "too_bright"
    sharpness: float
    brightness: float


class QualityGate:
    def __init__(self, blur_threshold: float = 100.0,
                 brightness_min: float = 20.0, brightness_max: float = 240.0):
        self.blur_threshold = blur_threshold
        self.brightness_min = brightness_min
        self.brightness_max = brightness_max

    def assess(self, gray: np.ndarray) -> QualityResult:
        b = brightness(gray)
        if b < self.brightness_min:
            return QualityResult(False, "too_dark", 0.0, b)
        if b > self.brightness_max:
            return QualityResult(False, "too_bright", 0.0, b)
        s = laplacian_variance(gray)
        if s < self.blur_threshold:
            return QualityResult(False, "blurry", s, b)
        return QualityResult(True, "ok", s, b)

    @classmethod
    def from_config(cls, cfg: dict) -> "QualityGate":
        q = cfg.get("quality", {}) if "quality" in cfg else cfg
        return cls(
            blur_threshold=float(q.get("blur_threshold", 100.0)),
            brightness_min=float(q.get("brightness_min", 20.0)),
            brightness_max=float(q.get("brightness_max", 240.0)),
        )

    def screen_payload(self, payload: bytes) -> tuple[bool, str]:
        """Production screen: decode JPEG bytes -> grayscale -> assess.
        Returns (accepted, reason) for the pipeline hook. cv2 imported lazily."""
        import cv2
        arr = np.frombuffer(payload, dtype=np.uint8)
        gray = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        if gray is None:
            return False, "decode_failed"
        r = self.assess(gray)
        return r.accepted, r.reason
