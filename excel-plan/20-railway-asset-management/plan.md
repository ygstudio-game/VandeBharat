# Railway Asset Management

## 1. Task Overview
Asset lifecycle and maintenance scheduling system for railway physical assets (cameras, edge PCs, UPS units, sensors). Tracks maintenance schedules, service history, and replacement due dates. Alerts when assets are overdue for maintenance.

## 2. Current Codebase Status
**NOT STARTED.**

No asset management model, route, or page exists.

## 3. Required Role
- Full Stack Developer
- Backend Developer
- Frontend Developer

## 4. Role-Based Working Prompt
"You are a full stack developer. Build the Railway Asset Management module. Create a Prisma model for `Asset` (id, name, type, serial_number, location, installation_date, last_maintenance_date, next_maintenance_date, status). Build CRUD APIs and a frontend dashboard. Add an alert when any asset is past its maintenance due date. Asset types include: Camera, Edge PC, UPS, Network Switch, GPU Server."

## 5. Implementation Plan
1. Add `Asset` Prisma model with fields: id, asset_type, name, serial_number, location, installation_date, last_maintenance_at, next_maintenance_at, status (active/maintenance/retired), notes
2. Add `MaintenanceLog` model: id, asset_id, performed_by, performed_at, description, next_due_at
3. Backend: CRUD routes `GET/POST /api/assets`, `GET/PATCH/DELETE /api/assets/:id`
4. Backend: `POST /api/assets/:id/maintenance-log` — record maintenance event
5. Backend: `GET /api/assets/overdue` — assets past next_maintenance_at
6. Frontend: new `frontend/src/pages/RailwayAssetManagement.jsx`
7. Asset table with status badge, last/next maintenance dates
8. Overdue assets highlighted with alert banner
9. Add/Edit/Retire asset modal
10. Maintenance log history per asset (expandable row)
11. Register route `/assets` in Shell.jsx

## 6. Files Likely to be Modified
- `backend/prisma/schema.prisma` — add Asset + MaintenanceLog models
- `backend/src/routes/` — new `assets.js` route file
- `frontend/src/pages/RailwayAssetManagement.jsx` — new file
- `frontend/src/pages/Shell.jsx` — add nav entry

## 7. Dependencies
- Camera table exists in PostgreSQL (may link Asset → Camera)

## 8. Testing Plan
- API tests: CRUD operations on assets; overdue endpoint returns correct assets
- Unit tests: "Is overdue?" calculation
- UI tests: Table renders, overdue alert visible, modal opens correctly

## 9. Acceptance Criteria
- All asset types can be registered and tracked
- Maintenance log records persist correctly
- Overdue assets highlighted automatically
- Status transitions (active → maintenance → retired) work correctly

## 10. Risk Areas
- Data entry burden — suggest importing initial asset list from CSV if many assets exist
- `next_maintenance_at` calculation may vary by asset type (monthly camera, annual UPS)

## 11. Rollback Plan
- Entirely new models and page — fully additive, no risk to existing pipeline

## 12. Completion Checklist
- [ ] Code reviewed
- [ ] Feature implemented
- [ ] Tests passed
- [ ] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
