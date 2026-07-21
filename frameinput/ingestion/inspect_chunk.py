"""
inspect_chunk.py — CLI tool to inspect a .bin chunk file.

Usage:
    python ingestion/inspect_chunk.py /data/chunks/chunk_000001.bin
    python ingestion/inspect_chunk.py /data/chunks/chunk_000001.bin --limit 20
    python ingestion/inspect_chunk.py /data/chunks/chunk_000001.bin --no-crc

Stdlib only — no external dependencies needed.
"""
import argparse
import datetime
import os
import struct
import sys
import zlib

# ── add frameinput/ to sys.path so core/ is importable ──────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.chunk_format import (
    CHUNK_HEADER_SIZE,
    FRAME_HEADER_SIZE,
    unpack_chunk_header,
    unpack_frame_header,
    compute_crc32,
)


def _ts_to_str(us: int) -> str:
    if us <= 0:
        return "—"
    try:
        dt = datetime.datetime.fromtimestamp(us / 1_000_000, tz=datetime.timezone.utc)
        return dt.strftime("%Y-%m-%d %H:%M:%S.%f UTC")
    except Exception:
        return str(us)


def inspect(path: str, limit: int, check_crc: bool) -> int:
    """
    Returns number of CRC errors found.
    """
    size = os.path.getsize(path)

    with open(path, "rb") as f:
        # ── chunk header ──────────────────────────────────────────────────────
        raw_chunk_hdr = f.read(CHUNK_HEADER_SIZE)
        if len(raw_chunk_hdr) < CHUNK_HEADER_SIZE:
            print(f"ERROR: file too small for chunk header ({len(raw_chunk_hdr)} bytes)")
            return 1

        try:
            chunk_hdr = unpack_chunk_header(raw_chunk_hdr)
        except ValueError as e:
            print(f"ERROR: {e}")
            return 1

        print(
            f"\nChunk {chunk_hdr['chunk_id']:,}  |  "
            f"created: {_ts_to_str(chunk_hdr['created_at_us'])}  |  "
            f"file size: {size / 1_048_576:.1f} MB  |  "
            f"path: {path}\n"
        )

        col_w = {
            "idx":     7,
            "id":     14,
            "cam":     4,
            "dim":    12,
            "fmt":    10,
            "offset": 14,
            "size":   12,
            "crc":     6,
        }
        header = (
            f"{'Frame':>{col_w['idx']}}  "
            f"{'internal_id':>{col_w['id']}}  "
            f"{'cam':>{col_w['cam']}}  "
            f"{'dimensions':<{col_w['dim']}}  "
            f"{'format':<{col_w['fmt']}}  "
            f"{'byte_offset':>{col_w['offset']}}  "
            f"{'payload_sz':>{col_w['size']}}  "
            f"{'CRC':<{col_w['crc']}}"
        )
        print(header)
        print("-" * len(header))

        frame_idx  = 0
        crc_errors = 0

        while True:
            raw_frame_hdr = f.read(FRAME_HEADER_SIZE)
            if not raw_frame_hdr:
                break   # clean EOF
            if len(raw_frame_hdr) < FRAME_HEADER_SIZE:
                print(f"\n  WARNING: truncated frame header at EOF (read {len(raw_frame_hdr)} bytes)")
                break

            try:
                fhdr = unpack_frame_header(raw_frame_hdr)
            except ValueError as e:
                print(f"\n  ERROR at frame {frame_idx}: {e}")
                break

            payload = f.read(fhdr["payload_size"])
            if len(payload) < fhdr["payload_size"]:
                print(f"\n  WARNING: truncated payload at frame {frame_idx} "
                      f"(got {len(payload)} of {fhdr['payload_size']} bytes)")
                break

            # CRC check
            crc_status = "—"
            if check_crc:
                actual_crc = compute_crc32(payload)
                if actual_crc == fhdr["crc32"]:
                    crc_status = "OK"
                else:
                    crc_status = "FAIL"
                    crc_errors += 1

            dim_str = f"{fhdr['width']}×{fhdr['height']}"
            offset_of_this_frame = (
                f.tell() - FRAME_HEADER_SIZE - fhdr["payload_size"]
            )

            if limit == 0 or frame_idx < limit:
                print(
                    f"{frame_idx:>{col_w['idx']},}  "
                    f"{fhdr['internal_frame_id']:>{col_w['id']},}  "
                    f"{fhdr['camera_id']:>{col_w['cam']}}  "
                    f"{dim_str:<{col_w['dim']}}  "
                    f"{fhdr['pixel_format']:<{col_w['fmt']}}  "
                    f"{offset_of_this_frame:>{col_w['offset']},}  "
                    f"{fhdr['payload_size']:>{col_w['size']},}  "
                    f"{crc_status:<{col_w['crc']}}"
                )
            elif frame_idx == limit:
                print(f"  … (showing first {limit} frames; use --limit 0 for all)")

            frame_idx += 1

    print()
    crc_line = f"{crc_errors} CRC error(s)" if check_crc else "CRC check skipped"
    print(f"Summary: {frame_idx:,} frames  |  {crc_line}")
    print()
    return crc_errors


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect a DAQ .bin chunk file.")
    parser.add_argument("path", help="Path to chunk_NNNNNN.bin")
    parser.add_argument(
        "--limit", type=int, default=50,
        help="Max frames to print (0 = all, default 50)",
    )
    parser.add_argument(
        "--no-crc", action="store_true",
        help="Skip CRC validation (faster for large chunks)",
    )
    args = parser.parse_args()

    if not os.path.isfile(args.path):
        print(f"ERROR: file not found: {args.path}")
        sys.exit(1)

    errors = inspect(args.path, limit=args.limit, check_crc=not args.no_crc)
    sys.exit(0 if errors == 0 else 1)


if __name__ == "__main__":
    main()
