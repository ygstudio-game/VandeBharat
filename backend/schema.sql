-- =============================================================================
-- VandeInspect AI — Full Production PostgreSQL Schema
-- Storage: Cloudinary (URLs stored here, binary blobs stored in Cloudinary)
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. USERS & AUTH
-- =============================================================================

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(200) UNIQUE NOT NULL,
  name            VARCHAR(200) NOT NULL,
  role            VARCHAR(30) NOT NULL DEFAULT 'operator',
  -- operator | supervisor | admin | viewer
  password_hash   TEXT NOT NULL,
  is_active       BOOLEAN DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 2. INFRASTRUCTURE — Camera Setup & Edge Machine
-- =============================================================================

CREATE TABLE edge_machines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname         VARCHAR(100) NOT NULL,
  ip_address       VARCHAR(45),
  firmware_version VARCHAR(20),
  status           VARCHAR(20) DEFAULT 'online',
  -- online | offline | error
  last_heartbeat   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE camera_setups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_name    VARCHAR(100) NOT NULL,
  station_code    VARCHAR(20) UNIQUE NOT NULL,
  edge_machine_id UUID REFERENCES edge_machines(id),
  installed_at    TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE cameras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_setup_id UUID NOT NULL REFERENCES camera_setups(id),
  camera_code     VARCHAR(30) NOT NULL,
  -- e.g. CAM_OCR_LEFT, CAM_COMPONENT_RIGHT, CAM_BOTTOM
  camera_type     VARCHAR(40) NOT NULL,
  -- ocr_side | component_left | component_right | bottom | suspension | wheel | overview
  position_label  VARCHAR(80),
  resolution      VARCHAR(20),
  fps             INT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 3. COMPONENT MANIFESTS (What components are expected per coach type)
-- =============================================================================

CREATE TABLE component_manifests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_type      VARCHAR(60) NOT NULL,
  -- e.g. LHB_SLEEPER, LHB_AC, VANDE_BHARAT_CHAIR, PANTRY
  component_name  VARCHAR(120) NOT NULL,
  component_code  VARCHAR(60) NOT NULL,
  quantity        INT NOT NULL DEFAULT 1,
  is_critical     BOOLEAN DEFAULT false,
  -- critical = safety risk if missing
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(coach_type, component_code)
);

-- =============================================================================
-- 4. INSPECTION SESSIONS
-- =============================================================================

CREATE TABLE inspection_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Human-readable session code: INS-2026-XXXX (set by app logic)
  session_code    VARCHAR(30) UNIQUE,
  train_number    VARCHAR(50) NOT NULL,
  station_code    VARCHAR(20) REFERENCES camera_setups(station_code),
  camera_setup_id UUID REFERENCES camera_setups(id),

  status          VARCHAR(30) NOT NULL DEFAULT 'queued',
  -- queued | extracting | ocr_running | synchronizing | analysing
  -- correlating | review_ready | completed | failed

  progress_pct    INT DEFAULT 0,
  total_coaches   INT,
  total_frames    INT,
  cameras_active  INT,
  critical_defects INT DEFAULT 0,
  missing_components_count INT DEFAULT 0,
  health_score    NUMERIC(5,2),          -- 0–100

  ocr_confidence       NUMERIC(4,3),     -- average across all OCR hits
  sync_confidence      NUMERIC(4,3),

  started_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,

  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 5. PIPELINE STAGE TRACKING (maps to frontend Pipeline Timeline)
-- =============================================================================

CREATE TABLE pipeline_stages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES inspection_sessions(id) ON DELETE CASCADE,
  stage           VARCHAR(40) NOT NULL,
  -- frame_extraction | ocr_detection | synchronization
  -- component_detection | defect_analysis | report_generation
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending | running | completed | failed
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  progress_pct    INT DEFAULT 0,
  -- User-visible message — NO backend jargon ("Mapping frames to Coach B2...")
  detail_message  TEXT,
  error_message   TEXT,
  stats           JSONB,                 -- stage-specific counters
  UNIQUE(session_id, stage)
);

-- =============================================================================
-- 6. SESSION CAMERAS (which cameras were active per session)
-- =============================================================================

CREATE TABLE session_cameras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES inspection_sessions(id) ON DELETE CASCADE,
  camera_id       UUID NOT NULL REFERENCES cameras(id),
  camera_type     VARCHAR(40) NOT NULL,
  name            VARCHAR(100),
  -- Raw video upload — Cloudinary URL
  video_url       TEXT,
  video_public_id TEXT,
  frame_count     INT DEFAULT 0,
  dropped_frames  INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, camera_id)
);

