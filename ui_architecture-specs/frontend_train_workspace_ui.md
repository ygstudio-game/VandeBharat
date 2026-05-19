# VandeBharat AI Train Workspace UI Specifications

This is the CORE PRODUCT of the entire platform (`/train/:sessionId`). It provides an AI-powered train intelligence workspace and synchronized evidence management system. 

**Important Principle:** Everything revolves around this page. It unifies the framing, OCR, synchronization, detection, and reporting phases into a single workspace.

## 1. Layout Structure

```text
------------------------------------------------
Train Header
------------------------------------------------
Pipeline Timeline
------------------------------------------------
Left Hierarchy Panel  |  Center Evidence Viewer  |  Right Intelligence Panel
------------------------------------------------
Bottom Timeline / Frame Strip
------------------------------------------------
```

## 2. Train Header

The top section contains operational train context.
**Elements:**
- Train Number (e.g., VB22901)
- Session ID
- Started Time
- Current Processing Status
- Total Coaches
- Frames Captured & Cameras Active
- Critical Defects
- Synchronization/OCR Confidence
- Export Report Button & Replay Inspection Button

**Styling:** Compact industrial top bar with telemetry-like metrics and live status pulsing.

## 3. Pipeline Timeline

A horizontal, clickable timeline displaying the progress of the 6 pipeline stages:
1. `FRAME EXTRACTION`
2. `OCR DETECTION`
3. `SYNCHRONIZATION & COACH MAPPING` (The most critical stage)
4. `COMPONENT DETECTION`
5. `DEFECT ANALYSIS`
6. `REPORT GENERATION`

Each stage should be clickable, expandable, and visually indicate progress, warnings, and confidence levels.

## 4. Left Hierarchy Panel

This is the PRIMARY NAVIGATION SYSTEM within the workspace. It organizes the synchronized evidence contextually.

**Hierarchy Structure:**
```text
Train
 ├── Coach B1
 │    ├── OCR Frames (e.g. 23)
 │    ├── Component Frames (e.g. 140)
 │    ├── Missing Components
 │    ├── Critical Defects
 │    ├── Cameras
 │    └── Timeline
 ├── Coach B2
 ├── Coach B3
```
Must support live status indicators, defect badges, and expand/collapse mechanics.

## 5. Center Evidence Viewer

The MAIN VISUAL INSPECTION AREA. Supports multiple viewing modes:
- **Raw View**: Original synchronized frames.
- **OCR View**: OCR anchor points and evidence.
- **Synchronization View**: Timeline alignment visualization (camera gap detection).
- **Component View**: AI overlays with bounding boxes.
- **Defect View**: Defect specific overlays (warnings/errors).
- **Compare View**: Multi-camera side-by-side comparison.
- **Replay View**: Timeline playback.

**AI Overlay System:**
Should display bounding boxes, component labels (e.g. `Brake Assembly`), and defect markers (e.g., `⚠ Missing Bolt`, `⚠ Crack`). Overlays must use the defined white/off-white theme's alert colors (Red for critical, Yellow for warning).

## 6. Right Intelligence Panel

Displays the AI analysis results based on the currently selected context (Coach/Frame/Defect).

**Sections:**
1. Detected Components
2. Missing Components
3. Critical Defects
4. OCR Insights
5. Synchronization Warnings
6. AI Notes

**Component Intelligence Table:**
| Component | Expected | Detected | Status |
|---|---|---|---|
| Brake Pad | Yes | Yes | ✓ |
| Suspension Pin | Yes | No | ⚠ Missing |

## 7. Bottom Timeline / Frame Strip

Acts as an evidence playback system and CCTV timeline.
**Features:**
- Frame scrubbing
- Synchronized playback controls
- Camera filtering
- Defect jump markers
- Coach transition (gap) markers
- Hover previews with timestamps
