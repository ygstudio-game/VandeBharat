"""
OCR Service — port 5000
YOLO-first ROI pipeline:
  1. Call YOLO /api/yolo/predict_train_number → get Boogie bbox
  2. Crop frame with 15% padding
  3. Pass 1: PaddleOCR on raw BGR crop
  4. Pass 2 (if Pass 1 fails): preprocess → PaddleOCR
  5. Full-frame fallback if YOLO returns no boxes
  6. Filter: ^\d{5,6}$ + confidence >= 0.4
Ported from POC/backend/OCR/server.py — Phase 2
"""
from fastapi import FastAPI

app = FastAPI(title="VandeInspect OCR Service", version="1.0.0")

@app.get("/health")
def health():
    return {"status": "ok", "service": "ocr", "port": 5000}

# Phase 2: implement POST /ocr endpoint
