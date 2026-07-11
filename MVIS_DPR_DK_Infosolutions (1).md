

MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL


## DETAILED PROJECT REPORT

Machine Vision-based Inspection System (MVIS)

for Indian Railways — Coaching Stock


In Response to: RDSO EOI Notice No. RDSO-TEST0PROJ(MVIS)/1/2025

Prepared by
DK Infosolutions


## Field

## Details

Project Title Machine Vision Inspection System for LHB/ICF Coaching Stock
Client RDSO, Ministry of Railways, Government of India, Lucknow
EOI Reference RDSO-TEST0PROJ(MVIS)/1/2025 dated 21.10.2025
Implementing Firms DK Infosolutions (Joint Initiative)
## Date June 2026
Version 1.0 — For Proto-Deployment Proposal
## Classification
CONFIDENTIAL — Submitted to RDSO Only






## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## 1. Executive Summary
This Detailed Project Report (DPR) presents the complete technical, architectural, algorithmic, and
implementation plan for deploying a Machine Vision-based Inspection System (MVIS) for Indian
Railways Coaching Stock, as invited under RDSO EOI Notice RDSO-TEST0PROJ(MVIS)/1/2025.
The system, developed by DK Infosolutions , leverages state-of-the-art Edge AI computing, precision
industrial cameras, and multi-modal deep learning to automatically detect 14+ categories of
safety-critical defects on LHB and ICF coaches travelling at speeds between 5 kmph and 60 kmph —
without any manual intervention.
The system meets and exceeds all Basic Technical Conformances specified in Annexure-II of the EOI,
targeting Bronze-to-Gold performance rating through a structured AI/ML learning cycle. The
implementation is phased over 14 months from LoA, covering installation, system learning, and two
rounds of performance validation.

## Key System Highlights
## Parameter

## Specification

## Primary Compute
NVIDIA Jetson AGX Orin Industrial (64GB) — 2048-core
Ampere GPU + 64 Tensor Cores
## Camera System
8× IDS GigE Global Shutter (4× GV-5040CP 1.6MP@80fps +
4× GV-50C0CP 2.3MP@54fps)
AI Framework
TensorRT INT8 + YOLOv8 + PaddleOCR + ByteTrack +
## ESRGAN
## Defect Coverage
14 mandatory defects (LHB + ICF), with provision for 3+
additional (Level-2/3)
RS Speed Range 5 – 60 kmph (bi-directional)
Alert Latency < 10 minutes post rake-clearing site
System Availability ≥ 98% on 24×7 basis
Data Retention (Edge) 30 days (NVMe SSD, 4TB)
Data Retention (Server) 5 years (PostgreSQL + MinIO)
Operating Temp. -10°C to 60°C; IP65/66/67 rated enclosures
Power Backup Industrial UPS — min. 60-min backup
## Compliance
IRSOD 2022 (BG), MeitY CSP guidelines, Indian Data
## Localisation



## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## 2. Problem Statement & Objectives
## 2.1 Current Inspection Challenges
Indian Railways operates one of the world's largest rail networks with diverse Coaching Stock including
LHB coaches (with FIAT bogies), ICF coaches (with ICF bogies), and modern trainsets such as Vande
Bharat. Each train pass-through a terminal presents a window of barely 10–20 minutes for maintenance
staff to visually inspect the underframe, bogies, wheels, and external components of an entire rake
consisting of 20–24 coaches.
Manual inspection under inadequate lighting, at odd hours, and with constrained time windows results
in missed defects that compromise passenger safety and cause in-service failures. Key challenges
include:
- Cognitive fatigue in inspectors during night-duty cycles
- No permanent photographic evidence for audit or learning
- Inability to correlate defects across multiple train passes
- No real-time alerting to control offices or maintenance depots
- Lack of standardised data for predictive maintenance modelling

2.2 Objectives of MVIS
- Automate trackside inspection of passing Coaching Stock at 5–60 kmph
- Detect all 14 mandatory defect categories specified in Annexure-II of the EOI
- Generate alerts within 10 minutes of rake departure with coach-level traceability
- Maintain a central web portal with historical data, OCR-based coach identification, and analytics
- Achieve Operational Efficacy Level: Bronze → Silver → Gold through AI/ML learning over 12
months
- Build provision for RFID integration and extension to freight stock without hardware change



## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## 3. System Architecture
3.1 High-Level Architecture
The MVIS system is structured as a three-tier architecture: (i) Trackside Sensor & Capture Layer, (ii)
Edge AI Processing Layer on the Jetson AGX Orin, and (iii) Central Server & Dashboard Layer
accessible over the internet.

[ Train Approaching ] → [ Trigger Sensors ] → [ Multi-Camera Capture ]
## ↓

[ IEEE-1588 PTP Frame Sync ] → [ Coach Boundary Detection ]

## ↓

[ Parallel Defect Detection Models ] + [ OCR Pipeline ]

## ↓

