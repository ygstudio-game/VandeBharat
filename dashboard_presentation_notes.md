# VandeInspect AI — Dashboard Presentation Notes

**Screen:** Live Train Monitor (the Dashboard / home screen)
**Audience:** Client / stakeholders
**Goal of these notes:** present every element on the Dashboard, define every term, and explain what each control does.

> How to use this file: each numbered section = one part of the screen, top to bottom. "Say this" = speaker script. "What it is" = plain definition. "Functionality" = what it actually does. A full glossary is at the end.

---

## 0. Opening line (set the scene)

**Say this:**
"This is the Live Train Monitor — the control room's home screen. The moment a Vande Bharat train's camera footage is uploaded, everything you see here updates in real time: how many trains we inspected today, what the AI is currently processing, and any defects it has flagged. No refresh needed — the screen pushes updates to itself."

---

## 1. Header + Live Connection Badge

**What it is:** The page title "LIVE TRAIN MONITOR" and a status pill on the right.

**The badge has two states:**

| Badge | Meaning |
|---|---|
| 🟢 **LIVE ENGINE SYNCED** (green, pulsing) | Real-time channel (WebSocket) is connected — updates arrive the instant they happen |
| 🟠 **POLLING MODE** (amber) | Real-time channel dropped; screen falls back to auto-refreshing every few seconds. Still live, just slightly slower |

**Say this:** "The green dot tells the operator the system is connected live. If it ever turns amber, the dashboard still works — it just refreshes on a timer instead of instantly. Nothing breaks."

---

## 2. Quick Actions (task-first shortcuts)

**What it is:** A row of large buttons for the three most common operator tasks. Each shows a live count and jumps to the right page.

| Button | Live number shown | Goes to | Who sees it |
|---|---|---|---|
| **Review Defect Alerts** | number of critical defects | Defect Alert Console | Everyone |
| **Reports to Sign** | number of reports awaiting signature | Reports page | Only **Admin** & **RDSO Inspector** (people allowed to sign) |
| **Add Camera Footage** (highlighted) | "Start a new inspection" | Sessions / upload | Everyone |

**Say this:** "Instead of hunting through menus, the three things an operator does most are one click away — and each one already shows how many items are waiting. 'Reports to Sign' only appears for people who actually have signing authority."

---

## 3. KPI Strip (six headline numbers)

**What it is:** Six cards summarizing the whole operation at a glance. "KPI" = Key Performance Indicator — a single headline number. These auto-refresh every 10 seconds.

| Card | Definition |
|---|---|
| **Trains Today** | Inspection sessions started today |
| **Reports Ready** | Sessions that finished processing and have a report |
| **Processing** | Sessions the AI is actively working on right now |
| **Queued** | Sessions waiting their turn to be processed |
| **Critical Alerts** | Count of critical defects found |
| **Failed Sessions** | Runs that errored out and need attention |

**Say this:** "These six numbers are the pulse of the system. At a glance: how many trains today, how many reports are ready, what's processing now, what's waiting, how many critical problems, and anything that failed."

---

## 4. Active Train Rake (the visual centrepiece)

**What it is:** A live picture of the train currently being inspected — a locomotive followed by each coach, drawn as a connected rake. "Rake" = railway term for a full set of coupled coaches forming one train.

**Each coach is colour-coded by status:**

| Colour | Status | Meaning |
|---|---|---|
| Grey | **Pending** | Not yet inspected |
| Blue (pulsing) | **Processing** | AI inspecting it now |
| Green | **Clean** | No defects |
| Amber | **Missing Parts** | A component is missing |
| Red | **Critical Defect** | Serious fault found |

**Functionality:**
- A **red number badge** on a coach = how many critical defects it has; an amber "!" = missing parts.
- **Click any coach** → opens that train's full Train Workspace.
- Shows train number, short session ID, status, coach count, and progress %.
- "**Open Workspace →**" link jumps to the detailed view.
- If coaches aren't mapped yet, it shows placeholder coaches so the operator still sees the train shape forming.
- A **legend** under the rake explains every colour.

**Say this:** "This is the train, live. Each box is a coach, coloured by its result — green is clean, red is a critical defect, amber means a part is missing. The number on a red coach tells you how many critical issues it has. Click any coach to drill straight into it."

---

## 5. Processing Queue (left column) — Live Train Cards

**What it is:** A live list of every session currently being processed, each shown as a detailed "Live Train Card". "Manage Queue" button (top-right) opens the full Live Queue page. If nothing's running, it shows "No active sessions — upload a video to start."

**Each Live Train Card shows:**
- Session ID, train number, status badge, and overall **progress %** ("Telemetry Sync").
- A **5-step progress tracker** — the heart of the card. The AI pipeline broken into five visible stages:

| Step | Plain meaning |
|---|---|
| **1. Frame Extraction** | Splitting the video into still images |
| **2. Coach Number Detection** | Reading each coach's number off its placard (OCR) |
| **3. Sync & Coach Mapping** | Grouping images so each coach's frames line up correctly |
| **4. Component & Defect Detection** | Checking parts and finding faults |
| **5. Report Generation** | Building the final signed report |

Each step shows as **done** (green tick), **in progress** (pulsing play icon, e.g. "Mapping bogies…"), **failed** (alert icon), or **pending** (numbered, grey).

- Bottom stats row:

| Stat | Definition |
|---|---|
| **BOGIES** | Number of coaches detected ("bogie" = the coach/wheel-assembly unit) |
| **CRIT_DFCTS** | Critical defects found so far (pulses red if any) |
| **COACH_CONF** | Confidence % that the coach numbers were read correctly |
| **SYNC_CONF** | Confidence % that camera feeds are correctly aligned |

