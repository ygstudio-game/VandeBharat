"""
YOLO Service — port 5002
Two models loaded at startup:
  best.pt              → POST /api/yolo/predict               (defect detection)
  train_num_detector.pt → POST /api/yolo/predict_train_number (bogie ROI localization)
Severity map: crack/leakage=CRITICAL, broken/rust/deformation=HIGH, missing_part=MEDIUM, loose=LOW
Ported from POC/backend/YOLO/server.py — Phase 2 (OCR ROI) + Phase 3 (defect detection)
"""
from fastapi import FastAPI

app = FastAPI(title="VandeInspect YOLO Service", version="1.0.0")

@app.get("/health")
def health():
    return {"status": "ok", "service": "yolo", "port": 5002}

# Phase 2+: implement both endpoints with model loading
