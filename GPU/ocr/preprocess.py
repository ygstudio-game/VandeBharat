"""Frame preprocessing for Pass 2 OCR: grayscale → 2× upscale → sharpen → CLAHE → blur."""
import cv2
import numpy as np


def preprocess_frame(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_LINEAR)
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    sharp = cv2.filter2D(gray, -1, kernel)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(sharp)
    return cv2.GaussianBlur(enhanced, (3, 3), 0)