-- =============================================================================
-- 7. FRAMES (core evidence unit)
-- =============================================================================

CREATE TABLE frames (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES inspection_sessions(id) ON DELETE CASCADE,
  session_camera_id   UUID NOT NULL REFERENCES session_cameras(id) ON DELETE CASCADE,
  coach_id            UUID,              -- NULL until sync_engine assigns; FK added below
  sequence_number     INT NOT NULL,
  captured_at_ms      BIGINT NOT NULL,   -- hardware trigger timestamp (epoch ms)

  -- Cloudinary
  cloudinary_url      TEXT NOT NULL,
  cloudinary_public_id TEXT NOT NULL,
  thumbnail_url       TEXT,              -- Cloudinary transformation URL (small preview)

  width_px            INT,
  height_px           INT,
  file_size_bytes     INT,

  is_ocr_candidate    BOOLEAN DEFAULT false,
  is_defect_flagged   BOOLEAN DEFAULT false,
  is_sharp            BOOLEAN DEFAULT true,

  created_at          TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 8. COACHES (created by sync engine after OCR + gap detection)
-- =============================================================================

CREATE TABLE coaches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES inspection_sessions(id) ON DELETE CASCADE,
  coach_number      VARCHAR(30) NOT NULL,     -- "B1", "B2", "HA1", etc.
  coach_type        VARCHAR(60),               -- "LHB_SLEEPER", "VANDE_BHARAT_CHAIR"
  coach_index       INT,                       -- physical order in train (1, 2, 3...)

  ocr_confidence    NUMERIC(4,3),
  ocr_frame_id      UUID REFERENCES frames(id),  -- best OCR frame used for identification
  sync_confidence   NUMERIC(4,3),

  total_frames      INT DEFAULT 0,
  ocr_frame_count   INT DEFAULT 0,
  component_frame_count INT DEFAULT 0,

  critical_defects  INT DEFAULT 0,
  missing_components INT DEFAULT 0,
  health_score      NUMERIC(5,2),             -- 0–100

  created_at        TIMESTAMPTZ DEFAULT now()
);

-- FK from frames to coaches (added after coaches table created)
ALTER TABLE frames ADD CONSTRAINT fk_frames_coach
  FOREIGN KEY (coach_id) REFERENCES coaches(id);

-- =============================================================================
-- 9. OCR RESULTS (one frame may have multiple text detections)
-- =============================================================================

