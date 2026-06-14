"""RapidOCR singleton — ONNXRuntime PP-OCR models, GPU best-effort with CPU fallback.

RapidOCR (v3) runs the same PP-OCR detection + recognition models as PaddleOCR but
on ONNXRuntime, so it is Python 3.13 compatible and needs no paddlepaddle / cuDNN-8
DLL juggling. CPU works out of the box (onnxruntime). For GPU, install
onnxruntime-gpu and set OCR_DEVICE=gpu; it falls back to CPU cleanly if CUDA init
fails.
"""
import os
import logging

import cv2
from rapidocr import RapidOCR

logger = logging.getLogger(__name__)

_ocr = None

# rapidocr v3 reads engine settings from a params dict. Enable CUDA on every stage.
_GPU_PARAMS = {
    "EngineConfig.onnxruntime.use_cuda": True,
    "Det.engine_cfg.use_cuda": True,
    "Cls.engine_cfg.use_cuda": True,
    "Rec.engine_cfg.use_cuda": True,
}


def get_ocr():
    global _ocr
    if _ocr is not None:
        return _ocr

    requested = os.environ.get("OCR_DEVICE", "gpu").strip().lower()

    if requested == "gpu":
        try:
            _ocr = RapidOCR(params=_GPU_PARAMS)
            return _ocr
        except Exception as exc:
            logger.warning("RapidOCR GPU init failed (%s) — falling back to CPU", exc)

    _ocr = RapidOCR()
    return _ocr


def run_ocr(image):
    if len(image.shape) == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)

    # RapidOCROutput: .boxes (Nx4x2 ndarray), .txts (tuple[str]), .scores (tuple[float]).
    # All are None when nothing is detected.
    result = get_ocr()(image)
    extracted = []
    if result is None or not result.txts:
        return extracted

    boxes = result.boxes if result.boxes is not None else []
    scores = result.scores if result.scores is not None else []
    for i, text in enumerate(result.txts):
        box = None
        if i < len(boxes):
            b = boxes[i]
            box = b.tolist() if hasattr(b, "tolist") else b
        extracted.append({
            "text": str(text).strip(),
            "confidence": float(scores[i]) if i < len(scores) else 1.0,
            "box": box,
        })

    return extracted
