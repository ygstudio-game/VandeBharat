"""
Sync Engine Service — port 5004
Receives { session_id } → runs trigger_id gap detection → creates coaches → assigns frames.
"""
import os
import sys
import json
import logging
import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from engine import run_sync

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "..", "GPU", "shared"))
from logging_utils import configure_logging, set_trace_id  # noqa: E402

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

configure_logging("sync_engine")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]
app = FastAPI(title="VandeInspect Sync Engine", version="1.0.0")


class SyncRequest(BaseModel):
    session_id: str


def get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


@app.get("/health")
def health():
    return {"status": "ok", "service": "sync_engine", "port": 5004}


@app.post("/sync")
def sync(req: SyncRequest):
    set_trace_id(req.session_id)
    conn = get_conn()
    try:
        # Update pipeline stage
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE pipeline_stages
                SET status='running', started_at=NOW(), detail_message='Running gap detection...'
                WHERE session_id=%s AND stage='synchronization'
                """,
                (req.session_id,),
            )
            conn.commit()

        result = run_sync(conn, req.session_id)

        with conn.cursor() as cur:
            # Mark sync stage complete
            cur.execute(
                """
                UPDATE pipeline_stages
                SET status='completed', completed_at=NOW(),
                    detail_message=%s, stats=%s::jsonb
                WHERE session_id=%s AND stage='synchronization'
                """,
                (
                    f"{result['coaches_created']} coaches mapped from trigger_id gap detection",
                    json.dumps({k: v for k, v in result.items() if k != "coaches"}),
                    req.session_id,
                ),
            )
            # Update session: total_coaches, status
            cur.execute(
                """
                UPDATE inspection_sessions
                SET total_coaches=%s, status='analysing'
                WHERE id=%s
                """,
                (result["coaches_created"], req.session_id),
            )
            conn.commit()

        return result

    except Exception as exc:
        logger.exception("Sync failed for session %s", req.session_id)
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE pipeline_stages SET status='failed', error_message=%s
                WHERE session_id=%s AND stage='synchronization'
                """,
                (str(exc), req.session_id),
            )
            conn.commit()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()
