<!-- converted from VandeInspect_AI_Technical_Report.docx -->

# Phase 1: System Overview & Industrial Context
## 1. Executive Summary
VandeInspect AI is an enterprise-grade, distributed AI-powered vision inspection and predictive maintenance platform designed specifically for the Vande Bharat semi-high-speed trainsets operated by Indian Railways.
Manual safety and structural inspections of train coach undercarriages, suspensions, wheel assemblies, and bogies are highly time-consuming, subjective, and prone to human oversight. VandeInspect AI automates this critical workflow by leveraging a high-speed multi-camera acquisition system installed at trackside inspection bays (inspection pits).
As a train passes through the inspection zone, the trackside system captures high-resolution video streams from multiple perspectives. The platform ingests these multi-view video feeds, extracts individual frames, synchronizes the temporal sequences across cameras using a deterministic trigger-pulse identification model, groups frames into logical coaches via advanced OCR-based boundary detection, and analyzes the components for defects (such as cracks, rust, component deformation, and missing items) using deep learning algorithms (YOLOv8).
Ultimately, VandeInspect AI consolidates these findings into audit-ready PDF and JSON inspection reports complete with confidence scores, defect annotations, and overall coach health metrics. This enables maintenance engineers to transition from reactive maintenance models to proactive, condition-based scheduling.

Diagram 2

## 2. Problem Statement
Indian Railways operates one of the largest rail networks in the world, with the Vande Bharat trainsets representing a major technological leap toward modernizing passenger transport. These trainsets operate at high speeds (up to 160 km/h), placing substantial dynamic stress on their mechanical and structural assemblies. Consequently, daily visual inspections are mandatory to ensure passenger safety and operational reliability.
### The Inspection Challenge
Mechanical Stress: Underbody and suspension elements undergo severe vibration, thermal cycles, and ballast impact, making them susceptible to micro-cracks, component loosening, and structural fatigue.
Short Turnaround Windows: Maintenance schedules require inspection bays to complete full train inspections within tight turnaround windows (often less than 2-4 hours) between journeys.
Data Silos: Current systems, where they exist, capture footage but fail to map detected faults to the actual coach structure or serial number, forcing technicians to scroll through hours of video manually.

## 3. Existing System Limitations
The current inspection paradigm relies heavily on manual inspections conducted in maintenance pits by railway engineers using torches and visual checklists. Where automated wayside inspection systems (Wayside Inspection Systems - WIS) exist, they suffer from several fundamental system limitations:

## 4. Proposed AI Solution: VandeInspect AI
VandeInspect AI addresses these structural bottlenecks by introducing an integrated hardware-software framework that combines edge frame extraction, process-isolated deep learning inference, deterministic camera synchronization, and structured reporting.

Diagram 1
### Key Solution Pillars
Deterministic Multi-Camera Synchronization: Instead of aligning streams via system clocks, the platform syncs all camera feeds using trigger_id sequences mapped directly to hardware camera trigger pulses (production mode) or raw video frame numbers (test upload mode).
YOLO-First ROI OCR Pipeline: Rather than running heavy OCR engines over high-resolution, full-size images (which is slow and introduces background noise), the system uses a lightweight YOLOv8 network (train_num_detector.pt) to locate the bogie region containing the coach number. It then extracts this Region of Interest (ROI) with dynamic padding, executes a two-pass PaddleOCR sequence, and filters results using custom regex validation and a voting buffer.
Binary Defect Classification: To bypass naming conflicts across varied training datasets (e.g. “Battery Box” vs “Battery”), the defect detector uses a binary classifier (defect=0 / normal=1). This setup maximizes model recall (critical for safety inspection) and prevents catalog mismatch errors.
Manifest Correlation: The system correlates detected components against a master structural manifest database. This step automatically flags missing critical safety parts (such as secondary suspension springs, brake pads, and axle box bolts).
Interactive Operator Workspace: The React-based dashboard lets operators review the train hierarchy (Train → Coach → Camera → Frame → Component → Defect), inspect annotated defect bounding boxes, and sign off on audit-ready inspection reports.

# Phase 2: Frontend Architecture
## 1. Technologies & Architecture Overview
The VandeInspect AI frontend is developed using React 18 and Vite to provide a fast, responsive, and real-time operational interface. Modern, component-driven development practices are followed, styled with Tailwind CSS for layout responsiveness, and powered by Lucide React for UI icons.
### Core Tech Stack
Vite: Rapid hot-reloading bundler.
React 18: Component-based user interface rendering.
React Router v6: Client-side hash/history routing.
Zustand: Lightweight, reactive state management (for global alerts and toast messages).
Lucide React: Vector-based icons.
Tailwind CSS: Utility-first CSS styling framework.
### Client-Side Architecture Layout
The application runs as a Single Page Application (SPA). To maintain low latency, the frontend utilizes room-based WebSocket subscriptions via a shared singleton instance. This setup updates the UI immediately as background GPU workers process frame segments. If WebSocket connectivity is lost, it falls back to polling via custom React hooks to prevent UI stale states.

Diagram 3

## 2. Page Hierarchy & Routing Map
The frontend routing is managed via React Router, exposing eight distinct pages representing operations, analytics, infrastructure health, and configuration:
Dashboard (/dashboard): Displays the general system health status, active session queue counters, system-wide key performance indicators (KPIs), and current pipeline processing throughput.
Sessions (/sessions): The core entry point for historical audits. Displays a tabular view of all inspection runs, filterable by date, train number, and status, and hosts the multipart video uploader.
Live Queue (/live-queue): A dedicated real-time tracker displaying currently executing pipeline tasks, active camera feeds, and worker task allocations.
Train Workspace (/train/:sessionId): The core diagnostic workspace where operators analyze a specific session. It houses the train coach list, camera layout selectors, frame timelines, OCR results, and component-level defect logs.
Reports (/reports): A formal page containing final PDF report download buttons, compliance logs, and QA sign-off checklists.
Analytics (/analytics): Renders historical statistics on defect recurrences, most affected coaches, and OCR failure rates.
Infrastructure (/infrastructure): Displays the hardware status of connected edge cameras, GPU temperatures, RAM utilization, and microservice status.
Settings (/settings): Hosts threshold configurations, OCR VoteManager minimum hits adjustment, YOLO confidence defaults, and Cloudinary folder mappings.

## 3. Global State Management (Zustand)
Global states that require accessibility from outside the React rendering tree (such as notifications triggered during background WebSocket events) are governed via Zustand.
### Toast Store Implementation
The notification system is decoupled from React’s context to prevent redundant component re-renders. A global store maintains the list of active toasts, and exposure functions are exported directly.
import { create } from 'zustand';

export const useToastStore = create((set) => ({
  toasts: [],
  push: (toast) => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, ...toast }] }));
    return id;
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Convenience helpers — call from anywhere (including vanilla JS services)
export const toast = {
  success: (message, title) => useToastStore.getState().push({ type: 'success', message, title }),
  warning: (message, title) => useToastStore.getState().push({ type: 'warning', message, title }),
  error:   (message, title) => useToastStore.getState().push({ type: 'error',   message, title }),
  info:    (message, title) => useToastStore.getState().push({ type: 'info',    message, title }),
};

