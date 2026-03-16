"""
KPI daily resampling and performance metrics (Ya, Yr, PR).

Resamples PV & weather time series to daily frequency, then computes:
- E_DC = P_DC / 1000  (daily energy, kWh)
- Ya   = E_DC / tot_power  (specific yield, h)
- Yr   = GTI / 1000       (reference yield, kWh/kWp or h)
- PR   = Ya / Yr          (performance ratio)
"""

from __future__ import annotations

import json
import os
from typing import Any

import pandas as pd


# Daily aggregation: column -> 'sum' or 'mean'
DAILY_AGG = {
    "P_DC": "sum",
    "P_DC_calculee": "sum",
    "E_DC": "sum",
    "I_SUM": "sum",
    "U_DC": "mean",
    "T1": "mean",
    "Tcell": "mean",
    "GTI": "sum",
    "GHI": "sum",
    "DNI": "sum",
    "DHI": "sum",
    "Air_Temp": "mean",
    "Wind_speed": "mean",
    # Allow weather_ prefix variants (mapped below)
    "weather_GTI": "sum",
    "weather_GHI": "sum",
    "weather_DNI": "sum",
    "weather_DHI": "sum",
    "weather_Air_Temp": "mean",
    "weather_Wind_speed": "mean",
}


def _normalize_time_column(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure 'time' is datetime and set as index."""
    out = df.copy()
    if "time" not in out.columns:
        for c in ["time", "date", "timestamp", "datetime"]:
            if c in out.columns:
                out = out.rename(columns={c: "time"})
                break
    if "time" not in out.columns:
        raise ValueError("Data must contain a 'time' (or date/timestamp) column")
    out["time"] = pd.to_datetime(out["time"], errors="coerce")
    out = out.dropna(subset=["time"])
    return out


def _column_mapping(headers: list[str]) -> dict[str, str]:
    """Map standard names to actual column names (e.g. GTI -> weather_GTI)."""
    mapping = {}
    for h in headers:
        h = str(h).strip()
        if h in DAILY_AGG:
            mapping[h] = h
        if h.startswith("weather_"):
            base = h.replace("weather_", "", 1)
            if base in DAILY_AGG and base not in mapping:
                mapping[base] = h
    return mapping


def compute_daily_kpi(
    data: pd.DataFrame,
    system: dict[str, Any],
) -> pd.DataFrame:
    """
    Resample data to daily and compute E_DC, Ya, Yr, PR.

    Parameters
    ----------
    data : pd.DataFrame
        Must have a datetime column (named 'time', 'date', or 'timestamp')
        and columns for at least P_DC and GTI (or weather_GTI). Other columns
        from DAILY_AGG are aggregated if present.
    system : dict
        System parameters; must contain 'tot_power' (kW). Can be nested
        under 'config', e.g. system['config']['tot_power'].

    Returns
    -------
    pd.DataFrame
        Daily index, with columns from resample agg plus E_DC, Ya, Yr, PR.
        time index is reset so 'time' is a column again.
    """
    out = _normalize_time_column(data)
    tot_power = float(_get_tot_power(system))

    out = out.set_index("time")

    # Fixed resampling: hourly mean (numeric) / first (non-numeric), then sort and dedupe
    agg_dict = {}
    for col in out.columns:
        if pd.api.types.is_numeric_dtype(out[col]):
            agg_dict[col] = "mean"
        else:
            agg_dict[col] = "first"
    out = out.resample("60min", offset="0s").agg(agg_dict)
    out = out.sort_index()
    out = out[~out.index.duplicated(keep="first")]
    out = out.reset_index()

    out = out.set_index("time")

    # Build agg only for columns that exist
    agg = {}
    for col, how in DAILY_AGG.items():
        if col in out.columns:
            agg[col] = how
    # Map weather_* to same agg
    for col, how in DAILY_AGG.items():
        if col.startswith("weather_") and col in out.columns and col not in agg:
            agg[col] = how

    if not agg:
        raise ValueError("No resampleable columns found; need at least P_DC and GTI (or weather_*)")

    data_daily = out.resample("D").agg(agg)
    data_daily = data_daily.reset_index()

    # Standard names for KPI: prefer GTI over weather_GTI, P_DC already standard
    p_dc_col = "P_DC" if "P_DC" in data_daily.columns else None
    gti_col = "GTI" if "GTI" in data_daily.columns else "weather_GTI" if "weather_GTI" in data_daily.columns else None

    if p_dc_col is None:
        raise ValueError("Data must contain 'P_DC' for daily KPI")
    if gti_col is None:
        raise ValueError("Data must contain 'GTI' or 'weather_GTI' for daily KPI")

    P_DC = data_daily[p_dc_col]
    GTI = data_daily[gti_col]

    data_daily["E_DC"] = P_DC / 1000.0
    data_daily["Ya"] = data_daily["E_DC"] / tot_power
    data_daily["Yr"] = GTI / 1000.0
    data_daily["PR"] = data_daily["Ya"] / data_daily["Yr"].replace(0, float("nan"))

    return data_daily


def _get_tot_power(system: dict) -> float:
    """Extract tot_power from system dict (may be nested under 'config')."""
    if "tot_power" in system:
        return float(system["tot_power"])
    if "config" in system and isinstance(system["config"], dict) and "tot_power" in system["config"]:
        return float(system["config"]["tot_power"])
    raise ValueError("system must contain 'tot_power' or config.tot_power")


def run_from_files(
    csv_path: str,
    system_path: str,
    output_path: str | None = None,
) -> pd.DataFrame:
    """
    Load CSV and system JSON, compute daily KPI, optionally save.

    Parameters
    ----------
    csv_path : str
        Path to PV & weather synced CSV (with time, P_DC, GTI/weather_GTI, etc.).
    system_path : str
        Path to system_info.json (must have tot_power, e.g. under config).
    output_path : str, optional
        If set, write daily DataFrame to this CSV path.

    Returns
    -------
    pd.DataFrame
        Daily KPI DataFrame.
    """
    if not os.path.isfile(csv_path):
        raise FileNotFoundError(f"CSV not found: {csv_path}")
    if not os.path.isfile(system_path):
        raise FileNotFoundError(f"System file not found: {system_path}")

    data = pd.read_csv(csv_path)
    with open(system_path, "r", encoding="utf-8") as f:
        system = json.load(f)

    daily = compute_daily_kpi(data, system)

    if output_path:
        daily.to_csv(output_path, index=False)

    return daily


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Compute daily KPI (Ya, Yr, PR) from PV CSV and system JSON")
    parser.add_argument("csv", help="Path to PV & weather CSV")
    parser.add_argument("system", help="Path to system_info.json")
    parser.add_argument("-o", "--output", default=None, help="Output CSV path for daily KPI")
    args = parser.parse_args()

    result = run_from_files(args.csv, args.system, args.output)
    print(result.head(10).to_string())
    if args.output:
        print(f"Written to {args.output}")
