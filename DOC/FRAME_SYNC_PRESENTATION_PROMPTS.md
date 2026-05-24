# Frame Synchronisation — Presentation & Infographic Prompts

> **Context for these prompts**  
> VandeInspect is an AI-powered undercarriage inspection system for Vande Bharat trains.  
> Multiple cameras record the undercarriage simultaneously as the train passes over a pit.  
> All cameras start at the same instant, so every frame has the same **`trigger_id`** (= video frame number).  
> The OCR camera detects the **physical gap** between bogies; those gap trigger_ids become range boundaries.  
> Every frame — from every camera — whose trigger_id falls inside a boundary range is assigned to that bogie.  
> This is how a single shared trigger number ties multi-camera frames to the correct bogie and coach number.

---

## How Frame Synchronisation Actually Works (Technical Reference)

Use this section as ground truth when generating the assets below.

### Database Entities

| Entity | Role |
|---|---|
| `inspection_sessions` | One row per train pass-through |
| `session_cameras` | One row per physical camera per session |
| `frames` | One row per captured frame — carries `trigger_id`, `session_camera_id`, `cloudinary_url`, `coach_id` |
| `gap_detections` | One row per gap edge detected by OCR YOLO — carries `trigger_id` and `confidence` |
| `coaches` | One row per bogie — carries `coach_number`, `start_trigger_id`, `end_trigger_id` |
| `ocr_results` | One row per OCR reading — links `frame_id` to `coach_number` and `confidence` |

---

### Pipeline (7 steps)

```
Step 1  SIMULTANEOUS CAPTURE
        All cameras start recording at exactly the same instant.
        trigger_id = raw video frame number.
        Because all cameras start together, trigger_id 1200 on CAM_LEFT and
        trigger_id 1200 on CAM_RIGHT represent the SAME physical moment.
        No GPS, no clock sync needed — physics does it.

Step 2  FRAME EXTRACTION  (frame_extractor/server.py)
        For each camera, OpenCV reads every Nth frame.
        Each frame is uploaded to Cloudinary and inserted into `frames`
        with its trigger_id and session_camera_id.

Step 3  OCR DETECTION  (GPU/ocr/server.py)
        A dedicated OCR camera faces the bogie number panels and gap regions.
        For each OCR-camera frame, a YOLO model runs and detects two things:
          a) "gap" class  →  the physical space between two adjacent bogies
             Each "gap" detection is inserted into `gap_detections` with its trigger_id.
          b) Bogie number text  →  OCR reads the number from the cropped region.
             Each reading is inserted into `ocr_results` with its frame_id and trigger_id.

Step 4  GAP CLUSTERING  (services/sync_engine/engine.py)
        As the train moves, the same physical gap passes in front of the camera
        across several consecutive frames. This creates a cluster of gap_detections
        around the same trigger_id range.
        Algorithm:
          a) Load all gap_detections ordered by trigger_id.
          b) Detections within GAP_CLUSTER_RADIUS (default = 30 trigger_ids)
             are grouped into one cluster.
          c) The highest-confidence detection in each cluster becomes the
             canonical boundary trigger_id for that gap.
        Result: a sorted list of boundary trigger_ids, e.g. [150, 350, 550].

Step 5  BOGIE RANGE BUILDING  (services/sync_engine/engine.py)
        Insert session min and max trigger_id at either end of the boundary list.
        Adjacent boundaries define the trigger range for each bogie:
          boundaries = [150, 350, 550], session range 0 – 600
          Bogie 1  →  trigger_id  [  0 – 149 ]
          Bogie 2  →  trigger_id  [150 – 349 ]
          Bogie 3  →  trigger_id  [350 – 549 ]
          Bogie 4  →  trigger_id  [550 – 600 ]

Step 6  COACH IDENTIFICATION  (services/sync_engine/engine.py)
        For each bogie range, query ocr_results where the linked frame's
        trigger_id falls inside [start, end].
        Pick the highest-confidence valid reading → assign that coach_number
        to the bogie row.
        Example: in range [0–149], trigger 75 → OCR reads "B1" conf=0.92 → coach "B1"

Step 7  FRAME ASSIGNMENT  (services/sync_engine/engine.py)
        For every frame in the session (from ALL cameras):
          if frame.trigger_id ∈ [start_trigger_id, end_trigger_id] for a bogie
            → frame.coach_id = that bogie's coach UUID
        A `coach_frame_map` row records the assignment method ("GAP_BOUNDARY", conf=1.0).
        Result: every frame from every camera knows which bogie it captured.
        YOLO defect analysis then runs per-coach using these correctly-assigned frames.
```