## 4. Custom Hooks & Real-Time Sync
To handle communication with the Fastify orchestrator, the UI uses two custom hooks: a WebSocket listener and a polling fallback.
### 4.1 WebSocket Gateway Hook (useSessionSocket.js)
Rather than opening multiple connections per component, the application implements a shared singleton WebSocket. Multiple hook invocations subscribe to a single callback registry (subscribers). The hook handles room subscription messages ({ type: "subscribe", sessionId }) and parses events matching the context.
import { useState, useEffect, useRef, useCallback } from 'react';

const WS_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001')
  .replace(/^http/, 'ws');

let sharedWs = null;
const subscribers = new Set(); // Callback registry

function getSharedWs() {
  if (sharedWs && (sharedWs.readyState === WebSocket.OPEN || sharedWs.readyState === WebSocket.CONNECTING)) {
    return sharedWs;
  }
  sharedWs = new WebSocket(`${WS_BASE}/ws`);

  sharedWs.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      for (const cb of subscribers) cb(event);
    } catch (_) {}
  };

  sharedWs.onclose = () => {
    sharedWs = null;
    setTimeout(getSharedWs, 3000); // Reconnect loop
  };

  sharedWs.onerror = () => {
    sharedWs?.close();
  };

  return sharedWs;
}

function subscribeSession(sessionId) {
  const ws = getSharedWs();
  if (!sessionId) return;
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
  } else {
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
    }, { once: true });
  }
}

export function useSessionSocket(sessionId = null) {
  const [lastEvent, setLastEvent] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  const onEvent = useCallback((event) => {
    if (!sessionId || !event.sessionId || event.sessionId === sessionId) {
      setLastEvent(event);
    }
  }, [sessionId]);

  useEffect(() => {
    subscribers.add(onEvent);
    wsRef.current = getSharedWs();

    const checkState = () => setConnected(wsRef.current?.readyState === WebSocket.OPEN);
    const interval = setInterval(checkState, 1000);
    checkState();

    if (sessionId) subscribeSession(sessionId);

    return () => {
      subscribers.delete(onEvent);
      clearInterval(interval);
    };
  }, [onEvent, sessionId]);

  return { lastEvent, connected };
}
### 4.2 Fallback Polling Hook (usePolling.js)
If the browser connection is blocked by a VPN or firewall, or if a backend WebSocket fails, the components fall back to active REST polling. The custom hook utilizes a standard useRef block to store the timer reference, preventing memory leaks on component unmounting.
import { useEffect, useRef, useCallback } from 'react';

export function usePolling(callback, delay, active = true) {
  const savedCallback = useRef();

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!active || delay === null) return;

    function tick() {
      savedCallback.current();
    }

    // Immediate first tick
    tick();

    const id = setInterval(tick, delay);
    return () => clearInterval(id);
  }, [delay, active]);
}

## 5. UI Evolution: Plans vs. Actual Implementation
During development, the interface design shifted away from traditional dashboard patterns to address the realities of operating a high-throughput railway yard:
Mock Data to API Integration: The early prototypes relied on static local JSON lists. In the current implementation, all tables (Sessions, Dashboard, Reports, Workspace) are connected to the Node.js API with custom adapter helpers to handle differences in database keys.
Progress Bar Precision: Instead of using linear time-based mock increments (e.g., ticking to 90%), the progress indicator is tied directly to the backend database stages (pipeline_stages records). The progress bar moves only as stages (e.g., frame_extraction, ocr_running, defect_analysis) switch from PENDING to COMPLETED.
Dynamic Overlay Canvas: The initial workspace design loaded static, pre-drawn bounding boxes. The current component maps YOLO defect arrays dynamically onto a React canvas overlay. This overlay automatically resizes based on image resolution, supporting responsive zoom modals and detailed inspections.

# Phase 3: Backend Architecture & Orchestration
## 1. Fastify Gateway Server Design
The core of VandeInspect AI’s backend is a Fastify server running on port 8001. Fastify was chosen over Express for its high throughput, low overhead, built-in schema serialization, and native plugin ecosystem.
The backend acts as an API gateway, orchestrating REST requests, WebSocket messaging, and the lifecycle of long-running GPU/CPU inspection pipeline jobs.
### Server Lifecycle & Registration
The application initializes Fastify with built-in logging, CORS support, multipart parsing configured for high-capacity file transfers, and a room-based WebSocket server:
const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const multipart = require('@fastify/multipart');
const websocketPlugin = require('@fastify/websocket');
const config = require('./config');
const prisma = require('./db/client');
const wsGateway = require('./services/wsGateway');

// Enable Cross-Origin Resource Sharing for the React Client
fastify.register(cors, {
  origin: config.frontendUrl,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

// Configure Multipart parser with a 2 GB file size limit for high-res train videos
fastify.register(multipart, {
  limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 10 },
});

// Register WebSocket support
fastify.register(websocketPlugin);

## 2. API Routes Mapping & Registry
The API routing structure is organized by functional domain, prefixing each set of endpoints under /api.
/api/sessions: Handles upload creations, starts pipelines, and queries session details.
/api/sessions/:id/intelligence: Serves detected components, defects, and missing component lists.
/api/sessions/:id/reports: Triggers PDF/JSON generation and serves Cloudinary URLs.
/api/dashboard: Pulls system KPIs and lists currently processing queue items.
/api/health: Simple health-check verification showing database connectivity state.
/api/config: Serves and updates global pipeline defaults (like Frame Intervals and thresholds).

## 3. Real-Time WebSocket Rooms Gateway
To prevent dashboard and workspace widgets from spamming the server with HTTP polling requests, the backend broadcasts real-time pipeline transitions over a WebSocket gateway at /ws.
The WebSocket server utilizes a room-based publisher-subscriber pattern managed by wsGateway.js. This allows client sockets to subscribe to updates for a specific session by sending a { type: "subscribe", sessionId } message. Global dashboard listeners receive state changes for all active sessions.

Diagram 4

## 4. Pipeline Orchestrator (pipelineOrchestrator.js)
When video uploads are processed and frames are extracted, the backend triggers the async analysis pipeline.
The orchestrator utilizes sliding-window concurrency to feed frames to the GPU workers without overloading system resources, periodically updating the Neon database with progress and sending WebSocket updates to clients.
### Pipeline Orchestration Algorithm
const axios = require('axios');
const prisma = require('../db/client');
const config = require('../config');
const { broadcast, broadcastAll } = require('./wsGateway');

const OCR_CONCURRENCY = 4;  // sliding-window boundary
const PROGRESS_EVERY = 10;  // DB update throttle

async function runOcrPipeline(sessionId, fastify) {
  const log = fastify ? fastify.log : console;
  
  try {
    // 1. Set stage state to RUNNING
    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'ocr_detection' },
      data: { status: 'running', started_at: new Date(), detail_message: 'Queuing frames...' },
    });
    broadcast(sessionId, { type: 'stage_update', sessionId, stage: 'ocr_detection', status: 'running' });

    // 2. Load all frames order-aligned by trigger_id
    const frames = await prisma.frame.findMany({
      where: { session_id: sessionId },
      orderBy: { trigger_id: 'asc' },
      select: { id: true, trigger_id: true, cloudinary_url: true },
    });

    const total = frames.length;
    let processed = 0;
    let ocrValid = 0;

    // 3. Process batches of frames using sliding-window concurrency
    for (let i = 0; i < frames.length; i += OCR_CONCURRENCY) {
      const batch = frames.slice(i, i + OCR_CONCURRENCY);

      const results = await Promise.allSettled(
        batch.map((frame) =>
          axios.post(`${config.services.ocr}/ocr`, {
            frame_url: frame.cloudinary_url,
            frame_id: frame.id,
            trigger_id: Number(frame.trigger_id),
            session_id: sessionId,
          }, { timeout: 30_000 })
        )
      );

      for (const res of results) {
        if (res.status === 'fulfilled' && res.value.data?.is_valid) {
          ocrValid++;
        }
      }
      processed += batch.length;

      // Throttle DB writes and broadcast socket updates to avoid overload
      if (processed % PROGRESS_EVERY === 0 || processed === total) {
        const pct = Math.round((processed / total) * 100);
        await prisma.pipelineStage.updateMany({
          where: { session_id: sessionId, stage: 'ocr_detection' },
          data: {
            detail_message: `OCR: ${processed}/${total} frames (${ocrValid} valid)`,
            stats: { processed, total, valid: ocrValid, progress_pct: pct },
          },
        });
        broadcast(sessionId, { type: 'progress_update', sessionId, stage: 'ocr_detection', processed, total, pct });
      }
    }

    // 4. Mark OCR complete and hand off to the synchronization engine
    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'ocr_detection' },
      data: { status: 'completed', completed_at: new Date() },
    });
    
    // Call Sync Engine, Correlation Engine, and finalize session...
  } catch (err) {
    log.error({ msg: 'OCR pipeline failed', error: err.message });
    // Handle failures and broadcast session_failed
  }
}

