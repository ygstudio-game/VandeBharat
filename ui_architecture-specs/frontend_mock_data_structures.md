# VandeBharat AI Mock Data Structures

The frontend will be developed using hardcoded data initially. This data must mirror the exact format the APIs will eventually use. Below are the JSON data structures required to build the frontend.

## 1. Train Session Object

Used in `/sessions` table and the `/train/:sessionId` workspace header.

```json
{
  "id": "INS-2026-0045",
  "trainNumber": "VB-22901",
  "startedAt": "2026-05-20T20:41:00Z",
  "status": "PROCESSING",
  "progressPercent": 72,
  "stats": {
    "totalCoaches": 14,
    "framesCaptured": 14221,
    "camerasActive": 6,
    "criticalDefects": 2,
    "ocrConfidence": 0.96,
    "synchronizationConfidence": 0.98
  },
  "pipelineStates": {
    "frameExtraction": "COMPLETED",
    "ocrDetection": "COMPLETED",
    "synchronization": "IN_PROGRESS",
    "componentDetection": "PENDING",
    "defectAnalysis": "PENDING",
    "reportGeneration": "PENDING"
  }
}
```

## 2. Train Hierarchy Structure

This drives the Left Hierarchy Panel and maps the synchronization output.

```json
{
  "trainId": "INS-2026-0045",
  "coaches": [
    {
      "id": "coach-b1",
      "coachNumber": "B1",
      "stats": {
        "ocrFramesCount": 23,
        "componentFramesCount": 140,
        "criticalDefects": 1,
        "missingComponents": 0
      },
      "cameras": [
        {
          "id": "cam-ocr-01",
          "name": "OCR Camera",
          "frames": ["frame-url-1", "frame-url-2"]
        },
        {
          "id": "cam-left-01",
          "name": "Left Assembly Camera",
          "frames": ["frame-url-3", "frame-url-4"]
        }
      ]
    }
  ]
}
```

## 3. Component & Defect Intelligence

Drives the Right Intelligence Panel and the Center Evidence Viewer overlays.

```json
{
  "coachId": "coach-b1",
  "components": [
    {
      "id": "comp-001",
      "name": "Brake Pad",
      "expected": true,
      "detected": true,
      "status": "OK",
      "confidence": 0.99
    },
    {
      "id": "comp-002",
      "name": "Suspension Pin",
      "expected": true,
      "detected": false,
      "status": "MISSING",
      "confidence": 0.0
    }
  ],
  "defects": [
    {
      "id": "def-001",
      "componentId": "comp-001",
      "type": "CRACK",
      "severity": "CRITICAL",
      "frameId": "frame-url-3",
      "boundingBox": { "x": 120, "y": 300, "w": 45, "h": 60 },
      "aiNotes": "Shape mismatch in lower bracket. Crack detected."
    }
  ]
}
```

## 4. Pipeline Timeline Events

Used to render the bottom evidence strip.

```json
[
  {
    "id": "evt-01",
    "timestamp": 1234.56,
    "type": "OCR_ANCHOR",
    "description": "Coach B1 detected",
    "frameId": "frame-url-1"
  },
  {
    "id": "evt-02",
    "timestamp": 1235.12,
    "type": "COACH_GAP",
    "description": "Inter-coach gap detected",
    "frameId": "frame-url-5"
  }
]
```
