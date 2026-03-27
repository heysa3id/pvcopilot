"""
CSV processing for the Quality Check page.
Resamples time-series to 10-minute grid, detects timestamp column,
and returns data in the shape expected by the frontend.

Accepts either a raw UTF-8 string (legacy) or a binary file-like object
(preferred — avoids buffering the entire file in memory).
"""

import io
import os

import pandas as pd

MAX_CSV_ROWS = int(os.getenv("MAX_CSV_ROWS", "500000"))
MAX_CSV_COLS = int(os.getenv("MAX_CSV_COLS", "100"))

_READ_KW = dict(sep=None, engine="python", on_bad_lines="skip")


def _make_reader(source):
    """Return a TextIO suitable for pd.read_csv from str or BinaryIO."""
    if isinstance(source, str):
        return io.StringIO(source)
    # Binary file-like: wrap in TextIOWrapper (UTF-8, replace bad bytes)
    return io.TextIOWrapper(source, encoding="utf-8", errors="replace")


def process_quality_check_csv(source) -> dict:
    """
    Process uploaded CSV: auto-detect delimiter and timestamp column,
    resample to 10-minute grid, interpolate numeric columns.

    Parameters
    ----------
    source : str | BinaryIO
        Raw CSV content as a string, or a binary file-like object.
        Passing a file-like avoids loading the entire file into memory.

    Returns a dict with keys: headers, rows, originalRows, resampledRows,
    timestampCol, resampled. Suitable for jsonify().

    Raises
    ------
    ValueError
        For client errors (no file, empty, bad timestamp column, too wide/long).
    """
    reader = _make_reader(source)

    # --- Schema fail-fast: peek at first 200 rows ---
    try:
        first_chunk = next(pd.read_csv(reader, chunksize=200, **_READ_KW))
    except StopIteration:
        raise ValueError("CSV file is empty or has no data rows.")
    except Exception as exc:
        raise ValueError(f"Could not parse CSV: {exc}") from exc

    if len(first_chunk.columns) > MAX_CSV_COLS:
        raise ValueError(
            f"Too many columns ({len(first_chunk.columns)}). Max {MAX_CSV_COLS}."
        )
    if first_chunk.empty:
        raise ValueError("CSV file is empty or has no columns.")

    # Reset to beginning and read full file in chunks (bounded memory)
    reader.seek(0)
    try:
        chunks = pd.read_csv(reader, chunksize=10_000, **_READ_KW)
        df = pd.concat(list(chunks), ignore_index=True)
    except TypeError:
        # Fallback for older pandas that don't support on_bad_lines
        reader.seek(0)
        df = pd.read_csv(
            reader,
            sep=None,
            engine="python",
            error_bad_lines=False,
            warn_bad_lines=False,
        )

    if df.empty or len(df.columns) == 0:
        raise ValueError("CSV file is empty or has no columns.")

    if len(df) > MAX_CSV_ROWS:
        raise ValueError(
            f"CSV has too many rows ({len(df):,}). Max {MAX_CSV_ROWS:,}."
        )

    # --- Timestamp column detection ---
    ts_col = None
    for col in df.columns:
        if any(kw in col.lower() for kw in ["time", "date", "timestamp"]):
            ts_col = col
            break
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
            raise ValueError(
                f"Column '{ts_col}' could not be parsed as timestamps ({int(valid)}/{len(df)} valid)."
            )

        df = df.dropna(subset=[ts_col])
        df = df.set_index(ts_col).sort_index()

        numeric_cols = df.select_dtypes(include="number").columns.tolist()
        non_numeric_cols = [c for c in df.columns if c not in numeric_cols]

        resampled_parts = []
        if numeric_cols:
            resampled_parts.append(df[numeric_cols].resample("10min").mean())
        if non_numeric_cols:
            resampled_parts.append(df[non_numeric_cols].resample("10min").first())

        if resampled_parts:
            df_resampled = pd.concat(resampled_parts, axis=1)
        else:
            df_resampled = df.resample("10min").mean()

        t_min, t_max = df_resampled.index.min(), df_resampled.index.max()
        full_index = pd.date_range(start=t_min, end=t_max, freq="10min")
        df_resampled = df_resampled.reindex(full_index)
        if numeric_cols:
            df_resampled[numeric_cols] = (
                df_resampled[numeric_cols].interpolate(method="time", limit_direction="both")
            )
        if non_numeric_cols:
            df_resampled[non_numeric_cols] = df_resampled[non_numeric_cols].ffill()
        df_resampled = df_resampled.reset_index()
        if "index" in df_resampled.columns and df_resampled.columns[0] == "index":
            df_resampled = df_resampled.rename(columns={"index": ts_col})
        df_resampled[ts_col] = df_resampled[ts_col].dt.strftime("%Y-%m-%d %H:%M")

        for col in df_resampled.select_dtypes(include="number").columns:
            df_resampled[col] = df_resampled[col].round(3)

        headers = df_resampled.columns.tolist()
        rows = df_resampled.fillna("").astype(str).values.tolist()
    else:
        headers = df.columns.tolist()
        for col in df.select_dtypes(include="number").columns:
            df[col] = df[col].round(3)
        rows = df.fillna("").astype(str).values.tolist()

    return {
        "headers": headers,
        "rows": rows,
        "originalRows": original_rows,
        "resampledRows": len(rows),
        "timestampCol": ts_col,
        "resampled": ts_col is not None,
    }
