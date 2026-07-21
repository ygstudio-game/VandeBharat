"""
Unit tests for core/chunk_format.py  (Phase 1, Task 1.3)

Run from frameinput/:
    pytest core/test_chunk_format.py -v
"""
import pytest
from core.frame import FramePacket
from core.chunk_format import (
    CHUNK_HEADER_SIZE,
    FRAME_HEADER_SIZE,
    CHUNK_MAGIC,
    FRAME_MAGIC,
    pack_chunk_header,
    unpack_chunk_header,
    pack_frame_header,
    unpack_frame_header,
    compute_crc32,
)


# ── helpers ────────────────────────────────────────────────────────────────────

def _make_packet(internal_id: int = 42) -> FramePacket:
    payload = bytes(range(256)) * 4   # 1 024 bytes — small but valid
    return FramePacket(
        internal_frame_id=internal_id,
        camera_id=3,
        camera_frame_id=9_999,
        hw_timestamp_us=1_700_000_000_000_000,
        width=32,
        height=32,
        pixel_format="BayerRG8",
        payload=payload,
    )


# ── size assertions (catch struct drift immediately) ───────────────────────────

def test_chunk_header_size_is_32():
    assert CHUNK_HEADER_SIZE == 32, (
        f"ChunkHeader must be exactly 32 bytes; got {CHUNK_HEADER_SIZE}"
    )


def test_frame_header_size_is_64():
    assert FRAME_HEADER_SIZE == 64, (
        f"FrameHeader must be exactly 64 bytes; got {FRAME_HEADER_SIZE}"
    )


# ── ChunkHeader round-trip ─────────────────────────────────────────────────────

def test_chunk_header_roundtrip():
    data = pack_chunk_header(chunk_id=7)
    assert len(data) == 32
    hdr = unpack_chunk_header(data)
    assert hdr["magic"] == CHUNK_MAGIC
    assert hdr["chunk_id"] == 7
    assert hdr["created_at_us"] > 0


def test_chunk_header_bad_magic_raises():
    bad = b"\x00" * 32
    with pytest.raises(ValueError, match="bad chunk magic"):
        unpack_chunk_header(bad)


# ── FrameHeader round-trip ────────────────────────────────────────────────────

def test_frame_header_roundtrip():
    pkt = _make_packet(internal_id=42)
    crc = compute_crc32(pkt.payload)

    data = pack_frame_header(pkt, crc)
    assert len(data) == 64

    hdr = unpack_frame_header(data)
    assert hdr["magic"]             == FRAME_MAGIC
    assert hdr["internal_frame_id"] == 42
    assert hdr["camera_id"]         == 3
    assert hdr["camera_frame_id"]   == 9_999
    assert hdr["hw_timestamp_us"]   == 1_700_000_000_000_000
    assert hdr["width"]             == 32
    assert hdr["height"]            == 32
    assert hdr["pixel_format"]      == "BayerRG8"
    assert hdr["payload_size"]      == len(pkt.payload)
    assert hdr["crc32"]             == crc


def test_frame_header_bad_magic_raises():
    bad = b"\x00" * 64
    with pytest.raises(ValueError, match="bad frame magic"):
        unpack_frame_header(bad)


# ── CRC32 correctness ─────────────────────────────────────────────────────────

def test_crc32_differs_for_different_payloads():
    a = compute_crc32(b"hello world")
    b = compute_crc32(b"hello worle")
    assert a != b


def test_crc32_stable_across_calls():
    payload = b"deterministic"
    assert compute_crc32(payload) == compute_crc32(payload)


def test_crc32_is_unsigned_32bit():
    val = compute_crc32(b"\xff" * 1024)
    assert 0 <= val <= 0xFFFF_FFFF


# ── pixel format enum ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("fmt", ["BayerRG8", "Mono8", "RGB8"])
def test_pixel_format_roundtrips(fmt: str):
    pkt = _make_packet()
    pkt.pixel_format = fmt
    data = pack_frame_header(pkt, 0)
    hdr = unpack_frame_header(data)
    assert hdr["pixel_format"] == fmt
