"""
verify_frame.py — standalone demo verifier for the Frame Fetching Service.

Writes 5 simulator frames to a temp chunk, reads one back, demosaics it,
and saves the result to /tmp/daq_verify_frame_N.png.

No postgres required — directly exercises chunk_reader.

Usage:
    python frame_fetcher/verify_frame.py
    python frame_fetcher/verify_frame.py --frame-id 3 --output /tmp/frame3.png
"""
import argparse
import os
import sys
import tempfile
import threading
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np

from core.frame import FramePacket, GlobalFrameNumberer
from frame_fetcher.chunk_reader import bayer_to_rgb, encode_png, read_frame_bytes
from ingestion.chunk_writer import ChunkWriter
from ingestion.ring_buffer import BoundedFrameBuffer
from ingestion.simulator import IdsSimulatorSource


def _write_sim_chunk(chunk_dir: str, n_frames: int = 10) -> list[tuple[int, int]]:
    """Run the simulator briefly, collect offsets, return them."""
    offsets: list[tuple[int, int]] = []
    lock = threading.Lock()

    def on_frame(pkt, chunk_id, byte_offset):
        with lock:
            offsets.append((chunk_id, byte_offset))

    numberer = GlobalFrameNumberer()
    buf      = BoundedFrameBuffer(capacity=n_frames + 16)
    writer   = ChunkWriter(
        chunk_dir        = chunk_dir,
        buffer           = buf,
        chunk_max_bytes  = 50 * 1024 * 1024,
        on_frame_written = on_frame,
    )
    cam = IdsSimulatorSource(
        camera_id=0, width=1456, height=1088, fps=80.0,
        numberer=numberer, buffer=buf,
    )

    writer.start()
    cam.start_thread()

    deadline = time.perf_counter() + 3.0
    while len(offsets) < n_frames and time.perf_counter() < deadline:
        time.sleep(0.05)

    cam.stop()
    # drain writer
    t2 = time.perf_counter() + 5.0
    while writer.total_frames_written < len(offsets) and time.perf_counter() < t2:
        time.sleep(0.05)
    writer.stop()

    return offsets


def verify(frame_id: int, output_path: str) -> None:
    tmp = tempfile.mkdtemp(prefix="daq_verify_")
    print(f"Writing simulator frames to: {tmp}")

    offsets = _write_sim_chunk(tmp, n_frames=max(frame_id + 1, 5))
    if frame_id >= len(offsets):
        print(f"ERROR: only {len(offsets)} frames written, cannot fetch frame {frame_id}")
        sys.exit(1)

    chunk_id, byte_offset = offsets[frame_id]
    print(f"Reading frame {frame_id}: chunk={chunk_id}  offset={byte_offset:,}")

    payload, hdr = read_frame_bytes(chunk_id, byte_offset, tmp)
    print(
        f"  internal_frame_id : {hdr['internal_frame_id']}\n"
        f"  camera_id         : {hdr['camera_id']}\n"
        f"  dimensions        : {hdr['width']}x{hdr['height']}\n"
        f"  pixel_format      : {hdr['pixel_format']}\n"
        f"  payload_size      : {hdr['payload_size']:,} bytes\n"
        f"  crc32             : {hdr['crc32']:#010x}  [validated OK]"
    )

    print("Demosaicing BayerRG8 → RGB ...")
    rgb = bayer_to_rgb(payload, hdr["width"], hdr["height"])
    print(f"  output shape : {rgb.shape}  dtype={rgb.dtype}")

    png = encode_png(rgb)
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(png)

    print(f"\nSaved to: {output_path}  ({len(png):,} bytes)")
    print("Open the file to confirm a valid colour gradient image.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify DAQ frame fetch + demosaic pipeline.")
    parser.add_argument("--frame-id", type=int, default=0, help="Frame to retrieve (default 0)")
    parser.add_argument(
        "--output", default=os.path.join(tempfile.gettempdir(), "daq_verify_frame.png"),
        help="Output PNG path",
    )
    args = parser.parse_args()
    verify(args.frame_id, args.output)


if __name__ == "__main__":
    main()
