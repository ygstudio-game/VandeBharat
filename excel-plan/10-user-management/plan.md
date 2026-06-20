# User Management

## 1. Task Overview
Full RBAC system with four roles (Admin, RDSO Inspector, ZR Officer, Field Staff), JWT authentication, session management, two-factor authentication (TOTP), and role-based route protection across all backend endpoints.

## 2. Current Codebase Status
**Frontend UI only — backend NOT implemented.**

Done:
- `frontend/src/pages/Settings.jsx` — User Management tab with role legend, user table, inline role-reassignment
- `frontend/src/lib/roles.js` — ROLES enum and ROLE_LABELS
- `backend/src/constants/roles.js` — roles enum defined
- `TwoFactorSetupModal` component — visual QR + 6-digit code UI (not connected)
- Dev-mode disclosure banner: "authentication disabled in this build"

NOT done:
- `backend/src/auth/` — JWT middleware not enforced on any route
- `User.role` DB field not migrated to new enum
- TOTP secret generation and verification
- Auth login/register/logout endpoints
- Per-route RBAC enforcement
- Audit log wiring to real actions

## 3. Required Role
- Backend Developer
- Security Engineer
- Full Stack Developer

## 4. Role-Based Working Prompt
"You are a senior backend developer and security engineer. Your task is to implement production-ready authentication and RBAC for VandeInspect AI. Use JWT for stateless auth. Implement TOTP-based 2FA using the `otplib` library. Enforce role-based route guards on all Fastify routes using a preHandler hook. The four roles are: admin, rdso_inspector, zr_officer, field_staff. Admin has full access; other roles have read-only access to specific modules. Wire the frontend mock user UI to real backend endpoints."

## 5. Implementation Plan
1. Create `POST /api/auth/login` — validate credentials, return JWT
2. Create `POST /api/auth/logout` — blacklist token (Redis or DB flag)
3. Create `POST /api/auth/register` (admin only) — create new user with role
4. Add Fastify `preHandler` auth middleware in `backend/src/middleware/`
5. Migrate `User.role` to enum `admin | rdso_inspector | zr_officer | field_staff` via Prisma migration
6. Add TOTP: `POST /api/auth/2fa/setup` (generate secret + QR), `POST /api/auth/2fa/verify` (validate OTP)
7. Add role guards to each route group (admin-only vs read-only roles)
8. Wire `Settings.jsx` user table to `GET /api/users`, role change to `PATCH /api/users/:id/role`
9. Wire `TwoFactorSetupModal` to real endpoints
10. Wire audit log: record login/logout/role-change events to `AuditLog` model

## 6. Files Likely to be Modified
- `backend/src/auth/` — new JWT + TOTP logic
- `backend/src/middleware/authMiddleware.js` — new preHandler
- `backend/src/routes/auth.js` — login/logout/register/2FA endpoints
- `backend/src/routes/users.js` — user list, role patch
- `backend/prisma/schema.prisma` — User.role enum migration
- `frontend/src/pages/Settings.jsx` — wire to real API
- `frontend/src/components/TwoFactorSetupModal` — wire to real TOTP endpoints
- `frontend/src/lib/api.js` — add auth headers

## 7. Dependencies
- PostgreSQL User model (exists, needs role migration)
- AuditLog model (exists in Prisma schema)
- otplib (npm install needed)
- jsonwebtoken (check if installed)

## 8. Testing Plan
- Unit tests: JWT sign/verify, TOTP secret generation/verification
- Integration tests: Login flow, role enforcement on protected routes
- API tests: `POST /login` with valid/invalid creds; `GET /api/sessions` with/without token
- UI tests: Login screen, role-select in settings, 2FA setup modal
- Security tests: Verify unauthenticated requests are rejected; verify role escalation is blocked

## 9. Acceptance Criteria
- Login returns JWT; all API routes reject unauthenticated requests with 401
- RBAC enforced: rdso_inspector cannot access admin-only routes
- 2FA setup generates real TOTP QR; verify step rejects wrong codes
- User table in Settings shows real users; role change persists to DB
- Audit log records login events

## 10. Risk Areas
- JWT secret must be strong and stored in env (never hardcoded)
- TOTP clock drift may cause intermittent 2FA failures — use ±1 window tolerance
- Session token blacklisting requires Redis or DB; pick one before implementing
- Role migration may require populating existing users with a default role

## 11. Rollback Plan
- Auth middleware can be toggled via `AUTH_ENABLED=false` env flag for emergency rollback
- Role migration is additive via Prisma; can revert with `prisma migrate reset` in dev

## 12. Completion Checklist
- [x] Code reviewed
- [x] Feature implemented
  - Backend: AUTH_ENABLED bypass in middleware/auth.js
  - Backend: Scoped protectedApi plugin in app.js — all routes guarded
  - Backend: users.js — removed duplicate authenticate hook, kept requireRole
  - Frontend: AuthContext (token in localStorage, login/logout)
  - Frontend: Login.jsx (credentials + 2FA step)
  - Frontend: ProtectedRoute.jsx (redirect to /login if unauthenticated)
  - Frontend: App.jsx wrapped in AuthProvider, /login route added
  - Frontend: api.js — Bearer token injected on all requests; auth/user/2FA/audit API functions added
  - Frontend: Settings.jsx — real user list, create/role/deactivate/2FA all wired to backend
  - Frontend: Shell.jsx — shows real user name+role, logout button
- [x] ESLint: 0 errors (6 warnings only)
- [x] No breaking changes — AUTH_ENABLED defaults to dev bypass
- [ ] Browser test — start npm run dev, login at localhost:5173/login with admin@vande.local / ChangeMe123!
- [x] Excel status updated
