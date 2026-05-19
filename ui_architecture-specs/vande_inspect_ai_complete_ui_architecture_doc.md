# VANDE_INSPECT_AI — COMPLETE UI/UX ARCHITECTURE DOCUMENT

## Vision

The platform is NOT a normal dashboard.

This is an:
- Industrial AI Inspection Platform
- Railway Operations Intelligence System
- Multi-camera Evidence Management Platform
- Real-time Computer Vision Monitoring System

The UI must feel:
- operational
- real-time
- train-centric
- evidence-oriented
- scalable
- audit-safe

NOT:
- CRUD dashboard
- admin template
- upload-and-process tool
- developer utility panel

---

# CORE PRODUCT PHILOSOPHY

The system revolves around:

# TRAIN INSPECTION SESSION

NOT:
- OCR job
- YOLO run
- frame batch
- processing stage

The user thinks:

```text
Train Arrived
→ Processing Started
→ Coaches Identified
→ Frames Categorized
→ Defects Found
→ Report Generated
```

So the UI must always maintain:

```text
Train
→ Coach
→ Camera
→ Frame
→ Component
→ Defect
→ Report
```

---

# ACTUAL PIPELINE FLOW

The REAL backend processing flow:

```text
1. Frame Extraction
2. OCR Detection
3. Synchronization & Coach Mapping
4. Component + Defect Detection
5. Report Generation
```

---

# IMPORTANT SYNCHRONIZATION LOGIC

This is the MOST IMPORTANT architectural concept in the platform.

## Real-world Working

The cameras are hardware/event synchronized.

When trigger-based capture happens:

- every camera captures frames simultaneously
- timestamps/triggers are aligned
- BUT the system still does NOT know:

```text
Which frame belongs to which coach?
```

That mapping happens later.

---

# WHY OCR COMES BEFORE SYNCHRONIZATION

The OCR system identifies:
- coach numbers
- bogie numbers
- identification markers

The synchronization system then uses:
- trigger events
- frame timestamps
- inter-coach gaps
- OCR detection points

To determine:

```text
Frames between Gap A and Gap B
belong to Coach B2
```

This means:

# Synchronization Stage = Frame Categorization Engine

This stage:
- groups frames per coach
- aligns cameras
- builds hierarchy
- creates frame ownership
- prepares evidence structure

This is NOT just timestamp syncing.

This is:

# Train Intelligence Mapping

---

# FINAL PROCESSING FLOW

```text
Train Arrives
   ↓
Hardware Trigger Capture
   ↓
Frame Extraction
   ↓
OCR Detection
   ↓
Gap Detection
   ↓
Synchronization & Coach Mapping
   ↓
Hierarchical Frame Organization
   ↓
Component Detection
   ↓
Defect Detection
   ↓
AI Correlation
   ↓
Report Generation
```

---

# FINAL PAGE ARCHITECTURE

The platform should contain:

# OPERATIONS

```text
/dashboard
/live-queue
/sessions
```

# TRAIN WORKSPACE

```text
/train/:sessionId
```

# SYSTEM & INFRA

```text
/analytics
/system-health
/camera-monitoring
/gpu-workers
```

# ADMIN

```text
/settings
/models
/thresholds
/audit-logs
/users
```

---

# MAIN NAVIGATION STRUCTURE

```text
Dashboard
Live Queue
Inspections
Reports
Analytics
Infrastructure
Settings
```

---

# 1. OPERATIONS DASHBOARD

## Purpose

The dashboard is:
- operational monitoring
- train queue management
- processing visibility
- health monitoring

NOT deep inspection.

---

# DASHBOARD LAYOUT

```text
------------------------------------------------
Top Navbar
------------------------------------------------
KPI Overview Strip
------------------------------------------------
Live Train Queue
------------------------------------------------
Pipeline Health
------------------------------------------------
Recent Critical Alerts
------------------------------------------------
Recent Inspection Sessions
------------------------------------------------
```

---

# KPI OVERVIEW STRIP

```text
------------------------------------------------
Trains Today        48
Reports Ready       31
Processing          12
Queued              5
Critical Alerts     3
Failed Sessions     1
------------------------------------------------
```

---

# LIVE TRAIN QUEUE

Each train card:

