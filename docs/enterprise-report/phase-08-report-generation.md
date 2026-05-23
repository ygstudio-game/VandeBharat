# Phase 8: Report Generation & Cloudinary Integration

## 1. Automated Reporting Engine Architecture

Once the synchronization engine constructs the logical coach mapping and the correlation engine flags defects and missing components, the Fastify orchestrator initiates the reporting stage.

The **Report Generator** runs as an isolated python service that:
1. Loads the full session metadata, coaches, defects, and missing components from PostgreSQL.
2. Compiles a hierarchical **JSON dataset** representing the full state of the train.
3. Assembles an executive-grade **PDF Inspection Report** using the `fpdf2` document library.
4. Uploads both assets to **Cloudinary** secure storage.
5. Returns secure HTTPS resource URLs to the database and frontend.

```
PostgreSQL Database
   |
   |-- [Query Session, Coaches, Defects, Missing Components]
   v
report_generator (Python)
   |
   |==> 1. Serializes to Structured JSON (builder.py)
   |==> 2. Generates PDF via fpdf2 (builder.py)
   v
Cloudinary Media Storage
   |
   |-- [Secure PDF & JSON Upload]
   v
Fastify Gateway / React UI (HTTPS links)
```

---

## 2. Structured JSON Serialization

The JSON report represents the canonical source of truth for downstream APIs, external rail inventory software, and system audits.

### JSON Schema Structure
```json
{
  "report_version": "1.0",
  "generated_at": "2026-05-23T18:10:00Z",
  "session": {
    "id": "78b50e2d-dc99-43ef-b387-052637738f61",
    "session_code": "INS-2026-8942",
    "train_number": "22436",
    "status": "completed",
    "health_score": 92.5
  },
  "coaches": [
    {
      "coach_index": 1,
      "coach_number": "SEC-12834",
      "coach_type": "AC_CHAIR_CAR",
      "health_score": 90.0,
      "defects": [
        {
          "type": "crack",
          "severity": "CRITICAL",
          "confidence": 0.89,
          "bbox": [120, 80, 45, 30],
          "annotated_url": "https://res.cloudinary.com/..."
        }
      ]
    }
  ]
}
```

---

## 3. PDF Compilation via `fpdf2`

The PDF builder is written in Python, using `fpdf2` to construct a document with clean typography, tables, and colors.

### Layout Elements
1. **Header & Footer**:
   * Every page has a standardized header: `"VandeInspect AI — Automated Train Inspection Report"`.
   * The footer displays confidentiality warnings and page numbering: `"Page X | Confidential — Indian Railways"`.
2. **Executive Summary Dashboard**:
   * Features a health score banner colored according to the train's condition:
     * **Green** (Score $\ge 80$): Satisfactory condition.
     * **Amber** (Score $50 \text{--} 79$): Maintenance recommended.
     * **Red** (Score $< 50$): Critical anomalies; immediate workshop routing required.
   * Includes a KPI table summarizing total coaches, processed frames, defects, and missing parts.
3. **Per-Coach Breakdown**:
   * Iterates through the train coach-by-coach.
   * Displays tables listing defects, color-coded by severity:
     * **CRITICAL**: Bright Red (`#DC2626`)
     * **HIGH**: Vibrant Orange (`#EA580C`)
     * **MEDIUM**: Amber (`#CA8A04`)
     * **LOW**: Green (`#16A34A`)
   * Bullet points list missing components, highlighting the discrepancy between the expected count and the detected count.

---

## 4. Cloudinary Storage and Secure Serving

To manage high volumes of PDF reports and annotated defect images without consuming excessive local storage, the platform integrates with Cloudinary.

### Upload Implementation
The service uploads PDF and JSON buffers directly from memory using the Cloudinary Python SDK, avoiding temporary writes to local disk:

```python
import io
import cloudinary.uploader

def upload_report(pdf_bytes: bytes, json_str: str, session_id: str) -> dict:
    base = f"vande/{session_id}/reports"
    
    # Upload binary PDF
    pdf_result = cloudinary.uploader.upload(
        io.BytesIO(pdf_bytes),
        public_id=f"{base}/inspection_report",
        resource_type="raw",
        overwrite=True
    )
    
    # Upload raw text JSON
    json_result = cloudinary.uploader.upload(
        io.BytesIO(json_str.encode()),
        public_id=f"{base}/inspection_report_data",
        resource_type="raw",
        overwrite=True
    )
    
    return {
        "pdf_url": pdf_result["secure_url"],
        "pdf_public_id": pdf_result["public_id"],
        "json_url": json_result["secure_url"],
        "json_public_id": json_result["public_id"],
    }
```
This offloads hosting from the backend API gateway. High-res annotated frames and report documents are served to operators globally via Cloudinary's content delivery network (CDN).