- "**Open Workspace**" button → full detail view.

**Say this:** "Every train being processed gets its own card with a five-step tracker, so you can literally watch the AI work — extracting frames, reading coach numbers, syncing cameras, finding defects, then generating the report. The confidence percentages tell you how sure the AI is about its coach reading and camera alignment."

---

## 6. Recent Defects (Detection Log Table)

**What it is:** A live table of the latest faults the AI flagged across all inspections — not just the current train.

**Filters (top-right):**
- **Train number** text box — filter to one train.
- **Date** picker — filter to one day.
- **Location** dropdown — filter to one station.
- **Clear** — resets all filters.
- **View All** → opens the full Defect Alert Console.

**Table columns:**

| Column | Definition |
|---|---|
| **Image ID** | The specific captured frame (e.g. IMG-42) |
| **Date & Time** | When that frame was captured |
| **Location** | Station where it was inspected |
| **Train No** | Which train |
| **Bogie No** | Which coach |
| **Camera** | Which camera caught it |
| **Component** | The part seen in the frame |
| **Defect** | The fault type + its **severity** (Critical / Review) |

**Functionality inside the table:**
- **Search box** — free-text search across component, defect, frame, train, camera, location.
- **"DEFECTS ONLY" toggle** — hide clean frames, show only faults.
- **Sortable columns** — click any header to sort.
- **VIEW** button — opens the actual annotated image in a popup (Defect Preview Modal), showing the AI's bounding box on the defect.
- **REPORT** button — jumps to the full report for that session.
- Footer shows "X / Y frames shown" with active filters.

**Say this:** "This is the running log of everything the AI has flagged. You can filter by train, date, or station, search freely, or show only the defect frames. Hit 'View' to see the actual photo with the AI's box drawn around the problem, or 'Report' to open the full inspection record."

---

## 7. How the Dashboard stays live (the mechanism — optional technical slide)

**What it is:** Two systems keep the screen fresh.

| Mechanism | Plain meaning |
|---|---|
| **WebSocket (live push)** | The server instantly pushes events — "session completed", "defects found", "coaches mapped", "session failed" — and the screen reacts immediately with a pop-up notification (toast) |
| **Polling (auto-refresh fallback)** | On a timer the screen re-asks the server: KPIs every 10s, the queue every 5s, defects every 15s. Used if the live push is unavailable |

**Live notifications (toasts) the operator sees:**
- "New Report Ready" when a train finishes.
- "Defect Alert — X new defects, Y critical" when faults are found.
- "Pipeline Error" if a session fails.

**Say this:** "The dashboard never goes stale. It listens for live events and pops a notification the moment a train finishes or a defect is found — and as a safety net, it also refreshes on a timer."

---

## 8. Closing line

**Say this:**
"So in one screen: the operator sees the day's totals, watches the current train being inspected coach-by-coach, tracks every job in the queue through five clear stages, and reviews every flagged defect with the actual evidence photo — all updating live. From here, one click takes them into any train, any defect, or any report."

---

## Glossary — every term, defined

| Term | Definition |
|---|---|
| **Session / Inspection** | One train passage being processed — from video upload to final report |
| **Pipeline** | The automated chain of AI steps that turns raw video into results |
| **Rake** | A full set of coupled coaches forming one train |
| **Coach / Bogie** | One carriage of the train (bogie = its wheel-and-frame unit; used interchangeably here) |
| **Loco** | The locomotive (engine) at the head of the rake |
| **Frame** | A single still image extracted from the video |
| **OCR** | Optical Character Recognition — the AI reading the printed coach number |
| **Coach Number Detection** | Using OCR to identify which coach is which |
| **Synchronization / Sync** | Aligning frames from multiple cameras so each coach's images match up |
| **Component** | A train part the AI looks for (e.g. suspension, brake unit) |
| **Defect** | A fault the AI detects on a part |
| **Severity** | How serious a defect is — **Critical**, **Review**, or **None** |
| **Critical Defect** | A serious fault needing urgent attention (shown red) |
| **Missing Parts** | A required component the AI couldn't find (shown amber) |
| **Health Score** | Overall condition rating for a coach/train |
| **Confidence (COACH_CONF / SYNC_CONF)** | How sure the AI is about a reading, as a % |
| **KPI** | Key Performance Indicator — a single headline number |
| **Queued / Processing / Completed / Failed** | The four states a session moves through |
| **Sign-off** | A human (Admin or RDSO Inspector) approving and signing the final report |
| **False Positive** | A defect the AI flagged that a human reviews and rejects as not real |
| **WebSocket** | The live-push connection that updates the screen instantly |
| **Polling** | Auto-refresh on a timer, used as a fallback |
| **Toast** | A small pop-up notification (e.g. "New Report Ready") |
| **RDSO** | Research Designs & Standards Organisation — Indian Railways' standards body; an inspector role here |

---

## One-page functionality checklist (for quick reference while presenting)

| # | Dashboard element | Key functions |
|---|---|---|
| 1 | Header badge | Live (WebSocket) vs Polling status |
| 2 | Quick Actions | Review defects · Reports to sign (role-gated) · Add footage |
| 3 | KPI strip | 6 live metrics, refresh every 10s |
| 4 | Active Train Rake | Colour-coded coaches, defect badges, click-to-open, legend |
| 5 | Processing Queue | Live cards, 5-step tracker, confidence stats, manage-queue link |
| 6 | Recent Defects table | Filter (train/date/station), search, defects-only, sort, view image, open report |
| 7 | Live mechanism | WebSocket push + polling fallback + toast notifications |

---

*These notes describe the Dashboard exactly as it currently functions in the application.*