## 5. Direct HTTP Loopback vs. Queue Systems
During planning, using a broker like RabbitMQ was proposed to decouple backend services and workers. For the initial version, the system pivot-steered to direct HTTP Loopback requests over localhost (ports 5000 to 5006):
Lower Overhead: Direct HTTP requests eliminate queue serialization costs and simplify debugging.
Simplified Scaling: Running workers as isolated FastAPI instances allows local development without complex RabbitMQ setup.
Synchronous Flow Control: Using await statements with Promise.allSettled lets the orchestrator manage concurrency, handle failed requests, and retry OCR jobs directly.

# Phase 4: AI Pipelines (YOLO ROI-First & PaddleOCR)
## 1. YOLO-First ROI Detection Pipeline
Direct OCR processing of high-resolution full-frame images is computationally expensive and introduces accuracy errors due to background noise (such as text on station boards, advertisement wraps, safety decals, or serial labels). To address this, VandeInspect AI implements a YOLO-First ROI (Region of Interest) pipeline.
graph TD
    A[Full Frame Ingestion] --> B[YOLOv8 bogie Model]
    B -->|BBox Coordinates| C{"bogie Found"}
    C -->|Yes| D[Apply 15% Dynamic Padding]
    D --> E[Crop Region of Interest]
    E --> F[Pass 1: OCR on Raw BGR Crop]
    C -->|No| H[Full-Frame Preprocessing Fallback]
    
    F --> G{"Valid Train Number?"}
    G -->|Yes| I[Output Result]
    G -->|No| J[Pass 2: OCR on Preprocessed Crop]
    
    J --> K{"Valid Train Number?"}
    K -->|Yes| I
    K -->|No| L[Digit Substring Crop Fallback]
    
    L --> M{"Valid Train Number?"}
    M -->|Yes| I
    M -->|No| H
    
    H --> N[Full-Frame OCR Run]
    N --> I
### Why ROI is Faster and More Accurate
Dimension Reduction: Instead of running character recognition on a 5-Megapixel frame (), the system runs a fast YOLO detector to find the “bogie” box, reducing the search space to a cropped region of roughly  pixels.
GPU Optimization: YOLO inference takes  on a GPU. PaddleOCR execution on a small crop takes , compared to  on a full frame.
Noise Filtering: Cropping excludes text outside the coach’s serial number region, minimizing false positives.

## 2. Preprocessing & Dual-Pass OCR Engine
When the bogie region is cropped, the OCR service executes a dual-pass recognition pipeline to handle varying lighting conditions, dirt, and motion blur.

Diagram 5
### The Preprocessing Sequence
To maximize legibility, the OCR worker applies the following OpenCV operations during Pass 2: 1. Grayscale Conversion: Eliminates chromatic noise. 2. 2x Upscale (Bilinear Interpolation): Increases sub-pixel spacing for character segmentation. 3. Sharpening: Emphasizes edge transitions using a custom kernel:

4. CLAHE (Contrast Limited Adaptive Histogram Equalization): Normalizes lighting gradients without over-amplifying noise. 5. Gaussian Blur (): Smoothes out pixelation caused by upscaling.
import cv2
import numpy as np

def preprocess_frame(frame):
    # Convert BGR to Grayscale
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    # 2x Bilinear upscale
    gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_LINEAR)
    
    # Apply 2D sharpening filter
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    sharp = cv2.filter2D(gray, -1, kernel)
    
    # Contrast normalization via CLAHE
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(sharp)
    
    # Denoise with Gaussian blur
    return cv2.GaussianBlur(enhanced, (3, 3), 0)

## 3. Train Number Filtering & VoteManager
Text detected by PaddleOCR is filtered using custom regex validation and a voting buffer to ensure reliability.
### Validation Constraints
Regular Expression: ^\d{5,6}$ (matches standard Indian Railways 5- or 6-digit coach numbers).
Confidence Threshold: .
Digit Substring Fallback: If the raw text contains extra characters (e.g., "COACH 22345B"), the parser extracts digit-only substrings as a fallback.
### VoteManager Buffer
OCR predictions on single frames are prone to noise from paint scratches, shadows, or background elements. To prevent false writes, the system uses a cross-frame voting buffer (VoteManager): 1. Candidate numbers are stored in an active database pool. 2. An identifier is only written to the coaches table once it is detected at least 5 times across different frames.

## 4. CUDA Process Isolation
In early prototypes, running YOLO (PyTorch) and PaddleOCR (PaddlePaddle) within a single Python process on Windows caused instant crashes with exit code 0xC0000005 (Access Violation).
### Root Cause
Both libraries load conflicting C-level DLL wrappers for CUDA initialization. PyTorch ships cuDNN 9.x, while PaddlePaddle requires cuDNN 8.x DLLs (e.g., cudnn_ops_infer64_8.dll). Attempting to initialize both within the same process thread space corrupts the C++ runtime memory.
### Solution
The system uses process isolation: * The YOLO service runs as an isolated FastAPI app on port 5002. * The OCR service runs on port 5000, communicating with YOLO via localhost loopback HTTP requests. * On Windows hosts, the OCR service dynamically injects cuDNN 8.x DLL paths into Python’s DLL directory list at runtime to ensure compatibility:
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
This isolates the model runtime memory, enabling stable, GPU-accelerated parallel execution.

