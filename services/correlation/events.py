"""
DefectEvent + state machine (C0) — the unit of work for the upgraded Event
Correlation Engine (Phase C). Mirrors the competitor's DefectEvent structure and
its NEW->...->ARCHIVED lifecycle, adapted to our Python correlation service.

Pure logic — no DB, no network — so the state machine and serialization are
unit-tested in isolation. Persistence is the migration in migrations/.
"""
from dataclasses import dataclass, field, asdict
from enum import Enum
import uuid


class EventState(str, Enum):
    NEW = "new"                 # detection seen, not yet assigned a coach
    TRACKED = "tracked"         # merged across frames (tracking)
    CORRELATED = "correlated"   # temporal + spatial correlation done
    VALIDATED = "validated"     # multi-camera voting applied
    CONFIRMED = "confirmed"     # composite score over threshold
    ALERTED = "alerted"         # alert dispatched
    ARCHIVED = "archived"       # written to long-term storage


# Legal forward transitions (linear lifecycle). Any other move raises.
_ALLOWED: dict[EventState, set[EventState]] = {
    EventState.NEW: {EventState.TRACKED},
    EventState.TRACKED: {EventState.CORRELATED},
    EventState.CORRELATED: {EventState.VALIDATED},
    EventState.VALIDATED: {EventState.CONFIRMED},
    EventState.CONFIRMED: {EventState.ALERTED, EventState.ARCHIVED},
    EventState.ALERTED: {EventState.ARCHIVED},
    EventState.ARCHIVED: set(),
}


class IllegalTransition(Exception):
    pass


@dataclass
class DefectEvent:
    coach_id: str
    camera_id: int
    defect_class: str
    timestamp_ms: float = 0.0
    train_position_m: float = 0.0
    bogie_id: int = 0                # 0=front, 1=rear
    component_id: int = 0
    yolo_confidence: float = 0.0
    image_quality: float = 0.0      # Laplacian-variance score, normalized
    track_confidence: float = 0.0
    ocr_confidence: float = 0.0
    frame_count: int = 1
    validated: bool = False
    state: EventState = EventState.NEW
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def can_transition(self, to: EventState) -> bool:
        return to in _ALLOWED[self.state]

    def transition(self, to: EventState) -> "DefectEvent":
        if not self.can_transition(to):
            raise IllegalTransition(f"{self.state.value} -> {to.value} not allowed")
        self.state = to
        if to == EventState.VALIDATED:
            self.validated = True
        return self

    def to_dict(self) -> dict:
        d = asdict(self)
        d["state"] = self.state.value
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "DefectEvent":
        d = dict(d)
        if "state" in d and not isinstance(d["state"], EventState):
            d["state"] = EventState(d["state"])
        return cls(**d)