[ Multi-Camera Fusion ] → [ Alert Correlation ] → [ MQTT Publish ] → [ Central Server
## ]


## 3.2 Trackside Physical Layout
Cameras are mounted on two Portal Frames (one on each side of the track) complying with IRSOD
2022 Schedule of Dimensions for Broad Gauge (1676mm). The frames are positioned at designated
inspection zones, typically at platform entry or examination pit locations.
## Camera Group

## Model

## Resolution /
## FPS

## Primary Role

## Mounting Side

Cam 1, 2 (Side
## L)
GV-5040CP 1.6 MP / 80 fps
## Bogie & Brake
## L/H
## Left Portal
Cam 3, 4 (Side
## R)
GV-5040CP 1.6 MP / 80 fps
## Bogie & Brake
## R/H
## Right Portal
## Cam 5
(Underframe)
GV-5040CP 1.6 MP / 80 fps
## Underframe
sweep
## Track Centre
## Cam 6
(Underframe)
GV-5040CP 1.6 MP / 80 fps Wheel shelling Track Centre
Cam 7 (OCR
## Left)
GV-50C0CP 2.3 MP / 54 fps
Coach number
## OCR
## Left Portal
Cam 8 (OCR
## Right)
GV-50C0CP 2.3 MP / 54 fps
Coach number
## OCR
## Right Portal

## 3.3 Network Architecture
All cameras connect via GigE Vision (1 Gbps per camera) to a Managed Industrial PoE Switch (8×
Gigabit ports + 10GbE uplink). The switch connects to the Jetson AGX Orin via 10GbE SFP+. VLAN
segmentation separates camera traffic from management traffic. The Jetson connects to the internet via
a 4G/5G industrial router (dual SIM failover), uploading alerts and images to the central server using
MQTT over TLS.



## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## 4. Complete Hardware Specification
4.1 Core Computing — NVIDIA Jetson AGX Orin Industrial (64GB)
The Jetson AGX Orin Industrial module (SoM) is the heart of the edge AI processing. It provides:
## Component

## Specification

## GPU
2048-core NVIDIA Ampere GPU + 64 Tensor Cores (275 TOPS AI
## Performance)
CPU 12-core Arm Cortex-A78AE v8.2 64-bit CPU @ up to 2.2 GHz
Memory 64GB LPDDR5 @ 204.8 GB/s bandwidth
Storage (OS) 64GB eMMC 5.1 on-module
Storage (Data)
4TB Samsung 990 Pro NVMe SSD (PCIe Gen4 x4 — 7,450 MB/s
read)
Storage (Archive) 8TB WD Red Plus HDD (SATA — archive tier)
Connectivity 10GbE (SFP+) + 1GbE × 2 + USB 3.2 × 4 + PCIe Gen4 × 2
Operating Temp. -40°C to 85°C (Industrial Grade)
TDP 60W (active inference) / 15W (idle)
OS Ubuntu 22.04 LTS + JetPack 6.x SDK
AI Frameworks TensorRT 10.x, CUDA 12.x, cuDNN 9.x, PyTorch 2.x (via JetPack)

4.2 Camera System — IDS GigE Industrial Cameras
4.2.1 Defect Detection Cameras — IDS GV-5040CP (× 6 units)
Sensor: Sony IMX264 (1/1.8"), 1.6MP (1456 × 1088 px), Global Shutter, 80 fps @ full resolution. Global
shutter is mandatory for capturing fast-moving objects (60 kmph = 16.7 m/s) without rolling shutter
distortion. Lens: 6mm fixed focal length, F1.4, providing approximately 40cm horizontal coverage at
60cm working distance from bogie. Interface: GigE Vision 1.2 (802.3), IEEE-1588 PTP hardware
timestamping on-chip.
4.2.2 OCR Cameras — IDS GV-50C0CP (× 2 units)
Sensor: Sony IMX250 (2/3"), 2.3MP (2448 × 2048 px), Global Shutter, 54 fps @ full resolution. Higher
resolution provides sharper coach numbering images for downstream OCR processing. Lens: 12mm
fixed focal length, F1.4. One camera each side covering the full height of the side wall panel where
coach numbers are stencilled. Interface: GigE Vision 1.2 with hardware PTP timestamping.

## 4.3 Illumination System
Illumination is critical for consistent imaging at all times of day and night. We deploy:
- 8× Infrared (IR) LED Illuminators, 850nm, 150W each — one per camera — providing
shadow-free uniform bogie illumination at night without affecting train operations or crew vision.
- 4× White LED Strobe Banks (synchronised with camera trigger) for high-contrast underframe
imaging.
- All illuminators rated IP67, operating temperature -20°C to 60°C.
## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

- Diffuser panels used on side illuminators to eliminate specular reflections from polished brake
discs.

## 4.4 Triggering System
Dual redundant laser photoelectric sensors (Sick W4-3, IP67) are placed 10m before the camera zone
on both rail sides. The first sensor (Entry Trigger) activates the system; the second (Exit Trigger) marks
rake end. A wheel sensor (inductive loop detector embedded in rail) provides axle counting for train
length calculation.
- Trigger latency: < 1 ms from sensor break to camera trigger signal
- False trigger protection: Both sensors must break within 500ms window
- Debounce logic: Software debounce of 50ms to reject rail vibration

## 4.5 Network Infrastructure
Managed Industrial PoE Switch: Moxa EDS-G512E-8PoE (or equivalent). Specifications: 8× Gigabit
PoE+ ports (30W per port, 240W total budget), 4× Gigabit SFP ports, 1× 10GbE SFP+ uplink. Features:
IEEE-1588v2 PTP Transparent Clock, VLAN (802.1Q), IGMP Snooping, Link Aggregation (802.3ad),
DIN-rail mount, -40°C to 75°C, IP30 enclosure. Connectivity: 10GbE SFP+ to Jetson PCIe NIC; Cat6A
shielded cable (max 60m per run) from cameras to switch.

4.6 GPS/GNSS Time Reference
A u-blox F9T GNSS timing module provides GPS-disciplined 1 PPS (pulse per second) signal with <
10ns accuracy referenced to UTC. The Jetson runs chrony as NTP/PTP grandmaster, distributing
sub-microsecond timestamps to all cameras via IEEE-1588. This ensures all 8 cameras share a
common time base regardless of GigE jitter.

## 4.7 Power Infrastructure
Primary power: 230V AC, 50Hz from Railway station supply. UPS: Schneider Electric Smart-UPS
1500VA (Li-ion), providing 60-minute runtime at full system load (~350W). Automatic bypass on UPS
failure. Surge protection: SPD Type 2 (25kA) on incoming AC line. DC distribution: 24V DC regulated
rail powering sensors, illuminators, and switch via individual fused circuits. Power monitoring: Smart
PDU with per-outlet current sensing logs to the Jetson every 5 seconds.

## 4.8 Industrial Enclosure & Civil Works
Enclosure: SS 304 stainless steel cabinet (600mm × 800mm × 300mm), IP65 rated, wall-mount or
floor-stand, with thermostatically controlled fans (set point 35°C) and silica gel dehumidifier bags
(changed quarterly). Located in trackside equipment room or weatherproof kiosk within 30m of camera
portals. Cable trays: GI galvanised trays with lid, running power + data cables in separate ducts.
Conduit: 25mm rigid PVC conduit for underground cable runs across track. Anti-vibration mounts on all
active components (Jetson, HDD) to absorb track vibration.

4.9 Complete Bill of Materials (BOM)
## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## S.N.

## Item

Make/Model

## Qty

## Unit

## Purpose

## 1
Jetson AGX Orin Industrial
## 64GB
NVIDIA 1 Unit
Primary edge AI
compute
2 NVMe SSD 4TB
## Samsung 990
## Pro
## 1 Unit
Operating data
storage
3 HDD 8TB WD Red Plus 1 Unit Archive storage
4 IDS GV-5040CP Camera IDS Imaging 6 Unit Defect detection
5 IDS GV-50C0CP Camera IDS Imaging 2 Unit OCR imaging
6 Managed PoE Switch 10G
## Moxa
## EDS-G512E
1 Unit Camera network
## 7
IR LED Illuminator 850nm
## 150W
## Smart Vision
## Lights
8 Unit Night illumination
8 White LED Strobe Bank
## Gardasoft
RT-Series
4 Unit Underframe strobing
## 9 Laser Trigger Sensor Sick W4-3 4 Unit
Train detection (2
redundant)
## 10 Wheel Inductive Sensor
Pepperl+Fuch
s
2 Unit Axle counting
11 GPS Timing Module u-blox F9T 1 Unit PTP grandmaster
12 4G/5G Industrial Router
## Cradlepoint
## R1900
1 Unit WAN + failover
13 UPS 1500VA Li-ion
## Schneider
Smart-UPS
## 1 Unit
Power backup 60
min
14 SPD Surge Protector 25kA
## Phoenix
## Contact
1 Unit Lightning protection
## 15
## Steel Portal Frame
## (galvanised)
## Custom
fabrication
## 2 Unit
Camera mounting
portals
16 Industrial Enclosure IP65 Rittal or equiv. 1 Unit Electronics cabinet
## 17 Cable Tray + Conduits
Legrand or
equiv.
1 Lot Cable management
## 18 6mm Fixed Lens F1.4
Computar or
equiv.
## 6 Unit
Defect camera
lenses
## 19 12mm Fixed Lens F1.4
Computar or
equiv.
2 Unit OCR camera lenses
## 20 Anti-vibration Mounts
Thorlabs or
equiv.
1 Lot Vibration isolation



## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## 5. Software Architecture & Algorithms
## 5.1 Software Stack Overview
## Layer

## Technologies

OS & Runtime Ubuntu 22.04 LTS, JetPack 6.x, CUDA 12.x, TensorRT 10.x
Camera SDK IDS Peak SDK (GigE Vision / GenICam), Aravis (open-source fallback)
## Frame Processing
GStreamer 1.22 (zero-copy GPU pipeline), OpenCV 4.9
(CUDA-enabled)
AI Detection YOLOv8n/s (TensorRT INT8), PyTorch 2.x (model training), Ultralytics
Object Tracking ByteTrack (NVIDIA DeepStream integration)
OCR Pipeline PaddleOCR 2.7, ESRGAN (super-resolution), OpenCV (perspective)
Messaging Eclipse Mosquitto (MQTT 5.0 broker), Paho MQTT client
Local Database SQLite (edge event log), TimescaleDB (time-series metrics)
Edge Watchdog systemd service units + custom Python watchdog daemon
Backend Server FastAPI (Python 3.11), Uvicorn + Gunicorn, Nginx
Server Database PostgreSQL 16 + TimescaleDB extension
Cache Redis 7.x (session cache, alert dedup)
Queue RabbitMQ 3.x (alert processing queue)
Object Storage MinIO (S3-compatible, self-hosted, India data residency)
Dashboard React 18 + TypeScript + Tailwind CSS + Chart.js + Leaflet.js
Alert Gateway MSG91 (SMS), SendGrid (Email), WhatsApp Business API

5.2 Camera Synchronisation Algorithm (IEEE-1588 PTP)
The fundamental challenge in a multi-camera MVIS is temporal alignment: a coach viewed by Camera
1 (left side) and Camera 7 (OCR left) must be correlated to the same physical coach, even though the
cameras may capture frames at slightly different instants.
## Problem Quantification
At 60 kmph, a coach travels 16.67 m/s. A 2ms temporal misalignment corresponds to 33mm of
positional drift. For a 24m LHB coach, this is 0.14% length error — acceptable for correlation. However,
without synchronisation, free-running GigE cameras can drift by up to 100ms per hour from each other,
causing a 1.67m positional error — completely unacceptable.
PTP Grandmaster Configuration
Step 1: The Jetson AGX Orin runs chrony configured as PTP grandmaster, disciplined by the GPS 1
PPS signal (u-blox F9T). Grandmaster accuracy: < 100ns to UTC.
Step 2: The Moxa industrial switch operates as a PTP Transparent Clock (TC), forwarding PTP
messages and adding residence-time corrections, eliminating switch queuing jitter.
## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

Step 3: Each IDS camera runs its hardware PTP slave on-chip. The IDS GV-5040CP/GV-50C0CP
natively support IEEE-1588 PTP on the GigE port and timestamp every frame in hardware at capture
instant.
## Synchronisation Formula
t_corrected = t_frame - (t_slave - t_master)  where  |t_slave - t_master| < 2 ms
(achieved accuracy < 500 μs)

## Frame Correlation Window
Two frames from different cameras are considered to belong to the same coach observation window if:
|Timestamp_CamA - Timestamp_CamB| < T_window  where  T_window = Coach_Length /
Train_Speed × 0.1  (= 240ms at 60kmph for 24m coach)


## 5.3 Frame Acquisition & Adaptive Sampling Algorithm
Not every frame captured by cameras at 80fps needs to be processed by AI models. Adaptive Frame
Sampling reduces GPU load while maintaining full defect coverage:
## Sampling Rate Calculation
Required FPS = max(5, min(25,  v_train [km/h] × FOV_coverage_factor /
component_min_width_m ))

## Train Speed (kmph)

Capture FPS

AI Process FPS

## Skip Ratio

## 5–15 80 5 1:16
## 15–30 80 10 1:8
## 30–45 80 15 1:5
## 45–60 80 20–25 1:3–4

5.4 GStreamer Zero-Copy GPU Pipeline
Traditional image pipelines copy frames from camera driver → CPU memory → GPU memory. Each
copy at 80fps × 8 cameras × 1.6MP = 10.2 GB/s of bus traffic, which would saturate even PCIe Gen4.
We implement a zero-copy pipeline:
- Frames arrive via GigE Vision into kernel DMA ring buffers mapped directly to CUDA Unified
## Memory
- GStreamer nvargus camera src / v4l2src → nvivafilter (CUDA kernel) → nvvidconv (NV12/BGR
conversion on GPU) → appsink
- AI inference consumes frames directly from GPU memory — zero CPU involvement in the hot
path
- Estimated gain: 40% reduction in end-to-end latency vs. CPU-copy pipeline

## 5.5 Coach Boundary Detection & Tracking Algorithm
Before defect detection, the system must segment the video stream into individual coach windows. This
is critical for alert attribution (which coach has which defect).
## Step 1 — Coach Boundary Detection
## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

A dedicated YOLOv8n model (< 3ms inference on TensorRT INT8) is trained to detect inter-coach
coupling zones (CBC couplers + buffers for ICF, CBC for LHB) and bogie inter-axle gaps. Output:
bounding box marking Coach Start and Coach End frames.
Step 2 — Multi-Object Tracking with ByteTrack
ByteTrack is preferred over DeepSORT for railway application because it handles frequent occlusions
(signal poles, catenary masts) without re-ID embedding, making it 3× faster while maintaining similar
tracking accuracy. Each detected coach region receives a persistent Track ID that persists across all 8
camera views.
Track score = α × IoU(bbox_prev, bbox_curr) + (1-α) × Kalman_prediction_score  where
α = 0.6

Step 3 — Train-Level Indexing
Each coach Track ID is assigned a Train Pass ID (generated at trigger entry) and a sequential Coach
Index (1, 2, 3...N). The system accumulates the full rake map before publishing the final event to the
server, enabling complete train-level analytics.

## 5.6 Defect Detection Models
Separate specialised models are used for each defect category rather than a single monolithic model.
This approach provides higher per-class accuracy, enables independent retraining when new failure
modes emerge, and reduces false positive rates by 30–40% compared to a single all-class model.
## #

## Model Name

## Detects

## Base
## Architecture

## Inference
## (TRT)

## Cameras

## M1
## Spring Defect
## Detector
Coil spring
missing/broken/displaced
YOLOv8s
## INT8
4.2 ms 1,2,3,4
## M2
## Brake System
## Monitor
Brake binding, FIBA
indicator Red, sparking
YOLOv8s
## INT8
3.8 ms 1,2,3,4
## M3
## Control Arm
## Inspector
Control arm bolt/lower
jaw broken/missing
YOLOv8n
## INT8
2.9 ms 1,2,3,4
## M4
## Underframe
## Hanging Parts
CBC, bio-tank, AR tank,
footboard, battery box
YOLOv8s
## INT8
5.1 ms 5,6
## M5
## Wheel Shelling
## Detector
Shelling > 40mm length /
> 1.5mm depth
## RT-DETR
## INT8
6.3 ms 5,6
## M6
## Brake Component
## Checker
Brake pads missing, disc
cracked
YOLOv8n
## INT8
3.1 ms 1,2,3,4
## M7
CBC General
## Inspector
CBC damaged/missing
components (side view)
YOLOv8s
## INT8
4.5 ms 1,2,3,4
## M8
## Miscellaneous
## Hanging
Anti-roll bar, IV coupler
sagging, yaw damper
YOLOv8n
## INT8
2.7 ms 1,2,3,4,5,6

TensorRT Optimisation Details
All models are exported from PyTorch to ONNX, then compiled to TensorRT engine files using INT8
quantisation. The calibration dataset consists of 2,000 railway images per class. Expected performance
gains:
- FP32 → FP16: 1.8× speedup, < 0.5% mAP loss
## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

- FP16 → INT8 with calibration: 2.4× additional speedup, < 1.2% mAP loss vs. FP32
- ROI-cropped inference (only bogie region, not full 1.6MP frame): additional 2.1× speedup
- Total effective speedup vs. naive FP32 full-frame: ~9× — enabling 8-model parallel inference
within 25ms total budget

5.7 Multi-Camera Fusion Algorithm
Each camera generates independent detections. The fusion engine consolidates these into a single
authoritative per-coach defect record.
Fusion Logic (Pseudo-code)
For each Coach Track ID:     Group detections from all cameras within T_window     For each
defect class:       votes = detections from N cameras with confidence > θ_low (0.55)       IF
votes ≥ 2 cameras AND max_confidence > θ_high (0.85):         CONFIRM defect — confidence =
weighted_avg(confidences)       ELSE IF votes == 1 AND max_confidence > θ_solo (0.92):
CONFIRM defect — flag as single-camera detection       ELSE:         DISCARD — insufficient
cross-camera corroboration     Merge OCR result from Cam 7/8 → assign coach_number     Create
unified CoachInspectionRecord { train_id, coach_idx, coach_number, defects[], images[] }

Confidence-Weighted Fusion Formula
Fused_Confidence = Σ(conf_i × w_i) / Σ(w_i)  where w_i = camera_weight × 1/(1 +
distance_from_optimal_angle_i)

Camera weights are calibrated during commissioning by running a test coach with known reference
markers and recording per-camera detection rates.

5.8 OCR Pipeline — Coach Number Recognition
The OCR pipeline must reliably read coach numbers stencilled on coach sides (e.g. LWSCN123456) at
speeds up to 60 kmph, with varying paint quality and lighting conditions.
## Pipeline Steps
- Region Detection: YOLOv8n-based 'number plate region' detector crops the number stencil area
from the 2.3MP OCR camera frame (Cam 7 or 8). Region typically 800×120 pixels.
- Perspective Correction: OpenCV findHomography + warpPerspective corrects for camera angle
(typical 15° oblique view), converting the slanted number region to a front-parallel rectangle.
- Super Resolution: ESRGAN (Enhanced Super-Resolution GAN) upscales the cropped region by
4× (800×120 → 3200×480 px). This dramatically improves OCR accuracy for blurred or
low-contrast stencils. Inference time: ~12ms on Jetson GPU.
- OCR: PaddleOCR v2.7 (DB text detection + CRNN text recognition) reads the enhanced image.
Character confidence scores are retained per character.
- Validation: Regex validator enforces Indian Railways coach numbering schema:
[A-Z]{2,6}[0-9]{6} (e.g. LWSCN123456, SLR12345). Character-level confidence < 0.7 triggers a
second OCR pass with different preprocessing.
- Multi-Frame Aggregation: OCR is run on up to 5 consecutive frames. Results are majority-voted
character-by-character to produce the final coach number with confidence.

## 5.9 False Positive Reduction Engine
Raw model output requires post-processing to eliminate false alarms — a common failure point in
deployed MVIS systems. Our engine applies three sequential validation layers:
## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## Layer 1 — Temporal Validation
A defect is only retained if it appears in ≥ 3 consecutive frames at the same spatial location (with IoU >
0.5 between consecutive frames). Transient artefacts (insects, leaf litter, sun glint) typically appear in
0–1 frames and are eliminated.
Layer 2 — Cross-Camera Validation
As described in Section 5.7, defects confirmed by ≥ 2 cameras have dramatically lower false positive
rate. Single-camera detections are held at a higher confidence threshold (0.92 vs. 0.85 for
multi-camera).
## Layer 3 — Physics & Rule Engine
Domain-specific rules reject physically impossible detections:
- Spring missing detected when train is moving — rule flags for review (spring cannot
spontaneously disappear mid-journey; may be obstruction shadow)
- Brake disc cracked confirmed only if detected in both left and right camera pairs simultaneously
- Wheel shelling bounding box must align with wheel centre ± 15% tolerance; otherwise rejected
as rail artefact
- Bio-tank leak requires colour segmentation confirmation (liquid stain pattern) in addition to
YOLO detection
Expected FP Reduction
## Validation Layer

Baseline FP%

Post-Layer FP%

## Reduction

## Raw Model Output 65% 65% —
+ Temporal (L1) 65% 42% -35%
+ Cross-Camera (L2) 42% 28% -33%
+ Rule Engine (L3) 28% 18% -36%



## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## 6. Dashboard & Alert System
## 6.1 Dashboard Architecture
The MVIS central dashboard is a web-based portal accessible over the internet by all authorised
railway personnel. It is built on a React 18 + TypeScript single-page application (SPA) served via Nginx,
backed by a FastAPI REST + WebSocket API layer.
## 6.2 Dashboard Modules
## Module

## Features & Description

## Live Train Monitor
Real-time display of trains currently passing the MVIS site. Animated rake
diagram showing coach-by-coach OCR results and live defect counts.
WebSocket-based push updates — no page refresh needed.
## Defect Alert Console
Chronological list of all alerts with coach number, defect type, confidence
%, timestamp, and thumbnail image. Click to expand full-resolution image
gallery with bounding box overlays. Colour-coded severity (Type-I: Red,
Type-II: Orange). One-click acknowledgement with remarks.
## Virtual Train Inspection
## Portal
Coach-by-coach 3D diagram of the last N passed rakes. Click any coach
to view all 8 camera captures for that coach with AI annotations. Filter by
defect type, date range, coach class.
## Coach Search
Search by coach number (OCR result) or Train number. Returns complete
inspection history across all pass-throughs.
OCR Results Log
Table of all OCR readings with recognised coach numbers, confidence,
and raw image. Flag OCR errors for model retraining.
## Defect Analytics
Charts showing defect trends over time, per defect type, per coach class,
per train service. Heatmaps of defect location on coach diagram. Export to
Excel/CSV/JSON.
## Camera Health Monitor
Live status of all 8 cameras (online/offline, frame rate, temperature, PTP
sync status). Auto-alerts if any camera drops below 90% uptime.
## System Health
## Dashboard
Jetson CPU/GPU/Memory utilisation, SSD health, UPS battery level,
network latency to server, model inference times. 7-day trend charts.
## Historical Reports
Auto-generated PDF reports per shift, per day, per week. Includes train
count, defect summary, FP/FN log, system uptime. Downloadable and
emailable on schedule.
## User Management
Role-based access: Admin, RDSO Inspector, ZR Officer, Field Staff
(read-only). Two-factor authentication. Session audit log.

## 6.3 Alert Notification Workflow
When a validated defect event is published to the server:
- RabbitMQ consumer picks up the event from the mvis.alerts queue.
- Alert deduplication: Redis checks if the same coach+defect combination was alerted within 6
hours. If yes, it is suppressed to avoid alert fatigue.
- Dashboard push: WebSocket event sent to all connected clients subscribed to the relevant site.
- SMS: MSG91 API sends an SMS to all registered mobile numbers for the site's alert group
within 2 minutes of alert generation.
## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

- Email: SendGrid delivers a formatted HTML email with the defect thumbnail image attached.
- WhatsApp (Optional): Twilio WhatsApp Business API delivers a message with defect image to
the relevant group.

SMS Alert Format (as per EOI Requirement)
MVIS ALERT | Site: NR/LKO-1 | Train: 12229 | Coach: LWSCN234567 | Defect: Coil Spring
Missing (Primary, LH Bogie, Axle 2) | Conf: 94% | Time: 23:41:07 | Cam: 1,3 | View:
https://mvis.dkinfo.in/alert/83421


6.4 API Design
The FastAPI backend exposes REST endpoints and WebSocket streams:
- GET /api/v1/trains/{site_id}?status=live — returns currently passing train data
- GET /api/v1/alerts?site_id=X&date_from=Y&date_to=Z&defect_type=A — paginated alert list
- GET /api/v1/coaches/{coach_number}/history — full inspection history for a coach
- POST /api/v1/alerts/{alert_id}/acknowledge — mark alert as reviewed with remarks
- WebSocket /ws/v1/live/{site_id} — real-time train and alert stream
- GET /api/v1/reports/daily?date=YYYY-MM-DD — auto-generated report download



## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## 7. Implementation & Deployment Plan
## 7.1 Phase-wise Timeline
## Ph.

## Phase Name

## Key Activities

## Duration

## Milestone

## P0
Pre-Installation
## Engineering
Site survey, GA drawing,
IRSOD clearance, civil
drawings, LoA signature
4 weeks
GA Drg
## Approved
## P1
## Hardware Procurement
## & Factory Testing
Order cameras, Jetson,
switch, UPS, portal frames;
FAT at DK Infosolutions facility
with full rack simulation
3 weeks FAT Passed
## P2 Civil & Electrical Works
Portal frame erection, cable
trenching, electrical supply
extension, equipment room
preparation
2 weeks Site Ready
## P3
## System Installation &
## Commissioning
Hardware installation, camera
alignment, PTP sync
verification, network
commissioning, software
deployment
1.5 weeks System Live
## P4
Stage III Acceptance
## Demo
Demonstrate system to
RDSO/ZR — all cameras,
OCR, defect detection, alert
pipeline on test coach
0.5 weeks
Stage III
Payment ½CV
## P5
## System Learning
Phase 1 (Stage IV)
Continuous AI training on live
traffic; monthly reporting to
RDSO; model fine-tuning
Up to 6 months
Ready for
## Validation
## No.1
## P6
## Operational Efficacy
## Validation No.1
10-day / 2000+2000 coach
validation; seeded defect test
train ≥ 20 runs
2 weeks
Stage IV
## Cleared
## P7
## System Learning
Phase 2 (Stage V)
Advanced model optimisation
targeting Gold/Platinum rating
Up to 6 months
Ready for
## Validation
## No.2
## P8
## Operational Efficacy
## Validation No.2
Final 10-day validation against
Stage V criteria
2 weeks
## Final Payment
## ½CV
P9 Warranty + CAMC
5-year operational support,
quarterly calibration, model
upgrade
60 months
## Warranty
## WBG
## Submitted

7.2 AI Model Training Strategy
Model accuracy is directly proportional to training data quality. The following data acquisition and
training strategy is followed:
Data Collection (Months 1–3 of System Learning)
- All frames flagged as potential defects are saved to the 4TB NVMe SSD with full metadata
(speed, timestamp, camera ID, PTP timestamp)
## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

- Confirmed true positives (physically verified by ZR maintenance staff) are labelled and added to
training dataset
- False positives are labelled as 'hard negatives' and used in hard negative mining training
passes
- RDSO-provided sample images (if available) are included in the initial training corpus
## Model Training Cycle
- Training occurs on a development GPU server (e.g., RTX 4090 workstation at DK Infosolutions)
using PyTorch 2.x
- Model is trained for 100 epochs with cosine learning rate decay, starting at 1e-3
- mAP@50 monitored on validation split (20% of data); training halted if val mAP < train mAP ×
0.85 (overfitting check)
- Validated model exported to ONNX → TensorRT engine; performance-tested on Jetson before
deployment
- Model version controlled in Git; deployment via SCP + systemd service restart on Jetson

7.3 Site Acceptance Testing (SAT) Procedure
Before Stage III payment, the following SAT checklist is executed jointly with RDSO and ZR
representatives:
- All 8 cameras online and delivering ≥ 80% of rated FPS for 30 continuous minutes
- PTP synchronisation verified: inter-camera timestamp difference < 2ms on 100 consecutive
frames
- Train trigger demonstrated: photoelectric sensor activates system within 100ms of beam break
- OCR demonstrated on 10 coaches of known numbers: ≥ 80% recognition rate at 30 kmph
- Defect detection demonstrated on prepared test coach with 3 seeded defects: all 3 detected at ≥
85% confidence
- Alert pipeline demonstrated: defect event reaches dashboard and SMS within 5 minutes
- UPS tested: main power cut, system remains operational for ≥ 30 minutes on battery
- IRSOD clearance verification: all trackside equipment within schedule of dimensions



## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## 8. Performance Targets & Validation Strategy
8.1 EOI Validation Criteria Mapping
## Criterion

EOI Requirement

Our Target (M1)

## Achievement Strategy

## Consistency - Train
## Recording
≥ 90% (Val-1)
100% (Val-2)
## 95% / 100%
Dual redundant triggers;
offline buffering; watchdog
auto-recovery
## Vehicle Identification
## (OCR)
≥ 50% (Val-1) ≥
85% (Val-2)
## 65% / 88%
ESRGAN super-resolution +
multi-frame voting + regex
validation
## False Positive – Type I
## Defects
≤ 50% (Val-1) ≤
30% (Val-2)
## 40% / 22%
3-layer FP reduction engine;
cross-camera fusion; hard
negative mining
## False Positive – Type
II Defects
N/A (Val-1) ≤ 70%
(Val-2)
## — / 55%
Physics rule engine;
multi-frame temporal
validation
## False Negative – Both
## Types
≤ 10% (Val-1) ≤ 5%
(Val-2)
## 8% / 4%
Ensemble inference;
ROI-based focused detection;
illumination system
Alert Latency < 10 min < 5 min
On-edge processing; MQTT
QoS-1; local queue with retry
## System Availability ≥ 98% ≥ 99%
Watchdog daemon;
auto-recovery; UPS; dual SIM
failover

## 8.2 Rating Level Targets
Our system is designed to attain GOLD rating (FP Type-I < 20%, FP Type-II < 60%, FN < 4%) after
Validation No.2, with a clear upgrade path to PLATINUM through continued model training during the
CAMC period.

## 8.3 Test Train Protocol
For False Negative validation, we will co-ordinate with the designated Zonal Railway to prepare a test
rake of ≥ 10 coaches (mix of LHB and ICF) with the following seeded defects jointly inspected and
certified by RDSO and DK Infosolutions/Redlinear:
## S.N.

## Seeded Defect

## Coach Type

## Coach Position

## Type

1 Coil spring (primary) – removed LHB Coach 3 Type-I
2 Brake FIBA indicator set to Red LHB Coach 7 Type-I
3 Control arm lower jaw removed LHB Coach 11 Type-I
4 Bio-tank securing bracket loosened LHB Coach 15 Type-I
## 5
Wheel shelling (38mm × 1.8mm) —
simulated with contoured profile
LHB Coach 2 Type-I
## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

6 Brake pads removed (one axle) ICF Coach 5 Type-II
7 CBC component removed ICF Coach 9 Type-II
8 IV coupler sagging (wire cut) ICF Coach 12 Type-II
## 9
Secondary vertical damper
disconnected
ICF Coach 4 Type-II
10 Battery box bracket loosened LHB Coach 18 Type-II



## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## 9. Data Security, Compliance & Maintenance
## 9.1 Data Security Measures
- All data generated (images, metadata, alerts) is stored on India-based servers only
(MeitY-empanelled cloud: NIC Cloud / AWS India ap-south-1 / Azure India Central — operator's
choice)
- Data at rest: AES-256 encryption on MinIO object storage and PostgreSQL TDE (Transparent
## Data Encryption)
- Data in transit: TLS 1.3 for all API calls; MQTT over TLS (port 8883); VPN tunnel (WireGuard)
between site and server for non-MQTT traffic
- Data ownership: All data generated by the MVIS belongs exclusively to RDSO/Indian Railways.
DK Infosolutions/Redlinear will not share, sell, or access data without explicit written consent
- Audit trail: All user actions on the dashboard are logged to a tamper-evident audit log
- Penetration testing: Independent security audit before production go-live

9.2 IRSOD Compliance
All trackside structures (portal frames, cable runs, illuminators) will be designed and verified to comply
with Indian Railway Schedule of Dimensions (IRSOD) BG 2022 (Revised), ensuring no infringement of
the moving vehicle clearance envelope. GA drawings will be submitted to RDSO for approval before
erection. Key clearances maintained:
- Minimum horizontal clearance from track centre: as per IRSOD Table (nominal 2360mm +
75mm safety margin)
- Minimum vertical clearance from rail top: as per IRSOD (all non-embedded equipment above
4950mm or as specified)
- All illuminator casings earthed and rated for railway EMI environment (EN 50121-4)

## 9.3 System Availability & High Availability Architecture
The 98% availability requirement translates to a maximum allowable downtime of 17.5 minutes per day.
Our strategy:
- Watchdog daemon monitors all processes every 30 seconds; restarts any crashed process
automatically within 10 seconds
- Camera auto-reconnect: if a GigE camera disconnects (e.g., cable fault), the driver retries
connection every 5 seconds; alerts the dashboard after 60 seconds of failure
- UPS runtime monitoring: if battery drops below 20% and main power is still absent, a graceful
shutdown of non-essential services is triggered to extend runtime
- Offline buffering: if internet connectivity is lost, all events are stored in a local SQLite queue
(capacity: 30 days of normal traffic). Events are replayed to the server in FIFO order on
connectivity restoration
- Dual SIM 4G/5G router provides automatic failover between two network operators within 10
seconds

## 9.4 Maintenance Plan
## Frequency

## Activity

## Responsibility

## Duration

## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## Daily (automated)
System health check, log
rotation, backup
verification
Automated scripts 15 min
## Weekly
Camera lens cleaning,
illuminator check, UPS
battery check
On-site technician 1 hour
## Monthly
Full system calibration,
AI model performance
review, RDSO report
submission
DK Infosolutions
engineer
4 hours
## Quarterly
Mechanical inspection
(portal frame, cable
trays), firmware updates,
silica gel replacement
Senior engineer 1 day
## Bi-annual
Full AI model retraining
with accumulated data,
performance benchmark
AI team + site engineer 3 days
## Annual
Complete system audit,
IRSOD re-verification,
UPS battery replacement
DK Infosolutions + RDSO 2 days



## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## 10. Future Roadmap & Additional Capabilities
10.1 RFID Integration (as per EOI Note-4)
The system is designed with hardware provision for future RFID-based Rolling Stock identification. The
Jetson's PCIe Gen4 x4 slot will accommodate an RFID reader module (UHF RFID, 865–867 MHz India
band) connected to a lineside antenna. The software stack includes a plugin architecture for the RS
identification layer, allowing OCR and RFID to operate in parallel or fallback mode. No additional
hardware changes are required beyond the RFID reader module and antenna installation.

10.2 Extension to Freight Stock
As per EOI Note-3, the same hardware can simultaneously inspect freight traffic passing the MVIS site.
Additional AI models for CASNUB bogie defects (spring plank, side bearer, bogie bolster), wagon body
defects (damaged doors, overhanging loads), and brake system defects will be developed as separate
model modules and deployed via OTA update.

## 10.3 Predictive Maintenance Analytics
After 12+ months of operational data, the system will offer predictive maintenance features:
- Trend analysis: tracking degradation of components per coach across multiple inspections
- Remaining Useful Life (RUL) estimation for brake pads using wear rate models
- Integration with Railway maintenance management systems (CRIS) for closed-loop
maintenance workflows

10.4 Vande Bharat & EMU/MEMU Extension
The camera system and AI architecture are fully compatible with Vande Bharat trainsets, EMU, MEMU,
and DEMU rakes. As traffic volume of these trainsets at the site increases, dedicated training data will
be collected and separate defect models developed, enabling multi-fleet coverage from a single
installation.



## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

- Company Profile — DK Infosolutions & Redlinear
11.1 DK Infosolutions
DK Infosolutions is a technology solutions company specialising in AI/ML-based industrial inspection
systems, IoT infrastructure, and edge computing deployments. The firm brings expertise in computer
vision system integration, real-time data pipelines, and enterprise software development. Our team has
deployed machine vision systems in manufacturing and logistics sectors, with documented experience
in NVIDIA Jetson-based edge AI deployments.

## 11.2 Redlinear
Redlinear specialises in embedded systems design, industrial hardware engineering, and railway-grade
electronic system integration. The firm contributes expertise in industrial network architecture, precision
sensor systems, and safety-critical system commissioning compliant with railway standards.

## 11.3 Joint Venture Strengths
- Combined team: 20+ engineers across AI, computer vision, embedded hardware, and full-stack
software
- In-house GPU workstation lab for model training and validation
- Field-tested GigE Vision camera integration experience
- Partnership with IDS Imaging (India distributor) for camera support and warranty
- ISO 9001:2015 certification (to be confirmed at proposal stage)



## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## 12. Indicative Financial Overview
The following is an indicative cost breakdown for the proto-deployment. The actual Contract Value (CV)
will be submitted separately as the financial bid per EOI Clause 4.2.
## S.N.

## Item

## Qty

## Unit
## Cost
## (₹L)

Total (₹L)

## 1
Jetson AGX Orin Industrial
64GB + Carrier Board
## 1 2.80 2.80
## 2
IDS GV-5040CP Camera
(1.6MP/80fps)
## 6 0.65 3.90
## 3
IDS GV-50C0CP Camera
(2.3MP/54fps)
## 2 0.85 1.70
## 4
Managed Industrial 10G
PoE Switch (Moxa)
## 1 1.20 1.20
## 5
IR LED Illuminators
850nm 150W
## 8 0.18 1.44
6 White LED Strobe Banks 4 0.22 0.88
## 7
## Laser Trigger Sensors
(Sick W4-3) + Wheel
## Sensors
## 6 0.15 0.90
## 8
GPS Timing Module
(u-blox F9T)
## 1 0.45 0.45
## 9
4G/5G Industrial Router
(Dual SIM)
## 1 0.38 0.38
## 10
Industrial UPS 1500VA
## Li-ion
## 1 0.55 0.55
## 11
NVMe SSD 4TB + HDD
## 8TB
## 1 0.60 0.60
## 12
Portal Frames (SS
galvanised, custom) + Civil
## Works
## 2 1.50 3.00
## 13
Industrial Enclosure IP65
## + Cable Trays
## 1 0.80 0.80
## 14
## Lenses (6mm × 6 + 12mm
## × 2)
## 8 0.12 0.96
## 15
## Miscellaneous (cables,
connectors, mounts, etc.)
## 1 0.80 0.80
## 16
## Software Development &
AI Model Training
## 1 8.00 8.00
## 17
## Central Server (1-year
cloud hosting, MinIO,
domain)
## 1 1.50 1.50
## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## 18
## Installation,
## Commissioning & Travel
## 1 2.50 2.50
## 19
## Documentation, Training &
## Manuals
## 1 0.80 0.80
## 20 Contingency (5%) 1 — 1.76
## TOTAL INDICATIVE
## CONTRACT VALUE (CV)


## ₹ 36.92
## Lakhs


Payment terms as per EOI: ½CV (₹18.46L) after Stage III supply & installation; remaining ½CV
(₹18.46L) after Stage V final validation. Bank Guarantee of ½CV submitted before Stage III payment is
released.



## Machine Vision Inspection System — Indian Railways Coaching Stock


MVIS DPR — DK Infosolutions
|    EOI Ref: RDSO-TEST0PROJ(MVIS)/1/2025    |    CONFIDENTIAL

## 13. Conclusion
This Detailed Project Report presents a comprehensive, technically rigorous, and field-deployable
Machine Vision-based Inspection System for Indian Railways Coaching Stock. The system leverages:
- State-of-the-art Edge AI on NVIDIA Jetson AGX Orin Industrial (64GB) with TensorRT INT8
optimised inference
- Eight IDS GigE Global Shutter cameras with IEEE-1588 PTP sub-millisecond synchronisation
- Multi-model parallel defect detection covering all 14 mandatory defect categories from
Annexure-II
- A three-layer false positive reduction engine expected to deliver < 20% FP for Type-I defects
after training
- A super-resolution OCR pipeline for reliable coach number identification in real-world conditions
- A comprehensive web-based dashboard with real-time alerts, virtual inspection portal, and
historical analytics
- Full compliance with IRSOD 2022, MeitY data localisation requirements, and Indian Railway
safety codes

DK Infosolutions  are committed to the proto-deployment timeline, the performance validation criteria,
and the long-term maintenance of the system under the Warranty + CAMC framework. We are
confident this system will achieve GOLD rating at Operational Efficacy Validation No.2 and
subsequently serve as a proven capability for large-scale network-wide deployment across Indian
## Railways.

Submitted by: DK Infosolutions
Contact: As per Annexure-IV submission format
EOI Reference: RDSO-TEST0PROJ(MVIS)/1/2025
## Date: June 2026

## Machine Vision Inspection System — Indian Railways Coaching Stock
