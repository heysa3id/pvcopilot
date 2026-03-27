"""
PVCopilot Backend — PVSyst PDF Parser & CSV Processing API
Runs on port 5001. Accepts PDF uploads and CSV processing requests.
Route handlers import logic from: lcoe_pdf, quality_check_csv, time_sync.

Large-file handling:
  - /api/process-csv        : synchronous (streams to temp file, no file.read())
  - /api/process-csv-async  : async job (returns job_id immediately, poll /api/jobs/<id>)
  - /api/jobs/<job_id>      : GET status/result, DELETE cancel
"""

import json
import os
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime

try:
    import fcntl
except ImportError:
    fcntl = None  # Windows: no flock; atomic replace still avoids torn writes

import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS

from lcoe_pdf import parse_pvsyst_pdf
from quality_check_csv import process_quality_check_csv
import jobs
import metrics

CONTACTS_DIR = os.path.join(os.path.dirname(__file__), "data")
CONTACTS_FILE = os.path.join(CONTACTS_DIR, "contacts.csv")
CONTACTS_LOCK_FILE = CONTACTS_FILE + ".lock"


@contextmanager
def _contacts_lock_exclusive():
    """Serialize contact CSV read-modify-write (Unix fcntl); no-op on Windows."""
    if fcntl is None:
        yield
        return
    os.makedirs(CONTACTS_DIR, exist_ok=True)
    with open(CONTACTS_LOCK_FILE, "a+", encoding="utf-8") as lockf:
        fcntl.flock(lockf.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lockf.fileno(), fcntl.LOCK_UN)


@contextmanager
def _contacts_lock_shared():
    """Allow concurrent reads; block while a writer holds the exclusive lock."""
    if fcntl is None:
        yield
        return
    if not os.path.exists(CONTACTS_LOCK_FILE) and not os.path.exists(CONTACTS_FILE):
        yield
        return
    os.makedirs(CONTACTS_DIR, exist_ok=True)
    with open(CONTACTS_LOCK_FILE, "a+", encoding="utf-8") as lockf:
        fcntl.flock(lockf.fileno(), fcntl.LOCK_SH)
        try:
            yield
        finally:
            fcntl.flock(lockf.fileno(), fcntl.LOCK_UN)


