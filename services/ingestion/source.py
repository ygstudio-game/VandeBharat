"""
Frame sources (B1).

FrameSource is the stable interface. B1 ships:
  - SyntheticSource : deterministic, dependency-free — used by unit tests.
  - FileLoopSource  : OpenCV VideoCapture on a local file, looped to simulate a
                      live camera. (Integration tier — needs cv2.)
RTSP/GigE sources drop in later behind this same interface (B3+) with no pipeline
change.
"""
from abc import ABC, abstractmethod


class SourceUnavailable(Exception):
    """Raised by read() when the source is temporarily unreadable (drop/disconnect)."""


class FrameSource(ABC):
    camera_id: int

    @abstractmethod
    def read(self) -> bytes:
        """Return the next encoded frame payload, or raise SourceUnavailable."""

    def reconnect(self) -> None:
        """Re-establish the source after failure. Default no-op."""

    def close(self) -> None:
        pass


class SyntheticSource(FrameSource):
    """Yields deterministic byte payloads. Optionally simulates transient failures
    so reconnect logic is testable without real hardware."""

    def __init__(self, camera_id: int = 0, fail_at: tuple[int, ...] = ()):
        self.camera_id = camera_id
        self._i = 0
        self._fail_at = set(fail_at)
        self.reconnects = 0

    def read(self) -> bytes:
        i = self._i
        self._i += 1
        if i in self._fail_at:
            raise SourceUnavailable(f"synthetic failure at read {i}")
        return f"frame-{self.camera_id}-{i}".encode()

    def reconnect(self) -> None:
        self.reconnects += 1


class FileLoopSource(FrameSource):
    """OpenCV file source, looped. Imported lazily so unit tests need no cv2."""

    def __init__(self, path: str, camera_id: int = 0, jpeg_quality: int = 85):
        self.path = path
        self.camera_id = camera_id
        self.jpeg_quality = jpeg_quality
        self._cap = None
        self._open()

    def _open(self):
        import cv2  # lazy
        self._cap = cv2.VideoCapture(self.path)
        if not self._cap or not self._cap.isOpened():
            raise SourceUnavailable(f"cannot open source: {self.path}")

    def read(self) -> bytes:
        import cv2  # lazy
        ok, frame = self._cap.read()
        if not ok:
            # loop back to start to simulate a continuous live feed
            self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = self._cap.read()
            if not ok:
                raise SourceUnavailable(f"no frames from {self.path}")
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality])
        if not ok:
            raise SourceUnavailable("jpeg encode failed")
        return buf.tobytes()

    def reconnect(self) -> None:
        try:
            if self._cap is not None:
                self._cap.release()
        finally:
            self._open()

    def close(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None
