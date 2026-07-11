# Vande Bharat / MVIS Dashboard — Google Stitch Visualization Prompts

> Purpose: paste these into Google Stitch to visualize each screen BEFORE coding.
> No code is changed. Based on the actual `frontend/` app (React 19 + Tailwind 4 + shadcn/ui + recharts).
> App = "Machine Vision Inspection System" (MVIS) for Vande Bharat train inspection: AI reads coach numbers (OCR) and detects defects from station camera footage; inspectors review and sign reports.

---

## 1. Dashboard UI/UX Audit

**Stack found:** React 19, Vite, Tailwind 4, shadcn/ui, recharts, zustand, react-router 7. 26 routes, ~30 page files.

**Core problems making it look "student-level":**
1. **Two clashing visual languages** — half the pages use design tokens + a heavy `font-black uppercase` industrial style (Dashboard, Login, Settings, Command Center, Live Queue); the other half hard-code raw `gray/slate/white` with plain weights (Stations, AI Training, Root Cause, Train History, Datasets). Looks like two different apps stitched together.
2. **No shared page chrome** — every page invents its own header size/style; no breadcrumbs, no consistent toolbar.
3. **Duplicated filter bars** — the same train#/date/station filter trio is rebuilt inline in 6 pages.
4. **Overloaded mega-screens** — Reports (1910 lines), TrainWorkspace (1581), Sessions (993) show list + viewer + player + intelligence all at once.
5. **Two overlapping "command centers"** — `/dashboard` and `/command-center` share KPIs; unclear which to use.
6. **Bespoke modals/badges/KPI tiles** re-implemented per page; shadcn primitives bypassed.
7. **Inconsistent empty/loading states** — some skeletons, some spinners, some plain text, some nothing.
8. **Three brand names** — `RDSO_MVIS`, `VANDE INSPECT AI`, `Machine Vision-based Inspection System`.

**Fix direction:** one enterprise SaaS system (Linear/Vercel/Stripe/Railway quality) — light background, subtle borders, soft shadows, rounded cards, single indigo/blue accent, clear type scale, grouped navigation, progressive disclosure.

---

## 2. New Dashboard Navigation Structure

Grouped, role-scoped sidebar (sections always visible, items indented; multiple sections open at once):

```
OVERVIEW
  • Home                  (all)
  • Stations              (admin, inspector, officer)
OPERATIONS
  • Processing Queue      (all)
  • Inspections           (all)
  • Defect Alerts         (all)
  • Verify Defects        (admin, inspector)
RECORDS
  • Reports               (all)
  • Train History         (all)
  • Coach Number Log      (all)
  • Image Archive         (admin, inspector, officer)
  • Analytics             (admin, inspector, officer)
  • Root Cause            (admin, inspector, officer)
  • Audit Log             (admin)
SYSTEM & AI
  • Command Center        (admin, inspector, officer)
  • Cameras               (admin, inspector)
  • System Health         (admin)
  • Data Sync             (admin)
  • AI Engine             (admin)
  • AI Accuracy           (admin)
  • Datasets              (admin)
  • AI Training           (admin)

Top bar: breadcrumb · global search · notifications · avatar menu (Settings, Profile, Sign out)
```

Roles: `admin`, `rdso_inspector`, `zr_officer`, `field_staff`.

---

## 3. List of Pages Found in Project

Home (Dashboard), Stations overview, Station Workspace (tabbed), Operations Command Center, Processing/Live Queue, Inspections (Sessions), Train Workspace (frame review), Train Movement Timeline, Defect Alert Console, Defect Verification Console, Coach Number Log (OCR), Reports, Train Passage History, Image Archive, Audit & Compliance, Analytics, Root Cause Analysis, Camera Health, System Health (Infrastructure + Railway Assets), Data Sync Hub, AI Inference (Engine), AI Performance (Accuracy), Datasets, AI Training Workbench, Settings, Login.

---

## 4. Recommended Dashboard Flow

- **Inspector/Field:** Home → active train → Train Workspace → review defects → sign report.
- **Ops/Admin:** Command Center → service/camera health → log incident.
- **Investigation:** Stations → station hub tabs; Records → Reports/History/Analytics/Root Cause.
- **Admin/AI:** AI Lab (Engine/Accuracy/Datasets/Training), System Health, Settings.

---

## MASTER STYLE BLOCK (prepend to every Stitch prompt)

