"""
PV Layout Estimator API — mirrors public/pv-estimator-app/server.js for production.
Used when the static app on GitHub Pages calls VITE_API_BASE + /api/weather, /api/modules*, /api/inverters*.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from flask import Blueprint, jsonify, request

bp = Blueprint("pv_estimator", __name__)

USER_AGENT = "PVCopilot-Flask-PV-Estimator/1.0"
CEC_MODULES_URL = (
    "https://raw.githubusercontent.com/NREL/SAM/develop/deploy/libraries/CEC%20Modules.csv"
)
CEC_INVERTERS_URL = (
    "https://raw.githubusercontent.com/NREL/SAM/develop/deploy/libraries/CEC%20Inverters.csv"
)

_cached_modules: list[dict[str, Any]] | None = None
_cached_inverters: list[dict[str, Any]] | None = None


def _fetch_json(url: str, timeout: int = 120) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        raise RuntimeError(body or f"Upstream request failed with HTTP {e.code}") from e


def _fetch_text(url: str, timeout: int = 120) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        raise RuntimeError(body or f"Upstream request failed with HTTP {e.code}") from e


def _split_csv_row(row: str) -> list[str]:
    fields: list[str] = []
    current: list[str] = []
    in_quotes = False
    for ch in row:
        if ch == '"':
            in_quotes = not in_quotes
            continue
        if ch == "," and not in_quotes:
            fields.append("".join(current).strip())
            current = []
            continue
        current.append(ch)
    fields.append("".join(current).strip())
    return fields


def pvgis_time_to_iso(value: str) -> str:
    year = value[0:4]
    month = value[4:6]
    day = value[6:8]
    hour = value[9:11]
    minute = value[11:13]
    return f"{year}-{month}-{day}T{hour}:{minute}:00.000Z"


def normalize_pvgis_payload(payload: dict[str, Any]) -> dict[str, Any]:
    rows = (payload.get("outputs") or {}).get("tmy_hourly") or []
    records = []
    for row in rows:
        t = row.get("time(UTC)")
        if not t:
            continue
        records.append(
            {
                "time": pvgis_time_to_iso(str(t)),
                "ghi": row.get("G(h)"),
                "dni": row.get("Gb(n)"),
                "dhi": row.get("Gd(h)"),
                "temp": row.get("T2m"),
                "wind": row.get("WS10m"),
                "rh": row.get("RH"),
                "pressure": (row.get("SP") / 100) if row.get("SP") is not None else None,
            }
        )
    return {
        "records": records,
        "meta": {
            "ready": len(records) > 0,
            "rowCount": len(records),
            "timestepHours": 1,
            "start": records[0]["time"] if records else None,
            "end": records[-1]["time"] if records else None,
            "annualizationFactor": 1,
            "coverageDays": 365,
            "usesImportedPoa": False,
            "timestampsUtc": True,
            "issues": [
                "Typical meteorological year from PVGIS. Loaded through the local proxy because the official PVGIS API blocks direct browser AJAX requests.",
            ],
        },
        "source": {
            "provider": "pvgis",
            "label": "PVGIS TMY",
            "note": "PVGIS TMY loaded through the local proxy.",
        },
    }


def _open_meteo_time_to_iso(time_str: str) -> str:
    s = str(time_str).strip()
    if not s:
        return ""
    if s.endswith("Z"):
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    else:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def normalize_open_meteo_payload(payload: dict[str, Any]) -> dict[str, Any]:
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []

    def col(key: str, i: int):
        arr = hourly.get(key)
        if not isinstance(arr, list) or i >= len(arr):
            return None
        return arr[i]

    records = []
    for index, time_val in enumerate(times):
        records.append(
            {
                "time": _open_meteo_time_to_iso(str(time_val)),
                "ghi": col("shortwave_radiation", index),
                "dni": col("direct_normal_irradiance", index),
                "dhi": col("diffuse_radiation", index),
                "temp": col("temperature_2m", index),
                "wind": col("wind_speed_10m", index),
                "rh": col("relative_humidity_2m", index),
                "pressure": col("surface_pressure", index),
            }
        )

    return {
        "records": records,
        "meta": {
            "ready": len(records) > 0,
            "rowCount": len(records),
            "timestepHours": 1,
            "start": records[0]["time"] if records else None,
            "end": records[-1]["time"] if records else None,
            "annualizationFactor": 1,
            "coverageDays": 365,
            "usesImportedPoa": False,
            "timestampsUtc": True,
            "issues": [
                "Historical weather year from Open-Meteo ERA5 reanalysis. This is a single calendar year, not a statistically synthesized TMY.",
            ],
        },
        "source": {
            "provider": "openmeteo",
            "label": "Open-Meteo ERA5",
            "note": "Open-Meteo ERA5 historical year loaded through the local proxy.",
        },
    }


def load_weather(provider: str, latitude: float, longitude: float) -> dict[str, Any]:
    if provider == "openmeteo":
        last_year = datetime.now(timezone.utc).year - 1
        q = urllib.parse.urlencode(
            {
                "latitude": str(latitude),
                "longitude": str(longitude),
                "start_date": f"{last_year}-01-01",
                "end_date": f"{last_year}-12-31",
                "hourly": "shortwave_radiation,direct_normal_irradiance,diffuse_radiation,temperature_2m,wind_speed_10m,relative_humidity_2m,surface_pressure",
                "wind_speed_unit": "ms",
                "timezone": "UTC",
            }
        )
        url = f"https://archive-api.open-meteo.com/v1/archive?{q}"
        payload = _fetch_json(url)
        return normalize_open_meteo_payload(payload)

    q = urllib.parse.urlencode(
        {
            "lat": str(latitude),
            "lon": str(longitude),
            "outputformat": "json",
        }
    )
    url = f"https://re.jrc.ec.europa.eu/api/v5_3/tmy?{q}"
    payload = _fetch_json(url)
    return normalize_pvgis_payload(payload)


def parse_cec_modules_csv(csv_text: str) -> list[dict[str, Any]]:
    lines = csv_text.split("\n")
    if not lines:
        return []
    headers = [h.strip() for h in lines[0].split(",")]

    def col(name: str) -> int:
        try:
            return headers.index(name)
        except ValueError:
            return -1

    c_name = col("Name")
    c_mf = col("Manufacturer")
    c_stc = col("STC")
    c_len = col("Length")
    c_wid = col("Width")
    c_gamma = col("gamma_pmp")
    c_tech = col("Technology")
    c_bif = col("Bifacial")
    c_tnoct = col("T_NOCT")

    modules: list[dict[str, Any]] = []
    for i in range(3, len(lines)):
        row = lines[i]
        if not row.strip():
            continue
        fields = _split_csv_row(row)
        if c_name < 0 or c_name >= len(fields):
            continue
        name = fields[c_name] or ""
        manufacturer = fields[c_mf] if 0 <= c_mf < len(fields) else ""
        if not name:
            continue

        model = name[len(manufacturer) :].strip() if manufacturer and name.startswith(manufacturer) else name

        def f(idx: int) -> float | None:
            if idx < 0 or idx >= len(fields):
                return None
            try:
                return float(fields[idx])
            except (TypeError, ValueError):
                return None

        stc = f(c_stc)
        if stc is None or stc <= 0:
            continue

        length_m = f(c_len)
        width_m = f(c_wid)
        gamma_pmp = f(c_gamma)
        technology = fields[c_tech] if 0 <= c_tech < len(fields) else ""
        bifacial = (fields[c_bif] if 0 <= c_bif < len(fields) else "") == "1"
        t_noct = f(c_tnoct)

        modules.append(
            {
                "name": name,
                "manufacturer": manufacturer,
                "model": model,
                "powerWp": round(stc * 10) / 10,
                "lengthM": round(length_m * 1000) / 1000 if length_m is not None else None,
                "widthM": round(width_m * 1000) / 1000 if width_m is not None else None,
                "tempCoeffPctPerC": round(gamma_pmp * 1000) / 1000 if gamma_pmp is not None else None,
                "technology": technology,
                "bifacial": bifacial,
                "tNoct": t_noct if t_noct is not None else None,
            }
        )
    return modules


def parse_cec_inverters_csv(csv_text: str) -> list[dict[str, Any]]:
    lines = csv_text.split("\n")
    if not lines:
        return []
    headers = [h.strip() for h in lines[0].split(",")]

    def col(name: str) -> int:
        try:
            return headers.index(name)
        except ValueError:
            return -1

    c_name = col("Name")
    c_paco = col("Paco")
    c_pdco = col("Pdco")
    c_vac = col("Vac")
    c_vdcmax = col("Vdcmax")
    c_mlow = col("Mppt_low")
    c_mhigh = col("Mppt_high")

    inverters: list[dict[str, Any]] = []
    for i in range(3, len(lines)):
        row = lines[i]
        if not row.strip():
            continue
        fields = _split_csv_row(row)
        if c_name < 0 or c_name >= len(fields):
            continue
        name = fields[c_name] or ""
        if not name:
            continue

        manufacturer = ""
        model = name
        colon_idx = name.find(":")
        if colon_idx > 0:
            manufacturer = name[:colon_idx].strip()
            model = name[colon_idx + 1 :].strip()

        def f(idx: int) -> float | None:
            if idx < 0 or idx >= len(fields):
                return None
            try:
                return float(fields[idx])
            except (TypeError, ValueError):
                return None

        paco = f(c_paco)
        pdco = f(c_pdco)
        vac = f(c_vac)
        vdcmax = f(c_vdcmax)
        mppt_low = f(c_mlow)
        mppt_high = f(c_mhigh)

        if paco is None or paco <= 0:
            continue

        efficiency_pct = None
        if pdco is not None and pdco > 0:
            efficiency_pct = round((paco / pdco) * 10000) / 100

        inverters.append(
            {
                "name": name,
                "manufacturer": manufacturer,
                "model": model,
                "pacoKw": round(paco / 10) / 100,
                "pdcoKw": round(pdco / 10) / 100 if pdco is not None else None,
                "efficiencyPct": efficiency_pct,
                "vacV": vac if vac is not None else None,
                "vdcmaxV": vdcmax if vdcmax is not None else None,
                "mpptLowV": mppt_low if mppt_low is not None else None,
                "mpptHighV": mppt_high if mppt_high is not None else None,
            }
        )
    return inverters


def load_module_database() -> list[dict[str, Any]]:
    global _cached_modules
    if _cached_modules is not None:
        return _cached_modules
    csv_text = _fetch_text(CEC_MODULES_URL)
    _cached_modules = parse_cec_modules_csv(csv_text)
    return _cached_modules


def load_inverter_database() -> list[dict[str, Any]]:
    global _cached_inverters
    if _cached_inverters is not None:
        return _cached_inverters
    csv_text = _fetch_text(CEC_INVERTERS_URL)
    _cached_inverters = parse_cec_inverters_csv(csv_text)
    return _cached_inverters


@bp.route("/api/weather", methods=["GET"])
def api_weather():
    provider = request.args.get("provider") or "pvgis"
    try:
        latitude = float(request.args.get("lat", ""))
        longitude = float(request.args.get("lon", ""))
    except (TypeError, ValueError):
        return jsonify({"error": "Latitude and longitude are required numeric values."}), 400

    if not (latitude == latitude and longitude == longitude):  # NaN check
        return jsonify({"error": "Latitude and longitude are required numeric values."}), 400

    if provider not in ("pvgis", "openmeteo"):
        return jsonify({"error": "Unsupported weather provider."}), 400

    try:
        payload = load_weather(provider, latitude, longitude)
        return jsonify(payload)
    except Exception as e:
        msg = str(e)
        if provider == "openmeteo":
            return jsonify({"error": f"Open-Meteo request failed. {msg}"}), 502
        return jsonify({"error": f"PVGIS request failed. {msg}"}), 502


@bp.route("/api/modules/manufacturers", methods=["GET"])
def api_module_manufacturers():
    try:
        modules = load_module_database()
        names = sorted({m["manufacturer"] for m in modules if m.get("manufacturer")})
        return jsonify({"manufacturers": names})
    except Exception as e:
        return jsonify({"error": f"Module database error: {str(e)}"}), 502


@bp.route("/api/modules", methods=["GET"])
def api_modules_search():
    q = (request.args.get("q") or "").strip()
    manufacturer = (request.args.get("manufacturer") or "").strip()
    try:
        power_min = float(request.args.get("powerMin", ""))
    except (TypeError, ValueError):
        power_min = float("nan")
    try:
        power_max = float(request.args.get("powerMax", ""))
    except (TypeError, ValueError):
        power_max = float("nan")
    has_power = power_min == power_min or power_max == power_max  # not NaN

    if not manufacturer and not has_power and len(q) < 2:
        return (
            jsonify(
                {"error": "Provide a manufacturer, power range, or a query of at least 2 characters."}
            ),
            400,
        )

    try:
        modules = load_module_database()
        results = modules
        if manufacturer:
            results = [m for m in results if m.get("manufacturer") == manufacturer]
        if power_min == power_min:
            results = [m for m in results if m.get("powerWp", 0) >= power_min]
        if power_max == power_max:
            results = [m for m in results if m.get("powerWp", 0) <= power_max]
        if q:
            terms = [t for t in q.lower().split() if t]
            results = [
                m
                for m in results
                if all(t in (m.get("name") or "").lower() for t in terms)
            ]
        return jsonify({"modules": results[:50]})
    except Exception as e:
        return jsonify({"error": f"Module database error: {str(e)}"}), 502


@bp.route("/api/inverters/manufacturers", methods=["GET"])
def api_inverter_manufacturers():
    try:
        inverters = load_inverter_database()
        names = sorted({inv["manufacturer"] for inv in inverters if inv.get("manufacturer")})
        return jsonify({"manufacturers": names})
    except Exception as e:
        return jsonify({"error": f"Inverter database error: {str(e)}"}), 502


@bp.route("/api/inverters", methods=["GET"])
def api_inverters_search():
    q = (request.args.get("q") or "").strip()
    manufacturer = (request.args.get("manufacturer") or "").strip()
    try:
        cap_min = float(request.args.get("capacityMin", ""))
    except (TypeError, ValueError):
        cap_min = float("nan")
    try:
        cap_max = float(request.args.get("capacityMax", ""))
    except (TypeError, ValueError):
        cap_max = float("nan")
    has_cap = cap_min == cap_min or cap_max == cap_max

    if not manufacturer and not has_cap and len(q) < 2:
        return (
            jsonify(
                {"error": "Provide a manufacturer, capacity range, or a query of at least 2 characters."}
            ),
            400,
        )

    try:
        inverters = load_inverter_database()
        results = inverters
        if manufacturer:
            results = [inv for inv in results if inv.get("manufacturer") == manufacturer]
        if cap_min == cap_min:
            results = [inv for inv in results if inv.get("pacoKw", 0) >= cap_min]
        if cap_max == cap_max:
            results = [inv for inv in results if inv.get("pacoKw", 0) <= cap_max]
        if q:
            terms = [t for t in q.lower().split() if t]
            results = [
                inv
                for inv in results
                if all(t in (inv.get("name") or "").lower() for t in terms)
            ]
        return jsonify({"inverters": results[:50]})
    except Exception as e:
        return jsonify({"error": f"Inverter database error: {str(e)}"}), 502


def register_pv_estimator_routes(app):
    app.register_blueprint(bp)
