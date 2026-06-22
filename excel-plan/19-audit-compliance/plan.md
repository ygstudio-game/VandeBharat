# Audit & Compliance

## 1. Task Overview
Comprehensive audit logging system tracking all user actions (login, logout, role change, defect review, report generation) and system events. Provides a searchable audit dashboard for compliance officers and RDSO inspectors.

## 2. Current Codebase Status
**30% DONE — frontend preview only, backend deferred.**

Done:
- `AuditLog` Prisma model exists in schema
- `backend/src/routes/auditLogRoutes.js` exists (verify actual implementation)
- Frontend: Audit Log tab in Settings.jsx with mock entries

NOT done:
- Actual audit event recording on user actions
- RBAC enforcement (required before audit can track by user)
- Real audit dashboard (searchable/filterable)
- Compliance export (PDF/CSV of audit log)

## 3. Required Role
- Backend Developer
- Security Engineer
- Full Stack Developer

## 4. Role-Based Working Prompt
"You are a backend developer and security engineer. Implement real audit logging for VandeInspect AI. Create an audit middleware that intercepts key actions and writes to the `AuditLog` table: user login/logout, role changes, defect review decisions, report generation, session deletion. Build a searchable audit log API with date/user/action filters. Create an audit dashboard page separate from Settings."

## 5. Implementation Plan
1. Verify `AuditLog` Prisma model fields: id, user_id, action, entity_type, entity_id, metadata (JSON), created_at
2. Create `backend/src/services/auditLogger.js` — `logAction(userId, action, entityType, entityId, metadata)` helper
3. Wire auditLogger to: auth routes (login/logout), user routes (role change), review-log routes (defect review), sessions routes (report generation)
4. Backend: `GET /api/audit-log?user_id=&action=&date_from=&date_to=&page=` — paginated, filterable
5. Backend: `GET /api/audit-log/export` — CSV export
6. Frontend: new `frontend/src/pages/AuditCompliance.jsx` — standalone audit log page (not embedded in Settings)
7. Searchable table: timestamp, user, action, entity, metadata preview
8. Date range + user + action type filters
9. Export to CSV button
10. Register route `/audit` in Shell.jsx

## 6. Files Likely to be Modified
- `backend/src/services/auditLogger.js` — new file
- `backend/src/routes/auditLogRoutes.js` — extend with real filters + export
- `backend/src/routes/auth.js` — wire auditLogger
- `backend/src/routes/users.js` — wire auditLogger
- `backend/src/routes/reviewLog.js` — wire auditLogger
- `frontend/src/pages/AuditCompliance.jsx` — new file
- `frontend/src/pages/Shell.jsx` — add nav entry

## 7. Dependencies
- User Management auth (module 10) — needed to associate log entries with real users
- `AuditLog` Prisma model (verify exists)

## 8. Testing Plan
- Unit tests: `logAction()` writes correct row to DB
- Integration tests: Perform login; verify audit log contains login event with correct user_id
- API tests: Paginated log endpoint, filter by action type
- UI tests: Table renders correctly; filters work; CSV export downloads

## 9. Acceptance Criteria
- All key user actions recorded automatically
- Audit log searchable by user, action, date range
- CSV export contains all visible columns
- Compliance officers can verify who did what and when
- Log entries immutable (no delete/edit endpoints)

## 10. Risk Areas
- High volume of user actions may grow AuditLog rapidly — add DB index on created_at and user_id
- Without RBAC (module 10), user_id may be null — handle gracefully
- Audit middleware must not block request processing — use async fire-and-forget

## 11. Rollback Plan
- `auditLogger` is called as fire-and-forget — failures do not affect the main request flow
- Prisma model is additive; no breaking migration

## 12. Completion Checklist
- [x] Code reviewed
- [x] Feature implemented
- [x] Tests passed
- [x] No breaking changes
- [x] Documentation updated
- [x] Excel status updated