> **Global style:** Enterprise SaaS admin dashboard, comparable to Linear, Vercel, Stripe, and Railway. Clean light background (#F8FAFC canvas, #FFFFFF cards). Subtle 1px borders (#E2E8F0), soft shadows, 12px rounded corners. Single professional accent: indigo/blue (#2563EB). Neutral slate text (#0F172A headings, #64748B secondary). Semantic colors: emerald (success/online), amber (warning/degraded), red (critical/offline), cyan (processing). Typography: Geist / Inter — clear hierarchy, 24px page titles, 14px body, 11px uppercase micro-labels for captions only (no all-caps headlines). Generous spacing, minimal line icons (Lucide style), tabular numerals for metrics. Left sidebar 256px with grouped sections. Sticky top bar with breadcrumb, search, notifications, avatar. Status shown as small pill badges (dot + label). Fully responsive: sidebar collapses to an icon rail under 1440px and to a drawer under 1024px; tables scroll/stack on mobile. Soft, premium, calm — never childish, no rainbow gradients, no overcrowding. Smooth micro-interactions: hover lift on cards, 150ms transitions, skeleton loaders, focus rings.

---

## 5. Google Stitch Prompt for Main Dashboard (Home)

**PAGE NAME:** Home (Live Train Monitor)
**Purpose:** Role-aware landing — show what needs the user's attention now (active inspections, critical defects, reports to sign).
**Current UI problem:** Dead commented code, overlaps Command Center, everything visible, heavy uppercase headings, inline filters.
**New UX goal:** "What do I do next" obvious in 3 seconds; ≤3 priority actions above the fold.
**Recommended layout:** Sidebar + top bar; main = page header, quick-action row, KPI strip, active rake visualization, two-column (queue | attention), recent-defects table.
**Sections:** Quick Actions; KPI overview; Active Train Rake; Processing Queue; Recent Defects.
**Primary actions:** Add Camera Footage (new inspection); Review Defect Alerts; Reports to Sign (inspector).
**Secondary actions:** Manage Queue; filter recent defects; open a defect frame.
**Data cards needed:** Trains Today, Reports Ready, Processing, Queued, Critical Alerts, Failed Sessions.
**Tables/lists:** Processing queue (live train cards); Recent Defects table (image, time, station, train, coach, camera, defect, severity).
**Empty state:** "No active inspections — upload camera footage to start" + CTA.
**Loading state:** KPI + queue skeletons.
**Responsive:** KPI 2→3→6 cols; two-column stacks under 1024.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design an enterprise dashboard **Home** screen for a railway AI inspection system. Left sidebar (256px) with grouped nav sections — OVERVIEW (Home active, Stations), OPERATIONS (Processing Queue, Inspections, Defect Alerts, Verify Defects), RECORDS, SYSTEM & AI — section labels as small grey uppercase captions, items with minimal line icons, active item highlighted in light indigo. Sticky top bar: breadcrumb "Home", centered search field, notification bell with red dot, user avatar with name and role. Main area on light grey canvas: (1) page title "Home" with a small green "Live engine synced" pill on the right; (2) a row of 3 quick-action cards — primary filled indigo "Add Camera Footage / Start a new inspection" with a plus icon, and two white outline cards "Review Defect Alerts / 3 critical" and "Reports to Sign / 5 awaiting signature", each with an icon and chevron; (3) a strip of 6 white KPI cards with soft shadow showing Trains Today, Reports Ready, Processing, Queued, Critical Alerts, Failed Sessions — each with tiny uppercase label, large tabular number, small status-colored icon; (4) an "Active Train Rake" card showing a horizontal row of coach tiles colored by inspection status (green ok, amber warning, red defect, grey pending); (5) a two-column section — left wider "Processing Queue" with live train cards (train number, station, progress bar, status pill), right "Needs Attention" feed; (6) a "Recent Defects" table with a filter bar (train number input, date picker, station dropdown) and columns Image, Time, Station, Train, Coach, Camera, Defect, Severity (severity as colored pill). Include hover lift on cards, skeleton loaders, and an empty-state illustration for the queue. Responsive: collapse sidebar to icon rail on tablet, single column on mobile.

---

## 6. Google Stitch Prompt for Each Page

### PAGE NAME: Stations Overview
**Purpose:** Fleet of inspection stations and their live health.
**Current UI problem:** Raw slate/white colors off-theme; inline KPI tiles; bespoke badges.
**New UX goal:** Clean station grid as the operational map.
**Recommended layout:** Page header + time-window filter + refresh; KPI strip; responsive station-card grid.
**Sections:** Summary KPIs; Station grid.
**Primary actions:** Open a station; change time window (All/6h/12h/24h); refresh.
**Secondary actions:** Scan camera/uptime per card.
**Data cards:** Total Stations, Online, Degraded, Offline, Active Sessions.
**Tables/lists:** Station cards (code, name, status pill, cameras/active/sessions, uptime bar, edge machine, last inspection).
**Empty state:** "No stations configured — add camera setups."
**Loading state:** card skeleton grid.
**Responsive:** 1→2→3 columns.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **Stations Overview** screen. Same sidebar + top bar (breadcrumb "Stations"). Header row: title "Stations" with last-updated timestamp, a segmented time-window toggle (All · 6h · 12h · 24h), and a "Refresh" button with spin icon. Below: a strip of 5 KPI cards — Total Stations, Online (emerald), Degraded (amber), Offline (red), Active Sessions (indigo). Then a responsive 3-column grid of station cards: each white rounded card shows station code (small grey caps), station name (bold), a status pill top-right, a 3-up mini stat row (Cameras / Active / Sessions), a thin camera-uptime progress bar with percentage, a footer line with edge-machine hostname + IP and a "Last inspection" timestamp. Cards hover-lift and are clickable. Include a skeleton grid loading state and an empty state with a map-pin icon. Responsive: 3→2→1 columns.

### PAGE NAME: Station Workspace (tabbed hub)
**Purpose:** Everything for one station in one place.
**Current UI problem:** Raw colors; some dead tab branches.
**New UX goal:** Polished station hub with breadcrumb and station-scoped tabs.
**Recommended layout:** Breadcrumb + station identity header + status + edge machine; sticky tab bar; tab content.
**Sections:** Identity header; Tabs (Inspections, Defect Alerts, Reports, Train History).
**Primary actions:** Switch tab; back to all stations.
**Secondary actions:** View edge machine info.
**Data cards:** station status + edge machine summary.
**Tables/lists:** per-tab (sessions, defects, reports, history) scoped to station.
**Empty state:** per tab ("No reports for this station").
**Loading state:** spinner then tab skeletons.
**Responsive:** tabs scroll horizontally on mobile.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **Station Workspace** detail screen. Breadcrumb "Stations / Mumbai Central". Sticky station header: map-pin icon chip, station code (grey caps) and name (bold), a status pill (Online/Degraded/Offline), and on the right an edge-machine card (server icon, hostname, IP). Below the header a horizontal tab bar with underline-style active tab: Inspections, Defect Alerts, Reports, Train History — each with a minimal icon. Tab content area shows a station-scoped data table (e.g. recent sessions: Train, Code, Status pill, Health %, Critical count, Started). Clean, calm, lots of whitespace. Include per-tab empty states and skeleton loading. Responsive: header stacks, tabs become a scrollable row on mobile.

### PAGE NAME: Operations Command Center
**Purpose:** Ops/infra lens — service status, system health, camera alerts, incident log.
**Current UI problem:** Duplicates Home KPIs; dense; inline incident modal.
**New UX goal:** Distinct operations control room (not a second Home).
**Recommended layout:** Page header + station filter; ops KPI strip; grid of Services / System Health / Camera Alerts / Incident Log.
**Sections:** Ops KPIs; Services; System health; Camera alerts; Incidents.
**Primary actions:** Log Incident; filter by station; refresh.
**Secondary actions:** Filter incidents; view service detail.
**Data cards:** Uptime, Open Incidents, Services OK, Camera Alerts.
**Tables/lists:** Incident log table; services status list.
**Empty state:** "No active incidents."
**Loading state:** per-panel skeletons.
**Responsive:** 2-col grid → single column.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design an **Operations Command Center** screen — a calm control-room view for admins. Header: title "Command Center", a station filter dropdown, a refresh button, and a primary indigo "Log Incident" button. Top KPI strip focused on operations: System Uptime %, Open Incidents, Services Healthy (e.g. 8/8), Camera Alerts. Main grid (2 columns): left column = "Services" status list (service name, small status dot green/amber/red, latency) and a "System Health" card with CPU/GPU/storage progress bars; right column = "Camera Alerts" compact list and a wide "Incident Log" table (severity pill P1–P4, title, assigned to, status, time). Provide a centered modal for "Log Incident" with fields Title, Severity, Description, Assigned To. Include empty state "No active incidents" and skeleton loaders. Responsive: grid collapses to one column.

### PAGE NAME: Processing / Live Queue
**Purpose:** Control the AI ingestion queue.
**Current UI problem:** Heavy uppercase headings; inline KPI tiles.
**New UX goal:** Clear queue control with active vs settings split.
**Recommended layout:** Page header; KPI strip; tabs (Active | Settings); queue table + concurrency/trigger controls.
**Data cards:** Active Now, Queued, Max Concurrency, Trigger Mode.
**Tables/lists:** active jobs; queued jobs.
**Empty state:** "Queue is empty."
**Loading state:** table skeleton.
**Responsive:** table scroll.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **Processing Queue** screen for an AI inference pipeline. Header "Processing Queue" with a segmented toggle (Active | Settings). KPI strip: Active Now, Queued, Max Concurrency (e.g. 2 streams), Trigger Mode (Manual/Auto). Active tab: a list/table of jobs with train number, station, a live progress bar, current stage, and a status pill (Queued/Processing/Completed/Failed). Settings tab: a card with max-concurrency stepper and a Manual/Auto-sensor trigger toggle. Empty state "Queue is empty — upload footage to begin." Skeleton loaders, hover states. Responsive: KPI cards wrap, table scrolls horizontally.

### PAGE NAME: Inspections (Sessions)
**Purpose:** List inspections + start a new one via wizard.
**Current UI problem:** 993-line page mixing upload wizard + list + coach search + filters all visible.
**New UX goal:** List-first; "New Inspection" wizard in a right drawer.
**Recommended layout:** Page header + New CTA; filter bar; sessions table (expandable rows); wizard drawer.
**Data cards:** optional summary chips (today, processing, completed).
**Tables/lists:** sessions table (train, station, status, severity, started, coaches).
**Empty state:** "No inspections yet — start one."
**Loading state:** table skeleton + upload progress.
**Responsive:** table scroll; wizard full-screen on mobile.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design an **Inspections** list screen. Header "Inspections" with a primary indigo "New Inspection" button. A filter bar: search field, status dropdown, severity dropdown, station dropdown, date picker, and a Clear link. A clean data table of inspection sessions: Train Number (mono), Station, Status pill, Severity pill, Started time, Coaches count, and an expand chevron revealing detail. On clicking New Inspection, show a right-side slide-in drawer wizard with steps (1 Train details, 2 Upload OCR/coach video, 3 Upload component camera videos, 4 Confirm) including a frames-per-second setting and an auto-detect toggle, with a progress indicator. Empty state "No inspections yet." Skeleton table rows. Responsive: drawer becomes full-screen, table scrolls.

### PAGE NAME: Train Workspace (frame review cockpit)
**Purpose:** Review inspection frames, AI overlays, defects, and pipeline stages for one train.
**Current UI problem:** 1581-line monster; viewer + overlays + tree + intelligence + fullscreen all at once.
**New UX goal:** Focused review cockpit with collapsible side panels.
**Recommended layout:** Slim header (train id, stage chips, actions); 3 zones — left coach/camera tree, center frame viewer + overlay toggles, right intelligence/defects panel; pipeline strip on top.
**Primary actions:** Select coach/camera; toggle OCR/defect/component overlays; fullscreen; generate/sign report.
**Secondary actions:** Zoom, layout mode, navigate frames.
**Data cards:** stage progress chips; defect count per coach.
**Tables/lists:** coach tree; detections list.
**Empty state:** "Pipeline still processing this stage."
**Loading state:** per-zone skeletons.
**Responsive:** zones stack; side panels become drawers.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **Train Inspection Workspace** — a focused review cockpit (like a pro media/annotation tool but clean and enterprise). Top: breadcrumb "Inspections / VB-22804", a slim header with train number, a row of pipeline stage chips (Ingest ✓, OCR ✓, Detect ●processing, Map, Report) and action buttons "Generate Report" and "Sign". Three-column workspace: LEFT collapsible panel = coach + camera tree (coaches C1–C16, each expandable to camera views, defect count badges); CENTER = large frame image viewer with bounding-box overlays and a toggle group above it (OCR boxes, Defect boxes, Component boxes) plus zoom and single/grid layout controls and a fullscreen button; RIGHT collapsible panel = "Coach Intelligence" with detected defects list (type, severity pill, confidence) and a summary. Calm light theme, subtle borders, the image viewer area slightly darker neutral for contrast. Include per-zone skeleton loaders and an empty "still processing" state. Responsive: panels collapse to icons / drawers, viewer stays primary.

### PAGE NAME: Train Movement Timeline
**Purpose:** Chronological pipeline/event timeline for one session.
**New UX goal:** Readable horizontal timeline + event detail.
**Recommended layout:** Breadcrumb + header; horizontal stepper/timeline; event detail panel.
**Empty state:** "No events recorded yet."
**Loading state:** timeline skeleton.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **Train Movement Timeline** screen. Breadcrumb "Inspections / VB-22804 / Timeline". A horizontal timeline/stepper showing pipeline events in order (Footage received → OCR complete → Coaches mapped → Defects found → Report ready) with timestamps, status dots, and durations between steps. Clicking an event shows a detail card on the right (event type, time, payload summary, related coach/camera). Clean, generous spacing, indigo accent on the active node. Empty state and skeleton. Responsive: timeline becomes vertical on mobile.

### PAGE NAME: Defect Alert Console
**Purpose:** Triage incoming AI defect alerts.
**Current UI problem:** off-theme colors; inline preview modal.
**New UX goal:** Fast triage queue.
**Recommended layout:** Page header; filter bar (severity/station/date); defect cards or table; preview modal; bulk acknowledge.
**Data cards:** Critical, Warning, Acknowledged counts.
**Tables/lists:** defect rows (image thumb, type, severity, train, coach, camera, time).
**Empty state:** "No active alerts — all clear."
**Loading state:** list skeleton.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **Defect Alert Console** for triaging AI-detected railway defects. Header "Defect Alerts" with counts (Critical, Warning) as colored chips and an "Acknowledge All" button. Filter bar: severity dropdown, station dropdown, date picker. Main = a list/table of defect alerts, each row with a small thumbnail, defect type, a severity pill (red critical / amber warning), train number, coach, camera, timestamp, and a "Review" action. Clicking opens a centered preview modal with the full frame, bounding box, defect metadata, and Acknowledge/Verify buttons. Empty state "No active alerts — all clear" with a shield-check icon. Skeleton rows, hover highlight. Responsive: rows become stacked cards on mobile.

### PAGE NAME: Defect Verification Console
**Purpose:** Inspector confirms or rejects each AI defect.
**New UX goal:** One-item-at-a-time verification flow.
**Recommended layout:** Page header; queue list + focused verify panel (image + accept/reject + notes).
**Empty state:** "Nothing to verify."
**Loading state:** panel skeleton.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **Defect Verification** screen for inspectors. Left = a queue list of pending AI defects (thumbnail, type, severity, train/coach). Right = a large focused verification panel showing the frame with bounding box, AI predicted defect type and confidence, and clear primary actions: "Confirm Defect" (green) and "Reject / False Positive" (outline red), plus an optional notes field and severity override. Progress indicator "12 of 30 verified". Calm, decisive layout. Empty state "Nothing to verify — queue clear." Skeletons. Responsive: stacks list above panel.

### PAGE NAME: Coach Number Log (OCR Results)
**Purpose:** Searchable ledger of every coach number the AI read.
**New UX goal:** Clean OCR ledger with low-confidence flagged.
**Recommended layout:** Page header; filter bar; table (coach#, confidence, frame, station, time); frame preview modal.
**Empty state:** "No OCR reads found."
**Loading state:** table skeleton.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **Coach Number Log** screen (OCR results ledger). Header "Coach Number Log" with a filter bar (search coach number, station dropdown, date picker, confidence threshold). A data table: Coach Number (mono bold), Confidence % with a small colored bar (green high, amber low), Frame thumbnail link, Station, Camera, Timestamp. Low-confidence rows subtly highlighted amber. Clicking a row opens a frame preview modal with the OCR bounding box. Empty state and skeleton. Responsive: table scrolls horizontally.

### PAGE NAME: Reports
**Purpose:** Browse, open, sign, and export inspection reports.
**Current UI problem:** 1910-line page rendering list + viewer + frame player + intelligence simultaneously.
**New UX goal:** List-first; open a report in a viewer drawer/sub-route.
**Recommended layout:** Page header; filter bar; reports table; report viewer drawer (coach nav, frame player, overlay toggles, sign/export).
**Data cards:** optional (signed, unsigned, critical).
**Tables/lists:** reports table (train, station, status, health, critical, sign state, date).
**Empty state:** "No reports for this filter."
**Loading state:** table + viewer skeletons.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **Reports** screen for railway inspection reports. Header "Reports" with a filter bar (search, status dropdown, station dropdown, date picker). A clean data table: Train Number, Station, Status pill (Draft/Signed), Health Score % (colored), Critical Defects count, Generated date, and actions (View, Export PDF). Clicking "View" opens a large right-side drawer report viewer: left a coach navigator list, center a frame player with playback controls and bounding-box overlay toggles (OCR / Defect / Component), right a "Coach Intelligence" summary panel; a sticky footer with "Sign Report" (primary) and "Export PDF". Empty state "No reports match these filters." Skeleton table + viewer. Responsive: drawer full-screen, table scrolls.

### PAGE NAME: Train Passage History
**Purpose:** Historical record of train passages with compare/trend.
**Current UI problem:** raw gray; inline compare and trend panels.
**New UX goal:** Passage ledger; compare 2 + per-train trend in drawers.
**Recommended layout:** Page header; filter bar; table; compare drawer; trend drawer.
**Empty state:** "No passages recorded."
**Loading state:** table skeleton.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **Train History** screen. Header "Train History" with filter bar (train number, station, date range). A data table of passages: Train, Station, Health Score badge, Critical Defects, Date/Time, and checkboxes to select up to 2 rows for comparison. A "Compare (2)" button opens a side drawer with a two-column comparison (defect counts by severity, health delta). A "Trend" icon per train opens a drawer with a recharts line chart of health over time. Calm enterprise styling, colored health badges. Empty state and skeleton. Responsive: table scrolls, drawers full-screen.

### PAGE NAME: Analytics
**Purpose:** Defect analytics dashboard.
**New UX goal:** Clean charts with consistent palette.
**Recommended layout:** Page header + range filter; KPI strip; chart-card grid; breakdown table.
**Data cards:** Total Defects, Critical Rate, Avg Health, Detection Accuracy.
**Tables/lists:** defect-by-type / by-station breakdown.
**Empty state:** "Not enough data for this range."
**Loading state:** chart skeletons.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design an **Analytics** dashboard for railway defect data. Header "Analytics" with a date-range selector. KPI strip: Total Defects, Critical Rate %, Average Health Score, Detection Accuracy. A grid of chart cards (recharts style, indigo + semantic palette, muted gridlines): a line chart "Defects over time", a bar chart "Defects by type", a horizontal bar "Defects by station", a donut "Severity distribution". Below, a breakdown table. Each chart in a white rounded card with a title and small caption. Empty state "Not enough data for this range." Chart skeletons. Responsive: charts go 2-up then 1-up.

### PAGE NAME: Root Cause Analysis
**Purpose:** Correlate defects to cameras/clusters/trends and log corrective actions.
**Current UI problem:** raw gray; inline action modal; inline filters.
**New UX goal:** Investigation workspace with tabs.
**Recommended layout:** Page header; filter bar; tabs (Camera | Cluster | Trend | Actions); chart cards + strength bars; log-action modal.
**Empty state:** "No correlations found."
**Loading state:** skeletons.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **Root Cause Analysis** screen. Header "Root Cause Analysis" with filter bar (train, station, date) and a primary "Log Corrective Action" button. A tab bar: Camera Correlation, Defect Clusters, Trends, Actions. Camera tab shows correlation cards with horizontal "strength" bars (how strongly a camera/condition correlates with defects). Cluster tab shows grouped defect clusters. Trends tab shows recharts line/area charts. Actions tab shows a table of logged corrective actions. A centered modal to log an action (title, owner, due date, description). Calm, analytical, indigo accent. Empty states + skeletons. Responsive: tabs scroll, cards stack.

### PAGE NAME: Camera Health Monitor
**Purpose:** Camera fleet status at a glance.
**New UX goal:** Clear health grid.
**Recommended layout:** Page header; KPI strip; camera grid/table with uptime bars + status pills.
**Data cards:** Online, Degraded, Offline, Avg Uptime.
**Empty state:** "No cameras registered."
**Loading state:** grid skeleton.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **Camera Health** screen. Header "Cameras" with refresh. KPI strip: Online (emerald), Degraded (amber), Offline (red), Average Uptime %. A responsive grid of camera cards: camera code, type/position, status pill with dot, a thin uptime progress bar with %, and "Last seen" timestamp. Hover lift. Empty state "No cameras registered." Skeleton grid. Responsive: 3→2→1 columns.

### PAGE NAME: System Health (Infrastructure + Railway Assets)
**Purpose:** Node telemetry plus asset registry.
**New UX goal:** One page, two tabs.
**Recommended layout:** Page header; tabs (Nodes/Telemetry | Assets); telemetry cards/progress + asset table.
**Empty state:** per tab.
**Loading state:** skeletons.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **System Health** screen with two tabs: "Nodes & Telemetry" and "Assets". Telemetry tab: cards for GPU inference nodes (e.g. 8/8 OK), sync engines (% capacity), storage pool (% full) — each with a labeled progress bar and status color; plus a node list. Assets tab: a registry data table of railway assets (asset id, type, station, status pill, last service). Clean monospace for telemetry numbers, calm layout. Empty states + skeletons. Responsive: cards wrap, table scrolls.

### PAGE NAME: Data Sync Hub
**Purpose:** Background data synchronization status and control.
**New UX goal:** Clear sync status + manual trigger.
**Recommended layout:** Page header; status cards; jobs table + trigger button.
**Empty state:** "No sync jobs."
**Loading state:** table skeleton.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **Data Sync** screen. Header "Data Sync" with a "Run Sync Now" button. Status cards: Last Sync time, Pending Records, Failed, Sync Health. A jobs table: job type, status pill (Synced/Pending/Failed), records count, started, duration. Calm, technical, indigo accent. Empty state and skeleton. Responsive: cards wrap, table scrolls.

### PAGE NAME: AI Engine (Inference Management)
**Purpose:** Manage the AI inference engine and models.
**New UX goal:** Engine status + model controls.
**Recommended layout:** Page header; engine KPI strip; model/queue table + controls.
**Empty state:** "No models loaded."
**Loading state:** skeletons.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design an **AI Engine** management screen for an inference service. Header "AI Engine". KPI strip: Active Model, GPU Utilization %, Throughput (frames/sec), Queue Depth. A table of loaded models (name, version, status pill Active/Idle, accuracy, last used) with controls to activate/deactivate. A panel showing live inference throughput (small chart). Technical but clean, indigo accent, monospace numerics. Empty state + skeletons. Responsive: KPI wrap, table scrolls.

### PAGE NAME: AI Accuracy (Performance Analytics)
**Purpose:** Model accuracy metrics and comparison.
**New UX goal:** Metric dashboard with charts.
**Recommended layout:** Page header; metric KPIs; chart-card grid; model compare table.
**Empty state:** "No evaluation data."
**Loading state:** chart skeletons.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design an **AI Accuracy** analytics screen. Header "AI Accuracy". KPI strip: Precision, Recall, F1, mAP. Chart cards: precision-recall curve, accuracy-over-versions line chart, a confusion-matrix style heatmap, per-class accuracy bars. Below, a model comparison table (version, precision, recall, F1, deployed badge). Indigo + semantic palette, muted gridlines, white rounded chart cards. Empty state + skeletons. Responsive: charts 2-up then 1-up.

### PAGE NAME: Datasets
**Purpose:** Manage training datasets.
**Current UI problem:** raw gray styling.
**New UX goal:** Clean dataset registry with upload/version.
**Recommended layout:** Page header + upload CTA; dataset cards or table (size, classes, version); upload drawer/modal.
**Empty state:** "No datasets yet."
**Loading state:** card skeleton.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **Datasets** management screen. Header "Datasets" with a primary "Upload Dataset" button. A grid of dataset cards or a table: dataset name, image count, class count, version tag, size, created date, and actions (view, new version). A modal/drawer to upload a dataset (name, files, class config). Clean enterprise styling, indigo accent. Empty state "No datasets yet — upload one to start training." Skeletons. Responsive: grid 3→2→1, modal full-screen on mobile.

### PAGE NAME: AI Training Workbench
**Purpose:** Launch and monitor model training jobs.
**Current UI problem:** raw gray; inline new-job modal.
**New UX goal:** Jobs dashboard with live progress + compare.
**Recommended layout:** Page header + New Job; KPI strip; tabs (Jobs | Compare); jobs table + live progress; new-job modal.
**Empty state:** "No training jobs."
**Loading state:** skeletons.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design an **AI Training Workbench** screen. Header "AI Training" with a primary "New Training Job" button. KPI strip: Running Jobs, Completed, Best Accuracy, GPU Hours. Tabs: Jobs | Compare. Jobs tab: a table of training jobs (name, dataset, status pill Running/Done/Failed, epoch progress bar, accuracy, started) and an expandable live-progress panel with a loss/accuracy chart for the selected job. Compare tab: side-by-side metrics table for selected runs. A centered modal "New Training Job" (model, dataset dropdown, epochs, batch size, learning rate). Technical, clean, indigo accent. Empty state + skeletons. Responsive: table scrolls, modal full-screen.

### PAGE NAME: Image Archive
**Purpose:** Browse archived inspection frames.
**New UX goal:** Fast image grid with filters + preview.
**Recommended layout:** Page header; filter bar; lazy thumbnail grid; preview modal; pagination.
**Empty state:** "No images found."
**Loading state:** thumbnail skeletons.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design an **Image Archive** screen. Header "Image Archive" with filter bar (station, train, date range, defect-only toggle). A responsive masonry/grid of frame thumbnails with subtle hover overlay (coach, camera, timestamp, defect pill if any). Clicking opens a lightbox modal with full image, bounding boxes, metadata, and prev/next. Pagination or infinite scroll. Empty state "No images found." Skeleton tiles. Responsive: grid columns adapt, lightbox full-screen.

### PAGE NAME: Audit & Compliance (Audit Log)
**Purpose:** Admin audit trail of user/system actions.
**New UX goal:** Clean searchable audit table.
**Recommended layout:** Page header; filter bar (user/action/date); audit table; export.
**Empty state:** "No audit entries."
**Loading state:** table skeleton.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design an **Audit Log** screen for admins. Header "Audit Log" with filter bar (user dropdown, action type dropdown, date range) and an "Export" button. A data table: Timestamp, User, Role, Action, Target, IP, Result pill (Success/Failed). Monospace timestamps, subtle zebra rows. Empty state "No audit entries for this filter." Skeleton rows. Responsive: table scrolls horizontally.

### PAGE NAME: Settings
**Purpose:** Detection thresholds, user management, security/2FA, audit.
**Current UI problem:** mixed token usage; inline modals.
**New UX goal:** Tabbed settings with forms in cards.
**Recommended layout:** Page header; tabs (Detection Thresholds | Users | Security | Audit); card forms; user-add + 2FA modals.
**Empty state:** per tab (e.g. no users).
**Loading state:** form/list skeletons.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a **Settings** screen with a left or top tab structure: Detection Thresholds, Users, Security, Audit. Thresholds tab: cards with sliders/number inputs for OCR confidence, brake defect, bolt defect thresholds, plus a Save button with success toast. Users tab: a table (name, email, role pill, 2FA status, actions) with an "Add User" button opening a modal (email, name, password, role). Security tab: a 2FA setup card with QR code modal flow. Audit tab: compact audit table. Clean forms, label-above-input, generous spacing, indigo accent. Empty states + skeletons. Responsive: tabs stack, forms single column.

### PAGE NAME: Login
**Purpose:** Authentication with 2FA.
**New UX goal:** Premium centered/split auth.
**Recommended layout:** Centered card (logo, product name, credentials → 2FA step) optional brand side panel.
**Empty state:** n/a.
**Loading state:** button spinner.

**Google Stitch Prompt:**
> [Paste MASTER STYLE BLOCK]
> Design a premium **Login** screen for "Vande Inspect AI". A centered white card on a soft light background (optional left brand panel with a subtle train/rail illustration and the product name). Card step 1: logo, "Sign in to your account", email field, password field with show/hide, primary indigo "Sign in" button. Step 2: "Two-Factor Authentication" with a single 6-digit code input (large spaced monospace) and verify button. Clean, trustworthy, enterprise. Error state inline. Button loading spinner. Responsive: single centered card on mobile.

---

## 7. Recommended Order to Visualize in Google Stitch

1. **Home (Main Dashboard)** — sets the entire visual language and sidebar.
2. **Login** — quick, locks brand + color.
3. **Stations Overview → Station Workspace** — proves the grouped-nav + drill-down pattern.
4. **Inspections → Train Workspace → Reports** — the core inspection journey end-to-end.
5. **Defect Alert Console → Defect Verification → Coach Number Log** — defect workflow.
6. **Operations Command Center → Processing Queue → Camera Health** — ops views.
7. **Analytics → Root Cause → Train History** — investigation/records.
8. **AI Engine → AI Accuracy → Datasets → AI Training** — AI lab (consistent technical style).
9. **System Health → Data Sync → Image Archive → Audit Log** — system/admin.
10. **Settings** — last; reuses all patterns.

Reason: lock the shared style + nav on Home/Login first, then each subsequent screen reuses the same sidebar, header, cards, tables, and pills — so Stitch outputs stay consistent and you approve the system once, not 26 times.

---

## 8. Notes for Implementation After Design Approval

- Build the **shared foundation first** (design tokens in `index.css` + `tailwind.config.js`; shared `PageHeader`, `Breadcrumbs`, `FilterBar`, `StatusBadge`, `KPICard`, `DataTable`, `EmptyState`, `LoadingState/Skeleton`, `Modal`, `Drawer`, `ChartCard`). Every approved Stitch screen maps to these components.
- **Ban raw `gray-/slate-/white`** in pages — only semantic tokens, so light/dark and consistency hold.
- **Preserve all backend integration and business logic** — these prompts change layout/visuals only, not data flow, auth, roles, polling/WebSocket, upload pipeline, report signing, or AI APIs.
- **Decompose mega-pages** (Reports, TrainWorkspace, Sessions) into list + drawer/sub-route viewers as the Stitch designs imply.
- **One brand name** everywhere (recommend "Vande Inspect AI").
- Keep the existing **role gating** (sidebar hide + URL guard) when implementing the new grouped nav.
- Implement in the order in §7; verify each screen against its approved Stitch mockup before moving on.
- Pair this file with `UIUX_REDESIGN_PLAN.md` (same project) which holds the detailed per-page code-implementation prompts.
</content>
