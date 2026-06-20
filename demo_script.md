# Demo Script

Run this after completing the setup steps below. Rehearse it once before presenting — if any step fails, it's almost always one of: Redis not running, `.env` not filled, or `npm run db:push`/`db:seed` not run.

---

## Setup (do once before the demo)

```bash
# 1. Backend env + DB
cd backend
cp .env.example .env
# Fill in: DATABASE_URL (Neon), CLOUDINARY_*, REDIS_URL, JWT_SECRET, DEV_ADMIN_PASSWORD
npm install
npm run db:push      # applies this sprint's schema changes (queue claim fields,
                      # 2FA fields, ModelVersion, train_type, pdf_url)
npm run db:seed       # creates admin@vande.local + TEST01 camera setup + manifests

# 2. Redis (pick one)
#   - Memurai (native Windows Redis), or
#   - a free Upstash/Redis Cloud instance — paste its URL into REDIS_URL

# 3. Start everything (separate terminals)
cd backend && npm run dev      # API, port 8001
cd backend && npm run worker   # pipeline worker — THIS IS NEW THIS SPRINT
cd GPU/yolo && uvicorn server:app --port 5002
cd GPU/ocr && uvicorn server:app --port 5000
cd services/frame_extractor && uvicorn server:app --port 5003
cd services/sync_engine && uvicorn server:app --port 5004
cd services/correlation && uvicorn server:app --port 5005
cd services/report_generator && uvicorn server:app --port 5006
cd frontend && npm run dev     # UI, port 5173
```

---

## Walkthrough

**1. Login (new this sprint)**
- Open `http://localhost:5173` → redirects to `/login` (previously: no login existed, every route was open).
- Sign in as `admin@vande.local` / your `DEV_ADMIN_PASSWORD`.

**2. Enable 2FA on your own account (new this sprint)**
- Settings → User Management → your row → "ENABLE 2FA".
- Real QR code appears (not a placeholder). Scan with any TOTP app, enter the 6-digit code, confirm it enables.
- Log out, log back in — note the app now asks for the TOTP code.

**3. Role-gating proof (new this sprint)**
- Settings → User Management → create a `field_staff` user.
- Log in as that user. Try to sign off a report (step 6 below, or directly hit the API) — show the real 403, not a hidden button. Compare to the source review's prior state: this was previously enforced only by hiding UI elements, with zero backend check.

**4. Upload a session and watch the queue work (new orchestration this sprint)**
- Back in as admin. Sessions → New Inspection → pick "Rake / Coach Type" (new this sprint — this is what fixes the coach-class analytics gap), upload OCR + component camera videos.
- Watch the pipeline stage timeline update live via WebSocket as frame extraction → OCR → sync → correlation each complete.
- Open Infrastructure → Node Telemetry tab → point out the "Pipeline Queue Health" card (real DLQ depth, not simulated) and the GPU panel (real `nvidia-smi` reading if a GPU is present on the demo machine, clearly labeled if it's falling back to simulated).

**5. Resumability proof (new this sprint)**
- Mid-pipeline on a session, kill the `npm run worker` terminal (Ctrl+C — not graceful).
- Restart `npm run worker`. Show the session resumes from where it was instead of hanging forever — the in-flight job was reclaimed from Redis, not lost.

**6. Coach hierarchy + defects with real coach class (new this sprint)**
- Open the completed session's Train Workspace. Show the coach hierarchy, defect/component intelligence panel.
- Open Analytics → "Defects by Coach Class" — show it resolves to `VANDE_BHARAT`/`LHB_SLEEPER`, not "Unclassified."

**7. Report generation + sign-off lock**
- Generate the report (PDF). Sign it off as `admin` or an `rdso_inspector` user.
- Attempt to regenerate — show it doesn't silently overwrite a signed report.

**8. Periodic report PDF (new this sprint)**
- Reports → Periodic Reports panel → "Generate Now" on any period → show the "Download PDF" link appears (previously JSON-only).

**9. Audit log (new this sprint — previously 3 hardcoded fake rows)**
- Settings → Security Audit Log tab → show real rows: the login, the 2FA enable, the role change, the report sign-off — each with a real actor, action, and timestamp.

**10. (Optional, if time) Human-feedback retraining loop**
- Show `POST /api/training/export` producing a manifest from any logged FP/FN review entries, and `GET /api/models` showing the version registry.
- Explain: this is a manual-trigger loop by design (per the architecture review's own recommendation), not a fully automated retrain pipeline.

---

## If something breaks during rehearsal

- **Worker logs `xreadgroup failed` repeatedly** → Redis not reachable, check `REDIS_URL`.
- **Upload returns 500 "Default camera setup not found"** → run `npm run db:seed`.
- **Login always 401** → check `JWT_SECRET` matches between `.env` and what the running process loaded (restart `npm run dev` after editing `.env`).
- **GPU panel always shows simulated** → expected if the demo machine has no NVIDIA GPU/driver — say so plainly, it's the documented fallback behavior, not a bug.
