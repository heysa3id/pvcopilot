"""
PVCopilot Backend — PVSyst PDF Parser & CSV Processing API
Runs on port 5001. Accepts PDF uploads and CSV processing requests.
Route handlers import logic from: lcoe_pdf, quality_check_csv, time_sync.
"""

import os
import tempfile
import time
from datetime import datetime

import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS

from lcoe_pdf import parse_pvsyst_pdf
from quality_check_csv import process_quality_check_csv

CONTACTS_DIR = os.path.join(os.path.dirname(__file__), "data")
CONTACTS_FILE = os.path.join(CONTACTS_DIR, "contacts.csv")
LEGACY_CONTACTS_XLSX = os.path.join(CONTACTS_DIR, "contacts.xlsx")

app = Flask(__name__)


def _migrate_legacy_contacts_xlsx_if_needed():
    """If contacts.csv is missing but contacts.xlsx exists, import once (openpyxl)."""
    if os.path.exists(CONTACTS_FILE):
        return
    if not os.path.exists(LEGACY_CONTACTS_XLSX):
        return
    try:
        df = pd.read_excel(LEGACY_CONTACTS_XLSX, engine="openpyxl")
        os.makedirs(CONTACTS_DIR, exist_ok=True)
        df.to_csv(CONTACTS_FILE, index=False, encoding="utf-8")
    except Exception:
        pass


CORS(app)

MAX_PVSYST_UPLOAD_BYTES = int(os.getenv("MAX_PVSYST_UPLOAD_BYTES", str(10 * 1024 * 1024)))
app.config["MAX_CONTENT_LENGTH"] = MAX_PVSYST_UPLOAD_BYTES

ALLOWED_PDF_MIME = {
    "application/pdf",
    "application/x-pdf",
    "application/octet-stream",  # some browsers/proxies
}


@app.errorhandler(413)
def handle_413(_e):
    max_mb = round(MAX_PVSYST_UPLOAD_BYTES / (1024 * 1024), 1)
    return jsonify({"error": f"File too large. Max {max_mb} MB."}), 413


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

    # Hard guard in addition to MAX_CONTENT_LENGTH (for cases where content-length is missing).
    if request.content_length and request.content_length > MAX_PVSYST_UPLOAD_BYTES:
        max_mb = round(MAX_PVSYST_UPLOAD_BYTES / (1024 * 1024), 1)
        return jsonify({"error": f"File too large. Max {max_mb} MB."}), 413

    content_type = (getattr(file, "content_type", None) or "").lower()
    if content_type and content_type not in ALLOWED_PDF_MIME and "pdf" not in content_type:
        return jsonify({"error": "Invalid file type. Please upload a PDF."}), 415

    tmp_path = None
    start = time.time()
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name
        result = parse_pvsyst_pdf(tmp_path)
        elapsed_ms = int((time.time() - start) * 1000)
        app.logger.info(
            "parse-pvsyst ok filename=%s bytes=%s elapsed_ms=%s",
            file.filename,
            request.content_length,
            elapsed_ms,
        )
        return jsonify(result)
    except Exception as e:
        elapsed_ms = int((time.time() - start) * 1000)
        app.logger.warning(
            "parse-pvsyst failed filename=%s bytes=%s elapsed_ms=%s error=%s",
            getattr(file, "filename", None),
            request.content_length,
            elapsed_ms,
            str(e)[:200],
        )
        # Parsing failures are client-correctable (bad/corrupt PDF, unexpected report format).
        return jsonify({"error": str(e)}), 422
    finally:
        if tmp_path is not None and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


@app.route("/api/process-csv", methods=["POST"])
def process_csv():
    """Accept a CSV upload, resample to 10 min (uses quality_check_csv module)."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded. Send a CSV file with key 'file'."}), 400

    file = request.files["file"]
    if not file.filename or not file.filename.lower().endswith(".csv"):
        return jsonify({"error": "Please upload a CSV file."}), 400

    try:
        raw = file.read().decode("utf-8", errors="replace")
        result = process_quality_check_csv(raw)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Processing error: {str(e)}"}), 500


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
        os.makedirs(CONTACTS_DIR, exist_ok=True)
        _migrate_legacy_contacts_xlsx_if_needed()
        new_row = pd.DataFrame([{
            "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "Name": name,
            "Email": email,
            "Message": message,
        }])

        if os.path.exists(CONTACTS_FILE):
            existing = pd.read_csv(CONTACTS_FILE, encoding="utf-8")
            df = pd.concat([existing, new_row], ignore_index=True)
        else:
            df = new_row

        df.to_csv(CONTACTS_FILE, index=False, encoding="utf-8")
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": f"Failed to save contact: {str(e)}"}), 500


@app.route("/api/contacts", methods=["GET"])
def list_contacts():
    """Return all contact form submissions as JSON."""
    _migrate_legacy_contacts_xlsx_if_needed()
    if not os.path.exists(CONTACTS_FILE):
        return jsonify([])
    try:
        df = pd.read_csv(CONTACTS_FILE, encoding="utf-8")
        return jsonify(df.to_dict(orient="records"))
    except Exception as e:
        return jsonify({"error": f"Failed to read contacts: {str(e)}"}), 500


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "pvcopilot-parser"})


if __name__ == "__main__":
    print("🔧 PVCopilot Parser API running on http://localhost:5001")
    debug = os.getenv("FLASK_DEBUG", "").lower() in {"1", "true", "yes", "on"}
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5001")), debug=debug)