---

### Concrete Example (use in assets)

```
Session VB-2025-001   Train VB-22901
4 cameras: CAM_OCR, CAM_LEFT, CAM_RIGHT, CAM_UNDER

Train passes over the pit. All cameras capture simultaneously.
trigger_id increments with every frame (every 25 raw frames ≈ 1 fps at 25 fps video).

OCR camera observes:
  trigger 75   → OCR reads "B1"     (conf 0.94)
  trigger 148  → YOLO sees GAP      (conf 0.88)   ← Bogie 1 / Bogie 2 boundary
  trigger 149  → YOLO sees GAP      (conf 0.91)   ← same physical gap, next frame
  trigger 150  → YOLO sees GAP      (conf 0.85)   ← same physical gap, next frame
  trigger 225  → OCR reads "B2"     (conf 0.89)
  trigger 349  → YOLO sees GAP      (conf 0.93)   ← Bogie 2 / Bogie 3 boundary
  trigger 350  → YOLO sees GAP      (conf 0.87)
  trigger 412  → OCR reads "B3"     (conf 0.91)
  trigger 550  → YOLO sees GAP      (conf 0.90)   ← Bogie 3 / Bogie 4 boundary
  trigger 610  → OCR reads "B4"     (conf 0.88)

GAP CLUSTERING:
  Cluster 1 — triggers {148,149,150} → best conf=0.91 → boundary = 149
  Cluster 2 — triggers {349,350}     → best conf=0.93 → boundary = 349
  Cluster 3 — trigger  {550}         → best conf=0.90 → boundary = 550

Bogie ranges (session: trigger 0 – 700):
  Bogie 1 → [  0 – 148 ]   coach "B1"
  Bogie 2 → [149 – 348 ]   coach "B2"
  Bogie 3 → [349 – 549 ]   coach "B3"
  Bogie 4 → [550 – 700 ]   coach "B4"

Frame assignment at trigger_id = 225:
  CAM_OCR    → shows "B2" placard     → coach_id = B2
  CAM_LEFT   → YOLO finds axle_box_cover (component) + rust (HIGH defect)  → coach_id = B2
  CAM_RIGHT  → YOLO finds wheel_assembly (component)                        → coach_id = B2
  CAM_UNDER  → YOLO finds brake_disc (component)                            → coach_id = B2

All four cameras at trigger 225 → Bogie "B2" health report.
```

---

## Prompt 1 — Presentation (Slides)

> Paste this prompt into ChatGPT, Gamma.app, Beautiful.ai, Tome, or any AI slide generator.

