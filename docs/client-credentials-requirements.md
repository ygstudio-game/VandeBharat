# VandeInspect AI — Client Credentials & Configuration Requirements

**Prepared by:** Development Team  
**Date:** 2026-06-20  
**Project:** MVIS — Vande Bharat Automated Train Inspection System  
**Version:** 1.0

---

## How to Use This Document

This document lists every credential, API key, configuration value, and external service account the development team requires from the client before production deployment can be completed.

For each item:
- **Required** = system will not function without it
- **Recommended** = strongly advised for production; system degrades without it
- **Optional** = enhances features; safe to skip for initial go-live

Send credentials securely via encrypted channel (not email plain text, not WhatsApp). Preferred method: shared password manager vault or encrypted ZIP.

---

## Section 1 — Infrastructure & Hosting

### 1.1 Production Server / VPS

| Field | Value | Notes |
|-------|-------|-------|
| VPS Provider | _(e.g., Hostinger, AWS EC2, Azure VM, on-premise)_ | Confirm OS: Ubuntu 22.04 LTS recommended |
| Server IP Address | ___ | Primary production server IP |
| SSH Username | ___ | For deployment access |
| SSH Private Key / Password | ___ | RSA key preferred over password |
| GPU Server IP | ___ | Separate server for YOLO + OCR workers; must have NVIDIA GPU with CUDA 12.x |
| GPU Server SSH Username | ___ | |
| GPU Server SSH Key | ___ | |
| Server RAM | ___ GB | Minimum 16 GB for backend + DB on same node |
| GPU VRAM | ___ GB | Minimum 8 GB (RTX 3080 / T4 or better) |

### 1.2 Domain & SSL

| Field | Value | Notes |
|-------|-------|-------|
| Production Domain | _(e.g., mvis.railway.gov.in)_ | Required for HTTPS and CORS |
| SSL Certificate | Let's Encrypt / Client-provided | If client provides cert: need `.pem` + private key |
| Subdomain for API | _(e.g., api.mvis.railway.gov.in)_ | Backend API endpoint |
| Subdomain for Monitoring | _(e.g., monitor.mvis.railway.gov.in)_ | Grafana dashboard |

### 1.3 Firewall / Network Rules Required

Ports the client's network/firewall team must open:

| Port | Service | Direction | Protocol |
|------|---------|-----------|----------|
| 443 | HTTPS Frontend | Inbound | TCP |
| 443 | HTTPS API | Inbound | TCP |
| 80 | HTTP (redirect to 443) | Inbound | TCP |
| 5432 | PostgreSQL | Internal only | TCP |
| 6379 | Redis | Internal only | TCP |
| 5000–5006 | AI microservices | Internal only | TCP |
| 9090 | Prometheus | Internal only | TCP |
| 3000 | Grafana | Internal (or VPN-only) | TCP |

---

## Section 2 — Database

### 2.1 PostgreSQL (Production)

The system uses PostgreSQL as its primary database. Currently using Neon (cloud-hosted, dev instance). Production needs a dedicated instance.

| Field | Value | Notes |
|-------|-------|-------|
| Host | ___ | e.g., `db.mvis.internal` or Neon/RDS endpoint |
| Port | 5432 (default) | |
| Database Name | ___ | e.g., `vandebharat_prod` |
| Username | ___ | App user with read/write on the DB |
| Password | ___ | Minimum 24-char random string |
| SSL Mode | `require` | Must be enabled in production |
| Full Connection String | `postgresql://USER:PASS@HOST:5432/DB?sslmode=require` | |

> **Note:** Dev is currently on Neon free tier. For production, client needs either: Neon paid plan, AWS RDS, or a self-hosted PostgreSQL instance with daily backups configured.

### 2.2 Redis (Session cache, WebSocket pub-sub)

| Field | Value | Notes |
|-------|-------|-------|
| Host | ___ | e.g., `redis.mvis.internal` |
| Port | 6379 (default) | |
| Password | ___ | Required for production Redis |
| TLS | Enabled | Recommended for production |
| Full URL | `redis://:PASSWORD@HOST:6379` | |

> **Acceptable providers:** Upstash (free tier works), Redis Cloud, self-hosted Redis 7.x on Docker.

---

## Section 3 — File & Media Storage

### 3.1 Cloudinary (Frames, Annotated Images, PDFs)

Currently configured on a dev Cloudinary account. Client needs their own account for production.

