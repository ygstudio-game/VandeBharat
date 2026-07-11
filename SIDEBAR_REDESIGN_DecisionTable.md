# Sidebar Redesign — Decision Table (Approach A: Grouped + Role-Scoped)

Every sidebar item: **rename / group / hide / card / settings**.

Role strings mirror backend `src/constants/roles.js`: `admin`, `rdso_inspector`, `zr_officer`, `field_staff`.

| #  | Current label            | Action            | New label            | Group              | Roles (visible to)                  |
|----|--------------------------|-------------------|----------------------|--------------------|-------------------------------------|
| 1  | Live Train Monitor       | rename            | Home                 | Overview           | all                                 |
| 2  | Command Center           | rename            | Operations Center    | Overview           | admin, rdso_inspector, zr_officer   |
| 3  | Live Queue               | rename            | Processing Queue     | Overview           | all                                 |
| 4  | Station Monitor          | keep              | Stations             | Overview           | admin, rdso_inspector, zr_officer   |
| 5  | Inspections (Sessions)   | keep + "+New" card| Inspections          | Inspection         | all                                 |
| 6  | Defect Alert Console     | rename            | Defect Alerts        | Inspection         | all                                 |
| 7  | Defect Verification      | rename            | Verify Defects       | Inspection         | admin, rdso_inspector               |
| 8  | OCR Results Log          | rename            | Coach Number Log     | Inspection         | all                                 |
| 9  | Historical Reports       | rename            | Reports              | Reports & Records  | all                                 |
| 10 | Passage History          | rename            | Train History        | Reports & Records  | all                                 |
| 11 | Image Archive            | keep              | Image Archive        | Reports & Records  | admin, rdso_inspector, zr_officer   |
| 12 | Audit & Compliance       | rename            | Audit Log            | Reports & Records  | admin only (backend = admin)        |
| 13 | Defect Analytics         | rename            | Analytics            | Analytics          | admin, rdso_inspector, zr_officer   |
| 14 | Root Cause               | rename            | Root Cause Analysis  | Analytics          | admin, rdso_inspector, zr_officer   |
| 15 | Asset Management         | rename            | Fleet & Assets       | Analytics          | admin, rdso_inspector, zr_officer   |
| 16 | Camera Health Monitor    | rename            | Cameras              | System Health      | admin, rdso_inspector               |
| 17 | System Health Dashboard  | keep              | System Health        | System Health      | admin                               |
| 18 | Sync Hub                 | rename            | Data Sync            | System Health      | admin                               |
| 19 | AI Inference             | rename            | AI Engine            | AI Lab             | admin only                          |
| 20 | AI Performance           | rename            | AI Accuracy          | AI Lab             | admin only                          |
| 21 | Datasets                 | keep              | Datasets             | AI Lab             | admin only (backend = admin)        |
| 22 | AI Training              | keep              | AI Training          | AI Lab             | admin only (backend = admin)        |
| 23 | Settings                 | keep              | Settings             | Account *           | all                                 |

\* **Implementation note:** original plan pinned Settings in the footer. Final build (per follow-up request) removed the footer status block and placed Settings as its own **Account** group at the bottom of the scrollable list.

## Convert to Home cards (not sidebar)

Quick-action shortcuts on the Home screen — **not** sidebar items. Each links into an existing page:

| Card                 | Links to page          | Visible to                |
|----------------------|------------------------|---------------------------|
| + New Inspection     | Inspections (#5)       | all                       |
| Reports to Sign      | Reports (#9)           | admin, rdso_inspector     |
| Active / Defect Alerts | Defect Alerts (#6)   | all                       |
| Camera Status        | Cameras (#16)          | admin, rdso_inspector     |

## Resulting sidebar item count per role

| Role            | Items visible |
|-----------------|---------------|
| field_staff     | 8             |
| zr_officer      | ~11–14        |
| rdso_inspector  | ~14–16        |
| admin           | all 23        |

Unknown/missing role falls back to least-privilege (`field_staff`).

## Final group order

`Overview → Inspection → Reports & Records → Analytics → System Health → AI Lab → Account`

Empty groups (all items filtered out for a role) are hidden entirely.
