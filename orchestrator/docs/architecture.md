# Phase-1 Orchestrator — Architecture Diagrams

Companion to the top-level `README.md`. Diagrams in Mermaid, consistent with
the convention already used in `Railway_AI_Inspection_System_ADS.md`.

## 1. Manager class diagram (UML)

```mermaid
classDiagram
    class PipelineCoordinator {
        -ProcessedFrameStore store
        -EventManager event_manager
        -GapDetectionManager gap_detector
        -OCRManager ocr_manager
        -FrameAssignmentManager frame_assignment
        -StitchManager stitcher
        -DetectionManager detector
        -StorageManager storage
        +run()
    }
    class FrameCaptureManager {
        +start()
        +stop()
        -_run()
    }
    class RingBufferManager {
        +put(frame)
        +get(timeout) FrameMessage
        +close()
    }
    class PreprocessingManager {
        +start()
        +stop_and_wait()
    }
    class ProcessedFrameStore {
        +add(frame)
        +query_range(camera, start, end) List
    }
    class OCRManager {
        +start()
        -_process_one(frame)
    }
    class GapDetectionManager {
        +submit_candidate(candidate)
        +flush()
    }
    class EventManager {
        +on_gap_boundary(ts, confidence)
        +enrich_with_ocr(observation)
        +close_final_window(ts)
    }
    class FrameAssignmentManager {
        +assign(event) EventFrames
    }
    class StitchManager {
        +stitch_event(event_frames) List~StitchedImage~
    }
    class DetectionManager {
        +detect(event_id, images) List~DetectionResult~
    }
    class StorageManager {
        +save_event(event, frames, stitched, detections, time)
        +update_metadata(event)
    }

    PipelineCoordinator --> FrameCaptureManager
    PipelineCoordinator --> PreprocessingManager
    PipelineCoordinator --> OCRManager
    PipelineCoordinator --> GapDetectionManager
    PipelineCoordinator --> EventManager
    PipelineCoordinator --> FrameAssignmentManager
    PipelineCoordinator --> StitchManager
    PipelineCoordinator --> DetectionManager
    PipelineCoordinator --> StorageManager
    FrameCaptureManager --> RingBufferManager : produces into
    PreprocessingManager --> RingBufferManager : consumes from
    PreprocessingManager --> ProcessedFrameStore : produces into
    OCRManager --> ProcessedFrameStore : polls
    OCRManager ..> GapDetectionManager : gap candidate callback
    OCRManager ..> EventManager : ocr result callback
    GapDetectionManager ..> EventManager : boundary callback
    FrameAssignmentManager --> ProcessedFrameStore : queries
```

## 2. End-to-end sequence (one coach / Event)

```mermaid
sequenceDiagram
    participant CAP as FrameCaptureManager (x3)
    participant RB as RingBufferManager
    participant PRE as PreprocessingManager
    participant PFS as ProcessedFrameStore
    participant OCR as OCRManager
    participant GAP as GapDetectionManager
    participant EVT as EventManager
    participant FA as FrameAssignmentManager
    participant ST as StitchManager
    participant DET as DetectionManager
    participant STO as StorageManager

    loop every frame, all 3 cameras
        CAP->>RB: put(FrameMessage, timestamp_ms)
        PRE->>RB: get()
        PRE->>PFS: add(ProcessedFrame)
    end

    par OCR camera only, never blocking preprocessing
        OCR->>PFS: query_range(ocr_cam, since last poll)
        OCR->>OCR: single YOLO call -> gap boxes + boogie box
        OCR->>GAP: on_gap_candidate(GapCandidate)
        OCR->>EVT: on_ocr_result(OcrObservation)
    end

    GAP->>GAP: cluster candidates within window
    GAP->>EVT: on_boundary(ts, confidence)
    EVT->>EVT: close current EventWindow, open EVT_NNNNNN+1
    EVT->>FA: (async) finalize bounded event

    FA->>PFS: query_range(cam1, start, end)
    FA->>PFS: query_range(cam2, start, end)
    FA-->>ST: EventFrames

    ST->>ST: pair Cam1(top)/Cam2(bottom) by timestamp, calibrated overlap alpha-blend (stitch.py)
    ST-->>DET: StitchedImage list

    DET->>DET: YOLO /predict per stitched image
    DET-->>STO: DetectionResult list

    STO->>STO: write event.json, metadata.json, OCR.json, detection.json, frames

    Note over EVT,STO: If OCR resolves the coach number AFTER storage,<br/>EventManager.enrich_with_ocr -> on_event_updated -> StorageManager.update_metadata patches disk.
```

## 3. Thread architecture

```mermaid
flowchart TB
    subgraph Capture["1 thread per camera (3 total)"]
        C1["FrameCaptureManager: ocr_cam"]
        C2["FrameCaptureManager: cam1"]
        C3["FrameCaptureManager: cam2"]
    end
    subgraph Preprocess["Thread pool per camera (config: preprocessing_thread_count)"]
        P1["PreprocessingManager: ocr_cam pool"]
        P2["PreprocessingManager: cam1 pool"]
        P3["PreprocessingManager: cam2 pool"]
    end
    subgraph OCRStage["Independent thread pool — never blocks Preprocess"]
        O1["OCRManager poll thread + worker pool"]
    end
    subgraph EventStage["GapDetectionManager (single-threaded, guarded by lock)"]
        G1["Gap clustering"]
    end
    subgraph Finalize["ThreadPoolExecutor(max_workers=2)"]
        F1["_finalize_event worker A"]
        F2["_finalize_event worker B"]
    end
    subgraph Viz["Daemon thread"]
        V1["Tkinter / console loop"]
    end

    C1 --> P1
    C2 --> P2
    C3 --> P3
    P1 --> O1
    O1 --> G1
    G1 --> F1
    G1 --> F2
    F1 --> Viz
    F2 --> Viz
```

## 4. Queue / buffer topology

```mermaid
flowchart LR
    CAM(("3 Camera Sources")) --> RB1{{"RingBufferManager\n(bounded, drop-oldest + counter)"}}
    RB1 --> PRE["PreprocessingManager pool"]
    PRE --> PFS[("ProcessedFrameStore\n(timestamp-sorted, per camera)")]

    PFS -->|poll: ocr_cam only| OCR["OCRManager"]
    OCR -->|gap candidates| GAPQ["GapDetectionManager\n(in-memory cluster buffer)"]
    OCR -->|ocr observations| EVTQ["EventManager"]
    GAPQ -->|boundary| EVTQ

    EVTQ -->|bounded event| FINQ{{"Finalize ThreadPoolExecutor\n(bounded: max_workers=2)"}}
    PFS -->|query_range cam1/cam2| FINQ
    FINQ --> ST["StitchManager"]
    ST --> DET["DetectionManager"]
    DET --> STORE["StorageManager"]
    STORE --> DISK[("Event folder tree on disk")]
```

## 5. Event lifecycle (state machine)

```mermaid
stateDiagram-v2
    [*] --> OPEN: EventManager opens window at session start / prior boundary
    OPEN --> BOUNDED: Gap Detection reports boundary (or stream ends)
    BOUNDED --> ASSIGNED: FrameAssignmentManager assigns Cam1/Cam2 frames
    ASSIGNED --> STITCHED: StitchManager produces stitched images
    STITCHED --> DETECTED: DetectionManager runs component detection
    DETECTED --> STORED: StorageManager writes the Event folder
    DETECTED --> FAILED_PARTIAL: any stage above logs a warning\n(missing frames, stitch failure, storage failure)
    STORED --> STORED: late OCR patches metadata.json in place (no state change)
```