| Field | Value | Notes |
|-------|-------|-------|
| Cloud Name | ___ | Found in Cloudinary Dashboard → Settings |
| API Key | ___ | Found in Cloudinary Dashboard → API Keys |
| API Secret | ___ | Found in Cloudinary Dashboard → API Keys |
| Upload Preset (optional) | ___ | If client wants unsigned uploads |
| Storage Plan | ___ | Estimated: 25 GB/month for 10 trains/day at 5MP |

> **Alternative (if Cloudinary not approved):** AWS S3 or MinIO self-hosted. Requires: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION`.

---

## Section 4 — Notifications & Alerts

This is the largest external dependency block. Multiple channels are supported; client must confirm which ones are active.

### 4.1 Email — SMTP

Required for: defect alert emails, inspection completion reports, system health warnings, user password reset, 2FA backup codes.

| Field | Value | Notes |
|-------|-------|-------|
| SMTP Host | ___ | e.g., `smtp.gmail.com`, `smtp.office365.com`, `mail.mvis.internal` |
| SMTP Port | 587 (STARTTLS) or 465 (SSL) | Confirm with mail team |
| SMTP Username | ___ | e.g., `alerts@mvis.railway.gov.in` |
| SMTP Password / App Password | ___ | If Gmail: use App Password, not account password |
| From Address | ___ | e.g., `MVIS Alerts <alerts@mvis.railway.gov.in>` |
| From Name | ___ | Display name in inbox |
| TLS/SSL | Required | |

> **Recommended approach for Indian Railways:** Use an official organisational email server or Zoho Mail (Indian provider). Gmail works but has sending limits (500/day free).

### 4.2 SMS — MSG91 (Primary Recommendation for India)

Required for: critical defect alerts to field staff, system downtime notifications, OTP for 2FA login.

> **Why MSG91:** India-based provider, DLT-registered (mandatory for transactional SMS under TRAI regulations), supports Unicode (Hindi if needed), has a reliable REST API.

| Field | Value | Notes |
|-------|-------|-------|
| Auth Key | ___ | MSG91 Dashboard → API → Auth Key |
| Sender ID | ___ | 6-char registered sender ID, e.g., `MVISAI` — must be DLT-approved |
| Template IDs | ___ | One template ID per message type (DLT requirement — see table below) |
| Route | Transactional (Route 4) | Ensures 24×7 delivery including DND numbers |
| Account Balance | ___ credits | Ensure sufficient credits for go-live |
| DLT Principal Entity ID | ___ | Mandatory under TRAI regulations |

**SMS Templates required (each needs separate DLT approval — ~5–7 business days):**

| Template Name | Purpose | Sample Message |
|---|---|---|
| DEFECT_CRITICAL | Critical defect detected | `MVISAI: CRITICAL defect detected on Train #{train_no} Coach #{coach}. Type: {defect_type}. Login: {url}` |
| DEFECT_ALERT | High/medium defect | `MVISAI: Defect detected on Train #{train_no}. Severity: {severity}. Review at {url}` |
| INSPECTION_DONE | Inspection complete | `MVISAI: Inspection for Train #{train_no} completed. Health Score: {score}%. Report: {url}` |
| CAMERA_DOWN | Camera failure | `MVISAI: Camera {camera_id} at {station} is offline. Immediate action required.` |
| SYSTEM_DOWN | Service outage | `MVISAI: System alert at {station}. Service: {service_name} is down. Contact IT.` |
| OTP_LOGIN | 2FA OTP | `MVISAI: Your OTP is {otp}. Valid for 10 minutes. Do not share.` |
| USER_CREATED | New user welcome | `MVISAI: Account created for {name}. Login: {url} Temp password: {password}` |

> **DLT Registration Process:** Client's IT/legal team must register on DLT portal (Airtel/Jio/BSNL aggregator). Dev team will provide template texts for approval. Allow 7–10 business days.

### 4.3 WhatsApp Business API (Optional but Recommended)

Useful for: supervisors receiving defect photos + annotations directly in WhatsApp, rich media alerts.

| Field | Value | Notes |
|-------|-------|-------|
| Provider | Meta Business API or MSG91 WhatsApp | MSG91 also offers WhatsApp API — simpler if already using MSG91 |
| Phone Number ID | ___ | WhatsApp Business phone number |
| Access Token | ___ | Meta permanent access token |
| WhatsApp Business Account ID | ___ | |
| Template Namespace | ___ | |

### 4.4 Push Notifications — Web Push (Optional)

For browser-based real-time alerts when user has the dashboard open.

| Field | Value | Notes |
|-------|-------|-------|
| VAPID Public Key | ___ | Generated once during setup — we can generate this |
| VAPID Private Key | ___ | Keep secret |
| FCM Server Key (optional) | ___ | If using Firebase for mobile app in future |

