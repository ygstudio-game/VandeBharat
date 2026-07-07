"""C0 — DefectEvent state machine + serialization tests."""
import pytest
from events import DefectEvent, EventState, IllegalTransition


def _ev():
    return DefectEvent(coach_id="LWSCN12345", camera_id=3, defect_class="spring_missing")


def test_full_legal_lifecycle():
    e = _ev()
    chain = [EventState.TRACKED, EventState.CORRELATED, EventState.VALIDATED,
             EventState.CONFIRMED, EventState.ALERTED, EventState.ARCHIVED]
    for s in chain:
        e.transition(s)
        assert e.state == s
    assert e.validated is True   # set when entering VALIDATED


def test_confirmed_can_skip_alert_to_archive():
    e = _ev()
    for s in [EventState.TRACKED, EventState.CORRELATED, EventState.VALIDATED, EventState.CONFIRMED]:
        e.transition(s)
    e.transition(EventState.ARCHIVED)      # CONFIRMED -> ARCHIVED is allowed (no alert)
    assert e.state == EventState.ARCHIVED


def test_illegal_skip_raises():
    e = _ev()
    with pytest.raises(IllegalTransition):
        e.transition(EventState.CONFIRMED)   # NEW -> CONFIRMED skips stages


def test_no_transition_out_of_archived():
    e = _ev()
    for s in [EventState.TRACKED, EventState.CORRELATED, EventState.VALIDATED,
              EventState.CONFIRMED, EventState.ARCHIVED]:
        e.transition(s)
    with pytest.raises(IllegalTransition):
        e.transition(EventState.ALERTED)


def test_backward_transition_raises():
    e = _ev()
    e.transition(EventState.TRACKED)
    with pytest.raises(IllegalTransition):
        e.transition(EventState.NEW)


def test_serialization_round_trip():
    e = _ev()
    e.transition(EventState.TRACKED)
    e.yolo_confidence = 0.91
    d = e.to_dict()
    assert d["state"] == "tracked"
    e2 = DefectEvent.from_dict(d)
    assert e2.state == EventState.TRACKED
    assert e2.yolo_confidence == 0.91
    assert e2.event_id == e.event_id


def test_event_id_unique():
    assert _ev().event_id != _ev().event_id
