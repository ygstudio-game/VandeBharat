# VandeBharat AI Frontend Architecture & Tech Stack

This document outlines the core architecture, technology stack, and design language for the VandeBharat AI Inspection Platform frontend.

## 1. Technology Stack

The platform is designed to handle thousands of high-definition frames, real-time overlays, and multi-camera synchronization.

| Area | Recommended Technology | Justification |
|---|---|---|
| **Core Framework** | Vite + ReactJS | Fast development, optimized build, component-based architecture. |
| **Styling** | Tailwind CSS | Utility-first styling for consistent design systems and rapid UI development. |
| **State Management** | Zustand | Lightweight, scalable state management for complex train session data. |
| **Live Updates** | Socket.IO (Mocked for now) | Real-time telemetry, pipeline status, and event-driven updates. |
| **Data Tables** | TanStack Table | Headless UI for complex defect and component intelligence tables. |
| **Frame Rendering** | Canvas API / WebGL | Performant rendering of bounding boxes, AI overlays, and frame manipulation. |
| **Virtualized Lists** | react-virtualized / react-window | Lazy loading and virtualization for frame galleries to ensure 60fps performance. |
| **Image Zoom/Pan** | OpenSeadragon (Optional) | Deep zoom capabilities for high-resolution defect inspection. |

## 2. Design Language & Theme

**Theme:** Complete White / Off-White Theme (Vande Bharat aesthetic)
*(Note: Overriding the original dark theme to match the Indian Railways and Vande Bharat branding).*

The UI must feel like an **Industrial AI Inspection Platform** and a **Railway Operations Intelligence System**. It should NOT feel like a generic SaaS CRUD dashboard. It needs to be dense, operational, evidence-driven, and highly tactical.

### 2.1 Color System

| Type | Suggested Color | Usage |
|---|---|---|
| **Backgrounds** | White / Off-White (#F8FAFC) | Primary application background, workspace areas. |
| **Panels & Cards** | Pure White (#FFFFFF) | Dashboard cards, intelligence panels, headers. |
| **Normal / Text** | Deep Blue / Slate (#0F172A) | Primary typography, neutral borders, standard icons. |
| **Success** | Green (#10B981) | Completed pipeline stages, passed compliance checks. |
| **Warning** | Yellow/Amber (#F59E0B) | Missing components, low-confidence OCR, pending reviews. |
| **Critical** | Red (#EF4444) | Critical defects (cracks, missing bolts), pipeline failures. |
| **Processing** | Cyan/Teal (#06B6D4) | Active synchronization, YOLO workers running, active telemetry. |

## 3. Mandatory UX Principles

### 3.1 Loading States
Every heavy operation must show contextual, operational loaders instead of generic spinners:
- "Extracting synchronized frames..."
- "Analyzing suspension assemblies..."
- "Generating defect intelligence..."
- "Mapping frames to Coach B2..."

### 3.2 Error States
Errors must be specific and actionable:
- "OCR confidence below operational threshold. Manual review required."
- "Synchronization incomplete. 12 frames could not be mapped."

### 3.3 Toasts & Notifications
Provide clear feedback for completed operations:
- "Synchronization completed successfully. 14 coaches mapped."
- "Inspection report generated successfully."

### 3.4 Microinteractions
Required throughout the system to make it feel alive:
- Hierarchy expansion animations.
- Frame hover previews and highlights.
- Synchronized playback indicators.
- Defect pulse animations.
- Pipeline status transitions.

### 3.5 Accessibility
The entire platform must support:
- Full keyboard navigation.
- Tab accessibility.
- Focus indicators.
- Screen-reader-friendly structure.
- Accessible overlays and timeline controls.
