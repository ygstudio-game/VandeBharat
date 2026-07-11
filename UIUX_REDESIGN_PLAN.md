# Vande Bharat / MVIS Dashboard — UI/UX Redesign Plan

> Status: **PLAN ONLY. No code changed.** Approve before any implementation.
> Scope: `frontend/` app (React 19 + Vite + Tailwind 4 + shadcn/ui + recharts + zustand + react-router 7).
> Goal: turn an overloaded, visually-inconsistent dashboard into a clean, premium, enterprise-grade product without removing features or breaking backend integration.

---

## 1. Complete UI/UX Audit

### 1.1 Current page list (26 routes)

| Route | Page file | In sidebar? | Role gate |
|---|---|---|---|
| `/dashboard` | Dashboard.jsx | Yes (Home) | all |
| `/stations` | StationMonitoringDashboard.jsx | Yes | admin, rdso, zr |
| `/stations/:code` | StationWorkspace.jsx | via card | open |
| `/command-center` | OperationsCommandCenter.jsx | Yes | admin, rdso, zr |
| `/analytics` | Analytics.jsx | Yes | admin, rdso, zr |
| `/rca` | RootCauseAnalysis.jsx | Yes | admin, rdso, zr |
| `/camera-health` | CameraHealthMonitor.jsx | Yes | admin, rdso |
| `/infrastructure` | Infrastructure.jsx | Yes | admin |
| `/sync-hub` | DataSyncHub.jsx | Yes | admin |
| `/ai-inference` | AiInferenceManagement.jsx | Yes | admin |
| `/ai-performance` | AiPerformanceAnalytics.jsx | Yes | admin |
| `/datasets` | DatasetManagementPortal.jsx | Yes | admin |
| `/training` | AiTrainingWorkbench.jsx | Yes | admin |
| `/settings` | Settings.jsx | Yes | all |
| `/sessions` | Sessions.jsx | **hidden** (tab in StationWorkspace) | all |
| `/defect-console` | DefectAlertConsole.jsx | **hidden** (tab) | all |
| `/defect-verification` | DefectVerificationConsole.jsx | **hidden** | admin, rdso |
| `/ocr-log` | OcrResultsLog.jsx | **hidden** (tab) | all |
| `/reports` | Reports.jsx | **hidden** (tab) | all |
| `/history` | TrainPassageHistory.jsx | **hidden** (tab) | all |
| `/image-archive` | ImageArchiveManagement.jsx | **hidden** | admin, rdso, zr |
| `/audit` | AuditCompliance.jsx | **hidden** | admin |
| `/assets` | RailwayAssetManagement.jsx | **hidden** | (folded into Infrastructure) |
| `/live-queue` | LiveQueue.jsx | via Dashboard btn | all |
| `/train/:sessionId` | TrainWorkspace.jsx | deep link | open |
| `/timeline/:sessionId` | TrainMovementTimeline.jsx | deep link | open |

### 1.2 Current feature list (functional modules)

1. **Live monitoring** — Dashboard (KPIs, live queue, active rake viz, recent defects), LiveQueue (ingestion control).
2. **Operations command** — OperationsCommandCenter (KPIs, services, system health, cameras, incident log).
3. **Stations** — overview grid → StationWorkspace (tabbed hub: Inspections / Defects / Reports / History).
4. **Inspection workflow** — Sessions (upload wizard, list), TrainWorkspace (frame review, OCR/defect/component overlays, pipeline stages), TrainMovementTimeline.
5. **Defects** — DefectAlertConsole, DefectVerificationConsole.
6. **Records** — Reports (report viewer + coach intelligence + frame player), OcrResultsLog, TrainPassageHistory, ImageArchiveManagement, AuditCompliance.
7. **Analytics** — Analytics, RootCauseAnalysis, AiPerformanceAnalytics.
8. **System health** — CameraHealthMonitor, Infrastructure, RailwayAssetManagement, DataSyncHub.
9. **AI Lab** — AiInferenceManagement, DatasetManagementPortal, AiTrainingWorkbench.
10. **Account** — Settings (thresholds, users, 2FA, audit), Login (2FA flow).

### 1.3 Major UI/UX problems