# Phase 5: Synchronization Engine
## 1. Why Timestamps Fail for Industrial Railway Inspection
In multi-camera wayside systems, traditional approaches attempt to align video feeds using CPU system clocks (timestamps). However, in high-speed industrial environments, timestamp-based alignment fails due to several factors:
Clock Drift: CPU system clocks on separate recording hosts drift relative to each other, introducing temporal errors of several milliseconds over short periods.
Network Jitter: IP-based GigE cameras experience packet delivery delays, causing frames to arrive at the capture cards at slightly variable intervals.
Variable Exposure and Frame Drops: Underbody cameras run at high frame rates (up to 120 FPS). Environmental factors (e.g., changes in lighting, dust) can trigger automatic exposure adjustments, leading to dropped frames that distort linear time offsets.
Speed Variations: Trains do not travel at a constant velocity past the inspection pit. A 200ms alignment error at 60 km/h shifts defect positions by 3.33 meters, assigning defects to the wrong bogies.

## 2. Deterministic trigger_id Synchronization Concept
To establish a reliable sync key across all cameras, VandeInspect AI uses a deterministic trigger_id sequence instead of time-based offsets.

Diagram 8
### 2.1 Production Mode (Hardware Sync Pulse)
In production deployment, the wayside inspection pit integrates a hardware sensor array (such as wheel-detecting induction sensors or laser barriers) connected to a centralized micro-controller.
As each axle passes the sensor, a hardware trigger pulse is generated. This electrical pulse is distributed to all camera units via General Purpose Input/Output (GPIO) lines. All cameras fire their global shutters simultaneously, ensuring that Frame  across all views captures the train at the exact same physical position. The hardware counter ID becomes the immutable trigger_id.
### 2.2 Test Mode (Video Upload Sync)
In test upload mode, the system aligns frames based on their position in the raw video file. The frame extractor sets:

Because the test videos are recorded simultaneously and aligned at the first frame, frame 500 in Camera 1 corresponds to frame 500 in Camera 2, providing a reliable reference for testing.

## 3. Gap Detection and Clustering Algorithm
The system maps frames to coaches by locating the physical gaps between coach structures (inter-coach gangways).

Diagram 7
### 3.1 Proximity-Based Clustering
As a train passes the camera, the space between coaches remains in view for multiple frames, resulting in consecutive gap detections. The sync engine clusters these detections using a proximity threshold (GAP_CLUSTER_RADIUS = 30 trigger IDs): 1. Detections within 30 frames of each other are grouped as the same physical gap. 2. For each cluster, the frame with the highest detection confidence is selected as the canonical gap boundary.
### 3.2 Timeline Segmentation
The clustered boundary trigger IDs partition the inspection session timeline into distinct coach segments:


## 4. Coach Range Mapping and OCR Anchoring
Once the timeline is divided into coach segments, the engine associates each segment with its physical coach identifier:
OCR Anchor Lookup: For each segment , the database is queried for OCR results within that segment’s trigger ID range.
Confidence-Weighted Selection: The engine selects the OCR candidate with the highest confidence score, preferring records marked as valid by the regex filter.
Fallback Labels: If a segment contains no valid OCR readings, the engine assigns a temporary label (e.g., UNKNOWN-1, UNKNOWN-2) based on its position in the train.
Frame Assignment: Every frame from all cameras (underbody, side, suspension, wheel) is mapped to its parent coach based on whether its trigger_id falls within the coach’s trigger range.

## 5. OCR Voting Fallback Algorithm
If YOLO misses the inter-coach gaps, the sync engine falls back to an OCR-voting algorithm to reconstruct the train structure.

Diagram 6
### Step-by-Step Fallback Execution
Deduplication: Valid OCR detections are sorted by trigger_id. If a frame has multiple OCR outputs, only the highest confidence result is kept.
Proximity Grouping: Consecutive frames that read the same coach number are grouped into a segment if the gap between them is within MAX_TRIGGER_GAP = 150 trigger IDs.
Voting Threshold: Segments are discarded if they accumulate fewer than 5 votes (MIN_VOTES = 5), preventing transient read errors from creating duplicate coach records.
Proximity Interpolation: Frames in the gaps between identified coach segments are assigned to the nearest coach. If the distance to the nearest segment exceeds , the frame remains unassigned.
Timeline Verification: The engine writes the results to the coach_frame_map table, tagging each row as either OCR_DIRECT (range match) or GAP_INTERPOLATION to maintain traceability.

# Phase 6: Database Design & Prisma Schema
## 1. Schema Overview
VandeInspect AI uses a relational schema designed in Prisma ORM and hosted on a Neon PostgreSQL server. The schema contains 19 models that organize the physical rail inspection process into logical, audit-safe structures.
The core relationship pattern is hierarchically aligned with physical objects:


Diagram 9

## 2. Table Design and Key Relationships
### 2.1 Inspection Sessions (inspection_sessions)
Main table managing the lifecycle of each train pass. * Fields: id (UUID), train_number (string), status (queued/extracting/ocr_running/analysing/completed/failed), health_score (decimal), and summary counters. * Indexes: Clustered index on train_number and status fields to speed up dashboard queries.
### 2.2 Pipeline Stages (pipeline_stages)
Tracks granular progress. * Fields: stage (e.g. frame_extraction, ocr_detection, synchronization, component_detection, defect_analysis, report_generation), status (pending/running/completed/failed), detail_message, and stats (JSON payload containing processed frame counters). * Constraints: Unique compound index on [session_id, stage] ensures stage records are not duplicated.
### 2.3 Frames (frames)
Individual physical images extracted from video feeds. * Fields: id, trigger_id (BigInt), cloudinary_url (string), is_ocr_candidate (boolean), and parent keys. * Indexes: Indexed on [session_id, trigger_id] to speed up database reads during the synchronization phase.
### 2.4 Coaches (coaches)
Logical coach boundaries identified by the synchronization engine. * Fields: id, coach_number, coach_index (integer sequence), start_trigger_id (BigInt), end_trigger_id (BigInt), and aggregates like health_score and critical_defects. * Relations: One-to-many relationship with frames (a coach contains many frames), and one-to-many with defects.
### 2.5 Coach Frame Map (coach_frame_map)
Resolves many-to-many linkages between frames and coaches. * Fields: assignment_method (GAP_BOUNDARY, OCR_DIRECT, or GAP_INTERPOLATION), and confidence. * Constraints: Unique key on frame_id ensures a frame is only assigned to one coach.
### 2.6 Defects (defects)
AI-identified anomalies on components. * Fields: id, defect_type (e.g. crack, rust, leakage, loose), severity (critical, high, medium, low), bbox_x/y/w/h (integers), and review_status (pending/approved/dismissed). * Relations: Linked to User for operator sign-offs, and ComponentDetection for component context.

