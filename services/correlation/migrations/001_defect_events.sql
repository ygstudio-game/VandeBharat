-- C0 — persistence for the upgraded Event Correlation Engine (Phase C).
-- Stores one authoritative, deduplicated, confidence-scored defect event per
-- physical defect (not one row per detection).

CREATE TABLE IF NOT EXISTS defect_events (
    event_id          UUID PRIMARY KEY,
    session_id        TEXT,
    coach_id          TEXT NOT NULL,
    camera_id         TEXT,                       -- session_camera_id (UUID) of best camera
    defect_class      TEXT NOT NULL,
    timestamp_ms      DOUBLE PRECISION DEFAULT 0,
    train_position_m  DOUBLE PRECISION DEFAULT 0,
    bogie_id          SMALLINT DEFAULT 0,         -- 0=front, 1=rear
    component_id      SMALLINT DEFAULT 0,
    yolo_confidence   REAL DEFAULT 0,             -- Bayesian-fused confidence (C3)
    agreement         REAL DEFAULT 0,             -- multi-camera agreement fraction (C2)
    alert_score       REAL DEFAULT 0,             -- composite score (C4)
    route             TEXT,                       -- 'confirm' | 'review' (C4)
    image_quality     REAL DEFAULT 0,
    track_confidence  REAL DEFAULT 0,
    ocr_confidence    REAL DEFAULT 0,
    frame_count       INTEGER DEFAULT 1,
    validated         BOOLEAN DEFAULT FALSE,
    state             TEXT NOT NULL DEFAULT 'new',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_defect_events_coach   ON defect_events (coach_id);
CREATE INDEX IF NOT EXISTS idx_defect_events_session ON defect_events (session_id);
CREATE INDEX IF NOT EXISTS idx_defect_events_state   ON defect_events (state);