- **P0 — Two visual languages.** Half the pages use the shadcn semantic token system (`bg-card`, `text-foreground`, `text-muted-foreground`, `primary`) with an industrial `font-black uppercase` treatment (Dashboard, Login, Settings, OperationsCommandCenter, LiveQueue). The other half hard-code raw Tailwind colors (`text-gray-900`, `text-slate-800`, `bg-white`, `border-slate-200`) with plain weights (StationMonitoringDashboard, AiTrainingWorkbench, RootCauseAnalysis, TrainPassageHistory, AiInference, Datasets). This single inconsistency is the biggest driver of the "10th-class / immature" perception. Dark mode and theme tokens only work on half the app.
- **P0 — No shared page chrome.** Every page re-invents its own header (`text-base` vs `text-xl` vs `text-2xl`, uppercase vs not, icon vs no icon). There is no `PageHeader`, no breadcrumbs, no consistent toolbar slot.
- **P1 — Duplicated filter bars.** The same train# / date / station filter trio is hand-built inline in Dashboard, Sessions, Reports, RootCauseAnalysis, OperationsCommandCenter, TrainPassageHistory — each slightly different.
- **P1 — Overloaded pages.** Reports.jsx (1910 lines), TrainWorkspace.jsx (1581), Sessions.jsx (993) cram many concerns (list + viewer + player + intelligence + overlays + wizard) into one file/screen with everything visible at once.
- **P1 — Two overlapping "command centers."** `/dashboard` (Live Train Monitor) and `/command-center` (MVIS Command Center) share KPIs (sessions, critical defects, cameras). Users can't tell which to use.
- **P2 — Dead/commented code in views.** Dashboard.jsx carries large commented-out telemetry & events blocks; Shell.jsx carries two fully commented nav groups. Adds noise, signals unfinished work.
- **P2 — Inline modals everywhere.** IncidentModal, NewJobModal, ActionModal, TwoFactorSetupModal, DefectPreviewModal, add-user, wizard — all bespoke, inconsistent sizing/overlay/close behavior. No shared Dialog/Drawer primitive in use (radix is installed but underused).
- **P2 — Inconsistent empty/loading states.** Some pages have skeletons (StationMonitoring), some spinners (StationWorkspace), some plain text ("No active sessions"), some nothing.
- **P2 — Icon-only top bar.** Notification bell is decorative (no panel), no global search, no breadcrumb, brand says `RDSO_MVIS` in sidebar but `VANDE INSPECT AI` on login and `Machine Vision-based Inspection System` in header — three names.

### 1.4 Navigation problems

- Sidebar groups are **collapsed-by-default accordions that single-select**; deep features (Reports, Defects, OCR, History) are reachable **only** through StationWorkspace tabs — discoverable only if you first pick a station. Good instinct (progressive disclosure) but it strands users who want "all reports" globally.
- Single-item groups (Home, Stations, Command Center) render as flat links while multi-item groups are dropdowns → inconsistent interaction in the same list.
- No "you are here" beyond the active link highlight; no breadcrumb when you drill into `/stations/:code?tab=reports` or `/train/:id`.
- Two near-identical entry points (Dashboard vs Command Center) at the top.

### 1.5 Layout problems

- Page padding varies (`p-6` vs `p-8`), max width mostly `max-w-7xl` but not enforced by a layout wrapper.
- Header heights/typography differ per page.
- No consistent content grid; some pages center, some stretch.

### 1.6 Component reuse problems

- `KPICard` exists but several pages render their own KPI tiles inline (StationMonitoring, LiveQueue, OCC, RCA, AiTraining) instead of reusing it.
- Status badges re-implemented per page (StationMonitoring `STATUS_CONFIG`, StationWorkspace `STATUS_BADGE`, TrainPassageHistory `StatusChip`, plus inline in tables).
- Tables hand-rolled repeatedly; only `DetectionLogTable` is shared.
- shadcn `ui/` primitives (button, card, badge, select, dialog) exist but raw-color pages bypass them.

### 1.7 Priority areas to fix first

1. **Design tokens + Tailwind theme** — one color/type system, kill raw `slate/gray/white`.
2. **Shared layout primitives** — `PageHeader`, `PageContainer`, `Breadcrumbs`, `FilterBar`, `StatusBadge`, `EmptyState`, `LoadingState`, `Modal/Drawer`.
3. **Sidebar/IA cleanup** — resolve Dashboard vs Command Center, fix group interaction, add global access to records.
4. **Home page** — make "what do I do next" obvious.
5. Then data-heavy pages (Reports, TrainWorkspace, Sessions), then the rest.

---

## 2. New Dashboard Architecture

**Mental model:** *Overview → Operate → Investigate → Maintain → Configure.* Most users live in Overview + Operate. Investigate/Maintain/AI are role-gated and progressively disclosed.

### 2.1 Main sections
1. **Overview** — Home (role-aware landing), Stations.
2. **Operations** — Processing Queue, Inspections, Defect Alerts, Verify Defects.
3. **Records & Investigation** — Reports, Train History, Coach Number Log, Image Archive, Analytics, Root Cause, Audit Log.
4. **System & AI (admin)** — Cameras, System Health, Data Sync, AI Engine, AI Accuracy, Datasets, AI Training.
5. **Account** — Settings, profile, sign out.

### 2.2 Show directly vs hide
- **Direct (sidebar):** Home, Stations, Processing Queue, Inspections, Defect Alerts, Reports, Analytics, Settings.
- **Inside detail pages / tabs:** Coach Number Log, Train History, Image Archive, Verify Defects, Audit Log → keep as StationWorkspace tabs **and** add a global "Records" landing so they're reachable without a station.
- **Inside deep links/modals:** TrainWorkspace (`/train/:id`), Timeline, DefectPreview, incident/job/action modals.

