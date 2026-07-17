"""
Frame stores (B1) — where the actual image bytes live. Only the returned reference
(path/URL) travels downstream through Redis; never the raw bytes.
"""
import os
from abc import ABC, abstractmethod

from frame import FramePacket


class FrameStore(ABC):
    @abstractmethod
    def put(self, pkt: FramePacket) -> str:
        """Persist the payload, return a reference string."""


class NullStore(FrameStore):
    """No persistence — returns a synthetic ref. Used by unit tests."""

    def put(self, pkt: FramePacket) -> str:
        return f"mem://{pkt.camera_id}/{pkt.frame_number}"


class LocalFileStore(FrameStore):
    """Writes JPEG bytes to a local/shared dir; returns the file path."""

    def __init__(self, root: str):
        self.root = root
        os.makedirs(root, exist_ok=True)

    def put(self, pkt: FramePacket) -> str:
        cam_dir = os.path.join(self.root, f"cam{pkt.camera_id}")
        os.makedirs(cam_dir, exist_ok=True)
        path = os.path.join(cam_dir, f"{pkt.frame_number:09d}.jpg")
        with open(path, "wb") as f:
            f.write(pkt.payload)
        return path
