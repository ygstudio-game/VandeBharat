"""
Correlation Service — port 5005
Loads component manifest from manifests/vande_bharat.json → compares expected vs detected → creates defect + missing_component rows
Phase 3
"""
from fastapi import FastAPI

app = FastAPI(title="VandeInspect Correlation Engine", version="1.0.0")

@app.get("/health")
def health():
    return {"status": "ok", "service": "correlation", "port": 5005}

# Phase 3: implement POST /correlate