### 2.3 Pages to merge / separate
- **Merge:** Fold `/command-center` KPIs into Home, or clearly re-label Command Center as the **admin operations** view (system services + incidents) and strip the duplicate inspection KPIs. Recommend: keep both but de-duplicate — Home = field/inspection lens, Command Center = ops/infra lens.
- **Merge:** RailwayAssetManagement already folded into Infrastructure (per nav tip) — formalize as a tab inside System Health.
- **Separate:** Split the giant Reports/TrainWorkspace into list-view + detail-view responsibilities (route already exists for TrainWorkspace; Reports should lazy-mount its viewer in a drawer/route, not always-rendered).

### 2.4 Primary & secondary journeys
- **Primary (Field Staff / Inspector):** Home → see active train → open TrainWorkspace → review frames/defects → (inspector) sign report.
- **Primary (ops/admin):** Command Center → service/camera health → log incident.
- **Secondary:** Stations → station → tab; Records → Reports/History/Analytics; Admin → AI Lab / System Health / Settings.

---

## 3. Proposed Navigation Structure

```
SIDEBAR (grouped, role-scoped, sections always-visible with section labels, items indented)
─ OVERVIEW
   • Home                 all
   • Stations             admin, rdso, zr
─ OPERATIONS
   • Processing Queue     all
   • Inspections          all
   • Defect Alerts        all
   • Verify Defects       admin, rdso
─ RECORDS
   • Reports              all
   • Train History        all
   • Coach Number Log     all
   • Image Archive        admin, rdso, zr
   • Analytics            admin, rdso, zr
   • Root Cause           admin, rdso, zr
   • Audit Log            admin
─ SYSTEM & AI            (admin-heavy)
   • Command Center       admin, rdso, zr
   • Cameras              admin, rdso
   • System Health        admin
   • Data Sync            admin
   • AI Engine            admin
   • AI Accuracy          admin
   • Datasets             admin
   • AI Training          admin
─ (footer) Account: avatar menu → Settings, Profile, Sign out
```

- **Top bar:** breadcrumb (left) · global search (center, optional phase) · notifications panel · avatar menu. Remove the duplicated brand string; pick one product name (**recommend "VANDE INSPECT AI"**) used everywhere.
- **Sidebar behavior:** section headers are static labels (not single-select accordions); each section can collapse but multiple open at once; active item + parent section highlighted. Collapsible to icon-rail on ≤1440px (already partly done).
- **Settings** moves to the avatar menu (enterprise convention) but keep `/settings` route.

---

## 4. Design System Plan

Implement as CSS variables in `index.css` + `tailwind.config` theme; consume only via tokens.

1. **Color palette** — Neutral base (slate scale) + one brand primary (deep indigo/blue `#2563EB`-class) + semantic: success (emerald), warning (amber), danger (red), info (cyan). Map to tokens: `--background, --card, --foreground, --muted-foreground, --border, --primary, --success, --warning, --destructive`. **Ban raw `gray-*/slate-*/white` in pages.**
2. **Typography** — Geist (already installed). Scale: Display 24/700, H1 20/700, H2 16/600, Body 14/400, Small 12/500, Micro 11/600-uppercase for labels. **Retire `font-black uppercase` as the default heading style** (it reads as "industrial demo"); reserve uppercase micro-labels for KPI captions only.
3. **Spacing** — 4px base; page padding `p-6` (24px) everywhere; section gap `space-y-6`; card padding `p-5`.
4. **Card** — `bg-card border border-border rounded-xl p-5 shadow-sm`; hover `shadow-md` for clickable cards only.
5. **Table** — shared `DataTable`: sticky header `bg-muted`, `text-xs`, zebra optional, row hover `bg-muted/50`, right-aligned numerics `tabular-nums`, empty + loading states built in.
6. **Buttons** — primary (filled), secondary (outline), ghost (toolbar), destructive; sizes sm/md; use shadcn `button` everywhere.
7. **Forms** — label above input, 12px helper, inline validation, `space-y-4`, grouped in cards; use shadcn `input`/`select`.
8. **Status badges** — one `<StatusBadge variant="online|degraded|offline|critical|warning|success|info|neutral" />`; dot + label, pill, uppercase 11px.
9. **Empty states** — `<EmptyState icon title description action />`: centered, muted icon, one-line title, helper, optional CTA.
10. **Loading states** — skeletons for lists/cards (preferred), inline spinner only for button actions; one `<Skeleton />` + `<LoadingState />`.
11. **Modal/drawer** — shared radix `Dialog` (centered, ≤640px) for forms; `Drawer` (right slide) for record/frame viewers; consistent overlay, header, close.
12. **Sidebar** — 256px, `bg-card`, section labels muted micro-caps, active = `bg-primary/10 text-primary` (lighter than current full-fill), icon-rail collapse.
13. **KPI card** — reuse single `KPICard` (label micro-caps, value 24/700 tabular, icon chip, optional delta/sub, optional click).
14. **Charts** — recharts with token colors, muted gridlines, 12px axis, legend top-right, consistent tooltip; wrap in `<ChartCard title>`.
15. **Responsive** — breakpoints: ≥1440 full sidebar; 1024–1440 icon-rail; <1024 drawer sidebar + single-column grids; tables → horizontal scroll or stacked cards; touch targets ≥40px.