## 3. Prisma Schema Reference
The core models are declared in Prisma syntax as follows:
model InspectionSession {
  id              String    @id @default(uuid()) @db.Uuid
  session_code    String?   @unique @db.VarChar(30)
  train_number    String    @db.VarChar(50)
  station_code    String?   @db.VarChar(20)
  camera_setup_id String?   @db.Uuid

  status                   String   @default("queued") @db.VarChar(30)
  progress_pct             Int      @default(0)
  total_coaches            Int?
  total_frames             Int?
  critical_defects         Int      @default(0)
  missing_components_count Int      @default(0)
  health_score             Decimal? @db.Decimal(5, 2)

  started_at    DateTime  @default(now()) @db.Timestamptz(6)
  completed_at  DateTime? @db.Timestamptz(6)
  error_message String?

  pipeline_stages      PipelineStage[]
  frames               Frame[]
  coaches              Coach[]
  defects              Defect[]
  report               Report?

  @@map("inspection_sessions")
}

model Frame {
  id                   String   @id @default(uuid()) @db.Uuid
  session_id           String   @db.Uuid
  session_camera_id    String   @db.Uuid
  coach_id             String?  @db.Uuid
  sequence_number      Int
  trigger_id           BigInt   // Unified physical synchronisation axis
  captured_at_ms       BigInt
  cloudinary_url       String
  cloudinary_public_id String

  session        InspectionSession @relation(fields: [session_id], references: [id], onDelete: Cascade)
  coach          Coach?            @relation("FrameToCoach", fields: [coach_id], references: [id])
  ocr_results    OcrResult[]
  defects        Defect[]

  @@map("frames")
}

model Coach {
  id                    String   @id @default(uuid()) @db.Uuid
  session_id            String   @db.Uuid
  coach_number          String   @db.VarChar(30)
  coach_index           Int?
  start_trigger_id      BigInt?
  end_trigger_id        BigInt?
  health_score          Decimal? @db.Decimal(5, 2)

  session   InspectionSession @relation(fields: [session_id], references: [id], onDelete: Cascade)
  frames    Frame[]           @relation("FrameToCoach")
  defects   Defect[]

  @@map("coaches")
}

## 4. Session State Lifecycles
+------------+      upload      +------------------+      complete      +-----------------+
|   QUEUED   | ---------------> | FRAME_EXTRACTION | -----------------> |   OCR_RUNNING   |
+------------+                  +------------------+                    +-----------------+
                                                                                 |
                                                                                 | complete
                                                                                 v
+------------+      complete    +------------------+      complete      +-----------------+
| COMPLETED  | <--------------- |    REPORTING     | <----------------- |    ANALYSING    |
+------------+                  +------------------+                    +-----------------+
      |                                                                          |
      +--------------------------> [FAILED] <------------------------------------+
                                (Any stage throws error)
The database tracks the pipeline state through a status machine: 1. queued: Session is created; videos are uploaded to the local disk. 2. extracting: Edge machine processes videos, uploading frames to Cloudinary and inserting records into the database. 3. ocr_running: Parallel OCR worker processes active candidate frames. 4. analysing: Gaps are clustered, frames mapped to coaches, and YOLO defect detection runs per coach. 5. completed: Defect severities are calculated, PDF reports generated, and final statistics aggregated. 6. failed: If any microservice throws an unhandled error, the state drops to failed and records the error message to help operators debug.

# Phase 7: API Documentation
## 1. REST API Interface Specification
The API gateway exposes REST endpoints on port 8001 to manage train sessions, retrieve inspection intelligence, and trigger reporting.
### 1.1 Ingestion & Session Management
POST /api/sessions/upload
Uploads raw video recordings and creates a new session. * Content-Type: multipart/form-data * Request Fields: * train_number (string, required): Train identifier (e.g. "22436"). * video_files[] (file, required): One or more video streams from trackside cameras. * frame_interval (string, optional): Downsample frame extraction rate (default: "5"). * Success Response (202 Accepted): json   {     "id": "78b50e2d-dc99-43ef-b387-052637738f61",     "session_code": "INS-2026-8942",     "status": "extracting",     "progress_pct": 0   }
POST /api/sessions/:id/process
Triggers the AI detection and synchronization pipeline. * Success Response (202 Accepted): json   {     "message": "OCR pipeline triggered",     "status": "ocr_running"   }
GET /api/sessions/:id
Retrieves the status and stages of an active session. * Success Response (200 OK): json   {     "id": "78b50e2d-dc99-43ef-b387-052637738f61",     "session_code": "INS-2026-8942",     "train_number": "22436",     "status": "analysing",     "progress_pct": 50,     "pipeline_stages": [       { "stage": "frame_extraction", "status": "completed" },       { "stage": "ocr_detection", "status": "completed" },       { "stage": "synchronization", "status": "running" }     ]   }

### 1.2 Inspection Intelligence
GET /api/sessions/:id/hierarchy
Retrieves the coach hierarchy mapping generated by the synchronization engine. * Success Response (200 OK): json   [     {       "id": "11a50e2d-dc99-43ef-b387-052637738f62",       "coach_number": "SEC-12834",       "coach_index": 1,       "start_trigger_id": "0",       "end_trigger_id": "180",       "total_frames": 36,       "ocr_confidence": 0.895     }   ]
GET /api/sessions/:id/coaches/:coachId/intelligence
Retrieves AI detections, defects, and missing component alerts for a specific coach. * Success Response (200 OK): json   {     "coach_id": "11a50e2d-dc99-43ef-b387-052637738f62",     "health_score": 92.00,     "defects": [       {         "id": "44b50e2d-dc99-43ef-b387-052637738f63",         "defect_type": "crack",         "severity": "CRITICAL",         "confidence": 0.854,         "bbox_x": 120, "bbox_y": 80, "bbox_w": 45, "bbox_h": 30,         "annotated_frame_url": "https://res.cloudinary.com/..."       }     ],     "missing_components": [       {         "component_code": "SP_SEC_02",         "component_name": "Secondary Suspension Spring",         "severity": "high"       }     ]   }

## 2. WebSocket Protocol Schema
Real-time pipeline updates are broadcast over a WebSocket connection at /ws using the following event formats.
### 2.1 Client Subscriptions
To receive updates for a session, the client sends a subscription message:
{
  "type": "subscribe",
  "sessionId": "78b50e2d-dc99-43ef-b387-052637738f61"
}
### 2.2 Server Broadcasts
Stage Transitions (stage_update)
Fires when a pipeline stage changes state.
{
  "type": "stage_update",
  "sessionId": "78b50e2d-dc99-43ef-b387-052637738f61",
  "stage": "ocr_detection",
  "status": "running",
  "message": "Queuing frames for OCR..."
}
Progress Metrics (progress_update)
Fires periodically to report stage progress.
{
  "type": "progress_update",
  "sessionId": "78b50e2d-dc99-43ef-b387-052637738f61",
  "stage": "ocr_detection",
  "processed": 120,
  "total": 350,
  "pct": 34
}
Coach Maps Completed (coaches_mapped)
Fires when the synchronization engine completes coach mapping.
{
  "type": "coaches_mapped",
  "sessionId": "78b50e2d-dc99-43ef-b387-052637738f61",
  "count": 16
}
Session Completed (session_completed)
Fires when the full pipeline completes and report data is compiled.
{
  "type": "session_completed",
  "sessionId": "78b50e2d-dc99-43ef-b387-052637738f61",
  "criticalDefects": 2,
  "healthScore": 88,
  "coaches": 16
}