```text
------------------------------------------------
Train: VB-22901
Started: 08:41 PM
Status: Processing
Progress: 72%

✓ Frame Extraction
✓ OCR Detection
~ Synchronization Running
• Component Detection Pending
• Report Pending

Detected:
14 Coaches
2 Critical Defects
OCR Confidence: 96%

[Open Workspace]
------------------------------------------------
```

---

# IMPORTANT UI PRINCIPLE

Never expose backend jargon.

BAD:

```text
YOLO Worker Active
```

GOOD:

```text
Analyzing suspension assemblies...
```

---

# PIPELINE STATUS STATES

| State | Meaning |
|---|---|
| Queued | Waiting for processing |
| Extracting | Frames being extracted |
| OCR Running | Coach identification running |
| Synchronizing | Mapping frames to coaches |
| Analysing | Components/defects being analysed |
| Correlating | AI matching evidence |
| Review Ready | Awaiting operator review |
| Completed | Report finalized |
| Failed | Manual review needed |

---

# 2. TRAIN SESSION MANAGER

This replaces:

```text
Active Session Dropdown
```

Dropdowns do not scale.

---

# INSPECTION SESSIONS PAGE

Table:

| Train | Start Time | Status | Coaches | Defects | Report |
|---|---|---|---|---|---|
| VB22901 | 08:41 PM | Processing | 14 | 2 | Pending |
| NDLS1202 | 07:12 PM | Completed | 18 | 0 | Ready |

---

# FILTERS

```text
Date
Train Number
Status
Defect Severity
Camera Setup
OCR Confidence
Report Status
```

---

# ROW ACTIONS

```text
[Open Workspace]
[Open Report]
[Replay Inspection]
```

---

# 3. TRAIN WORKSPACE

This is the MAIN PRODUCT.

Everything revolves around this page.

The current POC separates:
- framing page
- OCR page
- detection page
- report page

That is NOT scalable.

Instead:

# ONE UNIFIED TRAIN WORKSPACE

---

# TRAIN WORKSPACE LAYOUT

```text
------------------------------------------------
Train Header
------------------------------------------------
Pipeline Timeline
------------------------------------------------
Left Hierarchy Panel
Center Evidence Viewer
Right Intelligence Panel
------------------------------------------------
Bottom Timeline / Frame Strip
------------------------------------------------
```

---

# TRAIN HEADER

Contains:

```text
Train Number
Session ID
Started Time
Current Status
Total Coaches
Frames Captured
Critical Defects
Export Report
```

---

# PIPELINE TIMELINE

This replaces:

```text
Video Framing → OCR → Detection
```

Final production flow:

```text
FRAMES → OCR → SYNCHRONIZATION → COMPONENTS → DEFECTS → REPORT
```

Each stage:
- clickable
- expandable
- live status aware
- progress aware

---

# STAGE DETAILS

## 1. FRAME EXTRACTION

Purpose:
- convert videos to frames
- maintain timestamps
- preserve trigger metadata

UI shows:

```text
Frames Extracted: 14,221
Cameras Active: 6
Dropped Frames: 0
Frame Rate: 240 FPS
```

---

## 2. OCR DETECTION

Purpose:
- identify coach numbers
- identify bogie numbers
- detect textual train identifiers

UI shows:

```text
Coach Identifiers Detected
OCR Confidence
Best OCR Frames
Uncertain OCR Matches
```

---

## 3. SYNCHRONIZATION & COACH MAPPING

THIS IS THE MOST IMPORTANT STAGE.

Purpose:
- align all camera streams
- detect inter-coach gaps
- assign frames to coaches
- create hierarchical evidence structure

This stage builds:

```text
Train
 → Coach
   → Camera
     → Frames
```

This is where frame management happens.

---

# SYNCHRONIZATION VIEW

## Layout

```text
Camera Timeline
--------------------------------
CAM_A | ████████████████
CAM_B | ████████████████
CAM_C | ████████████████
```

---

# GAP DETECTION VISUALIZATION

```text
Coach Gap Detected
↓
Frames between Gap A and Gap B
Assigned to Coach B2
```

---

# SYNCHRONIZATION OUTPUT PANEL

