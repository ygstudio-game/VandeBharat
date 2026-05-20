"""Filter OCR results to valid 5-6 digit train numbers."""
import re

TRAIN_NUMBER_PATTERN = re.compile(r'^\d{5,6}$')
CONFIDENCE_THRESHOLD = 0.4


def filter_train_numbers(ocr_results):
    candidates = []
    for item in ocr_results:
        cleaned = item["text"].replace(" ", "").strip()
        if TRAIN_NUMBER_PATTERN.match(cleaned) and item["confidence"] >= CONFIDENCE_THRESHOLD:
            candidates.append(cleaned)
    return candidates