# Phase 8: Report Generation & Cloudinary Integration
## 1. Automated Reporting Engine Architecture
Once the synchronization engine constructs the logical coach mapping and the correlation engine flags defects and missing components, the Fastify orchestrator initiates the reporting stage.
The Report Generator runs as an isolated python service that: 1. Loads the full session metadata, coaches, defects, and missing components from PostgreSQL. 2. Compiles a hierarchical JSON dataset representing the full state of the train. 3. Assembles an executive-grade PDF Inspection Report using the fpdf2 document library. 4. Uploads both assets to Cloudinary secure storage. 5. Returns secure HTTPS resource URLs to the database and frontend.
PostgreSQL Database
   |
   |-- [Query Session, Coaches, Defects, Missing Components]
   v
report_generator (Python)
   |
   |==> 1. Serializes to Structured JSON (builder.py)
   |==> 2. Generates PDF via fpdf2 (builder.py)
   v
Cloudinary Media Storage
   |
   |-- [Secure PDF & JSON Upload]
   v
Fastify Gateway / React UI (HTTPS links)

## 2. Structured JSON Serialization
The JSON report represents the canonical source of truth for downstream APIs, external rail inventory software, and system audits.
### JSON Schema Structure
{
  "report_version": "1.0",
  "generated_at": "2026-05-23T18:10:00Z",
  "session": {
    "id": "78b50e2d-dc99-43ef-b387-052637738f61",
    "session_code": "INS-2026-8942",
    "train_number": "22436",
    "status": "completed",
    "health_score": 92.5
  },
  "coaches": [
    {
      "coach_index": 1,
      "coach_number": "SEC-12834",
      "coach_type": "AC_CHAIR_CAR",
      "health_score": 90.0,
      "defects": [
        {
          "type": "crack",
          "severity": "CRITICAL",
          "confidence": 0.89,
          "bbox": [120, 80, 45, 30],
          "annotated_url": "https://res.cloudinary.com/..."
        }
      ]
    }
  ]
}

