"""
Report Generator Service — port 5006
Reads full session data → builds PDF (fpdf2) + JSON → uploads to Cloudinary → writes reports table
Phase 4
"""
from fastapi import FastAPI

app = FastAPI(title="VandeInspect Report Generator", version="1.0.0")

@app.get("/health")
def health():
    return {"status": "ok", "service": "report_generator", "port": 5006}

# Phase 4: implement POST /generate