---

## Section 5 — Authentication & Security

### 5.1 JWT Configuration

| Field | Value | Notes |
|-------|-------|-------|
| JWT Secret | ___ | Minimum 64-character random string. **Generate via:** `openssl rand -hex 64` |
| JWT Expiry | 8h (default) or as per client policy | Matches shift duration |
| Refresh Token Expiry | 7 days | |

### 5.2 Two-Factor Authentication (TOTP)

2FA is built into User Management. No third-party API needed — uses standard TOTP (works with Google Authenticator, Microsoft Authenticator, Authy).

| Field | Value | Notes |
|-------|-------|-------|
| App Name for TOTP | ___ | Appears in authenticator app, e.g., `MVIS VandeInspect` |
| OTP Validity Window | 30 seconds (standard) | |
| Backup codes count | 8 codes per user | |

### 5.3 Initial Admin Credentials

| Field | Value | Notes |
|-------|-------|-------|
| Admin Email | ___ | e.g., `admin@mvis.railway.gov.in` |
| Initial Admin Password | ___ | Will be forced-changed on first login |
| Password Policy | ___ | Min length, complexity, expiry rules per IT policy |

---

## Section 6 — Camera Hardware Integration

This is critical for production. Dev currently uses video file upload to simulate cameras.

### 6.1 Camera Network Details

For each camera installed at each station:

| Field | Value | Notes |
|-------|-------|-------|
| Camera Manufacturer / Model | ___ | e.g., Basler, FLIR, Hikvision |
| Camera Interface | GigE / USB3 / CoaXPress | Determines SDK required |
| Camera Resolution | ___ MP | e.g., 5MP |
| Frame Rate | ___ FPS | e.g., 120 FPS |
| Camera IP Addresses | ___ (one per camera) | Static IPs required |
| Camera Username | ___ | RTSP/HTTP stream auth |
| Camera Password | ___ | |
| RTSP Stream URL format | `rtsp://USER:PASS@IP:PORT/stream` | Confirm with camera vendor |
| Trigger Interface | Hardware GPIO / Software | Hardware trigger recommended for synchronization |
| Trigger Pulse Details | ___ | Voltage, duration, polarity |

### 6.2 Edge PC (On-Site Computer) Details

| Field | Value | Notes |
|-------|-------|-------|
| Edge PC OS | Ubuntu 22.04 / Windows 10 | |
| Edge PC GPU | ___ | Model + VRAM |
| CUDA Version | ___ | Must match our PyTorch/PaddlePaddle build |
| Python Version | 3.10 or 3.11 | |
| Network: Edge to Cloud | VPN / Direct / Leased Line | Bandwidth: minimum 50 Mbps upload |
| Static IP of Edge PC | ___ | For remote access + monitoring |

### 6.3 Station Configuration

| Field | Value | Notes |
|-------|-------|-------|
| Station Name | ___ | e.g., Pune, Mumbai CSMT |
| Station Code | ___ | Railway station code |
| Number of Inspection Lanes | ___ | How many parallel tracks have MVIS installed |
| Cameras per Lane | ___ | |
| Expected Train Throughput | ___ trains/day | For capacity planning |

---

## Section 7 — Railway Domain Data

These are data inputs the system needs to function correctly — not API keys, but structured data from the client.

### 7.1 Train & Coach Manifest

| Field | Format | Notes |
|-------|--------|-------|
| Vande Bharat train numbers | CSV / Excel | 5-digit train numbers that pass through MVIS stations |
| Coach configuration per rake | JSON / Excel | Number of coaches, coach types (AC Chair Car, Executive, etc.) |
| Expected component manifest per coach type | JSON | List of components YOLO must detect per coach (e.g., wheels, brake pads, pantograph) |
| Coach number format | ___ | e.g., `VC-01`, `EC-01` — for OCR validation regex |

### 7.2 User Directory

| Field | Format | Notes |
|-------|--------|-------|
| Initial user list | Excel | Name, Email, Phone, Role (Admin/RDSO Inspector/ZR Officer/Field Staff), Station |
| Role definitions | Document | What each role can and cannot access — for RBAC implementation |
| RDSO zone assignments | ___ | Which ZR Officer oversees which stations |

### 7.3 Defect Classification Standards

| Field | Format | Notes |
|-------|--------|-------|
| Approved defect types and codes | Excel / PDF | Official RDSO/Railway defect classification codes |
| Severity mapping | Document | Which defect types are Critical vs Major vs Minor per Railway SOP |
| Maintenance action codes | Excel | Recommended actions per defect type |