---

## 5. Page-by-Page Redesign Prompts

> Each block is self-contained — paste one back to Claude later to implement just that page. Do Foundation (Stage 6 below) **before** any page so the shared primitives exist.

### PAGE: Foundation / Design System (do first)
- **Current purpose:** N/A — shared layer.
- **Current problems:** No tokens enforced; no shared layout/header/badge/empty/loading/modal; raw colors across half the app.
- **New UX goal:** One visual language; pages compose primitives.
- **New layout structure:** Add `src/components/layout/PageContainer.jsx`, `PageHeader.jsx`, `Breadcrumbs.jsx`; `src/components/common/{FilterBar,StatusBadge,EmptyState,LoadingState,Skeleton,DataTable,ChartCard,Modal,Drawer}.jsx`.
- **Components needed:** above + finalize tokens in `index.css` + `tailwind.config.js`.
- **User flow:** invisible; consumed by pages.
- **Empty/Loading states:** define the canonical components here.
- **Responsive:** PageContainer sets `max-w-7xl mx-auto p-6` + responsive grid helpers.
- **Implementation instructions:** Define CSS vars for all semantic colors incl. success/warning/info. Build primitives mapping only to tokens. Do NOT touch pages yet. Add an ESLint rule or note banning raw `slate-/gray-/white` in `pages/`.
- **Files likely affected:** `index.css`, `tailwind.config.js`, new files under `components/layout` + `components/common`.
- **Testing checklist:** App still builds; dark/light token swap works; Storybook-less manual mount of each primitive; no visual change to existing pages yet.

### PAGE: Shell / Sidebar + Top bar — `Shell.jsx`
- **Current purpose:** App frame, nav, role gating, top bar.
- **Current problems:** Single-select accordion groups; inconsistent flat-vs-dropdown; no breadcrumb; decorative bell; 3 brand names; full-fill active state heavy.
- **New UX goal:** Calm, scannable nav matching §3; clear "where am I."
- **New layout structure:** Static section labels + multi-open collapsible groups; breadcrumb in top bar; avatar menu (Settings/Profile/Logout); functional or removed bell; icon-rail collapse.
- **Components needed:** Breadcrumbs, avatar dropdown (radix), Sidebar section component.
- **User flow:** any → click section item → route; drill-down shows breadcrumb.
- **Empty/Loading:** n/a.
- **Responsive:** ≥1440 full, 1024–1440 icon-rail, <1024 overlay drawer.
- **Implementation:** Refactor `navGroups` to the §3 structure; keep `ROUTE_ROLES` derivation so guard stays in sync; preserve role filtering + access-denied screen; move Settings to avatar menu but keep route. Don't change route paths.
- **Files affected:** `Shell.jsx`, new `Breadcrumbs.jsx`.
- **Testing:** each role sees correct items; direct-URL guard still blocks; active highlight + breadcrumb correct on nested routes; collapse works.

### PAGE: Home — `Dashboard.jsx`
- **Current purpose:** Live train monitor — KPIs, quick actions, active rake, processing queue, recent defects.
- **Current problems:** Large commented dead code; overlaps Command Center; everything visible; raw filter trio inline; heavy headings.
- **New UX goal:** Role-aware "what needs me now" landing; ≤3 priority actions above the fold.
- **New layout:** PageHeader ("Home", live-sync chip) → Quick Actions row (role-filtered) → KPI strip (`KPICard`) → Active Rake card → 2-col (Processing Queue | Attention feed) → Recent Defects (DataTable + shared FilterBar).
- **Components:** PageHeader, KPICard, RakeVisualization, LiveTrainCard, DataTable, FilterBar, EmptyState.
- **User flow:** land → see active train → open workspace / review defects / sign reports.
- **Empty states:** "No active inspections — upload a video to start" with CTA.
- **Loading:** KPI + queue skeletons.
- **Responsive:** KPI 2→3→6 cols; 2-col stacks under 1024.
- **Implementation:** Delete commented blocks; replace inline filter with `FilterBar`; reuse KPICard; keep all polling/WS logic untouched.
- **Files affected:** `Dashboard.jsx`.
- **Testing:** KPIs/poll/WS still update; quick actions role-correct; defect filters work.