```
Create a professional technical presentation titled:
"How VandeInspect Assigns Multi-Camera Frames to the Correct Bogie"

Target audience: Railway engineers and system reviewers with moderate technical background.
Tone: Clear, authoritative, slightly visual-first. No jargon without explanation.
Slide count: 9 slides.
Style: Dark theme (navy/slate background), accent colour electric blue (#0052CC),
       monospace labels for technical terms, clean sans-serif body text.

--- SLIDE STRUCTURE ---

SLIDE 1 — TITLE
  Title:    "Multi-Camera Frame Synchronisation"
  Subtitle: "How VandeInspect ties every frame to the correct bogie before AI analysis"
  Visual:   Four camera icons pointing at a train undercarriage silhouette.
            A single shared counter (trigger_id) pulses across all four cameras at once.

SLIDE 2 — THE CHALLENGE
  Headline: "One train, four cameras, hundreds of frames — how do we know which bogie?"
  Content:
    - As the train passes, 4 cameras record simultaneously
    - Each second produces ~1 frame per camera (every 25th raw video frame)
    - The train has 4 bogies separated by physical gaps
    - The AI must analyse each bogie independently — "which frame belongs to which bogie?"
    - Wrong assignment → correct camera, wrong bogie → wrong health score
  Visual: Overhead diagram of train with 4 bogies labelled B1–B4.
          Below it, 4 camera icons capturing frames as the train moves.
          Red question mark over "Which bogie is this frame from?"

SLIDE 3 — THE SHARED KEY: trigger_id
  Headline: "All cameras share one counter: trigger_id"
  Content:
    - All cameras start recording at exactly the same instant
    - trigger_id = the raw video frame number
    - Because cameras start together, trigger_id 225 on CAM_LEFT
      and trigger_id 225 on CAM_RIGHT represent the SAME physical moment
    - No GPS, no hardware trigger, no clock sync — physics does it
  Visual: Four horizontal timelines (one per camera), all ticking the same trigger_id.
          A vertical green line at trigger_id 225 crosses all four timelines.
          Label: "Same moment in time — same trigger_id"
  Code label (small monospace box):
    trigger_id = raw_video_frame_number
    # Same value across all cameras = same instant

SLIDE 4 — THE OCR CAMERA SEES TWO THINGS
  Headline: "Step 3: OCR camera detects gaps AND bogie numbers"
  Content:
    - One dedicated camera faces the bogie number panels
    - A YOLO model runs on each OCR-camera frame and detects:
        1. "gap" class → the physical space between two adjacent bogies
        2. Bogie number text → OCR reads the number from the panel
    - Every "gap" detection is saved with its trigger_id → gap_detections table
    - Every coach number reading is saved with its trigger_id → ocr_results table
  Visual: Single camera frame split into two annotation boxes:
    Left box: bounding box around the gap region, labelled "GAP (conf 0.91)"
    Right box: bounding box around the bogie placard, labelled "B2 (conf 0.89)"

SLIDE 5 — GAP CLUSTERING: ONE GAP, MANY FRAMES
  Headline: "Step 4: A gap is seen across multiple frames — cluster them"
  Content:
    - As the train moves, the same physical gap passes the camera over ~3–5 frames
    - This creates a cluster of consecutive gap_detections near the same trigger_id
    - Algorithm:
        Detections within 30 trigger_ids → same cluster
        Pick the highest-confidence detection in each cluster
        That trigger_id becomes the canonical gap boundary
  Visual: A zoomed-in timeline showing triggers 148, 149, 150 — all labelled "GAP".
          A bracket groups them. Arrow points to "Boundary = trigger 149 (highest conf)".
  Example box:
    Cluster {148, 149, 150} → conf 0.88, 0.91, 0.85 → boundary = 149
    Cluster {349, 350}      → conf 0.93, 0.87        → boundary = 349
    Cluster {550}           → conf 0.90               → boundary = 550

SLIDE 6 — BUILDING BOGIE RANGES
  Headline: "Step 5: Gap boundaries define each bogie's trigger range"
  Content:
    - Boundaries mark the START of a new bogie
    - Together with the session start and end, they split the timeline into ranges
    - Each range = one bogie
  Visual: A single horizontal timeline 0 → 700.
          Three vertical dashed lines at trigger 149, 349, 550.
          Four coloured bands labelled:
            [0–148]   "Bogie 1 — B1"
            [149–348] "Bogie 2 — B2"
            [349–549] "Bogie 3 — B3"
            [550–700] "Bogie 4 — B4"
  Example box:
    Boundaries [149, 349, 550] + session [0, 700]
    Bogie 1: triggers 0 – 148
    Bogie 2: triggers 149 – 348
    Bogie 3: triggers 349 – 549
    Bogie 4: triggers 550 – 700

SLIDE 7 — FINDING THE COACH NUMBER FOR EACH BOGIE
  Headline: "Step 6: Identify the coach number from OCR readings in that range"
  Content:
    - For each bogie range, query all OCR readings where the frame's trigger_id falls inside
    - Pick the highest-confidence valid reading
    - Assign that coach number to the entire bogie
  Visual: Bogie 2 range [149–348] highlighted.
          Inside the range, two OCR readings shown:
            trigger 225 → "B2" conf 0.89  ← selected (highest)
            trigger 300 → "B2" conf 0.72
          Arrow: "Coach number for Bogie 2 = 'B2'"

SLIDE 8 — FRAME ASSIGNMENT (the payoff)
  Headline: "Step 7: Every frame from every camera gets its bogie"
  Content:
    - For every frame in the session — from ALL cameras:
        if frame.trigger_id is between a bogie's start and end trigger → assign to that bogie
    - All four cameras' frames at trigger 225 → assigned to coach B2
    - YOLO defect analysis runs per-coach using correctly-assigned frames
  Visual: At trigger 225, four camera thumbnail boxes side by side:
    CAM_OCR   → "B2 placard"   → B2
    CAM_LEFT  → "axle_box_cover + rust defect"  → B2
    CAM_RIGHT → "wheel_assembly"                → B2
    CAM_UNDER → "brake_disc"                    → B2
  All four arrows point to one "Bogie B2 Health Report" badge.

SLIDE 9 — SUMMARY
  Headline: "One trigger_id. One bogie. Zero misassignments."
  Content (3 icons with captions):
    📷 All cameras share trigger_id — same number = same instant
    🔍 OCR YOLO finds the gap boundaries and reads the bogie number
    🎯 Every frame from every camera is assigned to the correct bogie by trigger range
  Tagline at bottom: "VandeInspect — Precision inspection, one trigger at a time."
```

