"""PaddleOCR singleton — GPU with CPU fallback. Windows CUDA DLL injection included."""
import os
import sys

# Windows: inject CUDA/cuDNN DLL paths from nvidia python packages
if sys.platform == "win32":
    for pkg in ("nvidia.cudnn", "nvidia.cublas", "nvidia.cuda_runtime", "nvidia.cusparse"):
        try:
            mod = __import__(pkg, fromlist=["__file__"])
            pkg_bin = os.path.abspath(os.path.join(os.path.dirname(mod.__file__), "bin"))
            if os.path.exists(pkg_bin):
                os.add_dll_directory(pkg_bin)
        except Exception:
            pass

import cv2
from paddleocr import PaddleOCR

_ocr = None


def get_ocr():
    global _ocr
    if _ocr is not None:
        return _ocr

    device = os.environ.get("OCR_DEVICE", "gpu").strip().lower()
    try:
        _ocr = PaddleOCR(
            use_angle_cls=True,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            lang="en",
            device=device,
        )
        return _ocr
    except Exception as exc:
        if device == "gpu":
            _ocr = PaddleOCR(
                use_angle_cls=True,
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                lang="en",
                device="cpu",
            )
            return _ocr
        raise exc


def run_ocr(image):
    if len(image.shape) == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)

    result = get_ocr().ocr(image)
    extracted = []
    if not result:
        return extracted

    # PaddleX v3 dict format: [{'rec_texts': [...], 'rec_scores': [...], 'rec_polys': [...]}]
    if isinstance(result, list) and result and isinstance(result[0], dict):
        data = result[0]
        texts = data.get("rec_texts", [])
        scores = data.get("rec_scores", [])
        polys = data.get("rec_polys", data.get("rec_boxes", []))
        for i, text in enumerate(texts):
            box = None
            if i < len(polys):
                p = polys[i]
                box = p.tolist() if hasattr(p, "tolist") else p
            extracted.append({
                "text": str(text).strip(),
                "confidence": float(scores[i]) if i < len(scores) else 1.0,
                "box": box,
            })
        return extracted

    # Classic nested list format: [[ [[coords], ('text', conf)], ... ]]
    if result[0] is None:
        return extracted
    for res in result[0]:
        if len(res) > 1 and isinstance(res[1], tuple):
            text, score = res[1]
            extracted.append({"text": str(text).strip(), "confidence": float(score), "box": res[0]})

    return extracted
