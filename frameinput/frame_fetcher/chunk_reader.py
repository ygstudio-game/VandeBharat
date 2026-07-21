"""
chunk_reader.py — reads a stored frame from a .bin chunk file, validates it,
and converts raw BayerRG8 pixels into an RGB image.

All functions are synchronous and CPU-bound.  The FastAPI server calls them
via asyncio.to_thread() so they never block the event loop.

Retrieval flow
──────────────
    (chunk_id, byte_offset)  ← from PostgreSQL metadata row
            ↓
    open chunk_NNNNNN.bin
    seek(byte_offset)
    read 64-byte FrameHeader  → validate magic + CRC
    read payload_size bytes   → raw BayerRG8
            ↓
    numpy.frombuffer → reshape(H, W)
    cv2.cvtColor(COLOR_BayerRG2RGB)
            ↓
    optional resize
    cv2.imencode('.png') / '.jpg'
"""
import os
import zlib

import cv2
import numpy as np

from core.chunk_format import (
    FRAME_HEADER_SIZE,
    compute_crc32,
    unpack_frame_header,
)


class ChunkReadError(Exception):
    """Raised when a chunk file cannot be read or its data is corrupt."""


def read_frame_bytes(chunk_id: int, byte_offset: int, chunk_dir: str) -> tuple[bytes, dict]:
    """
    Open the chunk file, seek to byte_offset, validate the FrameHeader,
    verify CRC32, and return (raw_payload_bytes, header_dict).

    Raises ChunkReadError on any I/O, magic, or CRC problem.
    """
    path = os.path.join(chunk_dir, f"chunk_{chunk_id:06d}.bin")
    if not os.path.exists(path):
        raise ChunkReadError(f"chunk file not found: {path}")

    try:
        with open(path, "rb") as f:
            f.seek(byte_offset)

            raw_hdr = f.read(FRAME_HEADER_SIZE)
            if len(raw_hdr) < FRAME_HEADER_SIZE:
                raise ChunkReadError(
                    f"truncated frame header at offset {byte_offset} in {path} "
                    f"(got {len(raw_hdr)} bytes)"
                )

            try:
                hdr = unpack_frame_header(raw_hdr)
            except ValueError as e:
                raise ChunkReadError(f"invalid frame header: {e}") from e

            payload = f.read(hdr["payload_size"])
            if len(payload) < hdr["payload_size"]:
                raise ChunkReadError(
                    f"truncated payload: expected {hdr['payload_size']} bytes, "
                    f"got {len(payload)}"
                )

    except (IOError, OSError) as e:
        raise ChunkReadError(f"I/O error reading {path}: {e}") from e

    actual_crc = compute_crc32(payload)
    if actual_crc != hdr["crc32"]:
        raise ChunkReadError(
            f"CRC mismatch for frame {hdr['internal_frame_id']} "
            f"at offset {byte_offset}: "
            f"stored={hdr['crc32']:#010x} actual={actual_crc:#010x}"
        )

    return payload, hdr


def bayer_to_rgb(payload: bytes, width: int, height: int) -> np.ndarray:
    """
    Convert raw BayerRG8 bytes to an (H, W, 3) uint8 RGB array.

    BayerRG8: R at (0,0), G at (0,1)/(1,0), B at (1,1).
    OpenCV's COLOR_BayerRG2RGB performs bilinear demosaicing.
    """
    raw = np.frombuffer(payload, dtype=np.uint8)
    if raw.size != width * height:
        raise ChunkReadError(
            f"payload size mismatch: {raw.size} bytes for {width}×{height} BayerRG8 "
            f"(expected {width * height})"
        )
    bayer = raw.reshape(height, width)
    return cv2.cvtColor(bayer, cv2.COLOR_BayerRG2RGB)


def resize_rgb(rgb: np.ndarray, width: int, height: int) -> np.ndarray:
    """Resize an RGB image to (width, height). Uses INTER_LINEAR."""
    return cv2.resize(rgb, (width, height), interpolation=cv2.INTER_LINEAR)


def encode_png(rgb: np.ndarray) -> bytes:
    """Encode an RGB ndarray to PNG bytes."""
    ok, buf = cv2.imencode(".png", rgb)
    if not ok:
        raise ChunkReadError("PNG encoding failed")
    return buf.tobytes()


def encode_jpeg(rgb: np.ndarray, quality: int = 85) -> bytes:
    """Encode an RGB ndarray to JPEG bytes."""
    ok, buf = cv2.imencode(".jpg", rgb, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise ChunkReadError("JPEG encoding failed")
    return buf.tobytes()