### PAGE: Stations overview — `StationMonitoringDashboard.jsx`
- **Current problems:** Raw slate/white colors (off-theme); inline KPI tiles; bespoke StatusBadge; embedded DetailPanel duplicates StationWorkspace.
- **New UX goal:** Clean station grid as the operations map.
- **New layout:** PageHeader + window filter + refresh → KPI strip (KPICard) → responsive StationCard grid → click routes to `/stations/:code` (drop the inline `selected` DetailPanel path; StationWorkspace owns detail).
- **Components:** PageHeader, KPICard, StatusBadge, StationCard (tokenized), EmptyState, Skeleton.
- **Empty:** existing "No stations configured" → EmptyState component.
- **Loading:** existing skeleton → shared Skeleton.
- **Responsive:** 1→2→3 col grid.
- **Implementation:** Swap all raw colors to tokens; use shared StatusBadge/KPICard; keep `getStationsOverview(window)` logic; remove dead `selected` branch (DetailPanel still used by StationWorkspace via export).
- **Files affected:** `StationMonitoringDashboard.jsx`.
- **Testing:** window filter, refresh, navigation to workspace.

### PAGE: Station Workspace — `StationWorkspace.jsx`
- **Current problems:** Good tab hub already; raw slate colors; sticky header ok; "overview"/"coach-log" tabs referenced but not in TABS array (dead branches).
- **New UX goal:** Polished station hub w/ breadcrumb.
- **New layout:** Breadcrumb (Stations / {name}) → station identity header + status + edge machine → tab bar → tab content.
- **Components:** Breadcrumbs, StatusBadge, Tabs primitive.
- **Implementation:** Tokenize colors; align tab styling to design system; remove unused tab branches or add their tabs; keep child-page `lockedStation` props.
- **Files affected:** `StationWorkspace.jsx`.
- **Testing:** each tab mounts station-scoped child; back nav; deep link `?tab=` works.

### PAGE: Operations Command Center — `OperationsCommandCenter.jsx`
- **Current problems:** Duplicates Home KPIs; dense; inline IncidentModal; inline station filter.
- **New UX goal:** The **ops/infra** lens (services, system health, cameras, incidents) — distinct from Home.
- **New layout:** PageHeader → ops KPI strip (de-duplicated vs Home; focus uptime/incidents/service status) → grid: Services status · System health · Camera alerts · Incident log (DataTable) → "Log Incident" → shared Modal.
- **Components:** PageHeader, KPICard, StatusBadge, DataTable, Modal, FilterBar.
- **Empty:** "No active incidents."
- **Loading:** skeletons per panel.
- **Implementation:** Move IncidentModal to shared Modal; FilterBar for station; keep all fetches.
- **Files affected:** `OperationsCommandCenter.jsx`.
- **Testing:** incident create/list, station filter, refresh.

### PAGE: Inspections (Sessions) — `Sessions.jsx`
- **Current problems:** 993 lines; upload wizard + list + coach search + filters all in one; works both standalone and as station tab.
- **New UX goal:** Clear list-first page; "New inspection" via wizard in a Drawer/Modal, not always-expanded.
- **New layout:** PageHeader (+ "New Inspection" CTA) → FilterBar (search/status/severity/station/date) → sessions DataTable (expandable rows) → wizard in Drawer.
- **Components:** PageHeader, FilterBar, DataTable, Drawer (wizard), StatusBadge, EmptyState.
- **Empty:** "No inspections yet — start one."
- **Loading:** table skeleton + upload progress.
- **Responsive:** table scroll; wizard full-screen on mobile.
- **Implementation:** Extract wizard into Drawer; replace inline filters with FilterBar; respect `lockedStation`; keep upload/pipeline logic + progress.
- **Files affected:** `Sessions.jsx` (consider split into `SessionsList` + `NewInspectionWizard`).
- **Testing:** upload flow, pipeline progress, filters, station-locked mode.

### PAGE: Train Workspace — `TrainWorkspace.jsx`
- **Current problems:** 1581 lines; frame viewer + overlays + pipeline + coach groups + fullscreen + intelligence in one; heavy.
- **New UX goal:** Focused review cockpit; secondary panels collapsible.
- **New layout:** Slim header (train id, stage chips, actions) → 3-zone: left coach/camera tree (collapsible) · center frame viewer + overlay toggles · right intelligence/defects panel (collapsible) → pipeline progress as a top strip or drawer.
- **Components:** Breadcrumbs, Drawer/Collapsible panels, overlay toggle group, BboxOverlay, FrameGrid.
- **Empty:** "Pipeline still processing" state per stage.
- **Loading:** per-zone skeletons.
- **Responsive:** stack zones; panels become drawers on small screens (collapse already partial).
- **Implementation:** Decompose into subcomponents (`CoachTree`, `FrameViewer`, `IntelPanel`, `PipelineStrip`); tokenize; keep all data hooks/overlays.
- **Files affected:** `TrainWorkspace.jsx` (+ new subcomponents).
- **Testing:** frame load, overlay toggles, stage progress, fullscreen, intelligence fetch.

