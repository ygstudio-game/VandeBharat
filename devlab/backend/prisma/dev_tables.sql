-- Additive: creates only devlab's dev_* tables. Does NOT alter/drop main tables.
CREATE TABLE IF NOT EXISTS public.dev_ocr_runs (
  id            uuid PRIMARY KEY,
  session_id    uuid NOT NULL,
  frame_id      uuid NOT NULL,
  yolo_bbox     jsonb,
  pass1_result  jsonb,
  pass2_result  jsonb,
  final_number  varchar(30),
  confidence    decimal(4,3),
  pass_used     integer,
  roi_used      boolean,
  is_valid      boolean NOT NULL DEFAULT false,
  raw_response  jsonb,
  created_at    timestamptz(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dev_sync_runs (
  id           uuid PRIMARY KEY,
  session_id   uuid NOT NULL,
  output_json  jsonb,
  created_at   timestamptz(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dev_yolo_runs (
  id               uuid PRIMARY KEY,
  session_id       uuid NOT NULL,
  frame_id         uuid NOT NULL,
  detections_json  jsonb,
  created_at       timestamptz(6) NOT NULL DEFAULT now()
);
