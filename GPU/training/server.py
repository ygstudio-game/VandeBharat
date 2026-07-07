"""
GPU Training Service — FastAPI
Accepts training jobs from the Node.js backend, runs YOLOv8 training via
Ultralytics, and streams epoch metrics back to the backend progress endpoint.

Requires: GPU machine with CUDA, ultralytics, cloudinary installed.
Start: uvicorn server:app --host 0.0.0.0 --port 5003
"""

import os
import uuid
import threading
import httpx
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

app = FastAPI(title="MVIS Training Service", version="1.0.0")

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8001")
BACKEND_TOKEN = os.getenv("BACKEND_TOKEN", "dev")

# In-memory job state (single-node; for multi-GPU use Redis)
_jobs: dict[str, dict] = {}


class TrainRequest(BaseModel):
    job_id: str
    dataset_id: Optional[str] = None
    dataset_name: Optional[str] = None
    base_model: str = "yolov8n.pt"
    epochs: int = Field(default=100, ge=1, le=1000)
    batch_size: int = Field(default=16, ge=1, le=512)
    learning_rate: float = Field(default=0.01, gt=0, lt=1)
    img_size: int = Field(default=640, ge=32, le=1280)


def _post_progress(job_id: str, epoch_data: dict):
    """Fire-and-forget: post one epoch's metrics to the Node.js backend."""
    try:
        with httpx.Client(timeout=5) as client:
            client.post(
                f"{BACKEND_URL}/api/training/jobs/{job_id}/progress",
                json=epoch_data,
                headers={"Authorization": f"Bearer {BACKEND_TOKEN}"},
            )
    except Exception:
        pass  # Backend unreachable — metrics will be missing for this epoch


def _post_complete(job_id: str, model_url: Optional[str] = None, error: Optional[str] = None):
    try:
        with httpx.Client(timeout=5) as client:
            client.post(
                f"{BACKEND_URL}/api/training/jobs/{job_id}/complete",
                json={"model_url": model_url, "error": error},
                headers={"Authorization": f"Bearer {BACKEND_TOKEN}"},
            )
    except Exception:
        pass


def _upload_model_to_cloudinary(weights_path: Path) -> Optional[str]:
    """Upload trained weights to Cloudinary and return the URL."""
    try:
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
            api_key=os.getenv("CLOUDINARY_API_KEY"),
            api_secret=os.getenv("CLOUDINARY_API_SECRET"),
        )
        result = cloudinary.uploader.upload(
            str(weights_path),
            resource_type="raw",
            folder="mvis/models",
            public_id=f"model_{weights_path.stem}_{uuid.uuid4().hex[:8]}",
        )
        return result.get("secure_url")
    except Exception as e:
        print(f"[TRAINING] Cloudinary upload failed: {e}")
        return None


def _run_training(req: TrainRequest):
    """Background thread: run YOLOv8 training and post progress."""
    job_id = req.job_id
    _jobs[job_id]["status"] = "running"

    try:
        from ultralytics import YOLO

        model = YOLO(req.base_model)

        # Callbacks to stream per-epoch metrics
        def on_train_epoch_end(trainer):
            metrics = trainer.metrics or {}
            epoch = trainer.epoch + 1
            _post_progress(job_id, {
                "epoch": epoch,
                "box_loss": float(trainer.loss_items[0]) if trainer.loss_items is not None else 0,
                "cls_loss": float(trainer.loss_items[1]) if trainer.loss_items is not None and len(trainer.loss_items) > 1 else 0,
                "dfl_loss": float(trainer.loss_items[2]) if trainer.loss_items is not None and len(trainer.loss_items) > 2 else 0,
                "precision": float(metrics.get("metrics/precision(B)", 0)),
                "recall": float(metrics.get("metrics/recall(B)", 0)),
                "map50": float(metrics.get("metrics/mAP50(B)", 0)),
                "map95": float(metrics.get("metrics/mAP50-95(B)", 0)),
            })

        model.add_callback("on_train_epoch_end", on_train_epoch_end)

        # Build dataset YAML path from dataset_id
        # Convention: datasets are stored at GPU/datasets/<dataset_id>/dataset.yaml
        data_yaml = f"datasets/{req.dataset_id}/dataset.yaml" if req.dataset_id else "coco128.yaml"

        results = model.train(
            data=data_yaml,
            epochs=req.epochs,
            batch=req.batch_size,
            lr0=req.learning_rate,
            imgsz=req.img_size,
            project="runs/train",
            name=job_id,
            exist_ok=True,
        )

        best_weights = Path(f"runs/train/{job_id}/weights/best.pt")
        model_url = _upload_model_to_cloudinary(best_weights) if best_weights.exists() else None

        _jobs[job_id]["status"] = "completed"
        _post_complete(job_id, model_url=model_url)

    except Exception as e:
        _jobs[job_id]["status"] = "failed"
        _jobs[job_id]["error"] = str(e)
        _post_complete(job_id, error=str(e))


@app.get("/health")
def health():
    return {"status": "ok", "service": "training"}


@app.post("/train", status_code=202)
def launch_training(req: TrainRequest):
    if req.job_id in _jobs and _jobs[req.job_id]["status"] == "running":
        raise HTTPException(409, "Job already running")

    _jobs[req.job_id] = {"status": "queued", "request": req.dict()}

    thread = threading.Thread(target=_run_training, args=(req,), daemon=True)
    thread.start()

    return {"job_id": req.job_id, "status": "queued"}


@app.get("/train/{job_id}/status")
def job_status(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@app.post("/train/{job_id}/cancel")
def cancel_job(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    # Thread-based training cannot be cleanly interrupted mid-epoch.
    # Mark cancelled — the next epoch-end callback will see this and raise.
    _jobs[job_id]["status"] = "cancelled"
    return {"job_id": job_id, "status": "cancelled"}
