"""
PVCopilot Backend — PVSyst PDF Parser & CSV Processing API
Runs on port 5001. Accepts PDF uploads and CSV processing requests.
"""

import os
import io
import tempfile
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
from pvsyst_parser import parse_pvsyst_pdf

app = Flask(__name__)
CORS(app)

@app.route("/api/parse-pvsyst", methods=["POST"])
def parse_pvsyst():
    """Accept a PVSyst PDF upload and return parsed JSON."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded. Send a PDF file with key 'file'."}), 400

    file = request.files["file"]
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Please upload a PDF file."}), 400

    # Save to temp file, parse, clean up
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        result = parse_pvsyst_pdf(tmp_path)
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.route("/api/process-csv", methods=["POST"])
def process_csv():
    """Accept a CSV upload, resample time-series to hourly, return JSON."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded. Send a CSV file with key 'file'."}), 400

    file = request.files["file"]
    if not file.filename or not file.filename.lower().endswith(".csv"):
        return jsonify({"error": "Please upload a CSV file."}), 400

    try:
        raw = file.read().decode("utf-8", errors="replace")
        # Auto-detect delimiter (comma, semicolon, tab) and tolerate bad lines
        try:
            df = pd.read_csv(
                io.StringIO(raw),
                sep=None,
                engine="python",
                on_bad_lines="skip",
            )
        except TypeError:
            # pandas < 1.3
            df = pd.read_csv(
                io.StringIO(raw),
                sep=None,
                engine="python",
                error_bad_lines=False,
                warn_bad_lines=False,
            )

        if df.empty or len(df.columns) == 0:
            return jsonify({"error": "CSV file is empty or has no columns."}), 400

        # Auto-detect timestamp column
        ts_col = None
        for col in df.columns:
            if any(kw in col.lower() for kw in ["time", "date", "timestamp"]):
                ts_col = col
                break
        # Fallback: try the first column
        if ts_col is None:
            try:
                pd.to_datetime(df.iloc[:, 0].head(5))
                ts_col = df.columns[0]
            except Exception:
                pass

        original_rows = len(df)

        if ts_col is not None:
            df[ts_col] = pd.to_datetime(df[ts_col], errors="coerce")
            valid = df[ts_col].notna().sum()
            if valid < len(df) * 0.5:
                return jsonify({"error": f"Column '{ts_col}' could not be parsed as timestamps ({valid}/{len(df)} valid)."}), 400

            df = df.dropna(subset=[ts_col])
            df = df.set_index(ts_col).sort_index()

            # Resample: mean for numeric, first for non-numeric
            numeric_cols = df.select_dtypes(include="number").columns.tolist()
            non_numeric_cols = [c for c in df.columns if c not in numeric_cols]

            resampled_parts = []
            if numeric_cols:
                resampled_parts.append(df[numeric_cols].resample("1h").mean())
            if non_numeric_cols:
                resampled_parts.append(df[non_numeric_cols].resample("1h").first())

            if resampled_parts:
                df_resampled = pd.concat(resampled_parts, axis=1)
            else:
                df_resampled = df.resample("1h").mean()

            df_resampled = df_resampled.dropna(how="all")
            df_resampled = df_resampled.reset_index()
            df_resampled[ts_col] = df_resampled[ts_col].dt.strftime("%Y-%m-%d %H:%M")

            # Round numeric columns
            for col in df_resampled.select_dtypes(include="number").columns:
                df_resampled[col] = df_resampled[col].round(3)

            headers = df_resampled.columns.tolist()
            rows = df_resampled.fillna("").astype(str).values.tolist()
        else:
            # No timestamp found — return as-is
            headers = df.columns.tolist()
            for col in df.select_dtypes(include="number").columns:
                df[col] = df[col].round(3)
            rows = df.fillna("").astype(str).values.tolist()

        return jsonify({
            "headers": headers,
            "rows": rows,
            "originalRows": original_rows,
            "resampledRows": len(rows),
            "timestampCol": ts_col,
            "resampled": ts_col is not None,
        })

    except pd.errors.ParserError as e:
        return jsonify({"error": f"Failed to parse CSV: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Processing error: {str(e)}"}), 500


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "pvcopilot-parser"})


if __name__ == "__main__":
    print("🔧 PVCopilot Parser API running on http://localhost:5001")
    app.run(host="0.0.0.0", port=5001, debug=True)