def _write_contacts_csv_atomic(df):
    """Write CSV via temp file + os.replace to avoid truncated file on crash."""
    os.makedirs(CONTACTS_DIR, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(suffix=".csv", prefix="contacts_", dir=CONTACTS_DIR)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as tmpf:
            df.to_csv(tmpf, index=False)
        os.replace(tmp_path, CONTACTS_FILE)
    except Exception:
        try:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _stream_upload_to_tempfile(file_storage, max_bytes: int) -> tuple[str, int]:
    """
    Stream a Werkzeug FileStorage to a temp file in 64 KB chunks.
    Returns (tmp_path, bytes_written).
    Raises ValueError if max_bytes is exceeded.
    Never calls file_storage.read() — avoids full-buffer memory spike.
    """
    with tempfile.NamedTemporaryFile(suffix=".upload", delete=False) as tmp:
        tmp_path = tmp.name
        written = 0
        try:
            for chunk in iter(lambda: file_storage.stream.read(65536), b""):
                written += len(chunk)
                if written > max_bytes:
                    raise ValueError(
                        f"File too large. Max {max_bytes // (1024 * 1024)} MB."
                    )
                tmp.write(chunk)
        except Exception:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
    return tmp_path, written


def _log(event: str, **kwargs) -> None:
    """Emit a structured JSON log line."""
    app.logger.info(json.dumps({"event": event, **kwargs}))


# ── Flask app ──────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)

MAX_PVSYST_UPLOAD_BYTES = int(os.getenv("MAX_PVSYST_UPLOAD_BYTES", str(50 * 1024 * 1024)))
MAX_CSV_UPLOAD_BYTES = int(os.getenv("MAX_CSV_UPLOAD_BYTES", str(50 * 1024 * 1024)))

ALLOWED_PDF_MIME = {
    "application/pdf",
    "application/x-pdf",
    "application/octet-stream",
}


@app.errorhandler(413)
def handle_413(_e):
    max_mb = round(max(MAX_PVSYST_UPLOAD_BYTES, MAX_CSV_UPLOAD_BYTES) / (1024 * 1024), 1)
    return jsonify({"error": f"File too large. Max {max_mb} MB."}), 413


# ── PDF parser ─────────────────────────────────────────────────────────────────

@app.route("/api/parse-pvsyst", methods=["POST"])
def parse_pvsyst():
    """Accept a PVSyst PDF upload and return parsed JSON (uses lcoe_pdf module)."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded. Send a PDF file with key 'file'."}), 400

    file = request.files["file"]
    if not file or not file.filename:
        return jsonify({"error": "Please upload a PDF file."}), 400

    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Please upload a PDF file (.pdf)."}), 400

    if request.content_length and request.content_length > MAX_PVSYST_UPLOAD_BYTES:
        max_mb = round(MAX_PVSYST_UPLOAD_BYTES / (1024 * 1024), 1)
        return jsonify({"error": f"File too large. Max {max_mb} MB."}), 413

    content_type = (getattr(file, "content_type", None) or "").lower()
    if content_type and content_type not in ALLOWED_PDF_MIME and "pdf" not in content_type:
        return jsonify({"error": "Invalid file type. Please upload a PDF."}), 415

    tmp_path = None
    t0 = time.perf_counter()
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name
        result = parse_pvsyst_pdf(tmp_path)
        elapsed_ms = round((time.perf_counter() - t0) * 1000)
        _log("pdf_parsed", filename=file.filename, bytes=request.content_length, elapsed_ms=elapsed_ms)
        metrics.record("pdf_success", elapsed_ms=elapsed_ms)
        return jsonify(result)
    except Exception as e:
        elapsed_ms = round((time.perf_counter() - t0) * 1000)
        _log("pdf_error", filename=getattr(file, "filename", None), elapsed_ms=elapsed_ms, error=str(e)[:200])
        metrics.record("pdf_error")
        return jsonify({"error": str(e)}), 422
    finally:
        if tmp_path is not None and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


# ── CSV processor (synchronous — kept for backward compatibility) ───────────────

@app.route("/api/process-csv", methods=["POST"])
def process_csv():
    """
    Accept a CSV upload, resample to 10 min (synchronous, backward-compatible).
    Streams upload to a temp file — never buffers the full file in memory.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded. Send a CSV file with key 'file'."}), 400

    file = request.files["file"]
    if not file.filename or not file.filename.lower().endswith(".csv"):
        return jsonify({"error": "Please upload a CSV file."}), 400

    if request.content_length and request.content_length > MAX_CSV_UPLOAD_BYTES:
        max_mb = round(MAX_CSV_UPLOAD_BYTES / (1024 * 1024), 1)
        return jsonify({"error": f"CSV file too large. Max {max_mb} MB."}), 413

    t0 = time.perf_counter()
    tmp_path = None
    try:
        tmp_path, file_bytes = _stream_upload_to_tempfile(file, MAX_CSV_UPLOAD_BYTES)
        with open(tmp_path, "rb") as f:
            result = process_quality_check_csv(f)
        elapsed_ms = round((time.perf_counter() - t0) * 1000)
        _log("csv_processed", filename=file.filename, file_bytes=file_bytes,
             original_rows=result.get("originalRows"), resampled_rows=result.get("resampledRows"),
             elapsed_ms=elapsed_ms)
        metrics.record("csv_success", elapsed_ms=elapsed_ms)
        return jsonify(result)
    except ValueError as e:
        metrics.record("csv_error")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        metrics.record("csv_error")
        return jsonify({"error": f"Processing error: {str(e)}"}), 500
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


# ── CSV processor (async — returns job_id immediately) ─────────────────────────

def _csv_worker(job_id: str, tmp_path: str) -> dict:
    """Worker function executed in the thread pool."""
    try:
        jobs.update_job(job_id, progress=20)
        with open(tmp_path, "rb") as f:
            result = process_quality_check_csv(f)
        jobs.update_job(job_id, progress=90)
        return result
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@app.route("/api/process-csv-async", methods=["POST"])
def process_csv_async():
    """
    Accept a CSV upload and dispatch processing to the thread pool.
    Returns 202 immediately with a job_id for polling via /api/jobs/<job_id>.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded. Send a CSV file with key 'file'."}), 400

    file = request.files["file"]
    if not file.filename or not file.filename.lower().endswith(".csv"):
        return jsonify({"error": "Please upload a CSV file."}), 400

    if request.content_length and request.content_length > MAX_CSV_UPLOAD_BYTES:
        max_mb = round(MAX_CSV_UPLOAD_BYTES / (1024 * 1024), 1)
        return jsonify({"error": f"CSV file too large. Max {max_mb} MB."}), 413

    if not jobs.has_capacity():
        return jsonify({"error": "Server is busy. Please retry in a moment."}), 503

    tmp_path = None
    try:
        tmp_path, file_bytes = _stream_upload_to_tempfile(file, MAX_CSV_UPLOAD_BYTES)
    except ValueError as e:
        return jsonify({"error": str(e)}), 413
    except Exception as e:
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

    job_id = jobs.create_job()
    _log("csv_job_queued", job_id=job_id, filename=file.filename, file_bytes=file_bytes)
    jobs.submit_job(job_id, _csv_worker, tmp_path)
    return jsonify({"job_id": job_id}), 202


@app.route("/api/jobs/<job_id>", methods=["GET"])
def get_job(job_id):
    """Poll job status. Returns status/progress/result/error."""
    job = jobs.get_job(job_id)
    if job is None:
        return jsonify({"error": "Job not found or expired."}), 404
    # Don't expose internal created_at
    job.pop("created_at", None)
    return jsonify(job)


@app.route("/api/jobs/<job_id>", methods=["DELETE"])
def cancel_job(job_id):
    """Best-effort cancel. Only works if job is still queued (not running)."""
    cancelled = jobs.cancel_job(job_id)
    return jsonify({"cancelled": cancelled})


# ── Contact form ───────────────────────────────────────────────────────────────

@app.route("/api/contact", methods=["POST"])
def save_contact():
    """Save a contact form submission to the local CSV file."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body."}), 400

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    message = (data.get("message") or "").strip()

    if not name or not email or not message:
        return jsonify({"error": "Name, email, and message are required."}), 400

    try:
        new_row = pd.DataFrame([{
            "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "Name": name,
            "Email": email,
            "Message": message,
        }])

        with _contacts_lock_exclusive():
            if os.path.exists(CONTACTS_FILE):
                existing = pd.read_csv(CONTACTS_FILE, encoding="utf-8")
                df = pd.concat([existing, new_row], ignore_index=True)
            else:
                df = new_row
            _write_contacts_csv_atomic(df)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": f"Failed to save contact: {str(e)}"}), 500


@app.route("/api/contacts", methods=["GET"])
def list_contacts():
    """Return all contact form submissions as JSON."""
    if not os.path.exists(CONTACTS_FILE):
        return jsonify([])
    try:
        with _contacts_lock_shared():
            df = pd.read_csv(CONTACTS_FILE, encoding="utf-8")
        return jsonify(df.to_dict(orient="records"))
    except Exception as e:
        return jsonify({"error": f"Failed to read contacts: {str(e)}"}), 500


# ── Observability ──────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "pvcopilot-parser"})


@app.route("/api/metrics", methods=["GET"])
def get_metrics():
    """Return in-memory request counters and latency percentiles."""
    return jsonify(metrics.snapshot())


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("🔧 PVCopilot Parser API running on http://localhost:5001")
    debug = os.getenv("FLASK_DEBUG", "").lower() in {"1", "true", "yes", "on"}
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5001")), debug=debug)
