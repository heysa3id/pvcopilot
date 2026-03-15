"""
Data filtering: compute cell temperature (Tcell) and theoretical DC power (PVWatts)
from weather/PV data using parameters from system_info.json.
"""

from __future__ import annotations

import json
import os
import numpy as np
import pandas as pd


# Expected keys in system config (system_info.json "config" object)
SYSTEM_KEYS = ("coef_a", "coef_b", "delta", "tot_power", "temp_coef")

# Column name variants (data may use "weather_" prefix)
COL_AIR_TEMP = ("Air_Temp", "weather_Air_Temp")
COL_GTI = ("GTI", "weather_GTI")
COL_WIND_SPEED = ("Wind_speed", "weather_Wind_speed")


def _first_present(df: pd.DataFrame, candidates: tuple) -> str:
    """Return the first column name from candidates that exists in df."""
    for c in candidates:
        if c in df.columns:
            return c
    return None


def load_system_params(path: str) -> dict:
    """
    Load system parameters from system_info.json.

    Parameters
    ----------
    path : str
        Path to system_info.json (may contain a "config" object with
        coef_a, coef_b, delta, tot_power, temp_coef).

    Returns
    -------
    dict
        Flat dict with keys coef_a, coef_b, delta, tot_power, temp_coef
        (values as float).

    Raises
    ------
    FileNotFoundError
        If path does not exist.
    ValueError
        If required keys are missing or values are not numeric.
    """
    if not os.path.isfile(path):
        raise FileNotFoundError(f"System info file not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    # Support both { "config": { ... } } and { "coef_a": ..., ... }
    config = raw.get("config", raw)
    out = {}
    for key in SYSTEM_KEYS:
        if key not in config:
            raise ValueError(f"Missing required system parameter: {key}")
        try:
            out[key] = float(config[key])
        except (TypeError, ValueError) as e:
            raise ValueError(f"Invalid numeric value for '{key}': {config[key]}") from e
    # Optional loss factor (default 0.97) used in PVWatts formula
    try:
        out["loss_factor"] = float(config.get("loss_factor", 0.97))
    except (TypeError, ValueError):
        out["loss_factor"] = 0.97
    return out


def apply_temperature_and_power(data: pd.DataFrame, system_info_path: str) -> pd.DataFrame:
    """
    Compute Tcell and PVWatts from weather/PV columns using parameters
    read from system_info.json.

    Temperature module:
        Tcell = Air_Temp + (GTI * exp(coef_a + coef_b * Wind_speed))
                + (GTI * delta / 1000)

    Power module:
        PVWatts = GTI * tot_power * (1 + (temp_coef/100) * (Tcell - 25)) * loss_factor
        (loss_factor default 0.97, configurable in system config)

    Parameters
    ----------
    data : pd.DataFrame
        Must contain columns for air temperature, GTI, and wind speed
        (names: Air_Temp or weather_Air_Temp, GTI or weather_GTI,
        Wind_speed or weather_Wind_speed).
    system_info_path : str
        Path to system_info.json.

    Returns
    -------
    pd.DataFrame
        Copy of data with added columns 'Tcell' and 'PVWatts'.
    """
    data = data.copy()
    system = load_system_params(system_info_path)

    air_temp_col = _first_present(data, COL_AIR_TEMP)
    gti_col = _first_present(data, COL_GTI)
    wind_col = _first_present(data, COL_WIND_SPEED)

    if air_temp_col is None:
        raise ValueError("Data must contain 'Air_Temp' or 'weather_Air_Temp'")
    if gti_col is None:
        raise ValueError("Data must contain 'GTI' or 'weather_GTI'")
    if wind_col is None:
        raise ValueError("Data must contain 'Wind_speed' or 'weather_Wind_speed'")

    coef_a = system["coef_a"]
    coef_b = system["coef_b"]
    delta = system["delta"]
    tot_power = system["tot_power"]
    temp_coef = system["temp_coef"]
    loss_factor = system["loss_factor"]

    # Temperature module
    data["Tcell"] = (
        data[air_temp_col]
        + (data[gti_col] * np.exp(coef_a + coef_b * data[wind_col]))
        + (data[gti_col] * delta / 1000)
    )

    # Power module: GTI * tot_power * (1 + (temp_coef/100)*(Tcell-25)) * loss_factor
    data["PVWatts"] = (
        data[gti_col] * tot_power * (1 + (temp_coef * 1e-2) * (data["Tcell"] - 25))
    ) * loss_factor

    return data


def pvwatts_filter(
    data: pd.DataFrame,
    pvwatts_column: str = "PVWatts",
    threshold: float = 0.5,
    resample_interval: str | None = "10T",
) -> tuple[pd.DataFrame, pd.DataFrame, list]:
    """
    Filters out rows with high deviation from PVWatts estimates and labels removed rows.
    Optionally resamples data over a defined time interval.

    Parameters
    ----------
    data : pd.DataFrame
        Input DataFrame with at least ['time', 'P_DC', pvwatts_column].
    pvwatts_column : str
        Name of the column containing PVWatts estimates (default 'PVWatts').
    threshold : float
        Acceptable relative deviation from PVWatts (e.g. 0.5 = ±50%).
    resample_interval : str or None
        Resampling frequency string (e.g. '10T', '1H'). None to skip resampling.

    Returns
    -------
    labeled_data : pd.DataFrame
        Original/resampled data with 'status' column ('valid' or 'removed').
    filtered_data : pd.DataFrame
        Only rows where status == 'valid'.
    removed_times : list
        List of removed timestamps.
    """
    df = data.copy()

    # Clean known extra columns if they exist
    df = df.drop(columns=["level_0", "index"], errors="ignore")

    # Ensure 'time' is datetime
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    df = df.dropna(subset=["time"])

    if resample_interval:
        df = df.set_index("time")
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        df = df[numeric_cols].resample(resample_interval).mean()
        df = df.reset_index()

    df["hour"] = df["time"].dt.hour

    # Drop rows with missing or invalid PVWatts
    df = df[df[pvwatts_column] > 0]
    df = df.dropna(subset=["P_DC", pvwatts_column])

    # Relative error vs PVWatts (denominator = PVWatts to avoid div by zero when P_DC=0)
    df["rel_error"] = np.abs((df["P_DC"] - df[pvwatts_column]) / df[pvwatts_column])
    df["status"] = df["rel_error"].apply(lambda x: "valid" if x <= threshold else "removed")

    filtered_data = df[df["status"] == "valid"].drop(columns=["hour", "rel_error"])
    removed_times = df[df["status"] == "removed"]["time"].tolist()
    labeled_data = df.drop(columns=["hour", "rel_error"])

    return labeled_data, filtered_data, removed_times