CREATE TABLE ocr_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frame_id        UUID NOT NULL REFERENCES frames(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL REFERENCES inspection_sessions(id) ON DELETE CASCADE,

  detected_text   VARCHAR(200),
  coach_number    VARCHAR(30),           -- validated, clean coach/train number
  confidence      NUMERIC(4,3),

  pass_number     INT DEFAULT 1,         -- 1 = raw BGR, 2 = CLAHE+sharpened
  is_valid        BOOLEAN DEFAULT false, -- passed 5-6 digit regex check

  bbox_x INT, bbox_y INT, bbox_w INT, bbox_h INT,
  raw_response    JSONB,                 -- full PaddleOCR response

  mapped_coach_id UUID REFERENCES coaches(id),

  created_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 10. COACH FRAME MAP (sync engine output: frame → coach assignment)
-- =============================================================================

CREATE TABLE coach_frame_map (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES inspection_sessions(id) ON DELETE CASCADE,
  frame_id          UUID NOT NULL REFERENCES frames(id) ON DELETE CASCADE,
  coach_id          UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  assignment_method VARCHAR(30) NOT NULL,
  -- OCR_DIRECT | GAP_INTERPOLATION | MANUAL
  confidence        NUMERIC(4,3),
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(frame_id)
);

-- =============================================================================
-- 11. COMPONENT DETECTIONS (YOLO output per frame)
-- =============================================================================

CREATE TABLE component_detections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES inspection_sessions(id) ON DELETE CASCADE,
  coach_id        UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  frame_id        UUID NOT NULL REFERENCES frames(id) ON DELETE CASCADE,

  component_code  VARCHAR(60) NOT NULL,
  component_name  VARCHAR(120),
  detection_type  VARCHAR(20) NOT NULL DEFAULT 'COMPONENT',
  -- COMPONENT | DEFECT

  confidence      NUMERIC(4,3) NOT NULL,
  bbox_x INT NOT NULL, bbox_y INT NOT NULL, bbox_w INT NOT NULL, bbox_h INT NOT NULL,

  is_expected     BOOLEAN DEFAULT true,
  status          VARCHAR(20) NOT NULL DEFAULT 'detected',
  -- detected | missing | defective

  model_version   VARCHAR(50),
  raw_response    JSONB,

  created_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 12. DEFECTS (correlation engine output)
-- =============================================================================

CREATE TABLE defects (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              UUID NOT NULL REFERENCES inspection_sessions(id) ON DELETE CASCADE,
  coach_id                UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  frame_id                UUID NOT NULL REFERENCES frames(id) ON DELETE CASCADE,
  component_detection_id  UUID REFERENCES component_detections(id),

  defect_type   VARCHAR(80) NOT NULL,
  -- crack | missing_bolt | corrosion | deformation | leakage | misalignment | missing_component

  severity      VARCHAR(20) NOT NULL,
  -- critical | high | medium | low

  confidence    NUMERIC(4,3) NOT NULL,
  bbox_x INT, bbox_y INT, bbox_w INT, bbox_h INT,

  ai_notes      TEXT,                          -- model-generated description

  -- Cloudinary: annotated frame with bounding box overlay
  annotated_frame_url       TEXT,
  annotated_frame_public_id TEXT,

  review_status VARCHAR(20) DEFAULT 'pending',
  -- pending | approved | rejected | escalated
  reviewed_by   UUID REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  review_notes  TEXT,

  created_at    TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 13. MISSING COMPONENT ALERTS
-- =============================================================================

CREATE TABLE missing_components (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES inspection_sessions(id) ON DELETE CASCADE,
  coach_id        UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  component_code  VARCHAR(60) NOT NULL,
  component_name  VARCHAR(120) NOT NULL,
  expected_count  INT DEFAULT 1,
  detected_count  INT DEFAULT 0,
  severity        VARCHAR(20) NOT NULL DEFAULT 'high',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 14. TIMELINE EVENTS (for bottom frame strip in UI)
-- =============================================================================

CREATE TABLE timeline_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES inspection_sessions(id) ON DELETE CASCADE,
  frame_id    UUID REFERENCES frames(id),
  coach_id    UUID REFERENCES coaches(id),
  event_type  VARCHAR(40) NOT NULL,
  -- OCR_ANCHOR | COACH_GAP | DEFECT_FOUND | MISSING_COMPONENT | STAGE_COMPLETE
  description TEXT,
  timestamp_ms BIGINT,                   -- matches frame captured_at_ms
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 15. REPORTS
-- =============================================================================

CREATE TABLE reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES inspection_sessions(id) ON DELETE CASCADE UNIQUE,
  train_number    VARCHAR(50) NOT NULL,

  total_coaches   INT,
  total_frames    INT,
  total_defects   INT,
  critical_defects INT,
  missing_components_count INT,
  overall_health  NUMERIC(5,2),          -- 0–100

  -- Cloudinary URLs
  pdf_url         TEXT,
  pdf_public_id   TEXT,
  json_url        TEXT,
  json_public_id  TEXT,

  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending | generating | ready | failed

  generated_at    TIMESTAMPTZ,

  -- Digital sign-off
  is_signed       BOOLEAN DEFAULT false,
  signed_off_by   UUID REFERENCES users(id),
  signed_off_at   TIMESTAMPTZ,
  sign_off_notes  TEXT,

  created_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 16. AUDIT LOGS
-- =============================================================================

CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES inspection_sessions(id),
  user_id       UUID REFERENCES users(id),
  action        VARCHAR(100) NOT NULL,
  -- SESSION_CREATED | PIPELINE_TRIGGERED | DEFECT_APPROVED | REPORT_GENERATED | USER_LOGIN
  resource_type VARCHAR(50),             -- session | defect | report | user
  resource_id   UUID,
  ip_address    VARCHAR(45),
  metadata      JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 17. SYSTEM HEALTH SNAPSHOTS (for /gpu-workers and /system-health pages)
-- =============================================================================

CREATE TABLE system_health (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gpu_utilization_pct         NUMERIC(5,2),
  gpu_memory_used_mb          INT,
  gpu_memory_total_mb         INT,
  ocr_queue_depth             INT,
  detection_queue_depth       INT,
  active_sessions             INT,
  frames_processed_per_minute INT,
  ocr_accuracy_avg            NUMERIC(4,3),
  recorded_at                 TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- INDEXES — Performance-critical lookups
-- =============================================================================

-- Frame lookups (extremely frequent — thousands of frames per session)
CREATE INDEX idx_frames_session      ON frames(session_id);
CREATE INDEX idx_frames_camera       ON frames(session_camera_id);
CREATE INDEX idx_frames_coach        ON frames(coach_id);
CREATE INDEX idx_frames_defect_flag  ON frames(session_id, is_defect_flagged)
  WHERE is_defect_flagged = true;
CREATE INDEX idx_frames_ocr_candidate ON frames(session_id, is_ocr_candidate)
  WHERE is_ocr_candidate = true;
CREATE INDEX idx_frames_seq          ON frames(session_id, session_camera_id, sequence_number);

-- Session status polling (dashboard + live queue)
CREATE INDEX idx_sessions_status     ON inspection_sessions(status, started_at DESC);
CREATE INDEX idx_sessions_train      ON inspection_sessions(train_number);

-- Coach lookups
CREATE INDEX idx_coaches_session     ON coaches(session_id);

-- OCR results
CREATE INDEX idx_ocr_frame           ON ocr_results(frame_id);
CREATE INDEX idx_ocr_session         ON ocr_results(session_id);
CREATE INDEX idx_ocr_valid           ON ocr_results(session_id, is_valid) WHERE is_valid = true;

-- Component detections
CREATE INDEX idx_detections_session  ON component_detections(session_id);
CREATE INDEX idx_detections_coach    ON component_detections(coach_id);
CREATE INDEX idx_detections_frame    ON component_detections(frame_id);

-- Defect lookups (most queried for UI)
CREATE INDEX idx_defects_session     ON defects(session_id);
CREATE INDEX idx_defects_coach       ON defects(coach_id);
CREATE INDEX idx_defects_severity    ON defects(session_id, severity);
CREATE INDEX idx_defects_review      ON defects(review_status) WHERE review_status = 'pending';

-- Pipeline stage polling
CREATE INDEX idx_pipeline_session    ON pipeline_stages(session_id);

-- Timeline events
CREATE INDEX idx_timeline_session    ON timeline_events(session_id);
CREATE INDEX idx_timeline_coach      ON timeline_events(coach_id);

-- Audit logs
CREATE INDEX idx_audit_session       ON audit_logs(session_id, created_at DESC);
CREATE INDEX idx_audit_user          ON audit_logs(user_id, created_at DESC);

-- System health time-series
CREATE INDEX idx_health_recorded     ON system_health(recorded_at DESC);

-- =============================================================================
-- SEED: Default camera setup for MVP testing (update after real station setup)
-- =============================================================================

INSERT INTO camera_setups (station_name, station_code) VALUES
  ('Test Station - MVP', 'TEST01');

INSERT INTO component_manifests (coach_type, component_name, component_code, quantity, is_critical) VALUES
  ('VANDE_BHARAT', 'Brake Pad', 'BRAKE_PAD', 2, true),
  ('VANDE_BHARAT', 'Suspension Pin', 'SUSP_PIN', 4, true),
  ('VANDE_BHARAT', 'Water Tank', 'WATER_TANK', 1, false),
  ('VANDE_BHARAT', 'Axle Box Cover', 'AXLE_BOX', 4, true),
  ('VANDE_BHARAT', 'Wheel Assembly', 'WHEEL_ASSY', 4, true),
  ('VANDE_BHARAT', 'Coupler', 'COUPLER', 2, true),
  ('VANDE_BHARAT', 'Bogie Frame', 'BOGIE_FRAME', 2, true),
  ('LHB_SLEEPER', 'Brake Pad', 'BRAKE_PAD', 2, true),
  ('LHB_SLEEPER', 'Primary Suspension', 'PRI_SUSP', 4, true),
  ('LHB_SLEEPER', 'Secondary Suspension', 'SEC_SUSP', 4, true),
  ('LHB_SLEEPER', 'Axle Box Cover', 'AXLE_BOX', 4, true),
  ('LHB_SLEEPER', 'Wheel Assembly', 'WHEEL_ASSY', 4, true),
  ('LHB_SLEEPER', 'Centre Pivot Pin', 'CENTRE_PIVOT', 1, true),
  ('LHB_SLEEPER', 'Coupler', 'COUPLER', 2, true);
