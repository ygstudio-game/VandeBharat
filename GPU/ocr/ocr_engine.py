"""PaddleOCR singleton — GPU with CPU fallback. Windows CUDA DLL injection included."""
import os
import sys
import logging

logger = logging.getLogger(__name__)

# Windows: inject CUDA/cuDNN DLL paths so PaddlePaddle's C++ extensions find them.
# os.add_dll_directory() covers Python-level DLL loading.
# PATH prepend covers paddle's internal LoadLibrary() calls (which ignore add_dll_directory).
if sys.platform == "win32":
    _extra_dll_paths = []
    for pkg in ("nvidia.cudnn", "nvidia.cublas", "nvidia.cuda_runtime", "nvidia.cusparse"):
        try:
            mod = __import__(pkg, fromlist=["__file__"])
            pkg_bin = os.path.abspath(os.path.join(os.path.dirname(mod.__file__), "bin"))
            if os.path.exists(pkg_bin):
                os.add_dll_directory(pkg_bin)
                _extra_dll_paths.append(pkg_bin)
        except Exception:
            pass
    if _extra_dll_paths:
        os.environ["PATH"] = ";".join(_extra_dll_paths) + ";" + os.environ.get("PATH", "")


def _cudnn8_available():
    """
    PaddlePaddle 2.x requires cuDNN 8 (cudnn_ops_infer64_8.dll on Windows).
    PyTorch ships cuDNN 9 (cudnn_ops64_9.dll) — different major version, incompatible.
    Check before attempting GPU init so the process doesn't crash at the C level.
    """
    if sys.platform != "win32":
        return True  # On Linux paddle handles its own fallback
    import ctypes
    try:
        ctypes.WinDLL("cudnn_ops_infer64_8.dll")
        return True
    except OSError:
        return False


import cv2
from paddleocr import PaddleOCR

_ocr = None


def get_ocr():
    global _ocr
    if _ocr is not None:
        return _ocr

    requested = os.environ.get("OCR_DEVICE", "gpu").strip().lower()

    # Validate GPU feasibility on Windows before paddle tries to load cuDNN
    if requested == "gpu" and not _cudnn8_available():
        logger.warning(
            "cuDNN 8.x (cudnn_ops_infer64_8.dll) not found — "
            "falling back to CPU for PaddleOCR. "
            "To enable GPU: pip install nvidia-cudnn-cu12==8.9.7.29 in GPU/ocr/venv"
        )
        requested = "cpu"

    device = requested
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
            logger.warning("PaddleOCR GPU init failed (%s) — retrying on CPU", exc)
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