---

## Prompt 2 — Infographic (Single Image)

> Paste this prompt into Adobe Firefly, Canva AI, Midjourney (with text), DALL-E,
> or hand it to a designer in Figma.

```
Design a single-page technical infographic titled:
"How VandeInspect Assigns Frames to Bogies"

Format:      Portrait A4 or 1080×1920 px (social/print friendly)
Colour theme: Deep navy background (#051a3e), electric blue accents (#0052CC),
              white body text, amber (#f59e0b) for warnings/highlights,
              green (#10b981) for success states, red (#ef4444) for defects.
Font:         Sans-serif headings, monospace for code/IDs.
Style:        Technical diagram meets clean infographic —
              think railway operations room display, not a slide deck.

--- LAYOUT (top to bottom) ---

[HEADER BAND — full width]
  Logo placeholder (left) | Title: "Frame Synchronisation via Bogie Gap Detection" (centre)
  Subtitle: "How VandeInspect ties 4 cameras to the right bogie automatically" (right, smaller)

[SECTION 1 — "The Setup"]
  Left side:  Overhead illustration of a Vande Bharat train on a pit inspection track.
              Below the train: 4 camera icons (CAM_OCR, CAM_LEFT, CAM_RIGHT, CAM_UNDER).
              Arrows from each camera up toward the train undercarriage.
  Right side: Short paragraph:
              "Four cameras record the undercarriage simultaneously.
               Because they start at exactly the same instant,
               every frame shares a single counter — the trigger_id —
               which represents the same physical moment across all cameras."

[SECTION 2 — "The Shared Counter: trigger_id"]
  Four parallel horizontal timeline bars (one per camera, colour-coded).
  Each bar has tick marks at 0, 75, 149, 225, 349, 412, 550, 610.
  A single vertical GREEN line crosses all four bars at trigger_id 225.
  Label on the line: "trigger_id 225 — same instant, all cameras"
  Below: monospace code box:
         trigger_id = raw_video_frame_number
         # Same value → same physical moment

[SECTION 3 — "What the OCR Camera Sees"]
  Two side-by-side frame illustrations (simulated camera view at trigger 149):
  LEFT frame:  A gap region between two bogies, with a bounding box overlay.
               Label: "GAP detected — trigger_id 149, conf 0.91"
  RIGHT frame: A bogie number panel showing "B2", with bounding box.
               Label: "Coach number 'B2' — trigger_id 225, conf 0.89"
  Caption below:
    "The OCR camera detects TWO things per frame:
     the physical gap (boundary marker) and the bogie number (coach label)."

[SECTION 4 — "Gap Clustering → Boundaries" — center of page, largest section]
  Title chip: "Algorithm: cluster_gaps() + build_bogie_ranges()"

  Step-by-step flow (horizontal numbered steps connected by arrows):

    ① DETECT GAPS
       Multiple consecutive frames see the same physical gap.
       [Three small frame boxes at triggers 148, 149, 150, all labelled "GAP"]
       Conf: 0.88 / 0.91 / 0.85

    ② CLUSTER
       Detections within 30 trigger_ids → same cluster.
       Pick highest confidence.
       [Bracket grouping the three frames → arrow → "Boundary = 149"]

    ③ BUILD RANGES
       Boundaries [149, 349, 550] + session [0 → 700]
       [Horizontal bar split into 4 coloured bands]
       Bogie 1: [0–148] · Bogie 2: [149–348] · Bogie 3: [349–549] · Bogie 4: [550–700]

    ④ NAME EACH BOGIE
       Query OCR results within each range → pick highest-confidence reading.
       Bogie 1 → "B1"  ·  Bogie 2 → "B2"  ·  Bogie 3 → "B3"  ·  Bogie 4 → "B4"
       [Database icon with green checkmark]

[SECTION 5 — "Worked Example" — card/box style]
  Title: "Session VB-2025-001 · Train VB-22901 · trigger_id 225"
  Two-column layout:

  LEFT COLUMN — Gap boundaries:
    Cluster 1 → boundary 149 (conf 0.91)
    Cluster 2 → boundary 349 (conf 0.93)
    Cluster 3 → boundary 550 (conf 0.90)

    Bogie ranges:
    B1: triggers   0 – 148
    B2: triggers 149 – 348   ← trigger 225 falls here
    B3: triggers 349 – 549
    B4: triggers 550 – 700

  RIGHT COLUMN — Frame assignment at trigger 225:
    [CAM_OCR thumbnail]    → "B2" placard → Bogie B2
    [CAM_LEFT thumbnail]   → axle_box_cover ✓ + rust ⚠ HIGH → Bogie B2
    [CAM_RIGHT thumbnail]  → wheel_assembly ✓ → Bogie B2
    [CAM_UNDER thumbnail]  → brake_disc ✓ → Bogie B2

[SECTION 6 — "What Happens Next"]
  Pipeline arrow (left to right):
  [Assigned Frames] → [YOLO Defect Analysis] → [Per-Bogie Health Score] → [Inspection Report]
  Below each node: 1-line caption
  "trigger_id sets the bogie" | "Detections per camera" | "Penalties by severity" | "B1: 92% B2: 78% ..."

[FOOTER BAND]
  Left:  "VandeInspect AI Inspection System"
  Right: "Gap boundaries + trigger_id together ensure every AI detection is tied to the right bogie."
  Thin electric-blue rule separating footer from body.
```

---

## Quick Reference — Key Numbers for Both Assets

| Parameter | Value in system | Where set |
|---|---|---|
| Default frame interval | Every 25th raw frame (1 fps at 25 fps video) | `frames_per_second=1.0` in ExtractRequest |
| Gap cluster radius | 30 trigger_ids | `GAP_CLUSTER_RADIUS` in sync_engine/engine.py |
| Minimum confidence for gap | 0.5 | `GAP_MIN_CONFIDENCE` in sync_engine/engine.py |
| Concurrency (YOLO workers) | 4 parallel threads | `CORRELATION_CONCURRENCY=4` env var |
| YOLO confidence threshold | 0.35 | `YOLO_CONF=0.35` env var |
| Defect classes | 11 (crack, rust, leakage, deformation, missing_part, broken, puncture, hanging, loose, hole, smoke_emission) | `DEFECT_LABELS` in YOLO server |