---

## Section 8 — Monitoring & Observability

### 8.1 Grafana / Prometheus (Optional but Recommended)

| Field | Value | Notes |
|-------|-------|-------|
| Grafana Admin Password | ___ | For the monitoring dashboard |
| Alert Contact (email/phone) | ___ | Where Grafana sends system alerts |
| On-call rotation | ___ | Primary + backup contact for P0 incidents |

### 8.2 Error Tracking (Optional)

| Field | Value | Notes |
|-------|-------|-------|
| Sentry DSN | ___ | If client wants Sentry for error monitoring |
| Sentry Org / Project | ___ | |
| Environment Name | `production` | |

---

## Section 9 — AI Model Files

These are internal but require client/team coordination.

| File | Location | Status | Notes |
|------|----------|--------|-------|
| `best.pt` | `GPU/yolo/models/` | **Missing** — must be provided | Trained YOLOv8 defect detection model |
| `train_num_detector.pt` | `GPU/yolo/models/` | Exists in POC | OCR bogie detection model |
| Training dataset | ___ | To be provided | Labeled images for model retraining via Defect Verification Console |

> **Action required:** Confirm with client whether existing YOLO model files from the POC phase are approved for production use, or if retraining on field data is required before go-live.

---

## Section 10 — Compliance & Legal

### 10.1 Data Retention Policy

| Question | Client Answer |
|----------|---------------|
| How long should inspection images be stored? | ___ (e.g., 90 days, 1 year, 5 years) |
| How long should defect reports be retained? | ___ |
| Is PII (user names/phones) subject to any Railway IT policy? | ___ |
| Is there a data residency requirement (data must stay in India)? | ___ |

### 10.2 Audit / Compliance Requirements

| Question | Client Answer |
|----------|---------------|
| Which regulatory body oversees this system? (RDSO, Railway Board, CMRS) | ___ |
| Are audit logs required to be immutable (append-only)? | ___ |
| Is there a specific log retention period mandated? | ___ |
| Does the system need IS/ISO certification before go-live? | ___ |

---

## Summary Checklist

Use this to track what has been received from the client:

### Infrastructure
- [ ] Production VPS SSH access (backend + GPU)
- [ ] Domain name confirmed
- [ ] SSL certificate approach confirmed
- [ ] Firewall rules approved by network team

### Database & Cache
- [ ] Production PostgreSQL credentials
- [ ] Redis URL + credentials

### Storage
- [ ] Cloudinary production account credentials (or S3 alternative)

### Notifications
- [ ] SMTP credentials confirmed and tested
- [ ] MSG91 Auth Key + Sender ID received
- [ ] MSG91 DLT templates submitted for approval
- [ ] DLT Principal Entity ID provided
- [ ] WhatsApp Business API (if required)

### Security
- [ ] JWT secret generated and shared
- [ ] Initial admin email + password set
- [ ] Password policy document received

### Camera Hardware
- [ ] Camera model + specs confirmed
- [ ] Camera IP addresses provided (one per camera)
- [ ] RTSP stream URLs tested
- [ ] Hardware trigger spec document received
- [ ] Edge PC specs confirmed

### Railway Data
- [ ] Train number list provided
- [ ] Coach manifest per rake type provided
- [ ] Component manifest for YOLO validation provided
- [ ] Initial user directory (name + role + email + phone) provided
- [ ] Official defect classification codes provided

### AI Models
- [ ] `best.pt` model file provided (or retraining approved)
- [ ] `train_num_detector.pt` validated on production camera footage

### Compliance
- [ ] Data retention policy confirmed in writing
- [ ] Regulatory sign-off process clarified

---

## Estimated Timeline Impact

| Item | If Missing | Delay Risk |
|------|------------|------------|
| SMTP credentials | No email alerts, no password reset, no 2FA backup | Blocker for User Management |
| MSG91 Auth Key | No SMS alerts | 1–2 day delay to onboard |
| MSG91 DLT Approval | SMS not delivered even if API key exists | **7–10 business days** — submit ASAP |
| Production PostgreSQL | Cannot migrate from dev Neon | 1 day setup |
| Cloudinary prod account | Images go to dev account (dev quota) | 1 day setup |
| Camera RTSP URLs | Cannot test live camera integration | Blocks live train monitoring end-to-end test |
| `best.pt` model | YOLO detection skipped — no defects detected | Core feature broken |
| Coach manifest | Cannot validate missing components | Correlation engine returns incomplete results |

---

*Document version 1.0 — update as credentials are received.*
