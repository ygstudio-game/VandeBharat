"""
OCR Service — port 5000
YOLO-first ROI pipeline, ported from POC/backend/OCR/server.py (Flask → FastAPI).

Receives { frame_url, frame_id, trigger_id, session_id }
  1. Download frame from Cloudinary URL
  2. Call YOLO /api/yolo/predict_train_number → Boogie bbox
  3. Crop with 15% padding
  4. Pass 1: PaddleOCR on raw BGR crop
  5. Pass 2 (if Pass 1 empty): preprocess → PaddleOCR on crop
  6. Fallback: full-frame preprocess → PaddleOCR
  7. Filter ^\d{5,6}$ + conf ≥ 0.4 → write ocr_results row → return
"""
import os
import sys
import uuid
import json
import logging
import requests
import cv2
import numpy as np
import psycopg2
import psycopg2.extras
from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
from ocr_engine import run_ocr
from preprocess import preprocess_frame
from train_number_filter import filter_train_numbers

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]
YOLO_URL = os.environ.get("YOLO_SERVICE_URL", "http://localhost:5002/api/yolo/predict_train_number")

app = FastAPI(title="VandeInspect OCR Service", version="1.0.0")


class OcrRequest(BaseModel):
    frame_url: str
    frame_id: str
    trigger_id: int
    session_id: str


