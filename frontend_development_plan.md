# VandeBharat AI Frontend - Development Plan

This document outlines the phased approach to building the frontend platform. This ensures structured development, avoids hallucinations by focusing on one domain at a time, and maintains architectural integrity.

## Phase 1: Foundation & Operations Shell (COMPLETED)
- Scaffold Vite + React + JavaScript project.
- Install and configure Tailwind CSS, React Router, and Lucide Icons.
- Define the global Vande Bharat Theme (White/Off-White, Deep Blue text, Status colors).
- Set up the global Mock Data structures.
- Implement the `Shell` layout (Global Navigation).
- Implement the Operations Dashboard (`/dashboard`) with KPI strips and Live Train Queue.

## Phase 2: Inspection Sessions & Data Tables (COMPLETED)
- Implement the `/sessions` page showing a table of all completed/processing trains.
- Add row actions (Open Workspace, Report).
- Implement basic filtering UI for the table (Date, Status, Train Number).

## Phase 3: Train Workspace - Foundation & Header (COMPLETED)
- Scaffold the `/train/:sessionId` workspace route.
- Implement the `Train Header` showing telemetry-like metrics and status.
- Implement the `Pipeline Timeline` showing the 6 stages of processing (Extraction to Report).

## Phase 4: Train Workspace - Hierarchy Panel (COMPLETED)
- Implement the `Left Hierarchy Panel`.
- Map the JSON train hierarchy data (Train -> Coach -> Cameras -> Frames).
- Build the expand/collapse tree interactions and live status indicators.

## Phase 5: Train Workspace - Intelligence & Evidence Panels (COMPLETED)
- Implement the `Center Evidence Viewer` structure with real image assets and absolute-positioned bounding box overlays.
- Implement the `Right Intelligence Panel` (Detected Components, Missing Components, Defects).
- Build the Component Intelligence Table.
- Link the selection of items in the Hierarchy Panel to update the Intelligence Panel context.

## Phase 6: Frame Synchronization & Playback (COMPLETED)
- Implement the `Bottom Timeline / Frame Strip` with interactive frame scrubbing.
- Visualize defect jump markers and coach transition (gap) markers.

## Phase 7: Audit Reports Page & Interactive Sign-off (NEW - IN PROGRESS)
- Implement the `/reports` page showing completed audits.
- Add interactive digital sign-off dialog for railway supervisors.
- Mock PDF export and verification log checks.

## Phase 8: Polish, Animation & Integration Readiness
- Implement loaders and micro-interactions (e.g., "Analyzing suspension assemblies...").
- Ensure all states (Loading, Error, Empty, Success) are handled.
- Audit the UI for the "premium, industrial" feel.
- Ensure state management cleanly separates UI from data, ready for real API replacement.