### PAGE: Reports — `Reports.jsx`
- **Current problems:** 1910 lines; list + viewer + coach intelligence + frame player + overlays + sign flow always mounted; works standalone + station tab.
- **New UX goal:** List-first; open a report in a route/drawer viewer.
- **New layout:** PageHeader → FilterBar → reports DataTable (status, health, critical, sign state) → open report → Drawer/route viewer (coach nav, frame player, overlay toggles, sign/export).
- **Components:** PageHeader, FilterBar, DataTable, Drawer, BboxOverlay, StatusBadge, ChartCard (if charts).
- **Empty:** "No reports for this filter."
- **Loading:** table + viewer skeletons.
- **Implementation:** Move viewer out of always-render into Drawer/sub-route; FilterBar; keep PDF/export + sign + intelligence logic; respect `lockedStation`.
- **Files affected:** `Reports.jsx` (split into `ReportsList` + `ReportViewer`).
- **Testing:** open/sign/export report, coach intelligence, frame player, station-locked.

### PAGE: Defect Alert Console — `DefectAlertConsole.jsx`
- **New UX goal:** Triage queue.
- **New layout:** PageHeader → FilterBar (severity/station/date) → defect cards/table with DefectPreviewModal → bulk acknowledge.
- **Components:** FilterBar, DataTable, StatusBadge, DefectPreviewModal (→ shared Modal), EmptyState.
- **Implementation:** tokenize, shared filter/modal, keep `lockedStation`. **Files:** `DefectAlertConsole.jsx`.
- **Testing:** filter, preview, acknowledge.

### PAGE: Defect Verification Console — `DefectVerificationConsole.jsx`
- **New UX goal:** Inspector confirm/reject workflow, one item at a time.
- **New layout:** PageHeader → queue list + focused verify panel (image + accept/reject + notes).
- **Components:** PageHeader, Drawer/split panel, StatusBadge, BboxOverlay.
- **Implementation:** tokenize, shared primitives, keep verify API. **Files:** `DefectVerificationConsole.jsx`.
- **Testing:** accept/reject persists; role gate (admin/rdso).

