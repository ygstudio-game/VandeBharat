"""
Correlation Service — port 5005
POST /correlate { session_id, coach_id }
  → runs YOLO defect detection on sampled coach frames
  → writes defects + component_detections + missing_components
  → updates coaches.health_score
"""
import os
import sys
import logging
import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from engine import correlate_coach

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "..", "GPU", "shared"))
from logging_utils import configure_logging, set_trace_id  # noqa: E402

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

configure_logging("correlation")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]
app = FastAPI(title="VandeInspect Correlation Engine", version="1.0.0")


class CorrelateRequest(BaseModel):
    session_id: str
    coach_id: str


def get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


@app.get("/health")
def health():
    return {"status": "ok", "service": "correlation", "port": 5005}


@app.post("/correlate")
def correlate(req: CorrelateRequest):
    set_trace_id(req.session_id)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE pipeline_stages
                SET status='running', started_at=NOW(),
                    detail_message='Running defect detection...'
                WHERE session_id=%s AND stage='component_detection'
                """,
                (req.session_id,),
            )
            conn.commit()

        result = correlate_coach(conn, req.session_id, req.coach_id)

        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE pipeline_stages
                SET status='running',
                    detail_message='Correlation complete for coach, updating aggregates...'
                WHERE session_id=%s AND stage='defect_analysis'
                """,
                (req.session_id,),
            )
            conn.commit()

        return result

    except Exception as exc:
        logger.exception("Correlation failed session=%s coach=%s", req.session_id, req.coach_id)
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE pipeline_stages SET status='failed', error_message=%s
                WHERE session_id=%s AND stage='component_detection'
                """,
                (str(exc), req.session_id),
            )
            conn.commit()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()