```text
Total Coaches Mapped: 14
Frames Categorized: 14,221
Unassigned Frames: 21
OCR Anchors Used: 14
Synchronization Confidence: 98%
```

---

# WHY THIS PAGE IS CRITICAL

This stage converts:

```text
Raw Frames
```

Into:

```text
Structured Train Intelligence
```

---

# 4. COMPONENT + DEFECT DETECTION

Purpose:
- identify components
- validate expected components
- detect anomalies
- detect defects

---

# DETECTION WORKSPACE

## LEFT PANEL

```text
Detection Controls
Model Information
Thresholds
Camera Selection
```

---

## CENTER VIEWER

Shows:
- synchronized frame
- AI overlays
- bounding boxes
- defect highlights

---

# AI OVERLAYS

Examples:

```text
Brake Assembly
Suspension
Water Tank
Axle
Wheel
```

Defects:

```text
⚠ Missing Bolt
⚠ Crack
⚠ Loose Component
⚠ Missing Pin
```

---

# RIGHT INTELLIGENCE PANEL

Contains:

```text
Detected Components
Missing Components
Confidence Scores
Criticality
AI Notes
```

---

# EXPECTED vs DETECTED COMPONENT PANEL

| Component | Expected | Detected | Status |
|---|---|---|---|
| Brake Pad | Yes | Yes | ✓ |
| Suspension Pin | Yes | No | ⚠ Missing |
| Water Tank | Yes | Yes | ✓ |

---

# THIS IS VERY IMPORTANT

Because the system is NOT just:

```text
Object Detection
```

It is:

# Structural Compliance Validation

---

# COMPONENT DETAIL VIEW

When user clicks a component:

```text
Brake Assembly
--------------------------------
Detected In:
- 14 frames
- 3 cameras

Confidence:
94%

Issues:
- crack detected
- missing bolt

AI Notes:
Shape mismatch in lower bracket.
```

---

# 5. REPORT GENERATION

Purpose:
- summarize inspection
- create audit-ready evidence
- produce train-level report

NOT frame-level report.

---

# REPORT PAGE STRUCTURE

## Summary Section

```text
Train Number
Inspection Duration
Total Coaches
Frames Analysed
Critical Defects
Overall Health
```

---

# COACH BREAKDOWN

```text
Coach B1
- OCR Confidence
- Components Missing
- Defects
- Cameras Used
- Frame Count
```

---

# DEFECT EVIDENCE SECTION

Every defect should include:
- frame image
- bounding boxes
- timestamps
- AI reasoning
- camera source
- confidence score
- linked coach

---

# TRACEABILITY PRINCIPLE

Every report must maintain:

```text
Defect
→ Component
→ Frame
→ Camera
→ Timestamp
→ Coach
→ Train
```

---

# LEFT HIERARCHY PANEL

This is the MOST IMPORTANT navigation system.

---

# HIERARCHICAL STRUCTURE

```text
Train
 ├── Coach B1
 │    ├── OCR
 │    ├── Components
 │    ├── Defects
 │    ├── Cameras
 │    └── Frames
 │
 ├── Coach B2
 ├── Coach B3
```

---

# EXPANDED VIEW

```text
Coach B1
 ├── OCR Frames (23)
 ├── Component Frames (140)
 ├── Missing Components
 ├── Detected Defects
 └── Timeline
```

---

# WHY THIS IS IMPORTANT

This solves:
- frame chaos
- random navigation
- disconnected OCR
- disconnected defects
- camera confusion

Now everything becomes contextual.

---

# FRAME EXPLORER

The platform requires:

# MULTI-LEVEL FRAME ORGANIZATION

---

# STRUCTURE

```text
Train
 → Coach
   → Camera
      → Frames
```

---

# CAMERA GROUPING

Example:

```text
Coach B2
 ├── OCR Camera
 ├── Left Assembly Camera
 ├── Right Assembly Camera
 ├── Bottom Inspection Camera
```

---

# FILTER PANEL

```text
Camera
Coach
Defect Type
Component
Timestamp
OCR Match
Confidence
Severity
Missing Components
```

---

# SMART FRAME COLLECTIONS

System auto-generates:

```text
Best OCR Frames
Critical Defect Frames
Missing Component Frames
Low Confidence Frames
Review Required Frames
```

