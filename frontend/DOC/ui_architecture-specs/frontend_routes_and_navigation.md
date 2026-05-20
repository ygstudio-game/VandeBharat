# VandeBharat AI Frontend Routes & Navigation

This document defines the routing structure and primary navigation systems for the frontend application. The platform is divided into four main architectural domains.

## 1. Domain Routing Structure

### 1.1 Operations
Focuses on operational monitoring, queue management, and health monitoring.
- `/dashboard` : Operations Dashboard (KPIs, Queue, Pipeline Health)
- `/live-queue` : Live Train Queue
- `/sessions` : Inspection Sessions Manager (Table of all completed/processing trains)

### 1.2 Train Workspace
The core product. A unified workspace for an individual train inspection session.
- `/train/:sessionId` : Train Workspace (Replaces separate OCR, detection, report pages)

### 1.3 System & Infrastructure
Focuses on hardware health and processing nodes.
- `/analytics` : Processing metrics, OCR accuracy, synchronization health.
- `/system-health` : Overall system monitoring.
- `/camera-monitoring` : Active cameras, sync health, hardware trigger integrity.
- `/gpu-workers` : Inference queues, active YOLO jobs, processing throughput.

### 1.4 Admin
System configuration and auditing.
- `/settings` : System settings.
- `/models` : Model management.
- `/thresholds` : Confidence and threshold configurations.
- `/audit-logs` : Security and operational audit logs.
- `/users` : User and role management.

## 2. Main Navigation Structure

A persistent global navigation mechanism (e.g., a left sidebar or top navbar) should expose the primary modules to the user.

**Navigation Items:**
1. Dashboard
2. Live Queue
3. Inspections (Sessions)
4. Reports
5. Analytics
6. Infrastructure
7. Settings

## 3. Operations Dashboard (`/dashboard`) Details

**Purpose:**
Operational monitoring, train queue management, processing visibility, and health monitoring. NOT for deep inspection.

**Layout Architecture:**
```text
------------------------------------------------
Top Navbar (Global Navigation)
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

**KPI Overview Strip Example:**
- Trains Today: 48
- Reports Ready: 31
- Processing: 12
- Queued: 5
- Critical Alerts: 3
- Failed Sessions: 1

**Live Train Queue Example:**
```text
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

[Open Workspace Button]
```

## 4. Inspection Sessions Page (`/sessions`)

Replaces the "Active Session Dropdown". Dropdowns do not scale for large train volumes.

**Table Columns:**
- Train Number (e.g., VB22901)
- Start Time (e.g., 08:41 PM)
- Status (e.g., Processing, Completed)
- Coaches (Count)
- Defects (Count)
- Report (e.g., Pending, Ready)

**Filters:**
- Date
- Train Number
- Status
- Defect Severity
- Camera Setup
- OCR Confidence
- Report Status

**Row Actions:**
- `[Open Workspace]` -> Routes to `/train/:sessionId`
- `[Open Report]`
- `[Replay Inspection]`
