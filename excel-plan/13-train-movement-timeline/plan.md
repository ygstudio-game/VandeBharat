# Train Movement Timeline

## 1. Task Overview
Visual timeline showing a train's passage through the inspection zone — coach-by-coach as a horizontal event sequence. Each event marks when a coach entered/exited the frame, with timestamps and OCR anchor events. Includes a playback/replay feature to step through inspection events.

## 2. Current Codebase Status
**NOT STARTED.**

Partial foundation:
- `GET /api/sessions/:id/timeline-events` endpoint exists — returns OCR_ANCHOR + COACH_GAP events in trigger order
- Timeline events are produced by the sync engine and stored in PostgreSQL
- No frontend timeline page exists

## 3. Required Role
- Frontend Developer
- Backend Developer
- UI/UX Designer

## 4. Role-Based Working Prompt
"You are a senior frontend developer. Build the Train Movement Timeline page. Consume the existing `GET /api/sessions/:id/timeline-events` endpoint which returns events in trigger_id order. Render a horizontal timeline visualization where each coach is a segment, OCR anchor events mark detection points, and COACH_GAP events mark boundaries. Add a playback mode that steps through events at 1× or 2× speed, highlighting the current event. Use Recharts or SVG for the timeline rendering."

## 5. Implementation Plan
1. Read and understand the exact JSON structure from `GET /api/sessions/:id/timeline-events`
2. Backend: extend endpoint to include timestamp, coach_id, coach_number, event_type, trigger_id for each event
3. Frontend: new `frontend/src/pages/TrainMovementTimeline.jsx`
4. Render horizontal SVG/Recharts timeline: x-axis = trigger_id/time, coach segments colored by status
5. Clickable events: clicking an OCR_ANCHOR event loads that frame in a preview panel
6. Playback control bar: play/pause, speed (1×/2×), step forward/back
7. Embed a mini-timeline on `TrainWorkspace.jsx` for context
8. Register route `/timeline/:sessionId` in Shell.jsx

## 6. Files Likely to be Modified
- `backend/src/routes/sessions.js` — extend timeline-events endpoint if needed
- `frontend/src/pages/TrainMovementTimeline.jsx` — new file
- `frontend/src/pages/TrainWorkspace.jsx` — add mini-timeline embed
- `frontend/src/pages/Shell.jsx` — add nav entry (or access via TrainWorkspace)

## 7. Dependencies
- Sync engine timeline events (done)
- `GET /api/sessions/:id/timeline-events` (done)
- Frame image URLs (done)

## 8. Testing Plan
- API tests: Timeline-events returns events in trigger_id order with correct types
- UI tests: Timeline renders all coaches; playback steps through events; click loads frame
- Integration tests: End-to-end with a real session, verify event count matches coach count

## 9. Acceptance Criteria
- Horizontal timeline shows all coaches as distinct segments
- OCR_ANCHOR and COACH_GAP events visible on timeline
- Playback steps through events in order
- Clicking an event shows the corresponding frame image
- Timeline loads within 2 seconds for a 10-coach train

## 10. Risk Areas
- Very long trains (30+ coaches) may render a timeline that is too wide — add zoom/pan
- trigger_id gaps (missed frames) may create visual holes in timeline
- Playback at 2× speed may need requestAnimationFrame for smooth rendering

## 11. Rollback Plan
- New standalone page; no changes to sync engine or existing routes

## 12. Completion Checklist
- [ ] Code reviewed
- [ ] Feature implemented
- [ ] Tests passed
- [ ] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
