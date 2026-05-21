"""
Report Generator Service — port 5006
POST /generate { session_id } → builds PDF + JSON → uploads to Cloudinary → writes reports row
GET  /report/{session_id}     → returns report metadata
"""
import os
import json
import uuid
import logging
import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from dotenv import load_dotenv
from builder import generate_report, build_json_report, build_pdf_report, load_session_data

# Load backend .env first (shared credentials), then service .env as override
_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
load_dotenv(dotenv_path=os.path.join(_root, ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"), override=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]
app = FastAPI(title="VandeInspect Report Generator", version="1.0.0")


class GenerateRequest(BaseModel):
    session_id: str


def get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


@app.get("/health")
def health():
    return {"status": "ok", "service": "report_generator", "port": 5006}


@app.post("/generate")
def generate(req: GenerateRequest):
    conn = get_conn()
    try:
        # Mark pipeline stage running
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE pipeline_stages
                SET status='running', started_at=NOW(), detail_message='Building report...'
                WHERE session_id=%s AND stage='report_generation'
                """,
                (req.session_id,),
            )
            conn.commit()

        result = generate_report(conn, req.session_id)

        # Upsert reports row
        report_id = str(uuid.uuid4())
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM inspection_sessions WHERE id = %s
                """,
                (req.session_id,),
            )
            session_row = cur.fetchone()
            if not session_row:
                raise ValueError(f"Session {req.session_id} not found")

            cur.execute(
                """
                SELECT s.train_number FROM inspection_sessions s WHERE s.id = %s
                """,
                (req.session_id,),
            )
            train_row = cur.fetchone()

            cur.execute(
                """
                INSERT INTO reports
                  (id, session_id, train_number, total_coaches, total_frames,
                   total_defects, critical_defects, missing_components_count,
                   overall_health, pdf_url, pdf_public_id, json_url, json_public_id,
                   status, generated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'completed',NOW())
                ON CONFLICT (session_id) DO UPDATE SET
                  total_coaches=EXCLUDED.total_coaches,
                  total_frames=EXCLUDED.total_frames,
                  total_defects=EXCLUDED.total_defects,
                  critical_defects=EXCLUDED.critical_defects,
                  missing_components_count=EXCLUDED.missing_components_count,
                  overall_health=EXCLUDED.overall_health,
                  pdf_url=EXCLUDED.pdf_url,
                  pdf_public_id=EXCLUDED.pdf_public_id,
                  json_url=EXCLUDED.json_url,
                  json_public_id=EXCLUDED.json_public_id,
                  status='completed',
                  generated_at=NOW()
                """,
                (
                    report_id, req.session_id,
                    train_row["train_number"] if train_row else "",
                    result["total_coaches"], result["total_frames"],
                    result["total_defects"], result["critical_defects"],
                    result["missing_components_count"], result["overall_health"],
                    result["pdf_url"], result["pdf_public_id"],
                    result["json_url"], result["json_public_id"],
                ),
            )

            # Mark pipeline stage completed
            cur.execute(
                """
                UPDATE pipeline_stages
                SET status='completed', completed_at=NOW(),
                    detail_message='Report ready',
                    stats=%s::jsonb
                WHERE session_id=%s AND stage='report_generation'
                """,
                (
                    json.dumps({"pdf_size_bytes": result["pdf_size_bytes"]}),
                    req.session_id,
                ),
            )

            # Mark session completed (idempotent — Phase 3 may have already done this)
            cur.execute(
                """
                UPDATE inspection_sessions
                SET status='completed', completed_at=NOW()
                WHERE id=%s AND status != 'completed'
                """,
                (req.session_id,),
            )
            conn.commit()

        return result

    except Exception as exc:
        logger.exception("Report generation failed for session %s", req.session_id)
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE pipeline_stages SET status='failed', error_message=%s
                WHERE session_id=%s AND stage='report_generation'
                """,
                (str(exc), req.session_id),
            )
            conn.commit()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()


@app.get("/report/{session_id}")
def get_report(session_id: str):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM reports WHERE session_id = %s",
                (session_id,),
            )
            report = cur.fetchone()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        return dict(report)
    finally:
        conn.close()
