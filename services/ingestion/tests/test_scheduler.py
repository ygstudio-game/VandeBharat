"""
B3 smart frame selection tests.

Synthetic activity timeline = 16 coaches (high activity) separated by gaps (low
activity). Asserts the scheduler (a) detects every coach the naive baseline does,
(b) forwards >=50% fewer frames to the GPU.
"""
import numpy as np

from scheduler import FrameScheduler, State, Task, motion_score


N_COACHES = 16
COACH_LEN = 30      # active frames per coach
GAP_LEN = 20        # low-activity frames between coaches


def build_timeline():
    acts = []
    for c in range(N_COACHES):
        acts += [0.9] * COACH_LEN          # coach passing
        if c < N_COACHES - 1:
            acts += [0.02] * GAP_LEN       # inter-coach gap
    return acts


def naive_coach_count(acts, threshold=0.10):
    coaches, prev = 0, False
    for a in acts:
        cur = a >= threshold
        if cur and not prev:
            coaches += 1
        prev = cur
    return coaches


def test_detects_all_coaches_and_cuts_frames_50pct():
    acts = build_timeline()
    naive_total = len(acts)
    naive_coaches = naive_coach_count(acts)
    assert naive_coaches == N_COACHES

    sch = FrameScheduler(activity_threshold=0.10, active_stride=4, inter_coach_stride=10)
    processed = 0
    per_coach = {}
    for i, a in enumerate(acts):
        d = sch.decide(a, i)
        if d.process:
            processed += 1
            if d.coach_index >= 0:
                per_coach[d.coach_index] = per_coach.get(d.coach_index, 0) + 1

    # (a) no missed coaches
    assert sch.coaches_detected == naive_coaches
    assert len(per_coach) == N_COACHES                 # every coach has >=1 processed frame
    # (b) >=50% fewer frames to GPU
    reduction = 1 - processed / naive_total
    assert reduction >= 0.50, f"reduction {reduction:.2f} < 0.50"


def test_coach_onset_always_processed():
    sch = FrameScheduler()
    # first active frame after idle must be processed (BOTH tasks)
    d = sch.decide(0.9, 0)
    assert d.process and d.task == Task.BOTH and d.reason == "coach_onset"
    assert d.coach_index == 0


def test_brief_dip_does_not_split_coach():
    sch = FrameScheduler(gap_tolerance=5)
    sch.decide(0.9, 0)                 # onset -> coach 0
    for i in range(1, 4):
        sch.decide(0.9, i)
    # short low-activity dip within tolerance
    for i in range(4, 7):
        d = sch.decide(0.01, i)
        assert d.state == State.ACTIVE  # still same coach
    sch.decide(0.9, 7)                  # activity resumes
    assert sch.coaches_detected == 1    # not split into a second coach


def test_long_gap_then_new_coach_increments():
    sch = FrameScheduler(gap_tolerance=5)
    sch.decide(0.9, 0)                          # coach 0
    for i in range(1, 30):
        sch.decide(0.01, i)                     # long gap -> INTER_COACH
    d = sch.decide(0.9, 30)                     # new coach onset
    assert d.reason == "coach_onset"
    assert sch.coaches_detected == 2


def test_motion_score_tracks_change():
    a = np.zeros((32, 32), dtype=np.uint8)
    b = np.full((32, 32), 255, dtype=np.uint8)
    assert motion_score(a, a) == 0.0
    assert motion_score(a, b) > 0.9            # full change ~1.0
    assert motion_score(None, b) == 0.0        # no previous frame


def test_from_config():
    sch = FrameScheduler.from_config({"scheduler": {
        "activity_threshold": 0.2, "active_stride": 3, "inter_coach_stride": 8, "gap_tolerance": 2}})
    assert sch.activity_threshold == 0.2
    assert sch.active_stride == 3
    assert sch.inter_coach_stride == 8
    assert sch.gap_tolerance == 2