---

# EVIDENCE VIEWER MODES

| Mode | Purpose |
|---|---|
| Raw View | Original synchronized frame |
| OCR View | Coach number evidence |
| Component View | Bounding boxes |
| Defect View | Defect overlays |
| Compare View | Multi-camera comparison |
| Timeline View | Temporal analysis |

---

# BOTTOM TIMELINE STRIP

Acts like:
- video editor
- CCTV timeline
- evidence browser

Features:
- frame scrubbing
- synchronized playback
- camera comparison
- defect jump markers

---

# DEFECT MANAGEMENT CENTER

Defects must become actionable.

---

# DEFECT TABLE

| Coach | Component | Defect | Severity | Confidence | Status |
|---|---|---|---|---|---|
| B2 | Brake Pad | Crack | Critical | 94% | Review |
| B5 | Suspension | Missing Pin | Medium | 82% | Approved |

---

# DEFECT ACTIONS

Clicking a defect opens:
- exact frame
- synchronized cameras
- OCR evidence
- timestamps
- AI overlays
- related components
- review history

---

# SYSTEM MONITORING PAGES

## Analytics

Shows:

```text
Trains Processed
Average OCR Accuracy
Synchronization Accuracy
GPU Utilization
Defect Trends
Failure Rates
Camera Health
```

---

# CAMERA MONITORING

Shows:
- active cameras
- sync health
- dropped frames
- hardware trigger integrity
- latency

---

# GPU WORKER MONITORING

Shows:
- inference queues
- active jobs
- processing throughput
- memory usage

---

# ADMIN PANEL

Contains:

```text
Models
Thresholds
Users
Roles
Audit Logs
Camera Mapping
System Settings
```

---

# UI DESIGN LANGUAGE

The UI should feel like:

- industrial AI platform
- railway operations software
- computer vision intelligence system
- inspection control room

NOT:
- startup SaaS dashboard
- CRM
- admin panel template

---

# DESIGN RECOMMENDATIONS

## Theme

Dark theme preferred.

Reason:
- easier for frame inspection
- better for industrial environments
- better visual focus
- easier defect highlighting

---

# COLOR SYSTEM

| Type | Suggested Color |
|---|---|
| Normal | Blue / Neutral |
| Success | Green |
| Warning | Yellow |
| Critical | Red |
| Processing | Cyan |

---

# MICROINTERACTIONS (MANDATORY)

Required throughout system:

- hover states
- frame highlight transitions
- defect pulse animation
- synchronization timeline animations
- progress transitions
- camera selection feedback

---

# LOADING STATES (MANDATORY)

Every heavy operation must show:

```text
Synchronizing frames...
Mapping coaches...
Analyzing brake assembly...
Generating report...
```

NOT generic spinners.

---

# ERROR STATES (MANDATORY)

Examples:

```text
OCR confidence too low.
Manual verification required.
```

```text
Synchronization incomplete.
12 frames could not be mapped.
```

---

# TOASTS (MANDATORY)

Examples:

```text
Report generated successfully.
```

```text
Synchronization completed.
14 coaches identified.
```

---

# TAB ACCESSIBILITY (MANDATORY)

Entire platform must support:
- keyboard navigation
- tab traversal
- focus indicators
- accessibility-friendly controls

---

# PERFORMANCE REQUIREMENTS

The platform will process:
- thousands of HD frames
- multiple synchronized cameras
- real-time overlays

So frontend requires:

```text
Virtualized frame lists
Lazy loading
Canvas/WebGL rendering
Progressive image loading
Frame chunking
```

---

# RECOMMENDED FRONTEND STACK

| Area | Recommendation |
|---|---|
| Frontend | Next.js |
| State | Zustand |
| Live Updates | Socket.IO |
| Tables | TanStack Table |
| Frame Rendering | Canvas/WebGL |
| Virtualized Galleries | react-virtualized |
| Timeline | custom canvas timeline |
| Image Zoom | OpenSeadragon |

---

# FINAL UX PRINCIPLE

At ALL times the operator must know:

```text
Which train?
Which coach?
Which camera?
Which frame?
Which defect?
Which component?
What status?
```

Without confusion.

That is what makes the system production-grade.

