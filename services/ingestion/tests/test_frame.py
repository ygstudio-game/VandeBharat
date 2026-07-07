from frame import FrameNumberer


def test_frame_numbers_strictly_increasing_per_camera():
    n = FrameNumberer()
    seq = [n.next(0) for _ in range(5)]
    assert seq == [0, 1, 2, 3, 4]


def test_frame_numbers_independent_per_camera():
    n = FrameNumberer()
    a = [n.next(0) for _ in range(3)]
    b = [n.next(1) for _ in range(2)]
    assert a == [0, 1, 2]
    assert b == [0, 1]
    assert n.next(0) == 3  # camera 0 continues independently