def get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def download_frame(url: str) -> np.ndarray:
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    arr = np.frombuffer(resp.content, np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError(f"cv2 cannot decode image from {url}")
    return frame


def _best_candidate_from(ocr_results):
    """Return (coach_number, confidence) from the highest-confidence valid result, else (None, 0)."""
    candidates = filter_train_numbers(ocr_results)
    if candidates:
        best_conf = max(
            (r["confidence"] for r in ocr_results if r["text"].replace(" ", "").strip() in candidates),
            default=0.0,
        )
        return candidates[0], best_conf
    return None, 0.0


def _digit_substring(ocr_results):
    """Last-resort: extract any 5-6 digit substring from detected text."""
    for item in ocr_results:
        digits = "".join(c for c in str(item.get("text", "")) if c.isdigit())
        if 5 <= len(digits) <= 6:
            return digits, item["confidence"]
    return None, 0.0


def run_pipeline(frame: np.ndarray):
    """
    Returns (coach_number, confidence, pass_used, roi_used, bbox, raw_ocr, all_yolo_boxes)
    bbox is always set when YOLO found a box, even if OCR fell back to full-frame.
    all_yolo_boxes: every box YOLO returned (all classes: Boogie, Car Type, Engine, gap).
    """
    h, w = frame.shape[:2]
    yolo_boxes = []
    yolo_bbox = None  # best Boogie box from YOLO, kept for full-frame fallback too

    # ── Step 1: YOLO ROI detection ────────────────────────────────────────────
    try:
        ok, buf = cv2.imencode(".jpg", frame)
        resp = requests.post(
            YOLO_URL,
            files={"file": ("frame.jpg", buf.tobytes(), "image/jpeg")},
            timeout=5,
        )
        if resp.status_code == 200:
            yolo_boxes = resp.json().get("boxes", [])
    except Exception as exc:
        logger.warning("YOLO service unreachable (%s) — using full-frame fallback", exc)

    # ── Step 2: Crop OCR (YOLO found at least one box) ───────────────────────
    if yolo_boxes:
        boogie = [b for b in yolo_boxes if b.get("label", "").lower() == "boogie"]
        box = boogie[0] if boogie else yolo_boxes[0]
        x1, y1, x2, y2 = box["bbox_xyxy"]

        bw, bh = x2 - x1, y2 - y1
        pw, ph = int(bw * 0.15), int(bh * 0.15)
        x1p = max(0, x1 - pw); y1p = max(0, y1 - ph)
        x2p = min(w, x2 + pw); y2p = min(h, y2 + ph)
        yolo_bbox = [x1p, y1p, x2p - x1p, y2p - y1p]  # store for fallback too
        crop = frame[y1p:y2p, x1p:x2p]

        if crop.size > 0:
            # Pass 1 — raw BGR crop
            raw1 = run_ocr(crop)
            num, conf = _best_candidate_from(raw1)
            if num:
                return num, conf, 1, True, yolo_bbox, raw1, yolo_boxes

            # Pass 2 — preprocessed crop
            raw2 = run_ocr(preprocess_frame(crop))
            num, conf = _best_candidate_from(raw2)
            if num:
                return num, conf, 2, True, yolo_bbox, raw2, yolo_boxes

            # Digit substring fallback (still from crop)
            num, conf = _digit_substring(raw1)
            if num:
                return num, conf, 1, True, yolo_bbox, raw1, yolo_boxes

    # ── Step 3: Full-frame fallback ───────────────────────────────────────────
    # yolo_bbox is kept even here so the overlay shows where YOLO was looking
    raw_ff = run_ocr(preprocess_frame(frame))
    num, conf = _best_candidate_from(raw_ff)
    if num:
        return num, conf, 1, False, yolo_bbox, raw_ff, yolo_boxes

    num, conf = _digit_substring(raw_ff)
    if num:
        return num, conf, 1, False, yolo_bbox, raw_ff, yolo_boxes

    return None, 0.0, 0, False, yolo_bbox, [], yolo_boxes


@app.on_event("startup")
def warmup():
    blank = np.zeros((100, 300, 3), dtype="uint8")
    run_ocr(blank)
    logger.info("PaddleOCR warmed up and ready.")


@app.get("/health")
def health():
    return {"status": "ok", "service": "ocr", "port": 5000}


@app.post("/ocr")
def ocr(req: OcrRequest):
    # Download frame
    try:
        frame = download_frame(req.frame_url)
    except Exception as exc:
        logger.error("Frame download failed frame_id=%s: %s", req.frame_id, exc)
        return {"coach_number": None, "confidence": 0.0, "is_valid": False, "error": str(exc)}

    coach_number, confidence, pass_used, roi_used, bbox, raw_ocr, all_yolo_boxes = run_pipeline(frame)
    is_valid = coach_number is not None

    # Normalise YOLO boxes for the response: xyxy → xywh, keep label + confidence
    def _norm_box(b):
        x1, y1, x2, y2 = b.get("bbox_xyxy", [0, 0, 0, 0])
        return {"label": b.get("label"), "confidence": round(b.get("confidence", 0), 4),
                "bbox_x": x1, "bbox_y": y1, "bbox_w": x2 - x1, "bbox_h": y2 - y1}
    yolo_boxes_out = [_norm_box(b) for b in all_yolo_boxes]

    # Write ocr_results row
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ocr_results
                  (id, frame_id, session_id, detected_text, coach_number, confidence,
                   pass_number, is_valid, bbox_x, bbox_y, bbox_w, bbox_h, raw_response)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
                """,
                (
                    str(uuid.uuid4()),
                    req.frame_id, req.session_id,
                    coach_number or "",
                    coach_number,
                    round(confidence, 4),
                    pass_used,
                    is_valid,
                    bbox[0] if bbox else None,
                    bbox[1] if bbox else None,
                    bbox[2] if bbox else None,
                    bbox[3] if bbox else None,
                    json.dumps([{"text": r.get("text"), "conf": r.get("confidence")} for r in raw_ocr]),
                ),
            )
            conn.commit()
        conn.close()
    except Exception as exc:
        logger.error("DB write failed frame_id=%s: %s", req.frame_id, exc)

    logger.info(
        "trigger=%d coach=%s conf=%.3f pass=%d roi=%s",
        req.trigger_id, coach_number, confidence, pass_used, roi_used,
    )
    # print() bypasses uvicorn/PaddleOCR logger interference — captured by start.js stdout
    has_bbox = bbox is not None and bbox[0] is not None
    print(f"[OCR_RESULT] trigger={req.trigger_id} coach={coach_number!r} conf={confidence:.3f} valid={is_valid} pass={pass_used} roi={roi_used} bbox={has_bbox}", flush=True)

    return {
        "coach_number": coach_number,
        "confidence": round(confidence, 4),
        "trigger_id": req.trigger_id,
        "pass_used": pass_used,
        "roi_used": roi_used,
        "is_valid": is_valid,
        "yolo_boxes": yolo_boxes_out,
    }
