"""
PVCopilot Backend — PVSyst PDF Parser & CSV Processing API
Runs on port 5001. Accepts PDF uploads and CSV processing requests.
Route handlers import logic from: lcoe_pdf, quality_check_csv, time_sync.
"""

import os
import tempfile
from datetime import datetime

import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS

from lcoe_pdf import parse_pvsyst_pdf
from quality_check_csv import process_quality_check_csv

CONTACTS_DIR = os.path.join(os.path.dirname(__file__), "data")
CONTACTS_FILE = os.path.join(CONTACTS_DIR, "contacts.xlsx")

app = Flask(__name__)
CORS(app)


@app.route("/api/parse-pvsyst", methods=["POST"])
def parse_pvsyst():
    """Accept a PVSyst PDF upload and return parsed JSON (uses lcoe_pdf module)."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded. Send a PDF file with key 'file'."}), 400

    file = request.files["file"]
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Please upload a PDF file."}), 400

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name
        result = parse_pvsyst_pdf(tmp_path)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
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
    """Save a contact form submission to the local Excel file."""
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
        new_row = pd.DataFrame([{
            "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "Name": name,
            "Email": email,
            "Message": message,
        }])

        if os.path.exists(CONTACTS_FILE):
            existing = pd.read_excel(CONTACTS_FILE, engine="openpyxl")
            df = pd.concat([existing, new_row], ignore_index=True)
        else:
            df = new_row

        df.to_excel(CONTACTS_FILE, index=False, engine="openpyxl")
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": f"Failed to save contact: {str(e)}"}), 500


@app.route("/api/contacts", methods=["GET"])
def list_contacts():
    """Return all contact form submissions as JSON."""
    if not os.path.exists(CONTACTS_FILE):
        return jsonify([])
    try:
        df = pd.read_excel(CONTACTS_FILE, engine="openpyxl")
        return jsonify(df.to_dict(orient="records"))
    except Exception as e:
        return jsonify({"error": f"Failed to read contacts: {str(e)}"}), 500


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "pvcopilot-parser"})


if __name__ == "__main__":
    print("🔧 PVCopilot Parser API running on http://localhost:5001")
    app.run(host="0.0.0.0", port=5001, debug=True)
