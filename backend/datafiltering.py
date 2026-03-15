"""
Data filtering: compute cell temperature (Tcell) and theoretical DC power (P_DC_calculee)
from weather/PV data using parameters from system_info.json.
"""

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
    return out


def apply_temperature_and_power(data: pd.DataFrame, system_info_path: str) -> pd.DataFrame:
    """
    Compute Tcell and P_DC_calculee from weather/PV columns using parameters
    read from system_info.json.

    Temperature module:
        Tcell = Air_Temp + (GTI * exp(coef_a + coef_b * Wind_speed))
                + (GTI * delta / 1000)

    Power module:
        P_DC_calculee = (GTI * tot_power * (1 + (temp_coef/100) * (Tcell - 25)) / 1000 * 1000) * 0.97
                      = GTI * tot_power * (1 + (temp_coef/100) * (Tcell - 25)) * 0.97

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
        Copy of data with added columns 'Tcell' and 'P_DC_calculee'.
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

    # Temperature module
    data["Tcell"] = (
        data[air_temp_col]
        + (data[gti_col] * np.exp(coef_a + coef_b * data[wind_col]))
        + (data[gti_col] * delta / 1000)
    )

    # Power module: ((GTI * tot_power * (1 + (temp_coef/100)*(Tcell-25))/1000)*1000)*0.97
    data["P_DC_calculee"] = (
        (
            (data[gti_col] * tot_power * (1 + (temp_coef * 1e-2) * (data["Tcell"] - 25)))
            / 1000
            * 1000
        )
        * 0.97
    )

    return data
