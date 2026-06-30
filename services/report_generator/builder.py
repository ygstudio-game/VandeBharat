"""
Report builder — Phase 4
Reads full session from DB → builds PDF (fpdf2) + JSON → uploads to Cloudinary.
"""
import io
import os
import json
import zipfile
import logging
import datetime
import requests
from fpdf import FPDF
import cloudinary
import cloudinary.uploader

logger = logging.getLogger(__name__)

# ── Cloudinary setup ──────────────────────────────────────────────────────────
cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME", ""),
    api_key=os.environ.get("CLOUDINARY_API_KEY", ""),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET", ""),
)

SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
SEVERITY_COLOR = {
    "CRITICAL": (220, 38, 38),    # red
    "HIGH":     (234, 88, 12),    # orange
    "MEDIUM":   (202, 138, 4),    # amber
    "LOW":      (22, 163, 74),    # green
}
HEALTH_COLOR = {
    "good":     (22, 163, 74),   # ≥ 80
    "warning":  (202, 138, 4),   # 50–79
    "critical": (220, 38, 38),   # < 50
}


# ─── 1. Load data ─────────────────────────────────────────────────────────────

def load_session_data(conn, session_id: str) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT s.id, s.session_code, s.train_number, s.station_code,
                   s.status, s.started_at, s.completed_at,
                   s.total_coaches, s.total_frames, s.critical_defects,
                   s.missing_components_count, s.health_score,
                   cs.station_code AS setup_station
            FROM inspection_sessions s
            LEFT JOIN camera_setups cs ON cs.id = s.camera_setup_id
            WHERE s.id = %s
            """,
            (session_id,),
        )
        session = cur.fetchone()

        cur.execute(
            """
            SELECT id, coach_number, coach_index, coach_type,
                   ocr_confidence, health_score,
                   critical_defects, missing_components, total_frames,
                   start_trigger_id, end_trigger_id
            FROM coaches
            WHERE session_id = %s
            ORDER BY coach_index ASC
            """,
            (session_id,),
        )
        coaches = cur.fetchall()
        coach_ids = [c["id"] for c in coaches]

        defects = []
        missing = []
        if coach_ids:
            cur.execute(
                """
                SELECT d.id, d.coach_id, d.defect_type, d.severity,
                       d.confidence, d.bbox_x, d.bbox_y, d.bbox_w, d.bbox_h,
                       d.ai_notes, d.annotated_frame_url
                FROM defects d
                WHERE d.session_id = %s
                ORDER BY
                  CASE d.severity
                    WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2
                    WHEN 'MEDIUM' THEN 3 ELSE 4
                  END, d.created_at
                """,
                (session_id,),
            )
            defects = cur.fetchall()

            cur.execute(
                """
                SELECT coach_id, component_code, component_name,
                       expected_count, detected_count, severity
                FROM missing_components
                WHERE session_id = %s
                ORDER BY coach_id, severity
                """,
                (session_id,),
            )
            missing = cur.fetchall()

    # Group defects + missing by coach_id
    coach_defects = {}
    for d in defects:
        coach_defects.setdefault(d["coach_id"], []).append(d)
    coach_missing = {}
    for m in missing:
        coach_missing.setdefault(m["coach_id"], []).append(m)

    return {
        "session": session,
        "coaches": coaches,
        "coach_defects": coach_defects,
        "coach_missing": coach_missing,
        "total_defects": len(defects),
    }


# ─── 2. Build JSON ────────────────────────────────────────────────────────────

def build_json_report(data: dict) -> str:
    s = data["session"]

    def _dec(v):
        return float(v) if v is not None else None

    report = {
        "report_version": "1.0",
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "session": {
            "id": s["id"],
            "session_code": s["session_code"],
            "train_number": s["train_number"],
            "station_code": s["station_code"],
            "started_at": s["started_at"].isoformat() if s["started_at"] else None,
            "completed_at": s["completed_at"].isoformat() if s["completed_at"] else None,
            "total_coaches": s["total_coaches"],
            "total_frames": s["total_frames"],
            "critical_defects": s["critical_defects"],
            "missing_components_count": s["missing_components_count"],
            "health_score": _dec(s["health_score"]),
        },
        "coaches": [],
    }

    for c in data["coaches"]:
        defects = [
            {
                "type": d["defect_type"],
                "severity": d["severity"],
                "confidence": float(d["confidence"]),
                "bbox": [d["bbox_x"], d["bbox_y"], d["bbox_w"], d["bbox_h"]],
                "annotated_url": d["annotated_frame_url"],
                "notes": d["ai_notes"],
            }
            for d in data["coach_defects"].get(c["id"], [])
        ]
        missing = [
            {
                "component_code": m["component_code"],
                "component_name": m["component_name"],
                "expected": m["expected_count"],
                "detected": m["detected_count"],
                "severity": m["severity"],
            }
            for m in data["coach_missing"].get(c["id"], [])
        ]
        report["coaches"].append({
            "coach_index": c["coach_index"],
            "coach_number": c["coach_number"],
            "coach_type": c["coach_type"],
            "health_score": _dec(c["health_score"]),
            "critical_defects": c["critical_defects"],
            "missing_components": c["missing_components"],
            "total_frames": c["total_frames"],
            "defects": defects,
            "missing_components_list": missing,
        })

    return json.dumps(report, indent=2, ensure_ascii=False)


# ─── 3. Build PDF ─────────────────────────────────────────────────────────────

def _health_color(score):
    if score is None:
        return HEALTH_COLOR["warning"]
    v = float(score)
    if v >= 80:
        return HEALTH_COLOR["good"]
    if v >= 50:
        return HEALTH_COLOR["warning"]
    return HEALTH_COLOR["critical"]


class _PDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, "VandeInspect AI - Automated Train Inspection Report", align="R")
        self.ln(4)
        self.set_draw_color(200, 200, 200)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 8, f"Page {self.page_no()} | Confidential - Indian Railways", align="C")


def build_pdf_report(data: dict) -> bytes:
    s = data["session"]
    pdf = _PDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    # ── Cover / summary ───────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 12, "Train Inspection Report", ln=True, align="C")

    pdf.set_font("Helvetica", "", 13)
    pdf.set_text_color(71, 85, 105)
    pdf.cell(0, 8, f"Train No: {s['train_number']}   |   Session: {s['session_code']}", ln=True, align="C")

    started = s["started_at"].strftime("%d %b %Y, %H:%M") if s["started_at"] else "-"
    pdf.cell(0, 7, f"Inspected: {started}   |   Station: {s['station_code'] or '-'}", ln=True, align="C")
    pdf.ln(6)

    # Health score banner
    hs = float(s["health_score"]) if s["health_score"] else 0.0
    r, g, b = _health_color(s["health_score"])
    pdf.set_fill_color(r, g, b)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 14, f"Overall Health Score: {hs:.1f} / 100", ln=True, align="C", fill=True)
    pdf.ln(6)

    # Summary KPI table
    pdf.set_text_color(15, 23, 42)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "Inspection Summary", ln=True)
    pdf.set_draw_color(226, 232, 240)
    pdf.set_fill_color(241, 245, 249)

    kpis = [
        ("Total Coaches",            str(s["total_coaches"] or 0)),
        ("Total Frames Analysed",    str(s["total_frames"] or 0)),
        ("Total Defects",            str(data["total_defects"])),
        ("Critical Defects",         str(s["critical_defects"] or 0)),
        ("Missing Components",       str(s["missing_components_count"] or 0)),
    ]
    pdf.set_font("Helvetica", "", 10)
    col_w = 95
    for i, (label, val) in enumerate(kpis):
        fill = i % 2 == 0
        pdf.set_fill_color(241, 245, 249) if fill else pdf.set_fill_color(255, 255, 255)
        pdf.cell(col_w, 8, f"  {label}", border=1, fill=fill)
        pdf.cell(col_w, 8, f"  {val}", border=1, fill=fill, ln=True)
    pdf.ln(8)

    # ── Per-coach breakdown ───────────────────────────────────────────────────
    for c in data["coaches"]:
        coach_defs = data["coach_defects"].get(c["id"], [])
        coach_miss = data["coach_missing"].get(c["id"], [])

        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(15, 23, 42)
        ch_label = f"Coach {c['coach_index']}  -  #{c['coach_number']}"
        pdf.cell(0, 10, ch_label, ln=True)

        hs_c = float(c["health_score"]) if c["health_score"] else None
        r, g, b = _health_color(hs_c)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(r, g, b)
        hs_str = f"{hs_c:.1f}" if hs_c is not None else "N/A"
        pdf.cell(0, 6, f"Health: {hs_str}/100   Defects: {c['critical_defects']} critical   Missing: {c['missing_components']}", ln=True)
        pdf.set_text_color(15, 23, 42)
        pdf.ln(2)

        if coach_defs:
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_fill_color(226, 232, 240)
            pdf.cell(50, 7, "Defect Type", border=1, fill=True)
            pdf.cell(30, 7, "Severity", border=1, fill=True)
            pdf.cell(25, 7, "Confidence", border=1, fill=True)
            pdf.cell(85, 7, "Notes", border=1, fill=True, ln=True)

            pdf.set_font("Helvetica", "", 9)
            for d in coach_defs:
                sev = d["severity"]
                r2, g2, b2 = SEVERITY_COLOR.get(sev, (15, 23, 42))
                pdf.set_text_color(r2, g2, b2)
                pdf.cell(50, 6, f"  {d['defect_type']}", border=1)
                pdf.cell(30, 6, f"  {sev}", border=1)
                pdf.set_text_color(15, 23, 42)
                pdf.cell(25, 6, f"  {float(d['confidence']):.2f}", border=1)
                notes = (d["ai_notes"] or "")[:60]
                pdf.cell(85, 6, f"  {notes}", border=1, ln=True)
            pdf.ln(3)

        if coach_miss:
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(220, 38, 38)
            pdf.cell(0, 6, f"  Missing components ({len(coach_miss)}):", ln=True)
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(15, 23, 42)
            for m in coach_miss:
                pdf.cell(0, 5, f"    - {m['component_name']} ({m['component_code']})  - expected {m['expected_count']}, detected {m['detected_count']}", ln=True)
            pdf.ln(3)

        if not coach_defs and not coach_miss:
            pdf.set_font("Helvetica", "I", 10)
            pdf.set_text_color(22, 163, 74)
            pdf.cell(0, 6, "  No defects or missing components detected.", ln=True)
            pdf.set_text_color(15, 23, 42)
            pdf.ln(3)

        pdf.set_draw_color(200, 200, 200)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(4)

    return bytes(pdf.output())


# ─── 4. Upload to Cloudinary ──────────────────────────────────────────────────

def _upload(data: bytes, public_id: str, resource_type: str, raw_convert=None) -> dict:
    opts = {
        "public_id": public_id,
        "resource_type": resource_type,
        "overwrite": True,
    }
    result = cloudinary.uploader.upload(io.BytesIO(data), **opts)
    return {"url": result["secure_url"], "public_id": result["public_id"]}


def _configure_cloudinary():
    """Configure Cloudinary from the current environment at call time.

    The module-level cloudinary.config() runs at import, which (depending on
    import order) can happen before .env is loaded — capturing empty credentials.
    Re-reading env here guarantees the live values are used for the upload.
    """
    cloudinary.config(
        cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
        api_key=os.environ.get("CLOUDINARY_API_KEY"),
        api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    )


def upload_report(pdf_bytes: bytes, json_str: str, session_id: str) -> dict:
    _configure_cloudinary()
    base = f"vande/{session_id}/reports"
    # Keep the .pdf/.json extension in the public_id so the delivered raw URL ends
    # in the right extension — otherwise the browser downloads an extension-less,
    # octet-stream file that is not recognised as a PDF.
    pdf_result = _upload(pdf_bytes, f"{base}/inspection_report.pdf", "raw")
    json_result = _upload(json_str.encode(), f"{base}/inspection_report_data.json", "raw")
    return {
        "pdf_url": pdf_result["url"],
        "pdf_public_id": pdf_result["public_id"],
        "json_url": json_result["url"],
        "json_public_id": json_result["public_id"],
    }


# ─── 5. Public entry point ────────────────────────────────────────────────────

def generate_report(conn, session_id: str) -> dict:
    logger.info("Loading session data for report: %s", session_id)
    data = load_session_data(conn, session_id)

    if not data["session"]:
        raise ValueError(f"Session {session_id} not found")

    logger.info("Building JSON report")
    json_str = build_json_report(data)

    logger.info("Building PDF report")
    pdf_bytes = build_pdf_report(data)

    # Always write a local backup copy in backend/uploads/reports for robust offline operation
    try:
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        uploads_reports_dir = os.path.join(root_dir, "backend", "uploads", "reports")
        os.makedirs(uploads_reports_dir, exist_ok=True)
        
        local_pdf_path = os.path.join(uploads_reports_dir, f"report_{session_id}.pdf")
        with open(local_pdf_path, "wb") as f:
            f.write(pdf_bytes)
            
        local_json_path = os.path.join(uploads_reports_dir, f"report_{session_id}.json")
        with open(local_json_path, "w", encoding="utf-8") as f:
            f.write(json_str)
        logger.info("Saved local backup copies of the report to backend/uploads/reports/")
    except Exception as local_err:
        logger.warning("Could not write local report backup files: %s", str(local_err))

    # Serve the report from the backend's local file routes. Cloudinary blocks
    # delivery of raw/PDF files by default (401 "deny or ACL failure"), so the
    # browser-facing URLs always point at the local backup written just above.
    urls = {
        "pdf_url": f"/api/sessions/{session_id}/report/pdf",
        "pdf_public_id": f"local_{session_id}_pdf",
        "json_url": f"/api/sessions/{session_id}/report/json",
        "json_public_id": f"local_{session_id}_json",
    }

    s = data["session"]
    result = {
        **urls,
        "total_coaches": s["total_coaches"],
        "total_frames": s["total_frames"],
        "total_defects": data["total_defects"],
        "critical_defects": s["critical_defects"],
        "missing_components_count": s["missing_components_count"],
        "overall_health": float(s["health_score"]) if s["health_score"] else None,
        "pdf_size_bytes": len(pdf_bytes),
    }
    logger.info(
        "Report built: %d coaches, %d defects, %.0f KB PDF",
        s["total_coaches"] or 0, data["total_defects"], len(pdf_bytes) / 1024,
    )
    return result


# ─── 6. Periodic (shift/day/week) aggregate report — PDF ──────────────────────
# Distinct from the per-session PDF above: this is a one-page roll-up of the
# JSON aggregate already computed by Node's periodicReportScheduler.js. Closes
# the "Periodic Reports: JSON-only" gap — same local-backup-then-serve pattern
# as the per-session report, since Cloudinary blocks raw PDF delivery by default.

def build_periodic_pdf(periodic: dict) -> bytes:
    pdf = _PDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(15, 23, 42)
    period_label = periodic["period_type"].upper()
    pdf.cell(0, 12, f"Periodic Inspection Report - {period_label}", ln=True, align="C")

    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(71, 85, 105)
    start = periodic["period_start"]
    end = periodic["period_end"]
    start_str = start.strftime("%d %b %Y, %H:%M") if hasattr(start, "strftime") else str(start)
    end_str = end.strftime("%d %b %Y, %H:%M") if hasattr(end, "strftime") else str(end)
    pdf.cell(0, 8, f"Period: {start_str}  to  {end_str}", ln=True, align="C")
    pdf.ln(6)

    uptime = periodic.get("system_uptime_pct")
    r, g, b = _health_color(uptime)
    pdf.set_fill_color(r, g, b)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 15)
    uptime_str = f"{float(uptime):.1f}%" if uptime is not None else "N/A"
    pdf.cell(0, 13, f"Pipeline Completion Rate: {uptime_str}", ln=True, align="C", fill=True)
    pdf.ln(6)

    pdf.set_text_color(15, 23, 42)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "Summary", ln=True)
    pdf.set_draw_color(226, 232, 240)

    rows = [
        ("Total Sessions", periodic.get("total_sessions", 0)),
        ("Completed Sessions", periodic.get("completed_sessions", 0)),
        ("Failed Sessions", periodic.get("failed_sessions", 0)),
        ("Total Defects Detected", periodic.get("total_defects", 0)),
        ("Critical Defects", periodic.get("critical_defects", 0)),
        ("Reviewer False Positives", periodic.get("false_positive_count", 0)),
        ("Reviewer False Negatives", periodic.get("false_negative_count", 0)),
    ]
    pdf.set_font("Helvetica", "", 10)
    col_w = 95
    for i, (label, val) in enumerate(rows):
        fill = i % 2 == 0
        pdf.set_fill_color(241, 245, 249) if fill else pdf.set_fill_color(255, 255, 255)
        pdf.cell(col_w, 8, f"  {label}", border=1, fill=fill)
        pdf.cell(col_w, 8, f"  {val}", border=1, fill=fill, ln=True)

    pdf.ln(8)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 6, "Pipeline completion rate is a proxy for system uptime: completed / (completed + failed) sessions", ln=True)
    pdf.cell(0, 6, "in this period. No continuous service-uptime monitor is wired in yet (System Health Dashboard is", ln=True)
    pdf.cell(0, 6, "still simulated for CPU/memory/SSD/UPS - GPU utilization is real via nvidia-smi).", ln=True)

    return bytes(pdf.output())


def generate_periodic_pdf(periodic: dict) -> dict:
    pdf_bytes = build_periodic_pdf(periodic)

    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
    uploads_reports_dir = os.path.join(root_dir, "uploads", "reports")
    os.makedirs(uploads_reports_dir, exist_ok=True)

    report_id = periodic["id"]
    local_pdf_path = os.path.join(uploads_reports_dir, f"periodic_{report_id}.pdf")
    with open(local_pdf_path, "wb") as f:
        f.write(pdf_bytes)

    return {
        "pdf_url": f"/api/periodic-reports/{report_id}/pdf",
        "pdf_size_bytes": len(pdf_bytes),
    }


# ─── 7. Evidence bundle (zip of PDF + JSON + annotated defect frames) ──────────

def _download_bytes(url: str, timeout: int = 15) -> bytes:
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.content


def _safe_name(value) -> str:
    """Filesystem-safe fragment for zip entry paths."""
    s = str(value or "").strip()
    keep = []
    for ch in s:
        keep.append(ch if (ch.isalnum() or ch in ("-", "_")) else "_")
    return ("".join(keep) or "item")[:60]


def build_evidence_bundle(conn, session_id: str) -> dict:
    """Build a forensic evidence zip: the PDF report, the JSON report, and every
    annotated defect frame (downloaded from its stored URL), grouped per coach.
    Saved locally as a backup and uploaded to Cloudinary when configured.
    """
    logger.info("Building evidence bundle for session %s", session_id)
    data = load_session_data(conn, session_id)
    if not data["session"]:
        raise ValueError(f"Session {session_id} not found")

    json_str = build_json_report(data)
    pdf_bytes = build_pdf_report(data)

    coach_by_id = {c["id"]: c for c in data["coaches"]}
    frames_included = 0
    frames_failed = 0
    seen_urls = set()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("inspection_report.pdf", pdf_bytes)
        zf.writestr("inspection_report.json", json_str)

        for coach_id, defects in data["coach_defects"].items():
            coach = coach_by_id.get(coach_id)
            coach_dir = (
                f"frames/coach_{coach['coach_index']}_{_safe_name(coach['coach_number'])}"
                if coach else f"frames/coach_{_safe_name(coach_id)}"
            )
            for d in defects:
                url = d.get("annotated_frame_url")
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                try:
                    img = _download_bytes(url)
                    fname = f"{coach_dir}/{_safe_name(d['severity'])}_{_safe_name(d['defect_type'])}_{_safe_name(str(d['id'])[:8])}.jpg"
                    zf.writestr(fname, img)
                    frames_included += 1
                except Exception as exc:
                    frames_failed += 1
                    logger.warning("Evidence: could not fetch annotated frame %s: %s", url, exc)

    zip_bytes = buf.getvalue()

    # Local backup (mirrors the report local backup), for robust offline operation
    try:
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        uploads_reports_dir = os.path.join(root_dir, "backend", "uploads", "reports")
        os.makedirs(uploads_reports_dir, exist_ok=True)
        local_zip_path = os.path.join(uploads_reports_dir, f"evidence_{session_id}.zip")
        with open(local_zip_path, "wb") as f:
            f.write(zip_bytes)
        logger.info("Saved local evidence bundle to %s", local_zip_path)
    except Exception as local_err:
        logger.warning("Could not write local evidence bundle: %s", local_err)

    # Served from the backend's local file route — Cloudinary blocks raw/ZIP
    # delivery by default (401), so the browser-facing URL is always local.
    zip_url = f"/api/sessions/{session_id}/evidence/zip"
    zip_public_id = f"local_{session_id}_zip"

    logger.info(
        "Evidence bundle built: %d frames included, %d failed, %.0f KB zip",
        frames_included, frames_failed, len(zip_bytes) / 1024,
    )
    return {
        "zip_url": zip_url,
        "zip_public_id": zip_public_id,
        "frames_included": frames_included,
        "frames_failed": frames_failed,
        "size_bytes": len(zip_bytes),
    }
