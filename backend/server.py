"""
PVCopilot Backend — PVSyst PDF Parser & CSV Processing API
Runs on port 5001. Accepts PDF uploads and CSV processing requests.
Route handlers import logic from: lcoe_pdf, quality_check_csv, time_sync.
"""

import os
import tempfile

from flask import Flask, request, jsonify
from flask_cors import CORS

from lcoe_pdf import parse_pvsyst_pdf
from quality_check_csv import process_quality_check_csv

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


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "pvcopilot-parser"})


if __name__ == "__main__":
    print("🔧 PVCopilot Parser API running on http://localhost:5001")
    app.run(host="0.0.0.0", port=5001, debug=True)
