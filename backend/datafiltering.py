"""
Data filtering: compute cell temperature (Tcell) and theoretical DC power (PVWatts)
from weather/PV data using parameters from system_info.json.
"""

from __future__ import annotations

import json
import os
import numpy as np
import pandas as pd


def _time_of_day_weight(hour_float: np.ndarray, solar_noon: float = 12.0, min_weight: float = 0.2) -> np.ndarray:
    """
    Weight = 1 at solar noon, decreases toward morning/evening.
    Formula: weight = min_weight + (1 - min_weight) * (1 + cos(pi * (hour - solar_noon) / 6)) / 2.
    So at hour 6 or 18 (relative to noon 12) weight is min_weight; at noon weight is 1.
    """
    min_weight = max(0.0, min(1.0, min_weight))
    raw = (1 + np.cos(np.pi * (hour_float - solar_noon) / 6.0)) / 2.0
    raw = np.clip(raw, 0, 1)
    return min_weight + (1.0 - min_weight) * raw


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
        PVWatts = (GTI * tot_power * (1 + (temp_coef/100) * (Tcell - 25)) * loss_factor) / 1000
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

    # Power module: compute PVWatts then scale by /1000 to match kW-based `Power` units.
    data["PVWatts"] = (
        data[gti_col] * tot_power * (1 + (temp_coef * 1e-2) * (data["Tcell"] - 25))
    ) * loss_factor / 1000

    return data


def pvwatts_filter(
    data: pd.DataFrame,
    pvwatts_column: str = "PVWatts",
    threshold: float = 0.5,
    resample_interval: str | None = "10T",
    time_weight_min: float | None = None,
    solar_noon_hour: float = 12.0,
) -> tuple[pd.DataFrame, pd.DataFrame, list]:
    """
    Filters out rows with high deviation from PVWatts estimates and labels removed rows.
    Optionally resamples data over a defined time interval.
    Optional time-of-day weight: scale relative error by a factor 1 at noon, lower at dawn/dusk.

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
    time_weight_min : float or None
        If set (e.g. 0.2), scale rel_error by a time-of-day weight (1 at solar noon, >= time_weight_min
        at dawn/dusk). Comparison uses scaled_error <= threshold, so fewer points are removed at low sun.
        If None, no time weighting (current behavior).
    solar_noon_hour : float
        Hour of day for solar noon (default 12) used when time_weight_min is set.

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

    # Hour as float for smooth weight (e.g. 8.5 for 08:30)
    df["hour"] = (
        df["time"].dt.hour
        + df["time"].dt.minute / 60.0
        + df["time"].dt.second / 3600.0
    )

    # Drop rows with missing or invalid PVWatts
    df = df[df[pvwatts_column] > 0]
    df = df.dropna(subset=["P_DC", pvwatts_column])

    # Relative error vs PVWatts (denominator = PVWatts to avoid div by zero when P_DC=0)
    df["rel_error"] = np.abs((df["P_DC"] - df[pvwatts_column]) / df[pvwatts_column])

    if time_weight_min is not None:
        weight = _time_of_day_weight(df["hour"].values, solar_noon_hour, time_weight_min)
        scaled_error = df["rel_error"].values * weight
        df["status"] = np.where(scaled_error <= threshold, "valid", "removed")
    else:
        df["status"] = np.where(df["rel_error"] <= threshold, "valid", "removed")

    filtered_data = df[df["status"] == "valid"].drop(columns=["hour", "rel_error"])
    removed_times = df[df["status"] == "removed"]["time"].tolist()
    labeled_data = df.drop(columns=["hour", "rel_error"])

    return labeled_data, filtered_data, removed_times
