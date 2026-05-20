"""
Sync Engine Service — port 5004
Reads OCR results for a session → gap detection → assigns frames to coaches → writes coaches + coach_frame_map
Phase 2
"""
from fastapi import FastAPI

app = FastAPI(title="VandeInspect Sync Engine", version="1.0.0")

@app.get("/health")
def health():
    return {"status": "ok", "service": "sync_engine", "port": 5004}

# Phase 2: implement POST /sync
