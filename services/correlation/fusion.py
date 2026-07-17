"""
Bayesian Confidence Fusion — competitor Algorithm 5 (C3).

Combines independent camera evidence with sequential Bayesian updates instead of
naive averaging. Mathematically equivalent to multiplying odds, so it is
order-independent and especially strong when cameras disagree.

    P_post = (c · P_prior) / (c · P_prior + (1-c) · (1-P_prior))

Pure logic — unit-tested against the competitor's worked example (=> 0.999).
"""


def bayesian_update(prior: float, confidence: float) -> float:
    c, p = confidence, prior
    num = c * p
    den = c * p + (1.0 - c) * (1.0 - p)
    if den <= 0:
        return 0.0
    return num / den


def bayesian_fusion(confidences: list[float], prior: float = 0.5) -> float:
    """Fuse independent confidences into a single posterior probability."""
    p = prior
    for c in confidences:
        p = bayesian_update(p, c)
    return p
