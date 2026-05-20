"""
Frame Extractor Service — port 5003
Receives video path + session/camera IDs → OpenCV → JPEG frames → Cloudinary upload → writes frames table
Phase 1
"""
from fastapi import FastAPI

app = FastAPI(title="VandeInspect Frame Extractor", version="1.0.0")

@app.get("/health")
def health():
    return {"status": "ok", "service": "frame_extractor", "port": 5003}

# Phase 1: implement POST /extract