## 3. PDF Compilation via fpdf2
The PDF builder is written in Python, using fpdf2 to construct a document with clean typography, tables, and colors.
### Layout Elements
Header & Footer:
Every page has a standardized header: "VandeInspect AI — Automated Train Inspection Report".
The footer displays confidentiality warnings and page numbering: "Page X | Confidential — Indian Railways".
Executive Summary Dashboard:
Features a health score banner colored according to the train’s condition:
Green (Score ): Satisfactory condition.
Amber (Score ): Maintenance recommended.
Red (Score ): Critical anomalies; immediate workshop routing required.
Includes a KPI table summarizing total coaches, processed frames, defects, and missing parts.
Per-Coach Breakdown:
Iterates through the train coach-by-coach.
Displays tables listing defects, color-coded by severity:
CRITICAL: Bright Red (#DC2626)
HIGH: Vibrant Orange (#EA580C)
MEDIUM: Amber (#CA8A04)
LOW: Green (#16A34A)
Bullet points list missing components, highlighting the discrepancy between the expected count and the detected count.

## 4. Cloudinary Storage and Secure Serving
To manage high volumes of PDF reports and annotated defect images without consuming excessive local storage, the platform integrates with Cloudinary.
### Upload Implementation
The service uploads PDF and JSON buffers directly from memory using the Cloudinary Python SDK, avoiding temporary writes to local disk:
import io
import cloudinary.uploader

def upload_report(pdf_bytes: bytes, json_str: str, session_id: str) -> dict:
    base = f"vande/{session_id}/reports"
    
    # Upload binary PDF
    pdf_result = cloudinary.uploader.upload(
        io.BytesIO(pdf_bytes),
        public_id=f"{base}/inspection_report",
        resource_type="raw",
        overwrite=True
    )
    
    # Upload raw text JSON
    json_result = cloudinary.uploader.upload(
        io.BytesIO(json_str.encode()),
        public_id=f"{base}/inspection_report_data",
        resource_type="raw",
        overwrite=True
    )
    
    return {
        "pdf_url": pdf_result["secure_url"],
        "pdf_public_id": pdf_result["public_id"],
        "json_url": json_result["secure_url"],
        "json_public_id": json_result["public_id"],
    }
This offloads hosting from the backend API gateway. High-res annotated frames and report documents are served to operators globally via Cloudinary’s content delivery network (CDN).

# Phase 9: Architectural Decision Records (ADRs)
This section compiles the Architectural Decision Records (ADRs) that guided the design, development, and pivot points of the VandeInspect AI platform.

## ADR-001: Pivot from Express.js to Fastify for the API Gateway
### Context
The gateway API must handle concurrent video uploads, parse multi-part form data, stream frames, manage WebSocket clients, and coordinate microservice requests. Early benchmarks with Express.js showed high routing overhead, slower JSON serialization under load, and callback complexity when handling stream pipelines.
### Decision
Fastify was selected for the API gateway. 1. Low Overhead: Fastify scales to  requests/sec with minimal CPU utilization. 2. Schema Compilation: Fastify uses compiled JSON schemas for input validation and output serialization, reducing CPU overhead during API response generation. 3. Structured Logging: Built-in integration with the Pino logger provides structured JSON logs, facilitating log parsing in production. 4. Plugin Ecosystem: Native plugins for CORS, multipart forms (@fastify/multipart), and WebSockets (@fastify/websocket) provide a unified, highly optimized middleware stack.

## ADR-002: Pivot from RabbitMQ to Direct HTTP Loopback Orchestration
### Context
The initial design proposed using a RabbitMQ message broker to distribute frames to YOLO and OCR workers. While robust, this architecture introduced significant complexity: * Setting up and maintaining a local RabbitMQ instance on edge inspection PCs. * Serialization overhead from packaging binary frames into AMQP message payloads. * Increased troubleshooting complexity for on-site operators.
### Decision
Microservice orchestration was simplified to use direct HTTP loopback requests over localhost, with concurrency managed by the Fastify gateway. 1. Sliding-Window Concurrency: The Fastify orchestrator limits requests to OCR_CONCURRENCY = 4 using standard promise pools (Promise.allSettled). 2. Direct Worker DB Writes: Workers write OCR results and defect coordinates directly to the Neon PostgreSQL database using SQLAlchemy/psycopg2, bypassing Node.js gateway serialization overhead. 3. Lower System Overhead: Eliminating the message broker simplifies setup on Edge machines and reduces runtime memory usage.

## ADR-003: CUDA Runtime DLL Path Injection (Process Isolation)
### Context
Running YOLO (PyTorch) and PaddleOCR (PaddlePaddle) within a single Python process on Windows hosts caused immediate crashes:
Exit code: 0xC0000005 (Access Violation)
This was caused by conflicting CUDA runtimes: PyTorch requires cuDNN 9.x, while PaddlePaddle requires cuDNN 8.x DLLs (cudnn_ops_infer64_8.dll). Attempting to load both into a single process’s memory space caused memory corruption.
### Decision
Process Isolation: The YOLO service and the OCR service run in separate OS processes on distinct localhost ports (5002 and 5000).
Dynamic DLL Injection: At startup, the OCR service checks if it is running on Windows and dynamically injects the cuDNN 8.x bin path into the system’s DLL lookup directory before initializing PaddleOCR:
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

## ADR-004: Pivot from CPU Timestamps to Unified trigger_id
### Context
Aligning video feeds using CPU system clocks (timestamps) proved unreliable. Network jitter, variable video encoding frame rates, camera driver delays, and changes in train speed introduced alignment errors of up to 500ms. At a velocity of 60 km/h, a 500ms delay shifts the calculated position of a defect by 8.3 meters, resulting in defects being mapped to the wrong coaches.
### Decision
The system was pivoted to use a unified physical coordinate system: trigger_id. 1. Production Mode: A physical wheel sensor generates electrical trigger pulses that trigger all camera shutters simultaneously. The pulse count serves as the unified trigger_id. 2. Test Mode: Frame extraction uses the raw video frame index:

3. Accuracy: Physical synchronization ensures frame alignment is independent of train speed, frame drops, or network latency, guaranteeing sub-centimeter accuracy for defect mapping.

## ADR-005: Dual-Pass OCR Pipeline with Preprocessing
### Context
Single-pass OCR on cropped images yielded poor results on dirty, faded, or motion-blurred coach numbers. However, applying intensive image preprocessing to every frame significantly increased pipeline processing time.
### Decision
Implement a dual-pass OCR pipeline to balance accuracy and processing speed: 1. Pass 1 (Fast): Run PaddleOCR directly on the raw BGR crop. If a valid 5-6 digit coach number is detected, return the result immediately. 2. Pass 2 (Enhanced Fallback): If Pass 1 fails, apply a preprocessing chain (grayscale, 2x upscale, sharpening, CLAHE, and Gaussian blur) to improve character contrast before running PaddleOCR again. 3. Full-Frame Fallback: If the crop fails to yield a result, run Pass 2 on the entire frame as a final fallback. This approach preserves processing speed for clear frames while applying intensive enhancement steps only when needed.

# Phase 10: Troubleshooting, Debugging & Incident Logs
This section compiles technical analysis for major debugging incidents resolved during the development and testing of the VandeInspect AI platform.

## Incident 1: PaddleOCR OpenMP / OneDNN Crash on Windows
### Symptom
When starting the OCR microservice on Windows testing environments, the Python process crashed during PaddleOCR initialization, yielding the following error:
OMP: Error #15: Initializing libiomp5md.dll, but found libiomp5md.dll already initialized.
OMP: Hint: This means that multiple copies of the OpenMP runtime have been 
linked into the program. That is dangerous, but it can be bypassed by setting
the KMP_DUPLICATE_LIB_OK environment variable to TRUE.
### Root Cause
PaddlePaddle and OpenCV both package their own compiled version of Intel’s OpenMP library (libiomp5md.dll). When PaddlePaddle attempts to initialize its tensor computation graph, it loads its OpenMP runtime. If OpenCV has already loaded its copy to accelerate image filtering, the duplicate runtime initialization triggers a safety exit in the Intel OpenMP driver, crashing the process.
### Resolution
Environment Configuration: Added the duplicate library bypass flag to GPU/ocr/.env:
KMP_DUPLICATE_LIB_OK=TRUE
Import Ordering: Restructured ocr_engine.py to import cv2 before loading PaddlePaddle extensions, allowing OpenCV’s runtime to initialize first.

## Incident 2: YOLOv8 Startup Path Resolution Errors on Windows
### Symptom
The YOLO service failed to start, throwing FileNotFoundError or relative path resolution errors when attempting to load the custom trained weights:
ultralytics.utils.exceptions.HUBModelError: Model path 'weights/best.pt' not found.
### Root Cause
On Windows hosts, differences in path separator characters (backslashes \ vs forward slashes /) and varying current working directories (CWD) based on how the FastAPI service was launched (e.g., from the project root directory vs the service directory) caused relative paths to resolve incorrectly.
### Resolution
Updated GPU/yolo/server.py to resolve weight paths dynamically using absolute system paths relative to the file’s directory:
import os

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(CURRENT_DIR, "weights", "train_num_detector.pt")

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"YOLO model weights not found at absolute path: {MODEL_PATH}")

## Incident 3: Video Framing / Frame Extraction Mismatch
### Symptom
The frame extraction stage crashed with index out of bounds errors or produced blank frames when processing certain test video files:
cv2.error: OpenCV(4.8.0) ERROR: Frame index 3540 exceeds total frames 3500.
### Root Cause
The frame extraction service used the video’s average FPS metadata to calculate downsampling offsets. However, raw smartphone videos and consumer camera feeds often use Variable Frame Rate (VFR) encoding. For these files, the metadata’s average FPS is inaccurate, causing the calculated frame indexes to exceed the actual frame count.
### Resolution
Modified the extraction routine in frame_extractor to determine frame limits dynamically using OpenCV properties rather than FPS math, and added boundary constraints:
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

## Incident 4: False Positive Defect Detections from Glare
### Symptom
Underbody cameras flagged numerous “structural cracks” on shiny metal brackets and suspension components, generating high false-alarm rates.
### Root Cause
Bright overhead light-emitting diode (LED) panels in the inspection pit reflected off wet surfaces, creating high-contrast light reflections. The YOLO object detector, trained on static images, misidentified these high-contrast edges as structural cracks.
### Resolution
Training Augmentation: Retrained the YOLO defect model using training sets augmented with high-contrast brightness changes, simulating glare conditions.
Edge Processing Thresholds: Increased the confidence threshold for defect detections in glare-prone regions from 0.25 to 0.55 to filter out reflections.
Multi-Frame Verification: Configured the pipeline to verify defect detections across multiple consecutive frames, ensuring that reflections (which shift as the train moves) are not flagged as stationary defects.

# Phase 11: DevOps & Production Operations Manual
This document provides installation, configuration, deployment, and operational procedures for the VandeInspect AI platform.

## 1. Prerequisites and System Requirements
### 1.1 Edge Inspection Nodes (Wayside Station)
OS: Windows 10/11 Enterprise LTSC or Ubuntu 20.04/22.04 LTS.
CPU: Intel Xeon or Core i7 (6+ Cores, 3.5 GHz base).
GPU: NVIDIA RTX 3080 / RTX 4080 (or workstation equivalent with 16 GB+ VRAM).
Memory: 32 GB DDR4/DDR5.
Storage: 1 TB NVMe SSD (minimum write speed 3000 MB/s to handle raw GigE frame extraction).
CUDA Toolkits: CUDA 11.8 or 12.1, cuDNN v8.9.x.
### 1.2 Central Cloud Server (Management Dashboard)
Databases: Neon Serverless PostgreSQL instance (v15+).
Storage: Cloudinary account for media hosting.

## 2. Environment Variables Configuration
The platform requires configuration across the Gateway and Python microservices.
### 2.1 Backend Gateway (backend/.env)
PORT=8001
NODE_ENV=production
FRONTEND_URL=http://localhost:5173
DATABASE_URL="postgresql://user:pass@ep-host.region.pooler.neon.tech/vandeinspect?sslmode=require"
CLOUDINARY_CLOUD_NAME=d...
CLOUDINARY_API_KEY=1...
CLOUDINARY_API_SECRET=e...
### 2.2 OCR Microservice (GPU/ocr/.env)
DATABASE_URL="postgresql://user:pass@ep-host.region.pooler.neon.tech/vandeinspect?sslmode=require"
YOLO_SERVICE_URL="http://127.0.0.1:5002/api/yolo/predict_train_number"
OCR_DEVICE=gpu
KMP_DUPLICATE_LIB_OK=TRUE
### 2.3 YOLO Microservice (GPU/yolo/.env)
PORT=5002
YOLO_DEVICE=cuda

## 3. Installation and Deployment Steps
Follow this execution sequence to deploy the VandeInspect suite:

Diagram 10
### Step 1: Database Migration
Verify your PostgreSQL database connection in the Gateway environment, then push the database schema using Prisma:
cd backend
npm install
npx prisma db push
### Step 2: Set Up Python Microservices
Create virtual environments and install dependencies for the isolated Python workers:
OCR Service Setup
cd GPU/ocr
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux:
source venv/bin/activate
pip install -r requirements.txt
# Ensure CUDA support is configured
pip install nvidia-cudnn-cu12==8.9.7.29
YOLO Service Setup
cd ../yolo
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux:
source venv/bin/activate
pip install -r requirements.txt

## 4. Run Procedures (Startup Sequences)
To ensure proper startup synchronization, launch services in the following order.
### 1. Launch the YOLO Service
The YOLO service processes requests from both the OCR crop worker and the defect detection pipeline.
cd GPU/yolo
venv\Scripts\activate
python server.py
Verify: Command output should confirm: Running on http://127.0.0.1:5002.
### 2. Launch the OCR Service
cd GPU/ocr
venv\Scripts\activate
python server.py
Verify: Console output should log the CUDA device: PaddleOCR initialized on gpu.
### 3. Start the Backend API Gateway
cd backend
npm start
### 4. Start the Frontend Application
cd frontend
npm install
npm run dev

## 5. Operations & Monitoring
### 5.1 System Health Checks
Use the gateway’s health endpoint to verify database connectivity:
curl http://localhost:8001/api/health
Expected Response:
{
  "status": "healthy",
  "database": "connected"
}
### 5.2 Log Analysis
All backend logs are saved in JSON format using Pino, allowing you to search for pipeline errors:
tail -f backend/logs/app.log | grep -E "(error|fail)"

# Phase 12: Future Roadmap & Scaling Strategy
This document outlines the strategic engineering roadmap for scaling the VandeInspect AI platform from local edge prototypes to a distributed, nationwide rail inspection network.

## 1. Short-Term Scaling (v1.1 - v1.2)
### 1.1 Transition to a Distributed Message Broker (RabbitMQ / Kafka)
While the current direct HTTP loopback approach simplifies initial setup, scaling to handle multiple inspection bays requires a decoupled architecture. * Implementation Plan: Replace direct Fastify HTTP calls with a RabbitMQ AMQP exchange or Apache Kafka event stream. * Benefit: The Gateway will publish FRAME_READY events, allowing a cluster of local worker machines to pull and process frames in parallel. This prevents bottlenecks and ensures the system can continue processing during high-volume periods.
### 1.2 Local Offline S3 Storage (MinIO)
To operate reliably in remote rail workshops with limited internet connectivity, edge nodes must remain fully functional offline. * Implementation Plan: Replace external Cloudinary API uploads with a local MinIO server hosted on the edge machine. * Benefit: High-resolution frames and video assets are saved locally. When internet connectivity is detected, the edge node synchronizes the PDF reports and metadata to the central database, keeping raw videos offline to conserve bandwidth.

## 2. Medium-Term Infrastructure Optimization (v1.5)
### 2.1 Model Optimization via NVIDIA TensorRT
To support higher train speeds (above 80 km/h) at wayside stations, frame processing times must be reduced to under 10ms. * Implementation Plan: Export YOLOv8 and PaddleOCR models to NVIDIA TensorRT engine formats (.engine). * Benefit: Compiling the models directly to GPU instructions accelerates inference speed. YOLOv8 execution times drop from 20ms to , while PaddleOCR crop reads run in .
### 2.2 Kubernetes Deployment Orchestration (K3s)
For large-scale yards with multiple wayside pits and terminal dashboards, managing local service instances becomes complex. * Implementation Plan: Pack the gateway, python services, and local databases into Docker containers managed by a lightweight K3s (Kubernetes) cluster on-site. * Benefit: Provides automated self-healing (restarting failed workers), simple service updates, and dynamic scaling of GPU resources based on queue sizes.

## 3. Long-Term Research & Development (v2.0)
### 3.1 Sensor Fusion with 3D Laser Profilers
Camera feeds are excellent for detecting surface anomalies, but cannot measure physical wear in sub-millimeter detail. * Implementation Plan: Integrate 3D Laser Profilers alongside underbody cameras. * Benefit: This enables the system to measure brake disc thickness, wheel tread wear, and gear case alignment with sub-millimeter accuracy, combining visual defect flags with precise physical measurements.

Diagram 11
### 3.2 Workshop-Wide Federated Learning
Training a single global model is difficult due to regional variations in track dust, lighting conditions, and camera equipment. However, moving raw inspection videos to a central cloud server is bottlenecked by bandwidth constraints. * Implementation Plan: Implement Federated Learning across inspection yards. * Benefit: Models are trained locally at each workshop using on-site GPU resources. Only the resulting model weight adjustments (updates) are sent to a central server to improve the global model. This allows the system to continuously improve accuracy while keeping large video files stored locally.

| Limitation Area | Manual Inspection | Traditional Wayside Inspection |
| --- | --- | --- |
| Inspection Latency | Extremely High: A full physical walkthrough of a 16-coach Vande Bharat train takes 60 to 90 minutes. | High: Videos are captured but must be manually transferred and reviewed post-run. |
| Subjectivity & Human Error | High: Under poor lighting or technician fatigue, micro-cracks or missing safety split-pins are easily missed. | High False-Alarm Rates: Simple rule-based vision algorithms trigger alarms on color changes, shadows, or dirt. |
| Bogie-to-Defect Mapping | Manual Logging: Defects are logged on paper clipboards; matching a defect to coach SEC-22345 is prone to transcription errors. | No Logical Association: The video is stored as a raw file. To find a defect, technicians must estimate timestamps. |
| Temporal Alignment | N/A | Timestamp Drift: Multi-camera systems align footage using CPU system clocks. Network latency and frame drops cause multi-second drifts. |
| Scalability | Linear Cost: Inspecting more trains requires hiring more certified engineers, creating operational bottlenecks. | High Computational Overhead: Systems try to run OCR and object detection on full high-res frames concurrently, crashing GPUs. |