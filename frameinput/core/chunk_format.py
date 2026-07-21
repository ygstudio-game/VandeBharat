"""
Binary layout for .bin chunk files written by the Storage Writer.

Every chunk file:
  [ChunkHeader  32 bytes]
  [FrameHeader  64 bytes] [payload  N bytes]
  [FrameHeader  64 bytes] [payload  N bytes]
  ...

Retrieval is O(1): seek(byte_offset) lands exactly on a FrameHeader.
CRC32 in the FrameHeader covers the payload bytes only.
"""
import struct
import time
import zlib

# ── magic bytes ────────────────────────────────────────────────────────────────
CHUNK_MAGIC = b"DAQ\x00"
FRAME_MAGIC = b"FRM\x00"

# ── struct formats (little-endian) ─────────────────────────────────────────────
#
# ChunkHeader — 32 bytes
#   4s  magic
#   I   chunk_id        (uint32)
#   q   created_at_us  (int64, µs since epoch)
#   16s reserved
#
CHUNK_HEADER_FMT  = "<4sIq16s"
CHUNK_HEADER_SIZE = struct.calcsize(CHUNK_HEADER_FMT)   # must be 32

#
# FrameHeader — 64 bytes
#   4s  magic
#   Q   internal_frame_id  (uint64)
#   Q   camera_frame_id    (uint64)
#   q   hw_timestamp_us    (int64)
#   B   camera_id          (uint8)
#   B   pixel_format_id    (uint8)
#   H   width              (uint16)
#   H   height             (uint16)
#   I   payload_size       (uint32)
#   I   crc32              (uint32)
#   22s reserved
#
FRAME_HEADER_FMT  = "<4sQQqBBHHII22s"
FRAME_HEADER_SIZE = struct.calcsize(FRAME_HEADER_FMT)   # must be 64

# ── pixel format enum ──────────────────────────────────────────────────────────
PIXEL_FORMAT     = {"BayerRG8": 0, "Mono8": 1, "RGB8": 2}
PIXEL_FORMAT_INV = {v: k for k, v in PIXEL_FORMAT.items()}


# ── pack / unpack ──────────────────────────────────────────────────────────────

def pack_chunk_header(chunk_id: int) -> bytes:
    return struct.pack(
        CHUNK_HEADER_FMT,
        CHUNK_MAGIC,
        chunk_id,
        time.time_ns() // 1000,
        b"\x00" * 16,
    )


def unpack_chunk_header(data: bytes) -> dict:
    magic, chunk_id, created_at_us, _ = struct.unpack(CHUNK_HEADER_FMT, data)
    if magic != CHUNK_MAGIC:
        raise ValueError(f"bad chunk magic: {magic!r} (expected {CHUNK_MAGIC!r})")
    return {
        "magic":          magic,
        "chunk_id":       chunk_id,
        "created_at_us":  created_at_us,
    }


def pack_frame_header(pkt, crc32: int) -> bytes:
    """Pack a FramePacket into a 64-byte frame header. pkt is duck-typed."""
    return struct.pack(
        FRAME_HEADER_FMT,
        FRAME_MAGIC,
        pkt.internal_frame_id,
        pkt.camera_frame_id,
        pkt.hw_timestamp_us,
        pkt.camera_id,
        PIXEL_FORMAT.get(pkt.pixel_format, 0),
        pkt.width,
        pkt.height,
        len(pkt.payload),
        crc32,
        b"\x00" * 22,
    )


def unpack_frame_header(data: bytes) -> dict:
    (
        magic, internal_frame_id, camera_frame_id, hw_timestamp_us,
        camera_id, pixel_format_id, width, height,
        payload_size, crc32, _reserved,
    ) = struct.unpack(FRAME_HEADER_FMT, data)

    if magic != FRAME_MAGIC:
        raise ValueError(f"bad frame magic: {magic!r} (expected {FRAME_MAGIC!r})")

    return {
        "magic":             magic,
        "internal_frame_id": internal_frame_id,
        "camera_frame_id":   camera_frame_id,
        "hw_timestamp_us":   hw_timestamp_us,
        "camera_id":         camera_id,
        "pixel_format":      PIXEL_FORMAT_INV.get(pixel_format_id, "unknown"),
        "width":             width,
        "height":            height,
        "payload_size":      payload_size,
        "crc32":             crc32,
    }


def compute_crc32(payload: bytes) -> int:
    return zlib.crc32(payload) & 0xFFFF_FFFF