### PAGE: Coach Number Log (OCR) — `OcrResultsLog.jsx`
- **New UX goal:** Searchable OCR ledger.
- **New layout:** PageHeader → FilterBar → DataTable (coach#, confidence, frame, station, time) → low-confidence highlighted; frame preview modal.
- **Components:** FilterBar, DataTable, StatusBadge (confidence), Modal.
- **Implementation:** tokenize, shared table/filter, keep `lockedStation`. **Files:** `OcrResultsLog.jsx`.
- **Testing:** search, confidence sort, preview.

### PAGE: Train History — `TrainPassageHistory.jsx`
- **Current problems:** Raw gray/slate; inline compare + trend panels.
- **New UX goal:** Train passage ledger with compare/trend in drawers.
- **New layout:** PageHeader → FilterBar → DataTable (train, health, critical, date) → select ≤2 to Compare (Drawer) → per-train Trend (Drawer).
- **Components:** FilterBar, DataTable, Drawer, HealthBadge→StatusBadge, ChartCard.
- **Implementation:** tokenize; Compare/Trend → Drawer; keep APIs + `lockedStation`. **Files:** `TrainPassageHistory.jsx`.
- **Testing:** filter, compare 2, trend chart.

### PAGE: Analytics — `Analytics.jsx`
- **New UX goal:** Defect analytics dashboard.
- **New layout:** PageHeader + range filter → KPI strip → ChartCard grid (recharts, token colors) → breakdown table.
- **Components:** PageHeader, KPICard, ChartCard, FilterBar, DataTable.
- **Implementation:** wrap charts in ChartCard, tokenize palette, reuse KPICard. **Files:** `Analytics.jsx`.
- **Testing:** range filter recomputes; charts render.

### PAGE: Root Cause Analysis — `RootCauseAnalysis.jsx`
- **Current problems:** Raw gray; inline ActionModal; tabs (camera/...); inline filter trio.
- **New layout:** PageHeader → FilterBar (train/station/date) → tabs (Camera / Cluster / Trend / Actions) → ChartCards + StrengthBar → "Log Corrective Action" → shared Modal.
- **Components:** PageHeader, FilterBar, Tabs, ChartCard, Modal, DataTable.
- **Implementation:** tokenize, shared modal/filter, keep correlation/cluster/trend/action APIs. **Files:** `RootCauseAnalysis.jsx`.
- **Testing:** tab switch, filters, log action.

### PAGE: Camera Health — `CameraHealthMonitor.jsx`
- **New UX goal:** Camera fleet status at a glance.
- **New layout:** PageHeader → KPI strip (online/degraded/offline) → camera grid/table with UptimeBar + StatusBadge.
- **Components:** KPICard, StatusBadge, DataTable/grid, UptimeBar (shared).
- **Implementation:** tokenize, shared badge/uptime. **Files:** `CameraHealthMonitor.jsx`.
- **Testing:** statuses render; refresh.

### PAGE: System Health (+ Assets) — `Infrastructure.jsx` (+ fold `RailwayAssetManagement.jsx`)
- **New UX goal:** Node telemetry + asset registry under one page with tabs.
- **New layout:** PageHeader → tabs (Nodes/Telemetry | Assets) → telemetry cards/progress + asset DataTable.
- **Components:** PageHeader, Tabs, KPICard, Progress, DataTable.
- **Implementation:** Add Assets tab embedding RailwayAssetManagement content; tokenize. **Files:** `Infrastructure.jsx`, `RailwayAssetManagement.jsx`.
- **Testing:** both tabs; asset CRUD if present.

### PAGE: Data Sync — `DataSyncHub.jsx`
- **New layout:** PageHeader → sync status cards → jobs DataTable + manual trigger.
- **Components:** PageHeader, KPICard, DataTable, StatusBadge, Button.
- **Implementation:** tokenize, shared table. **Files:** `DataSyncHub.jsx`.
- **Testing:** trigger sync; status updates.

### PAGE: AI Engine — `AiInferenceManagement.jsx`
- **New layout:** PageHeader → engine status KPIs → model/queue DataTable + controls.
- **Components:** PageHeader, KPICard, DataTable, StatusBadge.
- **Implementation:** tokenize, shared primitives. **Files:** `AiInferenceManagement.jsx`.
- **Testing:** controls act; statuses live.

### PAGE: AI Accuracy — `AiPerformanceAnalytics.jsx`
- **New layout:** PageHeader → metric KPIs → ChartCard grid (precision/recall/confusion) → model compare table.
- **Components:** PageHeader, KPICard, ChartCard, DataTable.
- **Implementation:** wrap charts, tokenize. **Files:** `AiPerformanceAnalytics.jsx`.
- **Testing:** charts render; compare.

### PAGE: Datasets — `DatasetManagementPortal.jsx`
- **Current problems:** Raw gray.
- **New layout:** PageHeader → dataset cards/table (size, classes, version) → upload/version actions in Drawer/Modal.
- **Components:** PageHeader, DataTable, Modal/Drawer, StatusBadge, EmptyState.
- **Implementation:** tokenize, shared primitives. **Files:** `DatasetManagementPortal.jsx`.
- **Testing:** list, upload/version.

### PAGE: AI Training Workbench — `AiTrainingWorkbench.jsx`
- **Current problems:** Raw gray; inline NewJobModal; tabs (jobs/compare); LiveProgress.
- **New layout:** PageHeader (+ New Job) → KPI strip → tabs (Jobs | Compare) → jobs DataTable + LiveProgress → New Job in shared Modal.
- **Components:** PageHeader, KPICard, Tabs, DataTable, Modal, ChartCard (compare).
- **Implementation:** tokenize, shared modal, keep job APIs + deploy. **Files:** `AiTrainingWorkbench.jsx`.
- **Testing:** create job, live progress, compare, deploy.

### PAGE: Image Archive — `ImageArchiveManagement.jsx`
- **New layout:** PageHeader → FilterBar → image grid (lazy thumbnails) → preview modal; pagination.
- **Components:** PageHeader, FilterBar, grid, Modal, EmptyState, Skeleton.
- **Implementation:** tokenize, shared primitives. **Files:** `ImageArchiveManagement.jsx`.
- **Testing:** filter, paginate, preview.

### PAGE: Audit & Compliance — `AuditCompliance.jsx`
- **New layout:** PageHeader → FilterBar (user/action/date) → audit DataTable; export.
- **Components:** PageHeader, FilterBar, DataTable.
- **Implementation:** tokenize, shared table. **Files:** `AuditCompliance.jsx`.
- **Testing:** filter, export; admin-only gate.

### PAGE: Live Queue — `LiveQueue.jsx`
- **New layout:** PageHeader → KPI strip → tabs (Active | Settings) → queue DataTable + concurrency/trigger controls.
- **Components:** PageHeader, KPICard, Tabs, DataTable, Button.
- **Implementation:** tokenize uppercase headings to scale; shared KPICard/Tabs. **Files:** `LiveQueue.jsx`.
- **Testing:** tab switch, concurrency change, queue updates.

### PAGE: Train Movement Timeline — `TrainMovementTimeline.jsx`
- **New layout:** Breadcrumb → timeline header → horizontal timeline/stepper + event detail panel.
- **Components:** Breadcrumbs, timeline component, StatusBadge.
- **Implementation:** tokenize; keep data. **Files:** `TrainMovementTimeline.jsx`.
- **Testing:** events render in order; deep link.

### PAGE: Settings — `Settings.jsx`
- **Current problems:** Mixed token usage; inline TwoFactor/add-user modals; tabs (thresholds/users/2FA/audit).
- **New layout:** PageHeader → settings tabs (Detection Thresholds | Users | Security/2FA | Audit) → forms in cards; user add + 2FA in shared Modal.
- **Components:** PageHeader, Tabs, Card forms, Modal, DataTable (users/audit), StatusBadge.
- **Implementation:** tokenize, shared modal/forms; keep all APIs (threshold save, user CRUD, 2FA). **Files:** `Settings.jsx`.
- **Testing:** save thresholds, add/edit user (role gate), enable 2FA, audit list.

### PAGE: Login — `Login.jsx`
- **Current state:** Already tokenized, decent.
- **New UX goal:** Premium split/centered auth.
- **New layout:** Centered card (logo, product name, credentials → 2FA step), optional brand side panel.
- **Components:** Card, Input, Button.
- **Implementation:** Light polish only; unify brand name; keep 2-step + 2FA flow.
- **Files affected:** `Login.jsx`.
- **Testing:** login, 2FA, error states.

---

## 6. Recommended Implementation Order

**Stage A — Foundation (tokens + primitives).**
- Why first: every page depends on it; prevents rework.
- Files: `index.css`, `tailwind.config.js`, `components/layout/*`, `components/common/*`.
- Risk: low (no page edits). Test: build + mount primitives; existing pages unchanged.

**Stage B — Shell / Sidebar + Top bar (IA).**
- Why: fixes navigation confusion; sets breadcrumb infra for all pages.
- Files: `Shell.jsx`, `Breadcrumbs.jsx`.
- Risk: medium (role gating). Test: per-role nav, URL guard, active state.

**Stage C — Home (Dashboard).**
- Why: first impression; highest-traffic page; proves the system.
- Files: `Dashboard.jsx`. Risk: medium (polling/WS). Test: live updates intact.

**Stage D — Core workflow pages.** Stations → StationWorkspace → Sessions → TrainWorkspace → Defect consoles.
- Why: primary user journey end-to-end.
- Files: those pages + subcomponents. Risk: high (TrainWorkspace/Sessions size). Test: upload→process→review→verify flow.

**Stage E — Data-heavy / records.** Reports → Train History → OCR Log → Image Archive → Audit.
- Why: depends on DataTable/Drawer from Stage A; high payoff.
- Files: those pages. Risk: high (Reports size, sign/export). Test: open/sign/export, filters.

**Stage F — Analytics & AI & System.** Analytics → RCA → AiPerformance → AiInference → Datasets → AiTraining → CameraHealth → Infrastructure(+Assets) → DataSync → OperationsCommandCenter → Timeline → LiveQueue.
- Why: mostly admin; tokenize + ChartCard.
- Files: those pages. Risk: medium. Test: charts, controls, role gates.

**Stage G — Settings & Login.**
- Files: `Settings.jsx`, `Login.jsx`. Risk: medium (users/2FA). Test: save/CRUD/2FA.

**Stage H — Polish & animation.** Page transitions, hover/focus states, skeleton timing, micro-interactions, empty-state illustrations, dark mode pass.
- Risk: low. Test: visual QA, reduced-motion.

**Stage I — Final QA.** Cross-page consistency, responsive sweep, accessibility, role matrix, regression on backend integration.

---

## 7. Final QA Checklist

**Visual consistency**
- [ ] No raw `slate-/gray-/white` in `pages/`; only tokens.
- [ ] Every page uses PageContainer + PageHeader (+ Breadcrumbs where nested).
- [ ] One heading scale; uppercase reserved for micro-labels.
- [ ] One StatusBadge, one KPICard, one DataTable, one Modal/Drawer across app.
- [ ] One product brand name everywhere.

**Navigation / IA**
- [ ] Sidebar matches §3; sections multi-open; active item + section highlighted.
- [ ] Records reachable globally (not only via station).
- [ ] Dashboard vs Command Center roles/purpose distinct, no duplicate KPIs.
- [ ] Breadcrumbs correct on `/stations/:code`, `/train/:id`, `/timeline/:id`.

**States**
- [ ] Every list/table has loading skeleton + empty state.
- [ ] Every async action has button-level loading + error toast.

**Functionality preserved (no regressions)**
- [ ] Auth + 2FA + role guard (nav hide AND URL block).
- [ ] Upload → pipeline progress → completion (WS + polling).
- [ ] Frame overlays (OCR/defect/component) toggle correctly.
- [ ] Report sign + PDF export.
- [ ] Defect acknowledge/verify; coach intelligence; OCR search.
- [ ] Station window filter, station-locked child pages.
- [ ] AI training job create/progress/deploy; datasets; sync trigger.
- [ ] Settings: thresholds save, user CRUD, 2FA enable, audit.

**Responsive**
- [ ] ≥1440 full sidebar; 1024–1440 icon-rail; <1024 drawer + single-column.
- [ ] Tables scroll/stack; modals/drawers full-screen on mobile; touch targets ≥40px.

**Accessibility**
- [ ] Color contrast AA; focus rings; keyboard nav; `aria-expanded` on collapsibles; reduced-motion respected.

**Performance**
- [ ] Heavy pages (Reports, TrainWorkspace) code-split / lazy viewers.
- [ ] Image archive lazy-loads thumbnails.
- [ ] No console errors; build clean.
</content>
</invoke>
