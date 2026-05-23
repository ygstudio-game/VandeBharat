# Phase 10: Troubleshooting, Debugging & Incident Logs

This section compiles technical analysis for major debugging incidents resolved during the development and testing of the VandeInspect AI platform.

---

## Incident 1: PaddleOCR OpenMP / OneDNN Crash on Windows

### Symptom
When starting the OCR microservice on Windows testing environments, the Python process crashed during PaddleOCR initialization, yielding the following error:
```
OMP: Error #15: Initializing libiomp5md.dll, but found libiomp5md.dll already initialized.
OMP: Hint: This means that multiple copies of the OpenMP runtime have been 
linked into the program. That is dangerous, but it can be bypassed by setting
the KMP_DUPLICATE_LIB_OK environment variable to TRUE.
```

### Root Cause
PaddlePaddle and OpenCV both package their own compiled version of Intel's OpenMP library (`libiomp5md.dll`). When PaddlePaddle attempts to initialize its tensor computation graph, it loads its OpenMP runtime. If OpenCV has already loaded its copy to accelerate image filtering, the duplicate runtime initialization triggers a safety exit in the Intel OpenMP driver, crashing the process.

### Resolution
1. **Environment Configuration**: Added the duplicate library bypass flag to `GPU/ocr/.env`:
   ```ini
   KMP_DUPLICATE_LIB_OK=TRUE
   ```
2. **Import Ordering**: Restructured `ocr_engine.py` to import `cv2` before loading PaddlePaddle extensions, allowing OpenCV's runtime to initialize first.

---

## Incident 2: YOLOv8 Startup Path Resolution Errors on Windows

### Symptom
The YOLO service failed to start, throwing `FileNotFoundError` or relative path resolution errors when attempting to load the custom trained weights:
```
ultralytics.utils.exceptions.HUBModelError: Model path 'weights/best.pt' not found.
```

### Root Cause
On Windows hosts, differences in path separator characters (backslashes `\` vs forward slashes `/`) and varying current working directories (CWD) based on how the FastAPI service was launched (e.g., from the project root directory vs the service directory) caused relative paths to resolve incorrectly.

### Resolution
Updated `GPU/yolo/server.py` to resolve weight paths dynamically using absolute system paths relative to the file's directory:

```python
import os

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(CURRENT_DIR, "weights", "train_num_detector.pt")

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"YOLO model weights not found at absolute path: {MODEL_PATH}")
```

---

## Incident 3: Video Framing / Frame Extraction Mismatch

### Symptom
The frame extraction stage crashed with index out of bounds errors or produced blank frames when processing certain test video files:
```
cv2.error: OpenCV(4.8.0) ERROR: Frame index 3540 exceeds total frames 3500.
```

### Root Cause
The frame extraction service used the video's average FPS metadata to calculate downsampling offsets. However, raw smartphone videos and consumer camera feeds often use **Variable Frame Rate (VFR)** encoding. For these files, the metadata's average FPS is inaccurate, causing the calculated frame indexes to exceed the actual frame count.

### Resolution
Modified the extraction routine in `frame_extractor` to determine frame limits dynamically using OpenCV properties rather than FPS math, and added boundary constraints:

```python
import cv2

cap = cv2.VideoCapture(video_path)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

# Calculate target frame index
target_idx = int(i * frame_interval)

# Apply boundary constraints to prevent out-of-bounds errors
if target_idx >= total_frames:
    target_idx = total_frames - 1

cap.set(cv2.CAP_PROP_POS_FRAMES, target_idx)
success, frame = cap.read()
```

---

## Incident 4: False Positive Defect Detections from Glare

### Symptom
Underbody cameras flagged numerous "structural cracks" on shiny metal brackets and suspension components, generating high false-alarm rates.

### Root Cause
Bright overhead light-emitting diode (LED) panels in the inspection pit reflected off wet surfaces, creating high-contrast light reflections. The YOLO object detector, trained on static images, misidentified these high-contrast edges as structural cracks.

### Resolution
1. **Training Augmentation**: Retrained the YOLO defect model using training sets augmented with high-contrast brightness changes, simulating glare conditions.
2. **Edge Processing Thresholds**: Increased the confidence threshold for defect detections in glare-prone regions from `0.25` to `0.55` to filter out reflections.
3. **Multi-Frame Verification**: Configured the pipeline to verify defect detections across multiple consecutive frames, ensuring that reflections (which shift as the train moves) are not flagged as stationary defects.
