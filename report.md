# Plan: Replicating POC Detection Log Table in Main Platform

This document outlines the plan to align the Detection Log Table in the Main platform with the design and behavior of the POC version.

## 📋 Comparison & Gap Analysis

### 1. Component Locations
* **POC Table**: `POC/ui/src/pages/InspectionOutput/DetectionLogTable.jsx`
* **Main Table**: `Main/frontend/src/components/DetectionLogTable.jsx` (rendered in the workspace section of `Main/frontend/src/pages/Reports.jsx`)

### 2. Key Differences

| Feature | POC Implementation | Main Platform Implementation | Action for Replication |
| :--- | :--- | :--- | :--- |
| **Columns** | Date & Time, GPS Location, Bogie No, Component, Defect, Actions | Frame, Video Time, Location, Bogie No, Component Detected, Defect, Conf, Actions | Update columns to match POC specification (Date & Time, GPS Location, Bogie No, Component, Defect, Actions). |
| **Row Actions** | View button opens a modal preview overlay. | View button toggles an inline drawer with canvas overlay. | Implement/integrate the Modal Preview overlay in Main (matching POC's style) and link the table action to it. |
| **Styling** | Material Theme (MD3 class variables) and Material symbols. | Tailwind/Slate color scheme with Lucide React icons. | Retain Tailwind theme structure but adjust spacing, borders, hover states, and color accents to visually mirror the POC theme. |
| **Row Highlights** | Highlighted defect rows use `bg-red-50 border-red-200 hover:bg-red-100`. | Highlighted defect rows use `bg-red-50 hover:bg-red-100 border-red-100` with Lucide alert icons. | Standardize rows styling to use red accents for defects and gray borders for nominal entries. |

---

## 🛠️ Implementation Steps

### Step 1: Update Columns & Processing in `Main/frontend/src/components/DetectionLogTable.jsx`
* Simplify the dataset mapping to construct rows containing:
  - `timestamp`: formatted as date/time string (like POC's database date or timestamp format) or retaining duration offset.
  - `gps`: station name or location GPS coordinates if available.
  - `bogieNo`: maps to coach ID/number.
  - `component`: comma-separated names of detected components.
  - `defect`: name of detected defects.
* Re-order column headers: **DATE & TIME**, **GPS LOCATION**, **BOGIE NO**, **COMPONENT**, **DEFECT**, and action column.

### Step 2: Implement Modal Preview Overlay in Reports Workspace
* Import the modal overlay styling from `POC/ui/src/pages/InspectionOutput/index.jsx` into the Reports Workspace or as a separate component in Main.
* Connect the **VIEW** button click to trigger the overlay modal with frame preview, labels list, and next/prev keyboard navigation.

### Step 3: Match Design & Aesthetics
* Standardize class names for the table wrapper (`bg-surface-container-lowest`, outline borders, drop shadow).
* Adjust header text styling (`font-label-caps`, uppercase, small font size).
* Apply background colors for status highlighting (red tint for defects, nominal rows simple border-b hover effects).

### Step 4: Verification
* Run the main frontend development server.
* Navigate to the Reports tab, open a report session, and check that the Detection Log Table matches the POC design.
* Test search filtering, defects-only toggle, sorting, and view action (modal navigation).
