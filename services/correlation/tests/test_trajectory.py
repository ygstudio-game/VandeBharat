"""C4 — trajectory matching tests (anchored to competitor example)."""
import pytest
from trajectory import predict_arrival_ms, trajectory_match


def test_predicted_arrival():
    # cam4 is 3.5 m downstream, train at 22.2 m/s -> ~157.7 ms later
    p = predict_arrival_ms(100_520.0, 3.5, 22.2)
    assert abs((p - 100_520.0) - 157.66) < 0.5


def test_match_within_tolerance_confirms():
    r = trajectory_match(100_520.0, 3.5, 22.2, t_actual_ms=100_681.0)
    assert r.delta_ms < 20
    assert r.confirmed is True               # ~3 ms drift -> physics-confirmed


def test_miss_flags_for_review():
    r = trajectory_match(100_520.0, 3.5, 22.2, t_actual_ms=100_950.0)
    assert r.delta_ms > 20                    # ~272 ms off -> different defect / false positive
    assert r.confirmed is False


def test_zero_speed_raises():
    with pytest.raises(ValueError):
        predict_arrival_ms(0.0, 3.5, 0.0)
