import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";
import FilterAltOutlined from "@mui/icons-material/FilterAltOutlined";
import PatternOutlined from "@mui/icons-material/PatternOutlined";
import ShowChartOutlined from "@mui/icons-material/ShowChartOutlined";
import SolarPowerOutlined from "@mui/icons-material/SolarPowerOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import TimelineOutlined from "@mui/icons-material/TimelineOutlined";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import HelpOutline from "@mui/icons-material/HelpOutline";
import TipsAndUpdates from "@mui/icons-material/TipsAndUpdates";
import FunctionsOutlined from "@mui/icons-material/FunctionsOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";
import BookmarkAddedOutlinedIcon from "@mui/icons-material/BookmarkAddedOutlined";
import RotateLeftOutlinedIcon from "@mui/icons-material/RotateLeftOutlined";
import Button from "@mui/material/Button";
import TableColumnSelector from "../components/TableColumnSelector";
import SystemInfoHelpIcon from "../components/SystemInfoHelpIcon";
import { PV_SYNONYMS, PV_TEMPLATE_COLUMNS, PV_TEMPLATE_LABELS, WEATHER_SYNONYMS, WEATHER_TEMPLATE_COLUMNS, WEATHER_TEMPLATE_LABELS } from "../components/CSVColumnMapper";

const Plot = createPlotlyComponent(Plotly);

const FONT = "Inter, Arial, sans-serif";
const MONO = "'JetBrains Mono', monospace";
const O = "#ff7a45";
const B = "#1d9bf0";
const Y = "#16a34a";
const DF = "#e11d48"; // Data Filtering accent

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractUnitFromTemplateLabel(templateLabel) {
  if (!templateLabel) return null;
  const s = String(templateLabel);
  const m = s.match(/\(([^)]+)\)\s*$/);
  return m?.[1] ?? null;
}

function inferTemplateKeyFromHeader(headerBase, templateColumns, synonymTable) {
  const lower = String(headerBase ?? "").trim().toLowerCase();
  if (!lower) return null;

  for (const key of templateColumns) {
    if (String(key).toLowerCase() === lower) return key;
  }

  const normalized = lower.replace(/\s+/g, "_");
  if (normalized !== lower) {
    for (const key of templateColumns) {
      if (String(key).toLowerCase() === normalized) return key;
    }
  }

  for (const key of templateColumns) {
    const syn = synonymTable?.[key];
    if (!Array.isArray(syn) || syn.length === 0) continue;
    if (syn.some((v) => String(v).toLowerCase() === lower)) return key;
    if (syn.some((v) => String(v).toLowerCase() === normalized)) return key;
  }

  return null;
}

function formatHeaderWithUnit(header) {
  const original = String(header ?? "").trim();
  if (!original) return original;

  // Avoid double-appending: if it already ends with "(...)".
  if (/\([^)]*\)\s*$/.test(original)) return original;

  const base = original.replace(/^weather_/i, "").replace(/^pv_/i, "").trim();
  const baseForMatch = base.replace(/\s+/g, "_");

  const pvKey = inferTemplateKeyFromHeader(baseForMatch, PV_TEMPLATE_COLUMNS, PV_SYNONYMS);
  if (pvKey) {
    const unit = extractUnitFromTemplateLabel(PV_TEMPLATE_LABELS?.[pvKey]);
    return unit ? `${original} (${unit})` : original;
  }

  const whKey = inferTemplateKeyFromHeader(baseForMatch, WEATHER_TEMPLATE_COLUMNS, WEATHER_SYNONYMS);
  if (whKey) {
    const unit = extractUnitFromTemplateLabel(WEATHER_TEMPLATE_LABELS?.[whKey]);
    return unit ? `${original} (${unit})` : original;
  }

  return original;
}

function parseCSV(text) {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const vals = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) {
        vals.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    vals.push(cur.trim());
    return vals;
  });
  return { headers, rows };
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsText(file);
  });
}

// ── PV data helpers (self-contained for Data Filtering; separate from QualityCheckPage) ──
function getDateColumnIndex(headers) {
  if (!headers || headers.length === 0) return -1;
  const first = (headers[0] || "").toLowerCase();
  if (/time|date|timestamp|datetime/.test(first)) return 0;
  for (let i = 0; i < headers.length; i++) {
    if (/time|date|timestamp|datetime/.test((headers[i] || "").toLowerCase())) return i;
  }
  return 0;
}

/** Return first column index whose header matches one of the candidate names. */
function getColumnIndex(headers, candidates) {
  if (!headers?.length || !candidates?.length) return -1;
  const set = new Set(candidates.map((c) => String(c).trim()));
  for (let i = 0; i < headers.length; i++) {
    if (set.has(String(headers[i] ?? "").trim())) return i;
  }
  return -1;
}

function parseRuleDate(str) {
  if (!str) return null;
  const s = String(str).trim().replace(" ", "T");
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function LossFactorRuleRangeEditor({ rule, onChange }) {
  const fromValue = rule.start ? rule.start.replace(" ", "T") : "";
  const toValue = rule.end ? rule.end.replace(" ", "T") : "";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="datetime-local"
        value={fromValue}
        onChange={(e) => {
          const v = e.target.value;
          onChange({ ...rule, start: v ? v.replace("T", " ") : "" });
        }}
        style={{
          flex: 1,
          fontFamily: MONO,
          fontSize: 11,
          padding: "6px 8px",
          borderRadius: 8,
          border: "1px solid #E2E8F0",
          background: "#F9FAFB",
          color: "#0F172A",
          outline: "none",
        }}
      />
      <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: MONO }}>→</span>
      <input
        type="datetime-local"
        value={toValue}
        onChange={(e) => {
          const v = e.target.value;
          onChange({ ...rule, end: v ? v.replace("T", " ") : "" });
        }}
        style={{
          flex: 1,
          fontFamily: MONO,
          fontSize: 11,
          padding: "6px 8px",
          borderRadius: 8,
          border: "1px solid #E2E8F0",
          background: "#F9FAFB",
          color: "#0F172A",
          outline: "none",
        }}
      />
    </div>
  );
}

/**
 * Compute Tcell and PVWatts for each row (same formulas as backend datafiltering.py).
 * config: { coef_a, coef_b, delta, tot_power, temp_coef [, loss_factor ] } (numbers).
 * lossFactor: optional multiplier at end of PVWatts formula (default 0.97), or
 * { defaultFactor: number, rules: Array<{ start: string, end: string, factor: number }> }.
 * Returns array of objects: all original row columns (by header name) plus PVWatts.
 */
function computePdcComparison(headers, rows, config, lossFactor = 0.97) {
  if (!headers?.length || !rows?.length || !config || typeof config !== "object") return null;
  const cfg = config.config || config;
  const coef_a = Number(cfg.coef_a);
  const coef_b = Number(cfg.coef_b);
  const delta = Number(cfg.delta);
  const tot_power = Number(cfg.tot_power);
  const temp_coef = Number(cfg.temp_coef);
  const lfObj = lossFactor && typeof lossFactor === "object" && !Array.isArray(lossFactor) ? lossFactor : null;
  const num = Number(lfObj ? lfObj.defaultFactor : lossFactor);
  const defaultFactor = (Number.isFinite(num) && num >= 0) ? num : 0.97;
  const rules = Array.isArray(lfObj?.rules) ? lfObj.rules : null;
  if ([coef_a, coef_b, delta, tot_power, temp_coef].some((n) => !Number.isFinite(n))) return null;

  const timeIdx = getDateColumnIndex(headers);
  const airIdx = getColumnIndex(headers, ["weather_Air_Temp"]);
  const gtiIdx = getColumnIndex(headers, ["weather_POA", "weather_GTI", "GTI"]);
  const windIdx = getColumnIndex(headers, ["weather_Wind_speed"]);
  const pdcIdx = getColumnIndex(headers, ["Power", "P_DC"]);
  if (timeIdx < 0 || airIdx < 0 || gtiIdx < 0 || windIdx < 0 || pdcIdx < 0) return null;

  function resolveLossFactorForTime(timeVal) {
    if (!rules?.length) return defaultFactor;
    const base = timeVal != null ? new Date(String(timeVal).trim().replace(" ", "T")) : null;
    if (!base || Number.isNaN(base.getTime())) return defaultFactor;
    for (const r of rules) {
      const start = parseRuleDate(r.start);
      const end = parseRuleDate(r.end);
      if (!start || !end) continue;
      if (base >= start && base <= end) {
        const f = Number(r.factor);
        return Number.isFinite(f) && f >= 0 ? f : defaultFactor;
      }
    }
    return defaultFactor;
  }

  const result = [];
  let debugLogged = 0;
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const airTemp = parseFloat(row[airIdx]);
    const gti = parseFloat(row[gtiIdx]);
    const wind = parseFloat(row[windIdx]);
    const pdc = parseFloat(row[pdcIdx]);
    if (!Number.isFinite(gti) || !Number.isFinite(airTemp) || !Number.isFinite(wind)) continue;
    const tcell = airTemp + (gti * Math.exp(coef_a + coef_b * wind)) + (gti * delta / 1000);
    const factor = resolveLossFactorForTime(row[timeIdx]);
    // PVWatts is computed from the GTI model; scale by /1000 to match kW-based `Power` units.
    const pvWatts = (gti * tot_power * (1 + (temp_coef * 1e-2) * (tcell - 25))) * factor / 1000;
    const rowObj = {};
    for (let i = 0; i < headers.length; i++) rowObj[headers[i]] = row[i];
    rowObj.time = row[timeIdx];
    rowObj.Power = Number.isFinite(pdc) ? pdc : null;
    rowObj.weather_POA = Number.isFinite(gti) ? gti : null;
    rowObj.PVWatts = Number.isFinite(pvWatts) ? pvWatts : null;

    // #region agent log (pvwatts_power_units)
    const pdcWGuess = Number.isFinite(pdc) ? pdc * 1000 : null;
    if (debugLogged < 3 && Number.isFinite(pdc) && Number.isFinite(pvWatts) && Number.isFinite(gti) && gti > 0 && pvWatts > 0 && pdc !== 0) {
      fetch("http://127.0.0.1:7283/ingest/1d413e82-602f-441e-8fcf-2d13a5c3968e", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "bd2544" },
        body: JSON.stringify({
          sessionId: "bd2544",
          runId: "daylightEvidence",
          hypothesisId: "H1",
          location: "src/pages/DataFilteringPage.jsx:computePdcComparison",
          message: "PVWatts vs Power (kW) sample row",
          timestamp: Date.now(),
          data: {
            time: row[timeIdx],
            gti,
            tot_power,
            tcell,
            factor,
            Power: pdc,
            Power_times_1000_guess: pdcWGuess,
            PVWatts: pvWatts,
          },
        }),
      }).catch(() => {});
      debugLogged++;
    }
    // #endregion

    result.push(rowObj);
  }
  return result.length ? result : null;
}

/**
 * Time-of-day weight: 1 at solar noon, decreases toward dawn/dusk.
 * Same formula as backend _time_of_day_weight.
 * @param {number} hourFloat - Hour of day as float (e.g. 8.5 for 08:30)
 * @param {number} solarNoon - Solar noon hour (default 12)
 * @param {number} minWeight - Minimum weight at edges (default 0.2)
 * @returns {number} weight in [minWeight, 1]
 */
function timeOfDayWeight(hourFloat, solarNoon = 12, minWeight = 0.2) {
  const m = Math.max(0, Math.min(1, minWeight));
  const raw = (1 + Math.cos((Math.PI * (hourFloat - solarNoon)) / 6)) / 2;
  return m + (1 - m) * Math.max(0, Math.min(1, raw));
}

/**
 * Apply PVWatts filter in JS (mirrors backend pvwatts_filter).
 * comparisonData: array of { time, Power, PVWatts }.
 * threshold: max relative error (e.g. 0.2 = 20%).
 * options: { timeWeightMin?: number } - if set (e.g. 0.2), scale error by time-of-day weight.
 * Returns { labeled, filtered, removedTimes }.
 */
function pvwattsFilterJS(comparisonData, threshold, options = {}) {
  if (!Array.isArray(comparisonData) || comparisonData.length === 0) return null;
  const th = Number(threshold);
  const t = Number.isFinite(th) && th >= 0 ? th : 0.5;
  const timeWeightMin = options.timeWeightMin != null ? Number(options.timeWeightMin) : null;
  const useTimeWeight = Number.isFinite(timeWeightMin) && timeWeightMin >= 0 && timeWeightMin <= 1;

  const labeled = [];
  for (const d of comparisonData) {
    const pdc = d.Power != null ? Number(d.Power) : NaN;
    const pv = d.PVWatts != null ? Number(d.PVWatts) : NaN;
    if (!Number.isFinite(pv) || pv <= 0 || !Number.isFinite(pdc)) continue;
    if (pdc <= 0 && pv > 0) {
      labeled.push({ ...d, rel_error: 1, status: "removed" });
      continue;
    }
    const relError = Math.abs((pdc - pv) / pv);
    let compareError = relError;
    if (useTimeWeight) {
      const tMs = d.time != null ? (d.time instanceof Date ? d.time.getTime() : new Date(d.time).getTime()) : NaN;
      if (Number.isFinite(tMs)) {
        const date = new Date(tMs);
        const hourFloat = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
        const w = timeOfDayWeight(hourFloat, 12, timeWeightMin);
        compareError = relError * w;
      }
    }
    const status = compareError <= t ? "valid" : "removed";
    labeled.push({ ...d, rel_error: relError, status });
  }

  const filtered = labeled.filter((r) => r.status === "valid");
  const removedTimes = labeled.filter((r) => r.status === "removed").map((r) => r.time);
  return { labeled, filtered, removedTimes };
}

/** Simple linear regression: returns { slope, intercept, r2 } from x[], y[]. */
function linearRegression(x, y) {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i]; sumY += y[i]; sumXY += x[i] * y[i]; sumX2 += x[i] * x[i]; sumY2 += y[i] * y[i];
  }
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  let ssRes = 0, ssTot = 0;
  const meanY = sumY / n;
  for (let i = 0; i < n; i++) {
    const fit = slope * x[i] + intercept;
    ssRes += (y[i] - fit) ** 2;
    ssTot += (y[i] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

/** Centered rolling mean, min_periods 1. */
function rollingSmooth(arr, halfWindow = 1) {
  if (!Array.isArray(arr) || arr.length === 0) return arr;
  const k = Math.max(1, Math.floor(halfWindow));
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - k);
    const end = Math.min(arr.length, i + k + 1);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      const v = arr[j];
      if (v != null && Number.isFinite(v)) {
        sum += v;
        count++;
      }
    }
    out.push(count > 0 ? sum / count : arr[i]);
  }
  return out;
}

function parseDateCell(val) {
  if (val == null || String(val).trim() === "") return NaN;
  const d = new Date(String(val).trim());
  return isNaN(d.getTime()) ? NaN : d.getTime();
}

function parseDateCellFlexible(val) {
  if (val == null || String(val).trim() === "") return null;
  const raw = String(val).trim();
  const a = new Date(raw);
  if (!Number.isNaN(a.getTime())) return a;
  const b = new Date(raw.replace(" ", "T"));
  if (!Number.isNaN(b.getTime())) return b;
  return null;
}

function toYMDLocal(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function dayOfYearLocal(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  const ms = d.getTime() - start.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

function median(sorted) {
  if (!sorted.length) return NaN;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentileSorted(sorted, p) {
  if (!sorted.length) return NaN;
  const pp = clamp(p, 0, 1);
  const idx = (sorted.length - 1) * pp;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

function solarPositionZenithRad(date, latitudeDeg, longitudeDeg) {
  const lat = degToRad(latitudeDeg);
  const n = dayOfYearLocal(date);
  const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const gamma = (2 * Math.PI / 365) * (n - 1 + (hours - 12) / 24);

  // NOAA-style approximations
  const eqTimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const tzHours = -date.getTimezoneOffset() / 60;
  const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const timeOffsetMin = eqTimeMin + 4 * longitudeDeg - 60 * tzHours;
  const trueSolarTimeMin = minutes + timeOffsetMin;
  const hourAngleDeg = (trueSolarTimeMin / 4) - 180;
  const ha = degToRad(hourAngleDeg);

  const cosZ = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const z = Math.acos(clamp(cosZ, -1, 1));
  return { zenithRad: z, cosZenith: cosZ };
}

function clearSkyGhiHaurwitz(cosZenith) {
  const cz = Number(cosZenith);
  if (!Number.isFinite(cz) || cz <= 0) return 0;
  return 1098 * cz * Math.exp(-0.059 / cz);
}

const KT_CLEAR_MIN = 0.88;
const KT_CLEAR_MAX = 1.12;
const KT_CLEAR_DAY_RATIO = 0.45;
const KT_MIN_DAYTIME_SAMPLES = 6;

function computeKt(measuredGhi, clearSkyGhi) {
  const meas = Number(measuredGhi);
  const clear = Number(clearSkyGhi);
  if (!Number.isFinite(meas) || !Number.isFinite(clear) || clear <= 0) return null;
  return meas / clear;
}

function formatTimeCell(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function resampleRowsToStep(headers, rows, stepMinutes) {
  const stepMs = Math.max(1, Math.min(1440, Number(stepMinutes) || 10)) * 60 * 1000;
  if (!headers?.length || !rows?.length)
    return { headers: headers || [], rows: rows || [], originalRows: rows?.length ?? 0, resampledRows: rows?.length ?? 0, resampled: false };
  const timeColIdx = getDateColumnIndex(headers);
  if (timeColIdx < 0) return { headers, rows, originalRows: rows.length, resampledRows: rows.length, resampled: false };

  const safeRows = rows.filter((r) => Array.isArray(r));
  const withMs = safeRows
    .map((row) => ({ row, ms: parseDateCell(row[timeColIdx]) }))
    .filter((x) => !Number.isNaN(x.ms));
  if (withMs.length === 0) return { headers, rows, originalRows: rows.length, resampledRows: rows.length, resampled: false };

  withMs.sort((a, b) => a.ms - b.ms);
  const tMin = withMs[0].ms;
  const tMax = withMs[withMs.length - 1].ms;
  const tStart = Math.floor(tMin / stepMs) * stepMs;
  const tEnd = Math.ceil(tMax / stepMs) * stepMs;
  const gridTimes = [];
  for (let t = tStart; t <= tEnd; t += stepMs) gridTimes.push(t);

  const sample = withMs.slice(0, Math.min(200, withMs.length)).map((x) => x.row);
  const numericCols = new Set();
  for (let c = 0; c < headers.length; c++) {
    if (c === timeColIdx) continue;
    let seen = 0,
      numeric = 0;
    for (const row of sample) {
      const raw = (row[c] ?? "").toString().trim();
      if (!raw) continue;
      seen++;
      const n = Number(raw);
      if (!Number.isNaN(n) && Number.isFinite(n)) numeric++;
      if (seen >= 30) break;
    }
    if (seen > 0 && numeric / seen >= 0.6) numericCols.add(c);
  }

  function getNumericAt(idx, col) {
    const raw = (withMs[idx]?.row?.[col] ?? "").toString().trim();
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  let lastIdx = 0;
  const resampledRows = gridTimes.map((t) => {
    while (lastIdx + 1 < withMs.length && withMs[lastIdx + 1].ms <= t) lastIdx++;
    let nextIdx = lastIdx;
    while (nextIdx < withMs.length && withMs[nextIdx].ms < t) nextIdx++;
    if (nextIdx < lastIdx) nextIdx = lastIdx;
    const baseRow = withMs[lastIdx]?.row ?? [];
    const newRow = [...baseRow];
    newRow[timeColIdx] = formatTimeCell(t);
    for (const col of numericCols) {
      const t0 = withMs[lastIdx]?.ms ?? t;
      const t1 = withMs[nextIdx]?.ms ?? t0;
      const v0 = getNumericAt(lastIdx, col);
      const v1 = getNumericAt(nextIdx, col);
      if (v0 == null && v1 == null) continue;
      if (t1 === t0 || v1 == null) {
        newRow[col] = v0 != null ? String(v0) : "";
        continue;
      }
      if (v0 == null) {
        newRow[col] = String(v1);
        continue;
      }
      const alpha = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
      newRow[col] = String(Math.round((v0 + (v1 - v0) * alpha) * 1000) / 1000);
    }
    return newRow;
  });

  return { headers, rows: resampledRows, originalRows: rows.length, resampledRows: resampledRows.length, resampled: true };
}

function filterRowsByDateRange(headers, rows, dateFrom, dateTo) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const dateCol = getDateColumnIndex(headers || []);
  const fromMs = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
  const toMs = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null;
  if (fromMs == null && toMs == null) return rows;
  return rows.filter((row) => {
    if (!Array.isArray(row)) return false;
    const ms = parseDateCell(row[dateCol]);
    if (isNaN(ms)) return true;
    if (fromMs != null && ms < fromMs) return false;
    if (toMs != null && ms > toMs) return false;
    return true;
  });
}

function parseRangeTextBar(text) {
  const t = (text || "").trim();
  const sep = t.includes("~") ? "~" : t.includes("→") ? "→" : null;
  const parts = sep ? t.split(sep).map((s) => s.trim()) : t.split(/\s+/).filter(Boolean);
  const from = (parts[0] || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || null;
  const to = (parts[1] || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || null;
  if (from && new Date(from).toISOString().slice(0, 10) === from) {
    const toValid = to && new Date(to).toISOString().slice(0, 10) === to ? to : from;
    return [from, toValid];
  }
  return null;
}

// ── Spinner (self-contained for Data Filtering page) ──
function Spinner({ color, size = 20 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `2.5px solid ${color}30`,
        borderTopColor: color,
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}

// ── Toast (minimal, self-contained) ──
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: type === "error" ? "#FEF2F2" : "#F0FDF4",
        color: type === "error" ? "#B91C1C" : "#166534",
        padding: "12px 20px",
        borderRadius: 10,
        boxShadow: "0 4px 12px rgba(0,0,0,.15)",
        fontSize: 13,
        fontWeight: 600,
        fontFamily: FONT,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          fontSize: 18,
          lineHeight: 1,
          opacity: 0.8,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ── Upload Zone (self-contained copy for Data Filtering; no dependency on QualityCheckPage) ──
function FilterUploadZone({
  label,
  icon,
  accept,
  color,
  file,
  onLoad,
  onFileUpload,
  onClear,
  onError,
  onDownloadSuccess,
  templateFile,
  footerHint,
}) {
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputId = useRef(`filter-upload-${Math.random().toString(36).slice(2)}`).current;

  const loadTemplate = useCallback(
    async (e) => {
      if (e) e.preventDefault();
      if (!templateFile) return;
      setLoading(true);
      try {
        const res = await fetch(`/data_template/${templateFile}`);
        if (!res.ok) {
          throw new Error(`Template not found: ${templateFile} (${res.status})`);
        }
        if (onFileUpload) {
          const blob = await res.blob();
          const f = new File([blob], templateFile, {
            type: res.headers.get("content-type") || (templateFile.endsWith(".csv") ? "text/csv" : "application/json"),
          });
          await onFileUpload(f);
        } else {
          const text = await res.text();
          onLoad(templateFile, text);
        }
      } catch (err) {
        onError(err.message || "Failed to load template");
      } finally {
        setLoading(false);
      }
    },
    [templateFile, onFileUpload, onLoad, onError]
  );

  const downloadTemplate = useCallback(
    async (e) => {
      if (e) e.preventDefault();
      if (!templateFile) return;
      setLoading(true);
      try {
        const res = await fetch(`/data_template/${templateFile}`);
        if (!res.ok) throw new Error(`Template not found: ${templateFile}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = templateFile;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onDownloadSuccess?.("Template downloaded successfully");
      } catch (err) {
        onError(err.message || "Failed to download template");
      } finally {
        setLoading(false);
      }
    },
    [templateFile, onError, onDownloadSuccess]
  );

  const processFile = useCallback(
    (f) => {
      if (!f) return;
      const ext = f.name.split(".").pop().toLowerCase();
      const allowed = accept.split(",").map((a) => a.trim().replace(".", ""));
      if (!allowed.includes(ext)) {
        onError(`Invalid file type ".${ext}". Expected: ${accept}`);
        return;
      }
      if (f.size > 50 * 1024 * 1024) {
        onError(`File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Maximum: 50 MB`);
        return;
      }
      if (onFileUpload) {
        setLoading(true);
        onFileUpload(f).finally(() => setLoading(false));
        return;
      }
      setLoading(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        setLoading(false);
        onLoad(f.name, e.target.result);
      };
      reader.onerror = () => {
        setLoading(false);
        onError(`Failed to read "${f.name}". The file may be corrupted.`);
      };
      reader.readAsText(f);
    },
    [accept, onLoad, onFileUpload, onError]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDrag(false);
      processFile(e.dataTransfer.files[0]);
    },
    [processFile]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      style={{
        border: `2px dashed ${drag ? color : file ? `${color}60` : "#E2E8F0"}`,
        borderRadius: 12,
        padding: file ? "14px 20px" : "28px 20px",
        textAlign: "center",
        background: drag ? `${color}08` : file ? `${color}06` : "#FAFBFC",
        transition: "all 0.2s",
        position: "relative",
      }}
    >
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 12,
            background: "rgba(255,255,255,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            zIndex: 2,
          }}
        >
          <Spinner color={color} />
          <span style={{ fontSize: 13, fontWeight: 600, color, fontFamily: FONT }}>
            Reading file...
          </span>
        </div>
      )}

      {file ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CheckCircleOutline sx={{ fontSize: 20, color: Y }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", fontFamily: FONT }}>
              {file}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {templateFile && (
              <button
                type="button"
                onClick={downloadTemplate}
                disabled={loading}
                style={{
                  background: "none",
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  color: "#94a3b8",
                  padding: 4,
                  borderRadius: 6,
                  display: "flex",
                }}
                onMouseEnter={(e) => { if (!loading) e.currentTarget.style.color = color; }}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
                aria-label="Download template"
              >
                <FileDownloadOutlined sx={{ fontSize: 18 }} />
              </button>
            )}
            <button
              type="button"
              onClick={onClear}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#94a3b8",
                padding: 4,
                borderRadius: 6,
                display: "flex",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
            >
              <DeleteOutline sx={{ fontSize: 18 }} />
            </button>
          </div>
        </div>
      ) : (
        <label htmlFor={inputId} style={{ cursor: "pointer", display: "block" }}>
          <input
            id={inputId}
            type="file"
            accept={accept}
            style={{ display: "none" }}
            onChange={(e) => {
              processFile(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: `${color}14`,
              border: `1.5px solid ${color}30`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
            }}
          >
            {icon}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4, fontFamily: FONT }}>
            {label}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: FONT }}>
            Drag & drop or <span style={{ color, fontWeight: 600, textDecoration: "underline" }}>browse</span>
            {templateFile && (
              <>
                {" or "}
                <button
                  type="button"
                  onClick={loadTemplate}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color,
                    fontWeight: 600,
                    textDecoration: "underline",
                    fontFamily: FONT,
                    fontSize: 12,
                  }}
                >
                  load_template
                </button>
              </>
            )}
          </div>
        </label>
      )}
      {footerHint && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <TipsAndUpdates sx={{ fontSize: 16, color: "#64748B" }} />
          <span style={{ fontFamily: FONT, fontSize: 11, color: "#64748B" }}>{footerHint}</span>
        </div>
      )}
    </div>
  );
}

// ── System Info display (self-contained copy for Data Filtering; separate from QualityCheckPage) ──
function FilterNestedObject({ obj }) {
  const [open, setOpen] = useState(false);
  const keys = Object.keys(obj);
  if (!open) {
    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        style={{ color: B, cursor: "pointer", fontSize: 12, fontFamily: MONO }}
      >
        {`{ ${keys.length} fields }`}
      </span>
    );
  }
  return (
    <div
      style={{
        marginTop: 4,
        paddingLeft: 16,
        borderLeft: "2px solid #E2E8F0",
      }}
    >
      <span
        onClick={(e) => {
          e.stopPropagation();
          setOpen(false);
        }}
        style={{ fontSize: 11, color: "#94a3b8", cursor: "pointer", fontFamily: MONO }}
      >
        collapse
      </span>
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 12 }}>
          <span style={{ fontWeight: 600, color: "#64748B", fontFamily: MONO }}>{k}:</span>
          <span>
            {typeof v === "object" && v !== null && !Array.isArray(v) ? (
              <FilterNestedObject obj={v} />
            ) : typeof v === "number" ? (
              <span style={{ color: B, fontFamily: MONO }}>{v}</span>
            ) : Array.isArray(v) ? (
              <span style={{ color: "#64748B", fontFamily: MONO }}>[{v.join(", ")}]</span>
            ) : (
              <span style={{ color: "#0F172A" }}>{String(v)}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function FilterSystemInfo({ data }) {
  const [expanded, setExpanded] = useState(true);

  const renderValue = (val) => {
    if (val === null || val === undefined) return <span style={{ color: "#94a3b8" }}>null</span>;
    if (typeof val === "boolean") return <span style={{ color: DF, fontWeight: 600 }}>{val.toString()}</span>;
    if (typeof val === "number") return <span style={{ color: B, fontFamily: MONO }}>{val}</span>;
    if (typeof val === "string") return <span style={{ color: "#0F172A" }}>{val}</span>;
    if (Array.isArray(val)) return <span style={{ color: "#64748B", fontFamily: MONO }}>[{val.join(", ")}]</span>;
    if (typeof val === "object") return <FilterNestedObject obj={val} />;
    return <span>{String(val)}</span>;
  };

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #E2E8F0",
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          cursor: "pointer",
          userSelect: "none",
          borderBottom: expanded ? "1px solid #E2E8F0" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
          <SettingsOutlined sx={{ fontSize: 20, color: O }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>
            System Info
          </span>
          <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
            <SystemInfoHelpIcon linkColor={DF} />
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: O,
              background: `${O}14`,
              padding: "2px 10px",
              borderRadius: 20,
              fontFamily: MONO,
            }}
          >
            {Object.keys(data).length} fields
          </span>
        </div>
        {expanded ? (
          <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />
        )}
      </div>
      {expanded && (
        <div style={{ padding: "8px 0" }}>
          {Object.entries(data).map(([key, val]) => (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "8px 20px",
                fontSize: 13,
                fontFamily: FONT,
              }}
            >
              <span
                style={{
                  minWidth: 180,
                  fontWeight: 600,
                  color: "#64748B",
                  fontFamily: MONO,
                  fontSize: 12,
                  paddingTop: 1,
                }}
              >
                {key}
              </span>
              <span style={{ flex: 1 }}>{renderValue(val)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Table styles for PV data (Data Filtering only) ──
const thStyle = {
  padding: "8px 14px",
  borderBottom: "1px solid #F1F5F9",
  color: "#0F172A",
  whiteSpace: "nowrap",
  textAlign: "left",
  fontWeight: 700,
  fontSize: 11,
  fontFamily: MONO,
  background: "#F8FAFC",
  position: "sticky",
  top: 0,
  zIndex: 2,
};
const tdStyle = {
  padding: "8px 14px",
  borderBottom: "1px solid #F1F5F9",
  color: "#0F172A",
  whiteSpace: "nowrap",
  fontFamily: MONO,
};

// ── Calendar for date range (Data Filtering only) ──
const CALENDAR_BLUE = "#2563eb";
const CALENDAR_BLUE_LIGHT = "rgba(37, 99, 235, 0.2)";
const DAYS_HEADER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toYMD(d) {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getCalendarGridSundayFirst(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay();
  const daysInMonth = last.getDate();
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const prevLast = new Date(prevYear, prevMonth + 1, 0).getDate();
  const grid = [];
  let dayCount = 1;
  let nextMonthDay = 1;
  for (let row = 0; row < 6; row++) {
    const rowDays = [];
    for (let col = 0; col < 7; col++) {
      const cellIndex = row * 7 + col;
      if (cellIndex < startDay) {
        const d = prevLast - startDay + cellIndex + 1;
        rowDays.push({ date: new Date(prevYear, prevMonth, d), currentMonth: false });
      } else if (dayCount <= daysInMonth) {
        rowDays.push({ date: new Date(year, month, dayCount), currentMonth: true });
        dayCount++;
      } else {
        rowDays.push({ date: new Date(year, month + 1, nextMonthDay), currentMonth: false });
        nextMonthDay++;
      }
    }
    grid.push(rowDays);
  }
  return grid;
}

const QUICK_SELECTS = [
  { label: "Today", getRange: () => { const t = new Date(); const y = toYMD(t); return [y, y]; } },
  { label: "Yesterday", getRange: () => { const t = new Date(); t.setDate(t.getDate() - 1); const y = toYMD(t); return [y, y]; } },
  { label: "Last 7 days", getRange: () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 6); return [toYMD(start), toYMD(end)]; } },
  { label: "Last 30 days", getRange: () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 29); return [toYMD(start), toYMD(end)]; } },
  { label: "This month", getRange: () => { const t = new Date(); const y = t.getFullYear(), m = t.getMonth(); const first = new Date(y, m, 1); const last = new Date(y, m + 1, 0); return [toYMD(first), toYMD(last)]; } },
  { label: "Last month", getRange: () => { const t = new Date(); const y = t.getFullYear(), m = t.getMonth() - 1; const month = m < 0 ? 11 : m; const year = m < 0 ? y - 1 : y; const first = new Date(year, month, 1); const last = new Date(year, month + 1, 0); return [toYMD(first), toYMD(last)]; } },
];

function FilterSingleMonthGrid({ year, month, fromYmdStr, toYmdStr, onDayClick }) {
  const grid = useMemo(() => getCalendarGridSundayFirst(year, month), [year, month]);
  const isInRange = useCallback((d) => {
    const ymd = toYMD(d);
    if (!fromYmdStr || !toYmdStr || fromYmdStr === toYmdStr || !ymd) return false;
    return ymd > fromYmdStr && ymd < toYmdStr;
  }, [fromYmdStr, toYmdStr]);
  const isStart = useCallback((d) => toYMD(d) === fromYmdStr, [fromYmdStr]);
  const isEnd = useCallback((d) => toYMD(d) === toYmdStr, [fromYmdStr, toYmdStr]);

  return (
    <div style={{ minWidth: 200 }}>
      <div style={{ textAlign: "center", fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 10 }}>
        {new Date(year, month, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase()}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {DAYS_HEADER.map((day) => (
          <div key={day} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "#9ca3af", fontFamily: FONT }}>{day}</div>
        ))}
        {grid.map((row, ri) =>
          row.map((cell, ci) => {
            const inRange = isInRange(cell.date);
            const start = isStart(cell.date);
            const end = isEnd(cell.date);
            const selected = start || end;
            const otherMonth = !cell.currentMonth;
            return (
              <button
                key={`${ri}-${ci}`}
                type="button"
                onClick={() => onDayClick(cell.date)}
                style={{
                  border: "none",
                  borderRadius: "50%",
                  width: 28,
                  height: 28,
                  fontSize: 12,
                  fontFamily: FONT,
                  cursor: "pointer",
                  background: selected ? CALENDAR_BLUE : inRange ? CALENDAR_BLUE_LIGHT : "transparent",
                  color: selected ? "#fff" : otherMonth ? "#d1d5db" : "#374151",
                }}
              >
                {cell.date.getDate()}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function FilterDateRangePickerPopover({ dateFrom, dateTo, onDateFromChange, onDateToChange, onClear, onApply, onCancel, accentColor }) {
  const today = new Date();
  const [pendingFrom, setPendingFrom] = useState(dateFrom || null);
  const [pendingTo, setPendingTo] = useState(dateTo || null);
  const [leftYear, setLeftYear] = useState(() => (dateFrom ? new Date(dateFrom).getFullYear() : today.getFullYear()));
  const [leftMonth, setLeftMonth] = useState(() => (dateFrom ? new Date(dateFrom).getMonth() : today.getMonth()));
  const containerRef = useRef(null);

  useEffect(() => {
    setPendingFrom(dateFrom || null);
    setPendingTo(dateTo || null);
  }, [dateFrom, dateTo]);

  const rightYear = leftMonth === 11 ? leftYear + 1 : leftYear;
  const rightMonth = leftMonth === 11 ? 0 : leftMonth + 1;

  const handleDayClick = useCallback((d) => {
    const ymd = toYMD(d);
    if (!pendingFrom) {
      setPendingFrom(ymd);
      setPendingTo(ymd);
      return;
    }
    if (!pendingTo || pendingFrom === pendingTo) {
      if (ymd < pendingFrom) {
        setPendingFrom(ymd);
        setPendingTo(pendingFrom);
      } else {
        setPendingTo(ymd);
      }
      return;
    }
    setPendingFrom(ymd);
    setPendingTo(ymd);
  }, [pendingFrom, pendingTo]);

  const parseRangeText = (text) => {
    const t = (text || "").trim();
    const sep = t.includes("~") ? "~" : t.includes("→") ? "→" : null;
    const parts = sep ? t.split(sep).map((s) => s.trim()) : (t.match(/\d{4}-\d{2}-\d{2}/g) || []);
    const fromStr = (parts[0] || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || null;
    const toStr = (parts[1] || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || fromStr;
    const fromValid = fromStr && new Date(fromStr).toISOString().slice(0, 10) === fromStr;
    const toValid = toStr && new Date(toStr).toISOString().slice(0, 10) === toStr;
    if (fromValid) return [fromStr, toValid ? toStr : fromStr];
    return null;
  };

  const [rangeInput, setRangeInput] = useState((dateFrom && dateTo) ? `${dateFrom} ~ ${dateTo}` : "YYYY-MM-DD ~ YYYY-MM-DD");
  useEffect(() => {
    setRangeInput((pendingFrom && pendingTo) ? `${pendingFrom} ~ ${pendingTo}` : "YYYY-MM-DD ~ YYYY-MM-DD");
  }, [pendingFrom, pendingTo]);

  const applyRangeInput = () => {
    const parsed = parseRangeText(rangeInput);
    if (parsed) {
      const [fromStr, toStr] = parsed;
      setPendingFrom(fromStr);
      setPendingTo(toStr);
      if (onDateFromChange) onDateFromChange(fromStr);
      if (onDateToChange) onDateToChange(toStr);
      if (onApply) onApply();
    }
  };

  useEffect(() => {
    if (!onCancel) return;
    const handleClickOutside = (e) => {
      if (!containerRef.current?.contains(e.target)) onCancel();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onCancel]);

  return (
    <div
      ref={containerRef}
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
        overflow: "hidden",
        minWidth: 480,
      }}
    >
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="text"
          value={rangeInput}
          onChange={(e) => setRangeInput(e.target.value)}
          onBlur={applyRangeInput}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyRangeInput(); } }}
          placeholder="YYYY-MM-DD ~ YYYY-MM-DD"
          style={{ flex: 1, fontFamily: MONO, fontSize: 13, color: "#374151", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, outline: "none" }}
        />
        {(pendingFrom || pendingTo) && (
          <button type="button" onClick={() => { setPendingFrom(null); setPendingTo(null); setRangeInput("YYYY-MM-DD ~ YYYY-MM-DD"); onClear(); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#6b7280" }}>
            <CloseOutlined sx={{ fontSize: 18 }} />
          </button>
        )}
      </div>
      <div style={{ display: "flex" }}>
        <div style={{ width: 120, padding: "12px 8px", borderRight: "1px solid #e5e7eb" }}>
          {QUICK_SELECTS.map(({ label, getRange }) => (
            <button
              key={label}
              type="button"
              onClick={() => { const [from, to] = getRange(); setPendingFrom(from); setPendingTo(to); }}
              style={{ display: "block", width: "100%", padding: "8px 10px", marginBottom: 2, textAlign: "left", border: "none", background: "none", fontFamily: FONT, fontSize: 12, color: accentColor, cursor: "pointer", borderRadius: 6 }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, display: "flex", gap: 20, padding: 16, justifyContent: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
              <button type="button" onClick={() => { if (leftMonth === 0) { setLeftMonth(11); setLeftYear((y) => y - 1); } else setLeftMonth((m) => m - 1); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><ChevronLeft sx={{ fontSize: 20, color: "#6b7280" }} /></button>
              <select value={leftYear} onChange={(e) => setLeftYear(Number(e.target.value))} style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#374151", padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer" }}>
                {Array.from({ length: 31 }, (_, i) => 2000 + i).map((y) => (<option key={y} value={y}>{y}</option>))}
              </select>
              <button type="button" onClick={() => { if (leftMonth === 11) { setLeftMonth(0); setLeftYear((y) => y + 1); } else setLeftMonth((m) => m + 1); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><ChevronRight sx={{ fontSize: 20, color: "#6b7280" }} /></button>
            </div>
            <FilterSingleMonthGrid year={leftYear} month={leftMonth} fromYmdStr={pendingFrom} toYmdStr={pendingTo} onDayClick={handleDayClick} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
              <button type="button" onClick={() => { if (leftMonth === 0) { setLeftMonth(11); setLeftYear((y) => y - 1); } else setLeftMonth((m) => m - 1); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><ChevronLeft sx={{ fontSize: 20, color: "#6b7280" }} /></button>
              <select value={rightYear} onChange={(e) => { const y = Number(e.target.value); setLeftYear(rightMonth === 0 ? y - 1 : y); if (rightMonth === 0) setLeftMonth(11); }} style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#374151", padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer" }}>
                {Array.from({ length: 31 }, (_, i) => 2000 + i).map((y) => (<option key={y} value={y}>{y}</option>))}
              </select>
              <button type="button" onClick={() => { if (leftMonth === 11) { setLeftMonth(0); setLeftYear((y) => y + 1); } else setLeftMonth((m) => m + 1); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><ChevronRight sx={{ fontSize: 20, color: "#6b7280" }} /></button>
            </div>
            <FilterSingleMonthGrid year={rightYear} month={rightMonth} fromYmdStr={pendingFrom} toYmdStr={pendingTo} onDayClick={handleDayClick} />
          </div>
        </div>
      </div>
      <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onCancel} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}>Cancel</button>
        <button type="button" onClick={() => { onDateFromChange(pendingFrom); onDateToChange(pendingTo); onApply(); }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: accentColor, fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}>Apply</button>
      </div>
    </div>
  );
}

// ── Date filter bar (self-contained for Data Filtering) ──
function FilterDateFilterBar({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onClear,
  totalRows,
  filteredRows,
  accentColor,
  resamplingStepMinutes,
  onResamplingStepChange,
}) {
  const hasFilter = dateFrom || dateTo;
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [rangeText, setRangeText] = useState(() => (dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : ""));
  const [stepPopoverOpen, setStepPopoverOpen] = useState(false);
  const [stepDraftValue, setStepDraftValue] = useState(String(resamplingStepMinutes));
  const [resamplingInProgress, setResamplingInProgress] = useState(false);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const stepPopoverRef = useRef(null);
  const stepTriggerRef = useRef(null);

  useEffect(() => setRangeText((dateFrom && dateTo) ? `${dateFrom} → ${dateTo}` : ""), [dateFrom, dateTo]);
  useEffect(() => {
    if (stepPopoverOpen) setStepDraftValue(String(resamplingStepMinutes));
  }, [stepPopoverOpen, resamplingStepMinutes]);

  useEffect(() => {
    if (!calendarOpen) return;
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || popoverRef.current?.contains(e.target)) return;
      setCalendarOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [calendarOpen]);

  useEffect(() => {
    if (!stepPopoverOpen) return;
    const onDown = (e) => {
      if (stepTriggerRef.current?.contains(e.target) || stepPopoverRef.current?.contains(e.target)) return;
      if (resamplingInProgress) return;
      setStepPopoverOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [stepPopoverOpen, resamplingInProgress]);

  const handleValidateStep = () => {
    const v = parseInt(stepDraftValue, 10);
    if (Number.isNaN(v) || v < 1 || v > 1440) return;
    setResamplingInProgress(true);
    onResamplingStepChange(v);
    setTimeout(() => {
      setResamplingInProgress(false);
      setStepPopoverOpen(false);
    }, 500);
  };

  const applyRangeText = () => {
    const parsed = parseRangeTextBar(rangeText);
    if (parsed) {
      onDateFromChange(parsed[0]);
      onDateToChange(parsed[1]);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "16px 20px",
        background: "#F8FAFC",
        borderRadius: 14,
        border: "1px solid #E2E8F0",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div
          ref={triggerRef}
          role="button"
          tabIndex={0}
          onClick={() => setCalendarOpen((o) => !o)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setCalendarOpen((o) => !o); }}
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: `${accentColor}14`,
              border: `1px solid ${accentColor}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CalendarMonthOutlined sx={{ fontSize: 20, color: accentColor }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>Date range</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <input
            type="text"
            value={rangeText}
            onChange={(e) => setRangeText(e.target.value)}
            onBlur={applyRangeText}
            onKeyDown={(e) => e.key === "Enter" && applyRangeText()}
            placeholder="YYYY-MM-DD → YYYY-MM-DD"
            style={{
              width: 260,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1.5px solid #E2E8F0",
              fontFamily: MONO,
              fontSize: 13,
              color: "#0F172A",
              background: "#fff",
              outline: "none",
            }}
          />
          {hasFilter && (
            <>
              <button
                type="button"
                onClick={onClear}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1.5px solid #E2E8F0",
                  background: "#fff",
                  fontFamily: FONT,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#64748B",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
              <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: MONO }}>
                Showing {filteredRows} of {totalRows} rows
              </span>
            </>
          )}
        </div>
        {onResamplingStepChange != null && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
            <span style={{ fontSize: 12, color: "#64748B", fontFamily: FONT, whiteSpace: "nowrap" }}>Resampling step (min)</span>
            <div
              ref={stepTriggerRef}
              role="button"
              tabIndex={0}
              onClick={() => setStepPopoverOpen(true)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setStepPopoverOpen(true)}
              style={{
                minWidth: 56,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1.5px solid #E2E8F0",
                fontFamily: MONO,
                fontSize: 13,
                color: "#0F172A",
                background: "#fff",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {resamplingStepMinutes}
            </div>
            {stepPopoverOpen && (
              <div
                ref={stepPopoverRef}
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 8,
                  zIndex: 1001,
                  background: "#fff",
                  borderRadius: 12,
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
                  padding: 16,
                  minWidth: 220,
                }}
              >
                {resamplingInProgress ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "20px 16px" }}>
                    <Spinner color={accentColor} size={28} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#64748B", fontFamily: FONT }}>Resampling data...</span>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 10, fontFamily: FONT }}>Resampling step (minutes)</div>
                    <input
                      type="text"
                      value={stepDraftValue}
                      onChange={(e) => setStepDraftValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleValidateStep()}
                      placeholder="e.g. 10"
                      autoFocus
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1.5px solid #E2E8F0",
                        fontFamily: MONO,
                        fontSize: 13,
                        color: "#0F172A",
                        background: "#fff",
                        outline: "none",
                        marginBottom: 12,
                        boxSizing: "border-box",
                      }}
                    />
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<RotateLeftOutlinedIcon />}
                        onClick={() => { setStepDraftValue(String(resamplingStepMinutes)); setStepPopoverOpen(false); }}
                        sx={{
                          borderRadius: 2,
                          textTransform: "none",
                          border: "1px solid #E2E8F0",
                          color: "#64748B",
                          backgroundColor: "#F1F5F9",
                          "&:hover": {
                            border: "1px solid #ff4d6d",
                            color: "#ff4d6d",
                            backgroundColor: "rgba(255,77,109,0.08)",
                          },
                          "&:active": {
                            border: "1px solid #ff4d6d",
                            color: "#ff4d6d",
                            backgroundColor: "rgba(255,77,109,0.15)",
                          },
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<BookmarkAddedOutlinedIcon />}
                        onClick={handleValidateStep}
                        disabled={(() => {
                          const v = parseInt(stepDraftValue, 10);
                          return Number.isNaN(v) || v < 1 || v > 1440;
                        })()}
                        sx={{
                          borderRadius: 2,
                          textTransform: "none",
                          border: "1px solid #E2E8F0",
                          color: "#64748B",
                          backgroundColor: "#F1F5F9",
                          "&:hover": {
                            border: "1px solid #52b788",
                            color: "#52b788",
                            backgroundColor: "rgba(82,183,136,0.08)",
                          },
                          "&:active": {
                            border: "1px solid #52b788",
                            color: "#52b788",
                            backgroundColor: "rgba(82,183,136,0.15)",
                          },
                        }}
                      >
                        Apply
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {calendarOpen && (
        <div ref={popoverRef} style={{ position: "absolute", top: "100%", left: 0, marginTop: 8, zIndex: 1000 }}>
          <FilterDateRangePickerPopover
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={onDateFromChange}
            onDateToChange={onDateToChange}
            onClear={onClear}
            onApply={() => setCalendarOpen(false)}
            onCancel={() => setCalendarOpen(false)}
            accentColor={accentColor}
          />
        </div>
      )}
    </div>
  );
}

// ── PV Data table (Data Filtering only) ──
const ROW_NUM_ID = "_rowNum";

function FilterCSVTable({ title, icon, color, headers, rows, resampled, originalRows, resampledStepMinutes = 10, defaultVisibleLabels }) {
  const [expanded, setExpanded] = useState(false);
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const columns = useMemo(
    () => [
      { id: ROW_NUM_ID, label: "#" },
      ...safeHeaders.map((h, i) => ({
        id: i,
        label: formatHeaderWithUnit(String(h ?? "").trim() || `Column ${i + 1}`),
      })),
    ],
    [safeHeaders]
  );
  const defaultVisibleIds = useMemo(() => {
    if (defaultVisibleLabels && defaultVisibleLabels.length > 0 && columns.length > 1) {
      const lowerLabels = defaultVisibleLabels.map((l) => String(l).toLowerCase());
      const ids = [ROW_NUM_ID];
      columns.forEach((c) => {
        if (c.id !== ROW_NUM_ID && lowerLabels.includes(c.label.toLowerCase())) ids.push(c.id);
      });
      if (ids.length > 1) return ids;
    }
    return columns.map((c) => c.id);
  }, [columns, defaultVisibleLabels]);
  const [visibleIds, setVisibleIds] = useState(() => defaultVisibleIds);
  const visibleColumns = useMemo(() => columns.filter((c) => visibleIds.includes(c.id)), [columns, visibleIds]);

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          cursor: "pointer",
          userSelect: "none",
          borderBottom: expanded ? "1px solid #E2E8F0" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {icon}
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>{title}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color, background: `${color}14`, padding: "2px 10px", borderRadius: 20, fontFamily: MONO }}>
            {safeRows.length} rows × {visibleColumns.length} cols
          </span>
          {resampled && (
            <span style={{ fontSize: 11, fontWeight: 600, color: Y, background: `${Y}14`, padding: "2px 10px", borderRadius: 20, fontFamily: MONO }}>
              {resampledStepMinutes} min resampled{originalRows ? ` (from ${originalRows})` : ""}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <TableColumnSelector columns={columns} visibleIds={visibleIds} onVisibleChange={setVisibleIds} defaultVisibleIds={defaultVisibleIds} />
          {expanded ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} /> : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />}
        </div>
      </div>
      {expanded && (
        <div style={{ overflowX: "auto", maxHeight: 370, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: MONO }}>
            <thead>
              <tr>
                {visibleColumns.map((c) => (
                  <th key={c.id} style={thStyle}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeRows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                  {visibleColumns.map((c) => (
                    <td key={c.id} style={c.id === ROW_NUM_ID ? { ...tdStyle, color: "#94a3b8", fontWeight: 600 } : tdStyle}>
                      {c.id === ROW_NUM_ID
                        ? ri + 1
                        : (() => {
                            const raw = Array.isArray(row) ? row[c.id] ?? "" : "";
                            if (raw === "" || raw === null || raw === undefined) return "";
                            const num = Number(raw);
                            if (!Number.isFinite(num)) return raw;
                            return num.toFixed(2);
                          })()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {expanded && safeRows.length > 10 && (
        <div style={{ padding: "8px 20px", fontSize: 12, color: "#94a3b8", fontFamily: FONT, borderTop: "1px solid #E2E8F0" }}>
          Scroll to see all {safeRows.length} rows
        </div>
      )}
    </div>
  );
}

// ── Power vs PVWatts comparison chart (Data Filtering only) ──
function PdcComparisonChart({ comparisonData }) {
  const [expanded, setExpanded] = useState(true);
  if (!comparisonData || comparisonData.length === 0) return null;

  const x = comparisonData.map((d) => d.time);
  const pdcY = comparisonData.map((d) => d.Power);
  const pvWattsY = comparisonData.map((d) => d.PVWatts);

  const chartData = [
    {
      x,
      y: pdcY,
      type: "scatter",
      mode: "lines",
      name: "Power (measured, kW)",
      line: { color: O, width: 1.5, shape: "spline", smoothing: 1.2 },
      hovertemplate: "<b>Power</b>: %{y}<extra></extra>",
    },
    {
      x,
      y: pvWattsY,
      type: "scatter",
      mode: "lines",
      name: "PVWatts (theoretical, kW)",
      line: { color: B, width: 1.5, shape: "spline", smoothing: 1.2 },
      hovertemplate: "<b>PVWatts (kW)</b>: %{y}<extra></extra>",
    },
  ];

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden", marginTop: 20 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          cursor: "pointer",
          userSelect: "none",
          borderBottom: expanded ? "1px solid #E2E8F0" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ShowChartOutlined sx={{ fontSize: 20, color: DF }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>Power vs PVWatts</span>
        </div>
        {expanded ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} /> : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />}
      </div>
      {expanded && (
        <div style={{ padding: "8px 12px 12px" }}>
          <Plot
            data={chartData}
            layout={{
              height: 320,
              margin: { t: 44, r: 40, b: 50, l: 60 },
              hovermode: "x unified",
              showlegend: true,
              legend: { orientation: "h", x: 0.5, y: 1.02, xanchor: "center", yanchor: "bottom", font: { family: FONT, size: 11 } },
              xaxis: {
                title: { text: "Time", font: { family: FONT, size: 12, color: "#94a3b8" } },
                gridcolor: "#F1F5F9",
                tickfont: { family: MONO, size: 10, color: "#94a3b8" },
              },
              yaxis: {
                title: { text: "Power (kW)", font: { family: FONT, size: 12, color: "#94a3b8" } },
                gridcolor: "#F1F5F9",
                tickfont: { family: MONO, size: 10, color: "#94a3b8" },
              },
              plot_bgcolor: "#fff",
              paper_bgcolor: "#fff",
              font: { family: FONT },
            }}
            config={{ displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] }}
            style={{ width: "100%" }}
          />
        </div>
      )}
    </div>
  );
}

// ── Measured Vs Calculated Power (filtered + removed points) ──
function PdcFilterChart({ comparisonData, filterResult, resampleMinutes }) {
  const [expanded, setExpanded] = useState(true);
  const chartSpec = useMemo(() => {
    if (!comparisonData || comparisonData.length === 0) return null;
    const times = comparisonData.map((d) => d.time);
    const pdcRaw = comparisonData.map((d) => d.Power);
    const pvRaw = comparisonData.map((d) => d.PVWatts);

    const traces = [
      {
        x: times,
        y: pdcRaw,
        type: "scatter",
        mode: "lines",
        name: "Power",
        line: { color: "#2563eb", width: 1.5, shape: "spline", smoothing: 1.2 },
        connectgaps: true,
      },
      {
        x: times,
        y: pvRaw,
        type: "scatter",
        mode: "lines",
        name: "PVWatts",
        line: { color: "#16a34a", width: 1.5, shape: "spline", smoothing: 1.2 },
        connectgaps: true,
      },
    ];

    if (filterResult?.filtered?.length) {
      const ft = filterResult.filtered.map((d) => d.time);
      const fpdc = filterResult.filtered.map((d) => d.Power);
      // Map time -> Power for filtered points only (raw values)
      const filteredTimeToY = new Map();
      ft.forEach((t, i) => filteredTimeToY.set(t, fpdc[i]));
      // Use full time grid: null where point was removed so line does not link across gaps
      const filteredYOnFullGrid = times.map((t) => (filteredTimeToY.has(t) ? filteredTimeToY.get(t) : null));
      traces.push({
        x: times,
        y: filteredYOnFullGrid,
        type: "scatter",
        mode: "lines",
        name: "Filtered Data",
        line: { color: "#ea580c", width: 1.5, shape: "spline", smoothing: 1.2, dash: "dash" },
        connectgaps: false,
      });
    }

    if (filterResult?.labeled) {
      const removed = filterResult.labeled.filter((r) => r.status === "removed");
      if (removed.length > 0) {
        traces.push({
          x: removed.map((r) => r.time),
          y: removed.map((r) => r.Power),
          type: "scatter",
          mode: "markers",
          name: "Removed Points",
          marker: { color: "#DE3163", size: 4, symbol: "x", line: { width: 1, color: "#DE3163" } },
        });
      }
    }

    return { traces, title: `Measured Vs Calculated Power (resampled every ${resampleMinutes ?? 10} min)` };
  }, [comparisonData, filterResult, resampleMinutes]);

  if (!chartSpec) return null;

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden", marginTop: 20 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          cursor: "pointer",
          userSelect: "none",
          borderBottom: expanded ? "1px solid #E2E8F0" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ShowChartOutlined sx={{ fontSize: 20, color: DF }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>{chartSpec.title}</span>
        </div>
        {expanded ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} /> : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />}
      </div>
      {expanded && (
        <div style={{ padding: "8px 12px 12px" }}>
          <Plot
            data={chartSpec.traces}
            layout={{
              height: 340,
              margin: { t: 44, r: 40, b: 50, l: 60 },
              hovermode: "x unified",
              showlegend: true,
              legend: { orientation: "h", x: 0.5, y: 1.02, xanchor: "center", yanchor: "bottom", font: { family: FONT, size: 11 } },
              title: { text: "", font: { size: 0 } },
              xaxis: {
                title: { text: "Time", font: { family: FONT, size: 12, color: "#94a3b8" } },
                gridcolor: "#F1F5F9",
                tickfont: { family: MONO, size: 10, color: "#94a3b8" },
              },
              yaxis: {
                title: { text: "Power (kW)", font: { family: FONT, size: 12, color: "#94a3b8" } },
                gridcolor: "#F1F5F9",
                tickfont: { family: MONO, size: 10, color: "#94a3b8" },
              },
              plot_bgcolor: "#fff",
              paper_bgcolor: "#fff",
              font: { family: FONT },
            }}
            config={{ displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] }}
            style={{ width: "100%" }}
          />
        </div>
      )}
    </div>
  );
}

// ── Power vs weather_POA correlation scatter (above Labeled data table), data from labeled_data ──
const CORRELATION_PURPLE = "#7c3aed";

function PdcPvWattsCorrelationChart({ data }) {
  const [collapsed, setCollapsed] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'valid' | 'removed'

  const filteredByStatus = useMemo(() => {
    if (!Array.isArray(data)) return [];
    if (statusFilter === "all") return data;
    return data.filter((d) => d.status === statusFilter);
  }, [data, statusFilter]);

  const chartSpec = useMemo(() => {
    if (filteredByStatus.length === 0) return null;
    const validColor = Y;   // green
    const removedColor = DF; // red
    const validPoints = { x: [], y: [] };
    const removedPoints = { x: [], y: [] };
    const allX = [];
    const allY = [];
    for (const d of filteredByStatus) {
      const gti = d.weather_POA != null ? Number(d.weather_POA) : NaN;
      const pdc = d.Power != null ? Number(d.Power) : NaN;
      if (Number.isFinite(gti) && Number.isFinite(pdc)) {
        allX.push(gti);
        allY.push(pdc);
        if (d.status === "valid") {
          validPoints.x.push(gti);
          validPoints.y.push(pdc);
        } else {
          removedPoints.x.push(gti);
          removedPoints.y.push(pdc);
        }
      }
    }
    if (allX.length < 2) return null;
    const { slope, intercept, r2 } = linearRegression(allX, allY);
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const lineX = [minX, maxX];
    const lineY = [slope * minX + intercept, slope * maxX + intercept];

    const markerBase = { size: 6, opacity: 0.7, line: { width: 1, color: "rgba(255,255,255,0.9)" }, symbol: "circle" };
    const scatterTraces = [];
    if (statusFilter === "all") {
      if (validPoints.x.length > 0) {
        scatterTraces.push({
          x: validPoints.x,
          y: validPoints.y,
          type: "scatter",
          mode: "markers",
          name: "Valid",
          marker: { ...markerBase, color: validColor },
          hovertemplate: "<b>Valid</b><br>weather_POA: %{x:.2f}<br>Power: %{y:.2f}<extra></extra>",
        });
      }
      if (removedPoints.x.length > 0) {
        scatterTraces.push({
          x: removedPoints.x,
          y: removedPoints.y,
          type: "scatter",
          mode: "markers",
          name: "Removed",
          marker: { ...markerBase, color: removedColor },
          hovertemplate: "<b>Removed</b><br>weather_POA: %{x:.2f}<br>Power: %{y:.2f}<extra></extra>",
        });
      }
    } else {
      scatterTraces.push({
        x: allX,
        y: allY,
        type: "scatter",
        mode: "markers",
        name: statusFilter === "valid" ? "Valid" : "Removed",
        marker: { ...markerBase, color: statusFilter === "valid" ? validColor : removedColor },
        hovertemplate: "<b>weather_POA</b>: %{x:.2f}<br><b>Power</b>: %{y:.2f}<extra></extra>",
      });
    }
    const traceLine = {
      x: lineX,
      y: lineY,
      type: "scatter",
      mode: "lines",
      name: `Trend (R² = ${r2.toFixed(3)})`,
      line: { color: DF, width: 2.5 },
      hovertemplate: "Trend: Power = %{y:.2f}<extra></extra>",
    };

    const layout = {
      height: 360,
      margin: { t: 32, r: 40, b: 56, l: 60 },
      hovermode: "x unified",
      showlegend: true,
      legend: {
        x: 1,
        y: 1.02,
        xanchor: "right",
        yanchor: "bottom",
        font: { family: FONT, size: 12, color: "#475569" },
        bgcolor: "rgba(255,255,255,0.9)",
        bordercolor: "#E2E8F0",
        borderwidth: 1,
      },
      xaxis: {
        title: { text: formatHeaderWithUnit("weather_POA"), font: { family: FONT, size: 13, color: "#334155" } },
        gridcolor: "#E2E8F0",
        zerolinecolor: "#E2E8F0",
        tickfont: { family: MONO, size: 11, color: "#64748B" },
        showline: true,
        linecolor: "#E2E8F0",
      },
      yaxis: {
        title: { text: formatHeaderWithUnit("Power"), font: { family: FONT, size: 13, color: "#334155" } },
        gridcolor: "#E2E8F0",
        zerolinecolor: "#E2E8F0",
        tickfont: { family: MONO, size: 11, color: "#64748B" },
        showline: true,
        linecolor: "#E2E8F0",
      },
      plot_bgcolor: "#FFFFFF",
      paper_bgcolor: "#FFFFFF",
      font: { family: FONT },
    };
    return { traces: [...scatterTraces, traceLine], layout };
  }, [filteredByStatus, statusFilter]);

  if (!Array.isArray(data) || data.length === 0) return null;

  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 16,
        border: "1px solid #E2E8F0",
        boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
        padding: "16px 18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        marginTop: 20,
      }}
    >
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          cursor: "pointer",
          userSelect: "none",
          borderBottom: !collapsed ? "1px solid #E2E8F0" : "none",
          paddingBottom: !collapsed ? 14 : 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              background: `${CORRELATION_PURPLE}18`,
              border: `1px solid ${CORRELATION_PURPLE}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <TimelineOutlined sx={{ fontSize: 18, color: CORRELATION_PURPLE }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
              Power vs weather_POA — Correlation
            </span>
            <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>
              Data from labeled_data. Filter by status to change points shown.
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!collapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
              {[
                { opt: "all", color: B },
                { opt: "valid", color: Y },
                { opt: "removed", color: DF },
              ].map(({ opt, color }) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setStatusFilter(opt)}
                  style={{
                    padding: "4px 10px",
                    border: `1px solid ${statusFilter === opt ? color : "#E2E8F0"}`,
                    borderRadius: 8,
                    background: statusFilter === opt ? `${color}14` : "#fff",
                    color: statusFilter === opt ? color : "#64748B",
                    fontFamily: FONT,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
          {collapsed ? <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} /> : <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} />}
        </div>
      </div>
      {!collapsed && (chartSpec ? (
      <Plot
        data={chartSpec.traces}
        layout={chartSpec.layout}
        config={{ displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] }}
        style={{ width: "100%" }}
      />
      ) : (
        <div style={{ height: 360, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontFamily: FONT, fontSize: 13 }}>
          No data points for selected status ({statusFilter}). Choose another filter or ensure labeled_data has weather_POA and Power.
        </div>
      ))}
    </div>
  );
}

// ── Labeled data table (labeled_df) below Measured Vs Calculated Power ──
const FILTERED_TABLE_COLUMNS = [
  { id: "rowNum", label: "#" },
  { id: "time", label: "Time" },
  { id: "Power", label: "Power" },
  { id: "PVWatts", label: "PVWatts" },
  { id: "rel_error", label: "rel_error" },
  { id: "status", label: "Status" },
];

function FilteredDataTable({ data, title = "Filtered Data" }) {
  const [expanded, setExpanded] = useState(false);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'valid' | 'removed'
  const statusFilterRef = useRef(null);
  const statusPopoverRef = useRef(null);

  const defaultVisibleIds = useMemo(() => FILTERED_TABLE_COLUMNS.map((c) => c.id), []);
  const [visibleIds, setVisibleIds] = useState(() => defaultVisibleIds);
  const visibleColumns = useMemo(() => FILTERED_TABLE_COLUMNS.filter((c) => visibleIds.includes(c.id)), [visibleIds]);

  const rows = Array.isArray(data) ? data : [];
  const filteredRows = useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  useEffect(() => {
    if (!statusFilterOpen) return;
    const onDown = (e) => {
      if (statusFilterRef.current?.contains(e.target) || statusPopoverRef.current?.contains(e.target)) return;
      setStatusFilterOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [statusFilterOpen]);

  const renderCell = (colId, d, ri) => {
    if (colId === "rowNum") return ri + 1;
    if (colId === "time") return d.time ?? "";
    if (colId === "Power") return d.Power != null ? Number(d.Power).toFixed(2) : "";
    if (colId === "PVWatts") return d.PVWatts != null ? Number(d.PVWatts).toFixed(2) : "";
    if (colId === "rel_error") return d.rel_error != null ? (Number(d.rel_error) * 100).toFixed(2) + "%" : "";
    if (colId === "status") return d.status ?? "";
    return "";
  };

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden", marginTop: 20 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          cursor: "pointer",
          userSelect: "none",
          borderBottom: expanded ? "1px solid #E2E8F0" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <FilterAltOutlined sx={{ fontSize: 20, color: DF }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>{title}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: DF, background: `${DF}14`, padding: "2px 10px", borderRadius: 20, fontFamily: FONT }}>
            {statusFilter === "all" ? `${rows.length} rows` : `${filteredRows.length} of ${rows.length} rows`}
            {visibleColumns.length < FILTERED_TABLE_COLUMNS.length ? ` × ${visibleColumns.length} cols` : ""}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <TableColumnSelector columns={FILTERED_TABLE_COLUMNS} visibleIds={visibleIds} onVisibleChange={setVisibleIds} defaultVisibleIds={defaultVisibleIds} />
          {expanded ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} /> : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />}
        </div>
      </div>
      {expanded && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "8px 14px 4px",
              borderBottom: "1px solid #F1F5F9",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {[
              { opt: "all", color: B },
              { opt: "valid", color: Y },
              { opt: "removed", color: DF },
            ].map(({ opt, color }) => (
              <button
                key={opt}
                type="button"
                onClick={() => setStatusFilter(opt)}
                style={{
                  padding: "4px 10px",
                  border: `1px solid ${statusFilter === opt ? color : "#E2E8F0"}`,
                  borderRadius: 8,
                  background: statusFilter === opt ? `${color}14` : "#fff",
                  color: statusFilter === opt ? color : "#64748B",
                  fontFamily: FONT,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
          <div style={{ overflowX: "auto", maxHeight: 370, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT }}>
            <thead>
              <tr>
                {visibleColumns.map((c) => (
                  <th key={c.id} style={thStyle}>
                    {c.id === "status" ? (
                      <>
                        <span>Status</span>
                        <button
                          ref={statusFilterRef}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setStatusFilterOpen((v) => !v); }}
                          style={{
                            marginLeft: 6,
                            padding: 2,
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            verticalAlign: "middle",
                          }}
                          title="Filter by status"
                        >
                          <FilterAltOutlined sx={{ fontSize: 14, color: statusFilter !== "all" ? DF : "#94a3b8" }} />
                        </button>
                        {statusFilterOpen && (
                          <div
                            ref={statusPopoverRef}
                            style={{
                              position: "absolute",
                              top: "100%",
                              left: 0,
                              marginTop: 4,
                              background: "#fff",
                              border: "1px solid #E2E8F0",
                              borderRadius: 10,
                              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                              zIndex: 50,
                              minWidth: 120,
                              padding: "6px 0",
                            }}
                          >
                            {[
                              { opt: "all", color: B },
                              { opt: "valid", color: Y },
                              { opt: "removed", color: DF },
                            ].map(({ opt, color }) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => { setStatusFilter(opt); setStatusFilterOpen(false); }}
                                style={{
                                  width: "100%",
                                  padding: "6px 12px",
                                  border: "none",
                                  background: statusFilter === opt ? `${color}14` : "transparent",
                                  color: statusFilter === opt ? color : "#334155",
                                  fontFamily: FONT,
                                  fontSize: 12,
                                  textAlign: "left",
                                  cursor: "pointer",
                                  textTransform: "capitalize",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                {opt}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((d, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                  {visibleColumns.map((c) => (
                    <td key={c.id} style={c.id === "rowNum" ? { ...tdStyle, color: "#94a3b8", fontWeight: 600 } : tdStyle}>
                      {renderCell(c.id, d, ri)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Column multi-select for chart (Data Filtering only) ──
const CHART_COLORS_LEFT = ["#2563eb", "#dc2626", "#16a34a"];
const CHART_COLORS_RIGHT = ["#d97706", "#7c3aed", "#0891b2"];

function FilterColumnMultiSelect({ options, selected, onChange, label }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selectedLabels = useMemo(() => {
    const map = new Map(options.map((o) => [o.index, o.header]));
    return selected.map((i) => map.get(i)).filter(Boolean);
  }, [options, selected]);

  const buttonText = selectedLabels.length === 0 ? (label ? `${label} (select)` : "Select columns") : selectedLabels.slice(0, 2).join(", ") + (selectedLabels.length > 2 ? ` +${selectedLabels.length - 2}` : "");

  return (
    <div style={{ position: "relative", minWidth: 126 }}>
      {label && (
        <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 500, color: "#94a3b8", marginBottom: 2 }}>{label}</div>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          padding: "5px 8px",
          borderRadius: 8,
          border: "1px solid #E2E8F0",
          background: "#FAFBFC",
          cursor: "pointer",
          fontFamily: FONT,
          color: "#475569",
          fontSize: 11,
          fontWeight: 500,
        }}
        title={label || "Select columns"}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {buttonText}
        </span>
        <span style={{ display: "flex", alignItems: "center", color: "#94a3b8" }}>
          {open ? <ExpandLessIcon sx={{ fontSize: 14 }} /> : <ExpandMoreIcon sx={{ fontSize: 14 }} />}
        </span>
      </button>
      {open && (
        <div
          ref={popRef}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 20,
            width: 280,
            maxHeight: 280,
            overflow: "auto",
            background: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(2, 6, 23, 0.1)",
            padding: 8,
          }}
        >
          <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 500, color: "#94a3b8", padding: "2px 6px 4px" }}>{label ? `${label} — columns` : "Columns"}</div>
          {options.map((opt) => {
            const checked = selected.includes(opt.index);
            return (
              <button
                key={opt.index}
                type="button"
                onClick={() => {
                  const next = checked ? selected.filter((i) => i !== opt.index) : [...selected, opt.index];
                  onChange(next.length ? next : [options[0]?.index ?? 0]);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "6px 8px",
                  border: "none",
                  background: checked ? "#EEF2FF" : "transparent",
                  borderRadius: 8,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: FONT,
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      border: checked ? "none" : "1px solid #CBD5E1",
                      background: checked ? DF : "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {checked && <CheckCircleOutline sx={{ fontSize: 10, color: "#fff" }} />}
                  </span>
                  <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 500, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {opt.header}
                  </span>
                </span>
                <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 500, color: "#94a3b8" }}>#{opt.index}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PV Data chart with dual Y-axis (Data Filtering only) ──
function FilterCSVChart({ title, color, headers, rows, defaultYHeader, defaultRightYHeader }) {
  const [expanded, setExpanded] = useState(true);
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const safeRows = Array.isArray(rows) ? rows : [];

  const plottableCols = useMemo(() => {
    return safeHeaders
      .map((h, i) => ({ header: h, index: i }))
      .filter(({ index }) => {
        const sample = safeRows.slice(0, Math.min(100, safeRows.length));
        let numCount = 0;
        for (const row of sample) {
          const raw = (Array.isArray(row) ? (row[index] ?? "") : "").trim();
          if (raw === "") continue;
          const n = parseFloat(raw);
          if (!isNaN(n) && isFinite(n)) numCount++;
        }
        return numCount >= Math.max(2, sample.length * 0.15);
      });
  }, [safeHeaders, safeRows]);

  const defaultLeftIdx = useMemo(() => {
    if (plottableCols.length === 0) return [];
    if (defaultYHeader && safeHeaders.length > 1) {
      const target = String(defaultYHeader).trim().toLowerCase();
      const idx = safeHeaders.findIndex((h, i) => i > 0 && String(h ?? "").trim().toLowerCase() === target);
      if (idx > 0 && plottableCols.some((c) => c.index === idx)) return [idx];
    }
    return [plottableCols[0].index];
  }, [safeHeaders, defaultYHeader, plottableCols]);

  const defaultRightIdx = useMemo(() => {
    if (plottableCols.length === 0) return [];
    const candidates = [defaultRightYHeader, "weather_POA"].filter(Boolean).map((h) => String(h).trim().toLowerCase());
    for (const target of candidates) {
      const idx = safeHeaders.findIndex((h, i) => i > 0 && String(h ?? "").trim().toLowerCase() === target);
      if (idx > 0 && plottableCols.some((c) => c.index === idx)) return [idx];
    }
    return [];
  }, [safeHeaders, defaultRightYHeader, plottableCols]);

  const [selectedIndicesLeft, setSelectedIndicesLeft] = useState(() => defaultLeftIdx);
  const [selectedIndicesRight, setSelectedIndicesRight] = useState(() => defaultRightIdx);

  const xValues = useMemo(() => {
    if (safeRows.length === 0) return [];
    return safeRows.map((r) => (Array.isArray(r) ? r[0] : ""));
  }, [safeHeaders, safeRows]);

  const chartData = useMemo(() => {
    const traces = [];
    selectedIndicesLeft.forEach((colIndex, i) => {
      const yValues = safeRows.map((r) => {
        const v = parseFloat(Array.isArray(r) ? r[colIndex] : "");
        return isNaN(v) ? null : v;
      });
      traces.push({
        x: xValues,
        y: yValues,
        type: "scatter",
        mode: "lines",
        connectgaps: false,
        name: (safeHeaders[colIndex] ?? `Col ${colIndex}`) + " (L)",
        line: { color: CHART_COLORS_LEFT[i % CHART_COLORS_LEFT.length], width: 1.5, shape: "spline", smoothing: 1.2 },
        hovertemplate: "<b>%{fullData.name}</b>: %{y}<extra></extra>",
        yaxis: "y",
      });
    });
    selectedIndicesRight.forEach((colIndex, i) => {
      const yValues = safeRows.map((r) => {
        const v = parseFloat(Array.isArray(r) ? r[colIndex] : "");
        return isNaN(v) ? null : v;
      });
      traces.push({
        x: xValues,
        y: yValues,
        type: "scatter",
        mode: "lines",
        connectgaps: false,
        name: (safeHeaders[colIndex] ?? `Col ${colIndex}`) + " (R)",
        line: { color: CHART_COLORS_RIGHT[i % CHART_COLORS_RIGHT.length], width: 1.5, shape: "spline", smoothing: 1.2 },
        hovertemplate: "<b>%{fullData.name}</b>: %{y}<extra></extra>",
        yaxis: "y2",
      });
    });
    return traces;
  }, [safeRows, safeHeaders, selectedIndicesLeft, selectedIndicesRight, xValues]);

  const hasLeft = selectedIndicesLeft.length > 0;
  const hasRight = selectedIndicesRight.length > 0;
  const leftTitle = hasLeft && selectedIndicesLeft.length === 1 ? formatHeaderWithUnit(safeHeaders[selectedIndicesLeft[0]] ?? "Left") : "Left Y-axis";
  const rightTitle = hasRight && selectedIndicesRight.length === 1 ? formatHeaderWithUnit(safeHeaders[selectedIndicesRight[0]] ?? "Right") : "Right Y-axis";

  if (plottableCols.length === 0) return null;

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          cursor: "pointer",
          userSelect: "none",
          borderBottom: expanded ? "1px solid #E2E8F0" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TimelineOutlined sx={{ fontSize: 20, color }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>{title} — Chart</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }} onClick={(e) => e.stopPropagation()}>
          <FilterColumnMultiSelect label="Left Y-axis" options={plottableCols} selected={selectedIndicesLeft} onChange={setSelectedIndicesLeft} />
          <FilterColumnMultiSelect label="Right Y-axis" options={plottableCols} selected={selectedIndicesRight} onChange={setSelectedIndicesRight} />
          {expanded ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} /> : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "8px 12px 12px" }}>
          {chartData.length === 0 ? (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontFamily: FONT }}>Select at least one column from Left or Right Y-axis</div>
          ) : (
            <Plot
              data={chartData}
              layout={{
                height: 340,
                margin: { t: 44, r: 60, b: 50, l: 60 },
                hovermode: "x unified",
                showlegend: chartData.length > 1,
                legend: { orientation: "h", x: 0.5, y: 1.02, xanchor: "center", yanchor: "bottom", font: { family: FONT, size: 11 } },
                xaxis: {
                  title: { text: formatHeaderWithUnit(safeHeaders[0] ?? "Index"), font: { family: FONT, size: 12, color: "#94a3b8" } },
                  gridcolor: "#F1F5F9",
                  tickfont: { family: MONO, size: 10, color: "#94a3b8" },
                  rangeslider: { visible: false },
                },
                yaxis: {
                  title: { text: leftTitle, font: { family: FONT, size: 12, color: "#94a3b8" } },
                  gridcolor: "#F1F5F9",
                  tickfont: { family: MONO, size: 10, color: "#94a3b8" },
                  side: "left",
                },
                yaxis2: {
                  title: { text: rightTitle, font: { family: FONT, size: 12, color: "#94a3b8" } },
                  gridcolor: "transparent",
                  tickfont: { family: MONO, size: 10, color: "#94a3b8" },
                  overlaying: "y",
                  side: "right",
                },
                plot_bgcolor: "#fff",
                paper_bgcolor: "#fff",
                font: { family: FONT },
              }}
              config={{ displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] }}
              style={{ width: "100%" }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ClearSkyDaysChart({ title, color, headers, rows, systemInfo }) {
  const [expanded, setExpanded] = useState(true);
  const [ktMin, setKtMin] = useState(KT_CLEAR_MIN);
  const [ktMax, setKtMax] = useState(KT_CLEAR_MAX);
  const [editingKt, setEditingKt] = useState(false);
  const [ktMinInput, setKtMinInput] = useState(String(KT_CLEAR_MIN));
  const [ktMaxInput, setKtMaxInput] = useState(String(KT_CLEAR_MAX));
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const cfg = systemInfo && typeof systemInfo === "object" ? (systemInfo.config || systemInfo) : null;
  const latitude = Number(cfg?.latitude);
  const longitude = Number(cfg?.longitude);
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;

  const derived = useMemo(() => {
    if (!safeHeaders.length || !safeRows.length) return null;
    if (!hasCoords) return { error: "missing_coords" };

    const timeIdx = getDateColumnIndex(safeHeaders);
    const ghiIdx = getColumnIndex(safeHeaders, ["weather_GHI", "GHI"]);
    if (timeIdx < 0 || ghiIdx < 0) return { error: "missing_columns" };

    const x = [];
    const ghiMeas = [];
    const ghiClrBase = [];
    const cosZ = [];
    const dayKey = [];

    const ratios = [];
    for (const r of safeRows) {
      if (!Array.isArray(r)) continue;
      const tRaw = r[timeIdx];
      const d = parseDateCellFlexible(tRaw);
      const meas = Number.parseFloat(r[ghiIdx]);
      if (!d) continue;

      const sp = solarPositionZenithRad(d, latitude, longitude);
      const modeled = clearSkyGhiHaurwitz(sp.cosZenith);
      const isDay = sp.cosZenith > 0.08 && modeled > 50;

      x.push(tRaw);
      ghiMeas.push(Number.isFinite(meas) ? meas : null);
      ghiClrBase.push(modeled > 0 ? modeled : null);
      cosZ.push(sp.cosZenith);
      dayKey.push(toYMDLocal(d));

      if (isDay && Number.isFinite(meas) && meas > 0 && modeled > 0) ratios.push(meas / modeled);
    }
    if (!x.length) return { error: "no_data" };

    ratios.sort((a, b) => a - b);
    const p90 = percentileSorted(ratios, 0.9);
    const med = median(ratios);
    const scale = clamp(Number.isFinite(p90) ? p90 : (Number.isFinite(med) ? med : 1), 0.05, 20);

    const ghiClr = ghiClrBase.map((v) => (v == null ? null : v * scale));
    const clearMask = [];
    for (let i = 0; i < x.length; i++) {
      const meas = ghiMeas[i];
      const modeled = ghiClr[i];
      const isDay = cosZ[i] > 0.08 && (modeled ?? 0) > 150 && meas != null && Number.isFinite(meas) && meas > 0;
      const kt = isDay ? computeKt(meas, modeled) : null;
      clearMask.push(Boolean(kt != null && kt >= ktMin && kt <= ktMax));
    }

    const dayAgg = new Map();
    for (let i = 0; i < x.length; i++) {
      const k = dayKey[i];
      if (!k) continue;
      const modeled = ghiClr[i];
      const meas = ghiMeas[i];
      const isDay = cosZ[i] > 0.08 && (modeled ?? 0) > 150 && meas != null && Number.isFinite(meas) && meas > 0;
      if (!isDay) continue;
      const cur = dayAgg.get(k) || { daySamples: 0, clearSamples: 0 };
      cur.daySamples += 1;
      if (clearMask[i]) cur.clearSamples += 1;
      dayAgg.set(k, cur);
    }

    const dayKeys = Array.from(dayAgg.keys()).sort();
    const dayIsClear = dayKeys.map((k) => {
      const v = dayAgg.get(k);
      if (!v) return 0;
      if (v.daySamples < KT_MIN_DAYTIME_SAMPLES) return 0;
      return (v.clearSamples / v.daySamples) >= KT_CLEAR_DAY_RATIO ? 1 : 0;
    });
    const clearDaysCount = dayIsClear.reduce((a, b) => a + (b ? 1 : 0), 0);

    return { error: null, x, ghiMeas, ghiClr, clearMask, dayKeys, dayIsClear, clearDaysCount, totalDays: dayKeys.length };
  }, [safeHeaders, safeRows, hasCoords, latitude, longitude, ktMin, ktMax]);

  const plotData = useMemo(() => {
    if (!derived || derived.error) return [];
    const clearX = [];
    const clearY = [];
    const dayBarX = derived.dayKeys.map((k) => `${k} 12:00`);
    for (let i = 0; i < derived.x.length; i++) {
      if (derived.clearMask[i] && derived.ghiMeas[i] != null) {
        clearX.push(derived.x[i]);
        clearY.push(derived.ghiMeas[i]);
      }
    }
    return [
      {
        x: derived.x,
        y: derived.ghiMeas,
        type: "scatter",
        mode: "lines",
        connectgaps: false,
        name: "Measured GHI",
        line: { color: "#0ea5e9", width: 1.6, shape: "spline", smoothing: 1.1 },
        hovertemplate: "<b>Measured GHI</b>: %{y}<extra></extra>",
        yaxis: "y",
      },
      {
        x: derived.x,
        y: derived.ghiClr,
        type: "scatter",
        mode: "lines",
        connectgaps: false,
        name: "Clear-sky GHI (scaled)",
        line: { color: "#94a3b8", width: 1.6, dash: "dash", shape: "spline", smoothing: 1.1 },
        hovertemplate: "<b>Clear-sky (scaled)</b>: %{y}<extra></extra>",
        yaxis: "y",
      },
      {
        x: clearX,
        y: clearY,
        type: "scatter",
        mode: "markers",
        name: "Clear intervals",
        marker: { color: "#ff8800", size: 5, opacity: 0.9 },
        hovertemplate: "<b>Clear interval</b>: %{y}<extra></extra>",
        yaxis: "y",
      },
      {
        x: dayBarX,
        y: derived.dayIsClear,
        type: "bar",
        name: "Clear-sky day",
        width: 24 * 60 * 60 * 1000 * 0.55,
        marker: { color: derived.dayIsClear.map((v) => (v ? "#ff8800" : "#E2E8F0")) },
        hovertemplate: "<b>%{x}</b>: %{y}<extra></extra>",
        yaxis: "y2",
      },
    ];
  }, [derived]);

  if (!safeHeaders.length || !safeRows.length) return null;

  const headerRight = derived?.error
    ? null
    : (
      <span style={{ fontFamily: MONO, fontSize: 11, color: "#94a3b8" }}>
        clear-days {derived?.clearDaysCount ?? 0}/{derived?.totalDays ?? 0}
      </span>
    );

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          cursor: "pointer",
          userSelect: "none",
          borderBottom: expanded ? "1px solid #E2E8F0" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TimelineOutlined sx={{ fontSize: 20, color }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>{title} — Clear-sky days</span>
          {headerRight}
        </div>
        {expanded ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} /> : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />}
      </div>
      {expanded && (
        <div style={{ padding: "10px 12px 12px" }}>
          <div style={{ padding: "0 8px 10px", color: "#64748B", fontFamily: FONT, fontSize: 12 }}>
            Clear-sky index method: k_t = GHI_measured / GHI_clear_sky. A timestamp is clear when{" "}
            {!editingKt ? (
              <span
                onClick={() => {
                  setKtMinInput(String(ktMin));
                  setKtMaxInput(String(ktMax));
                  setEditingKt(true);
                }}
                style={{ fontFamily: MONO, color: "#0F172A", cursor: "pointer", borderBottom: "1px dashed #94a3b8" }}
                title="Click to edit thresholds"
              >
                {ktMin.toFixed(2)} ≤ k_t ≤ {ktMax.toFixed(2)}
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number"
                  step="0.01"
                  value={ktMinInput}
                  onChange={(e) => setKtMinInput(e.target.value)}
                  style={{ width: 62, fontFamily: MONO, fontSize: 11, padding: "2px 4px", border: "1px solid #CBD5E1", borderRadius: 6 }}
                />
                <span>≤ k_t ≤</span>
                <input
                  type="number"
                  step="0.01"
                  value={ktMaxInput}
                  onChange={(e) => setKtMaxInput(e.target.value)}
                  style={{ width: 62, fontFamily: MONO, fontSize: 11, padding: "2px 4px", border: "1px solid #CBD5E1", borderRadius: 6 }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const min = Number(ktMinInput);
                    const max = Number(ktMaxInput);
                    if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > min) {
                      setKtMin(min);
                      setKtMax(max);
                    }
                    setEditingKt(false);
                  }}
                  style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "1px solid #CBD5E1", background: "#fff", cursor: "pointer" }}
                >
                  Apply
                </button>
              </span>
            )}
            .
          </div>

          {derived?.error === "missing_coords" ? (
            <div style={{ padding: "12px 20px", color: "#64748B", fontFamily: FONT, fontSize: 12 }}>
              Add <span style={{ fontFamily: MONO }}>latitude</span> and <span style={{ fontFamily: MONO }}>longitude</span> to <span style={{ fontFamily: MONO }}>system_info.json</span> to detect clear-sky days from <span style={{ fontFamily: MONO }}>weather_GHI</span>.
            </div>
          ) : derived?.error === "missing_columns" ? (
            <div style={{ padding: "12px 20px", color: "#64748B", fontFamily: FONT, fontSize: 12 }}>
              This chart needs <span style={{ fontFamily: MONO }}>Time</span> and <span style={{ fontFamily: MONO }}>weather_GHI</span> columns in the PV & Weather CSV.
            </div>
          ) : derived?.error ? (
            <div style={{ padding: "12px 20px", color: "#64748B", fontFamily: FONT, fontSize: 12 }}>
              No usable GHI/time data found in the current filtered range.
            </div>
          ) : (
            <Plot
              data={plotData}
              layout={{
                height: 420,
                margin: { t: 30, r: 50, b: 50, l: 60 },
                hovermode: "x unified",
                showlegend: true,
                legend: { orientation: "h", x: 0.5, y: 1.08, xanchor: "center", yanchor: "bottom", font: { family: FONT, size: 11 } },
                xaxis: {
                  title: { text: "Time", font: { family: FONT, size: 12, color: "#94a3b8" } },
                  gridcolor: "#F1F5F9",
                  tickfont: { family: MONO, size: 10, color: "#94a3b8" },
                },
                yaxis: {
                  title: { text: "GHI", font: { family: FONT, size: 12, color: "#94a3b8" } },
                  gridcolor: "#F1F5F9",
                  tickfont: { family: MONO, size: 10, color: "#94a3b8" },
                  domain: [0.34, 1],
                },
                yaxis2: {
                  title: { text: "Clear day", font: { family: FONT, size: 12, color: "#94a3b8" } },
                  gridcolor: "#F1F5F9",
                  tickfont: { family: MONO, size: 10, color: "#94a3b8" },
                  domain: [0, 0.22],
                  range: [-0.05, 1.05],
                },
                plot_bgcolor: "#fff",
                paper_bgcolor: "#fff",
                font: { family: FONT },
              }}
              config={{ displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] }}
              style={{ width: "100%" }}
            />
          )}
        </div>
      )}
    </div>
  );
}

const CACHE_KEY_PV = "pvcopilot_datafiltering_pv_cache";
const CACHE_KEY_SYSTEM = "pvcopilot_datafiltering_system_cache";

export default function DataFilteringPage() {
  const [pvFile, setPvFile] = useState(null);
  const [pvRawData, setPvRawData] = useState(null);
  const [sysFile, setSysFile] = useState(null);
  const [sysData, setSysData] = useState(null);
  const [toast, setToast] = useState(null);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [resamplingStepMinutes, setResamplingStepMinutes] = useState(10);
  const [lossFactor, setLossFactor] = useState("1");
  const [lossFactorAdvanced, setLossFactorAdvanced] = useState(false);
  const [lossFactorRules, setLossFactorRules] = useState([]);
  const [pvwattsCardCollapsed, setPvwattsCardCollapsed] = useState(false);
  const [filterThreshold, setFilterThreshold] = useState("0.2");
  const [timeWeightEnabled, setTimeWeightEnabled] = useState(false);
  const [timeWeightMin, setTimeWeightMin] = useState("0.2");
  const [downloadFilter, setDownloadFilter] = useState("all"); // 'all' | 'valid' | 'removed' for summary card download
  const [thresholdHelpOpen, setThresholdHelpOpen] = useState(false);
  const thresholdHelpRef = useRef(null);
  const thresholdHelpTriggerRef = useRef(null);
  const [timeWeightHelpOpen, setTimeWeightHelpOpen] = useState(false);
  const timeWeightHelpRef = useRef(null);
  const timeWeightHelpTriggerRef = useRef(null);
  const [lossFactorHelpOpen, setLossFactorHelpOpen] = useState(false);
  const lossFactorHelpRef = useRef(null);
  const lossFactorHelpTriggerRef = useRef(null);
  const [pvwattsFormulaHelpOpen, setPvwattsFormulaHelpOpen] = useState(false);
  const pvwattsFormulaHelpRef = useRef(null);
  const pvwattsFormulaHelpTriggerRef = useRef(null);
  const [filterOverviewOpen, setFilterOverviewOpen] = useState(false);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type, key: Date.now() });
  }, []);

  // Collapse is only available in Advanced mode; keep card expanded otherwise.
  useEffect(() => {
    if (!lossFactorAdvanced) setPvwattsCardCollapsed(false);
  }, [lossFactorAdvanced]);

  // Restore PV and system files from cache on mount (after reload)
  useEffect(() => {
    try {
      const pvCached = localStorage.getItem(CACHE_KEY_PV);
      if (pvCached) {
        const { name, content } = JSON.parse(pvCached);
        if (name && content) {
          const data = parseCSV(content);
          if (data.headers.length > 0 && data.rows.length > 0) {
            setPvFile(name);
            setPvRawData({ headers: data.headers, rows: data.rows });
          }
        }
      }
      const sysCached = localStorage.getItem(CACHE_KEY_SYSTEM);
      if (sysCached) {
        const { name, content } = JSON.parse(sysCached);
        if (name && content) {
          const parsed = parseJSON(content);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            setSysFile(name);
            setSysData(parsed);
          }
        }
      }
    } catch (_) {
      // Ignore cache parse errors
    }
  }, []);

  const handlePvUpload = useCallback(
    async (file) => {
      const text = await readFileAsText(file);
      const data = parseCSV(text);
      if (data.headers.length === 0 || data.rows.length === 0) {
        showToast(`"${file.name}" appears empty or has no data rows.`, "error");
        return;
      }
      setPvFile(file.name);
      setPvRawData({ headers: data.headers, rows: data.rows });
      try {
        localStorage.setItem(CACHE_KEY_PV, JSON.stringify({ name: file.name, content: text }));
      } catch (_) {
        // Quota or other; ignore
      }
      showToast(`PV data loaded — ${data.rows.length} rows, ${data.headers.length} columns`);
    },
    [showToast]
  );

  const pvData = useMemo(() => {
    if (!pvRawData?.headers?.length || !pvRawData?.rows?.length) return null;
    const r = resampleRowsToStep(pvRawData.headers, pvRawData.rows, resamplingStepMinutes);
    return {
      headers: r.headers,
      rows: r.rows,
      originalRows: r.originalRows,
      resampled: r.resampled,
      resampledStepMinutes: resamplingStepMinutes,
    };
  }, [pvRawData, resamplingStepMinutes]);

  const pvFilteredRows = useMemo(
    () => (pvData ? filterRowsByDateRange(pvData.headers, pvData.rows, dateFrom, dateTo) : []),
    [pvData, dateFrom, dateTo]
  );

  const comparisonData = useMemo(() => {
    if (!pvData?.headers?.length || !pvFilteredRows.length || !sysData) return null;
    const lossFactorConfig = lossFactorAdvanced
      ? { defaultFactor: Number(lossFactor), rules: lossFactorRules }
      : lossFactor;
    return computePdcComparison(pvData.headers, pvFilteredRows, sysData, lossFactorConfig);
  }, [pvData, pvFilteredRows, sysData, lossFactor, lossFactorAdvanced, lossFactorRules]);

  const filterResult = useMemo(() => {
    if (!comparisonData || comparisonData.length === 0) return null;
    const opts = timeWeightEnabled && Number.isFinite(Number(timeWeightMin))
      ? { timeWeightMin: Math.max(0, Math.min(1, Number(timeWeightMin))) }
      : {};
    return pvwattsFilterJS(comparisonData, filterThreshold, opts);
  }, [comparisonData, filterThreshold, timeWeightEnabled, timeWeightMin]);

  const timeWeightHelpChartData = useMemo(() => {
    const hours = [];
    for (let i = 0; i <= 96; i++) hours.push(i * 0.25);
    return { x: hours, y: hours.map((hr) => timeOfDayWeight(hr, 12, 0.2)) };
  }, []);

  // Default date range to start and end of loaded PV data
  useEffect(() => {
    if (!pvRawData?.headers?.length || !pvRawData?.rows?.length) return;
    const timeColIdx = getDateColumnIndex(pvRawData.headers);
    if (timeColIdx < 0) return;
    const msList = pvRawData.rows
      .map((r) => parseDateCell(Array.isArray(r) ? r[timeColIdx] : ""))
      .filter((ms) => !Number.isNaN(ms));
    if (msList.length === 0) return;
    const minMs = Math.min(...msList);
    const maxMs = Math.max(...msList);
    setDateFrom(toYMD(new Date(minMs)));
    setDateTo(toYMD(new Date(maxMs)));
  }, [pvRawData]);

  useEffect(() => {
    if (!thresholdHelpOpen) return;
    const onDown = (e) => {
      if (thresholdHelpTriggerRef.current?.contains(e.target) || thresholdHelpRef.current?.contains(e.target)) return;
      setThresholdHelpOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [thresholdHelpOpen]);

  useEffect(() => {
    if (!timeWeightHelpOpen) return;
    const onDown = (e) => {
      if (timeWeightHelpTriggerRef.current?.contains(e.target) || timeWeightHelpRef.current?.contains(e.target)) return;
      setTimeWeightHelpOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [timeWeightHelpOpen]);

  useEffect(() => {
    if (!lossFactorHelpOpen) return;
    const onDown = (e) => {
      if (lossFactorHelpTriggerRef.current?.contains(e.target) || lossFactorHelpRef.current?.contains(e.target)) return;
      setLossFactorHelpOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [lossFactorHelpOpen]);

  useEffect(() => {
    if (!pvwattsFormulaHelpOpen) return;
    const onDown = (e) => {
      if (pvwattsFormulaHelpTriggerRef.current?.contains(e.target) || pvwattsFormulaHelpRef.current?.contains(e.target)) return;
      setPvwattsFormulaHelpOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pvwattsFormulaHelpOpen]);

  const handleSysLoad = useCallback(
    (name, text) => {
      const parsed = parseJSON(text);
      if (!parsed) {
        showToast(`"${name}" contains invalid JSON. Check the file format.`, "error");
        return;
      }
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        showToast(`"${name}" must be a JSON object (not an array or primitive).`, "error");
        return;
      }
      setSysFile(name);
      setSysData(parsed);
      try {
        localStorage.setItem(CACHE_KEY_SYSTEM, JSON.stringify({ name, content: text }));
      } catch (_) {
        // Quota or other; ignore
      }
      showToast(`System info loaded — ${Object.keys(parsed).length} fields`);
    },
    [showToast]
  );

  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        background: "#FAFBFC",
        fontFamily: FONT,
        padding: "32px 40px 60px",
      }}
    >
      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* ──────────── Data Filtering (collapsible) ──────────── */}
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderRadius: 12,
            padding: "18px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 0 0 1.5px #E2E8F0",
            marginBottom: 20,
          }}
        >
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer", gap: 16 }}
            onClick={() => setFilterOverviewOpen((o) => !o)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: `${DF}14`,
                  border: `1.5px solid ${DF}30`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <FilterAltOutlined sx={{ fontSize: 24, color: DF }} />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>
                  Data Filtering
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                  Upload PV data, weather data, and system configuration to filter, cleanse, and prepare datasets.
                </div>
              </div>
            </div>
            <div style={{ marginLeft: "auto", borderRadius: "999px", background: "#F8FAFC", border: "1px solid #E2E8F0", padding: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {filterOverviewOpen ? (
                <ExpandLessIcon sx={{ fontSize: 18, color: "#94a3b8" }} />
              ) : (
                <ExpandMoreIcon sx={{ fontSize: 18, color: "#94a3b8" }} />
              )}
            </div>
          </div>
          {filterOverviewOpen && (
            <>
              <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                {/* PVWatts model & comparison */}
                <div style={{ background: "#FFFBEB", borderRadius: 12, padding: 18, border: "1px solid #FDE68A" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>
                    PVWatts Model & Comparison
                  </div>
                  <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7, marginBottom: 10 }}>
                    Compute cell temperature (Tcell) and theoretical DC power (PVWatts) from weather and PV data using system parameters. Adjust the loss factor to account for model error, soiling, or degradation. Compare measured Power to PVWatts at each timestamp.
                  </p>
                  <ul style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
                    <li>Tcell from air temp, GTI, wind speed, and system coefficients.</li>
                    <li>PVWatts (kW) = GTI × tot_power × (1 + temp_coef×(Tcell−25)/100) × loss_factor / 1000.</li>
                    <li>Configurable loss factor (default 0.97); next version will auto-compute it.</li>
                  </ul>
                </div>

                {/* Filter logic */}
                <div style={{ background: "#FFFBEB", borderRadius: 12, padding: 18, border: "1px solid #FDE68A" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>
                    Filter Logic
                  </div>
                  <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7, marginBottom: 10 }}>
                    Relative error is |Power − PVWatts| / PVWatts per row. Rows with relative error ≤ the threshold are labeled valid; the rest are removed. Set the threshold (e.g. 20%) to control how strict the filter is.
                  </p>
                  <ul style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
                    <li>Configurable threshold (rel. error) as a percentage.</li>
                    <li>Labeled dataset: each row has status &quot;valid&quot; or &quot;removed&quot;.</li>
                    <li>Filtered dataset: only &quot;valid&quot; rows for downstream use.</li>
                  </ul>
                </div>

                {/* Visualization & export */}
                <div style={{ background: "#FFFBEB", borderRadius: 12, padding: 18, border: "1px solid #FDE68A" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>
                    Visualization & Export
                  </div>
                  <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7, marginBottom: 10 }}>
                    Time-series and scatter charts show Power vs PVWatts and correlation. A labeled data table lists valid and removed rows. Export the full labeled dataset or only valid/removed rows as CSV.
                  </p>
                  <ul style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
                    <li>Measured vs calculated time-series and filter result chart.</li>
                    <li>Scatter plot with linear regression and R².</li>
                    <li>One-click CSV export (all, valid only, or removed only).</li>
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Data Visualization card */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: 16,
            border: "1px solid #E2E8F0",
            boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
            padding: "16px 18px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 10,
                background: `${DF}12`,
                border: `1px solid ${DF}35`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShowChartOutlined sx={{ fontSize: 18, color: DF }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
                Data Visualization
              </span>
              <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>
                Load CSV and JSON files below to explore tables and charts.
              </span>
            </div>
          </div>
        </div>

        {/* Upload cards: PV Data + System Info only */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginTop: 0,
            marginBottom: 32,
          }}
        >
          <FilterUploadZone
            label="Load PV & Weather Synced Data (.csv)"
            footerHint="Generate using tool 'Data Ingestion & Sync'"
            icon={<SolarPowerOutlined sx={{ fontSize: 24, color: O }} />}
            accept=".csv"
            color={O}
            file={pvFile}
            templateFile="pv_weather_synced_pvcopilot.csv"
            onFileUpload={handlePvUpload}
            onDownloadSuccess={(msg) => showToast(msg, "success")}
            onClear={() => {
              setPvFile(null);
              setPvRawData(null);
              try {
                localStorage.removeItem(CACHE_KEY_PV);
              } catch (_) {}
            }}
            onError={(msg) => showToast(msg, "error")}
          />
          <FilterUploadZone
            label="System Info (.json)"
            icon={<SettingsOutlined sx={{ fontSize: 24, color: O }} />}
            accept=".json"
            color={O}
            file={sysFile}
            templateFile="system_info.json"
            onLoad={handleSysLoad}
            onDownloadSuccess={(msg) => showToast(msg, "success")}
            onClear={() => {
              setSysFile(null);
              setSysData(null);
              try {
                localStorage.removeItem(CACHE_KEY_SYSTEM);
              } catch (_) {}
            }}
            onError={(msg) => showToast(msg, "error")}
          />
        </div>

        {/* System Info section (separate from Data Ingestion) */}
        {sysData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 32 }}>
            <FilterSystemInfo data={sysData} />
          </div>
        )}

        {/* PV Data Analysis (separate from Data Ingestion; client-side only) */}
        {pvData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 32 }}>
            <FilterDateFilterBar
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
              onClear={() => {
                setDateFrom(null);
                setDateTo(null);
              }}
              totalRows={pvData.rows?.length ?? 0}
              filteredRows={pvFilteredRows.length}
              accentColor={DF}
              resamplingStepMinutes={resamplingStepMinutes}
              onResamplingStepChange={setResamplingStepMinutes}
            />
            <div
              style={{
                background: "#ffffff",
                borderRadius: 16,
                border: "1px solid #E2E8F0",
                boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
                padding: "16px 18px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    background: `${O}12`,
                    border: `1px solid ${O}35`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <SolarPowerOutlined sx={{ fontSize: 18, color: O }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>PV & Weather Data Analysis</span>
                  <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>Explore, filter, and visualize PV performance data.</span>
                </div>
              </div>
              <FilterCSVTable
                title="PV & Weather Data"
                icon={<SolarPowerOutlined sx={{ fontSize: 20, color: O }} />}
                color={O}
                headers={pvData.headers}
                rows={pvFilteredRows}
                resampled={pvData.resampled}
                originalRows={pvData.originalRows}
                resampledStepMinutes={pvData.resampledStepMinutes}
                defaultVisibleLabels={[
                  formatHeaderWithUnit("Time"),
                  formatHeaderWithUnit("Current"),
                  formatHeaderWithUnit("Voltage"),
                  formatHeaderWithUnit("Power"),
                  formatHeaderWithUnit("weather_POA"),
                  formatHeaderWithUnit("weather_GHI"),
                  formatHeaderWithUnit("weather_Air_Temp"),
                  formatHeaderWithUnit("weather_RH"),
                ]}
              />
              <FilterCSVChart title="PV & Weather Data" color={O} headers={pvData.headers} rows={pvFilteredRows} defaultYHeader="Power" defaultRightYHeader="weather_POA" />
              <ClearSkyDaysChart title="PV & Weather Data" color={O} headers={pvData.headers} rows={pvFilteredRows} systemInfo={sysData} />

              {/* Data Filtering card */}
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: 16,
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
                  padding: "16px 18px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  marginTop: 20,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 10,
                      background: `${DF}12`,
                      border: `1px solid ${DF}35`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <FilterAltOutlined sx={{ fontSize: 18, color: DF }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
                      Data Filtering
                    </span>
                    <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>
                      Filter and clean PV and weather time series for analysis.
                    </span>
                  </div>
                </div>
              </div>

              {/* PVWatts equation card: equation left, loss factor input right */}
              {pvData && sysData && (
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: 16,
                    border: "1px solid #E2E8F0",
                    boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
                    padding: "16px 20px",
                    marginTop: 20,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    position: "relative",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontFamily: FONT, fontSize: 12, color: "#334155", lineHeight: 1.6, position: "relative" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <FunctionsOutlined sx={{ fontSize: 16, color: DF }} />
                        <span style={{ fontWeight: 700, color: "#0F172A", fontSize: 12 }}>PVWatts formula</span>
                        <span
                          ref={pvwattsFormulaHelpTriggerRef}
                          role="button"
                          tabIndex={0}
                          onClick={() => setPvwattsFormulaHelpOpen((v) => !v)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setPvwattsFormulaHelpOpen((v) => !v); }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            color: "#64748B",
                            cursor: "pointer",
                            outline: "none",
                          }}
                          aria-label="Explain PVWatts model"
                        >
                          <HelpOutline sx={{ fontSize: 18 }} />
                        </span>
                        {pvwattsFormulaHelpOpen && (
                          <div
                            ref={pvwattsFormulaHelpRef}
                            style={{
                              position: "absolute",
                              top: "100%",
                              left: 0,
                              marginTop: 8,
                              zIndex: 1001,
                              background: "#fff",
                              borderRadius: 12,
                              border: "1px solid #E2E8F0",
                              boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
                              padding: 14,
                              maxWidth: 380,
                              fontFamily: FONT,
                              fontSize: 11,
                              color: "#475569",
                              lineHeight: 1.55,
                            }}
                          >
                            <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>PVWatts model</div>
                            <p style={{ margin: "0 0 8px 0" }}>
                              PVWatts is an NREL point-value model that predicts DC power from <strong>effective irradiance</strong> (e.g. GTI) and <strong>cell temperature</strong>. The power equation scales reference power by irradiance and applies a temperature coefficient; at low irradiance (≤125 W/m²) a different scaling is used. Cell temperature is estimated from ambient air temperature, plane-of-array irradiance, and wind speed (e.g. Sandia-style module temperature model).
                            </p>
                            <p style={{ margin: "0 0 8px 0" }}>
                              <strong>References:</strong>
                            </p>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              <li>
                                <a href="https://pvpmc.sandia.gov/modeling-guide/2-dc-module-iv/point-value-models/pvwatts/" target="_blank" rel="noopener noreferrer" style={{ color: DF, textDecoration: "underline" }}>PVWatts (power equation)</a>
                              </li>
                              <li>
                                <a href="https://pvpmc.sandia.gov/modeling-guide/2-dc-module-iv/module-temperature/sandia-module-temperature-model/" target="_blank" rel="noopener noreferrer" style={{ color: DF, textDecoration: "underline" }}>Sandia module temperature model</a>
                              </li>
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
                          <label style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#64748B" }} htmlFor="loss-factor-input">
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <button
                                type="button"
                                title={lossFactorAdvanced ? "Simple" : "Advanced"}
                                aria-label="Advanced loss factor rules"
                                onClick={() => {
                                  setLossFactorAdvanced((v) => !v);
                                  setLossFactorRules((prev) => {
                                    if (prev?.length) return prev;
                                    const first = Array.isArray(pvFilteredRows) && pvFilteredRows.length > 0 ? pvFilteredRows[0] : null;
                                    const last = Array.isArray(pvFilteredRows) && pvFilteredRows.length > 0 ? pvFilteredRows[pvFilteredRows.length - 1] : null;
                                    const timeCol = pvData?.headers?.length ? getDateColumnIndex(pvData.headers) : 0;
                                    const start = first && Array.isArray(first) ? String(first[timeCol] ?? "") : "";
                                    const end = last && Array.isArray(last) ? String(last[timeCol] ?? "") : "";
                                    return [
                                      {
                                        id: Date.now(),
                                        start,
                                        end,
                                        factor: Number(lossFactor),
                                      },
                                    ];
                                  });
                                }}
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 999,
                                  border: `1px solid ${lossFactorAdvanced ? `${DF}55` : "#E2E8F0"}`,
                                  background: lossFactorAdvanced ? `${DF}12` : "#F8FAFC",
                                  color: lossFactorAdvanced ? DF : "#64748B",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "pointer",
                                  padding: 0,
                                  boxShadow: lossFactorAdvanced ? `0 0 0 1px ${DF}22` : "none",
                                }}
                              >
                                {lossFactorAdvanced ? <RemoveOutlined sx={{ fontSize: 16, color: "inherit" }} /> : <AddOutlined sx={{ fontSize: 16, color: "inherit" }} />}
                              </button>
                              <span>loss_factor</span>
                            </span>
                          </label>
                          <span
                            ref={lossFactorHelpTriggerRef}
                            role="button"
                            tabIndex={0}
                            onClick={() => setLossFactorHelpOpen((v) => !v)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setLossFactorHelpOpen((v) => !v); }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 20,
                              height: 20,
                              borderRadius: "50%",
                              color: "#64748B",
                              cursor: "pointer",
                              outline: "none",
                            }}
                            aria-label="Explain loss factor"
                          >
                            <HelpOutline sx={{ fontSize: 18 }} />
                          </span>
                          {lossFactorHelpOpen && (
                            <div
                              ref={lossFactorHelpRef}
                              style={{
                                position: "absolute",
                                top: "100%",
                                left: 0,
                                marginTop: 8,
                                zIndex: 1001,
                                background: "#fff",
                                borderRadius: 12,
                                border: "1px solid #E2E8F0",
                                boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
                                padding: 14,
                                maxWidth: 340,
                                fontFamily: FONT,
                                fontSize: 11,
                                color: "#475569",
                                lineHeight: 1.55,
                              }}
                            >
                              <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>What is loss factor?</div>
                              <p style={{ margin: "0 0 8px 0" }}>
                                The loss factor is a multiplier applied at the end of the PVWatts formula. It can represent <strong>calculation error of the PVWatts model</strong>, <strong>soiling conditions</strong> of the system, or <strong>degradation</strong>. Typical values are around 0.95–1.0 (e.g. 0.97 = 3% losses).
                              </p>
                              <p style={{ margin: "0 0 6px 0" }}>
                                Clicking the <strong>+</strong> button next to <code style={{ fontFamily: MONO, fontSize: 11 }}>loss_factor</code> opens Advanced mode, where you can define multiple loss_factor values as rules over different date ranges.
                              </p>
                              <p style={{ margin: 0 }}>The next version of PVCopilot will compute this value automatically.</p>
                            </div>
                          )}
                          {!lossFactorAdvanced && (
                            <input
                              id="loss-factor-input"
                              type="number"
                              min={0}
                              max={2}
                              step={0.1}
                              value={lossFactor}
                              onChange={(e) => setLossFactor(e.target.value)}
                              style={{
                                width: 72,
                                padding: "8px 10px",
                                borderRadius: 10,
                                border: "1.5px solid #E2E8F0",
                                fontFamily: MONO,
                                fontSize: 12,
                                color: "#0F172A",
                                background: "#FAFBFC",
                              }}
                            />
                          )}
                        </div>
                      {lossFactorAdvanced && (
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 10,
                            padding: "3px 8px",
                            borderRadius: 999,
                            border: "1px solid rgba(148, 163, 184, 0.8)",
                            background: "#F8FAFC",
                            color: "#475569",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {lossFactorRules.length || 0} rule{lossFactorRules.length === 1 ? "" : "s"}
                        </span>
                      )}

                      {lossFactorAdvanced && (
                        <button
                          type="button"
                          onClick={() => setPvwattsCardCollapsed((v) => !v)}
                          aria-label={pvwattsCardCollapsed ? "Expand PVWatts formula" : "Collapse PVWatts formula"}
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 10,
                            border: "1px solid #E2E8F0",
                            background: "#F8FAFC",
                            color: "#64748B",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          {pvwattsCardCollapsed ? <ExpandMoreIcon sx={{ fontSize: 18 }} /> : <ExpandLessIcon sx={{ fontSize: 18 }} />}
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ color: "#64748B", fontSize: 11, fontFamily: FONT, marginTop: -2 }}>
                    PVWatts (kW) = GTI × tot_power × (1 + (temp_coef/100) × (Tcell − 25)) ×{" "}
                    <span style={{ color: "#0F172A", fontWeight: 600 }}>loss_factor</span>
                    {" "} / 1000
                  </div>

                  {lossFactorAdvanced && !pvwattsCardCollapsed && (
                    <div
                      style={{
                        marginTop: 6,
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid #E2E8F0",
                        background: "#FFFFFF",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        boxShadow: "0 0 0 1px rgba(148, 163, 184, 0.18), 0 8px 18px rgba(15, 23, 42, 0.06)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 999,
                              background: `${DF}12`,
                              border: `1px solid ${DF}35`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              boxShadow: `0 0 0 1px ${DF}22`,
                            }}
                          >
                            <FunctionsOutlined sx={{ fontSize: 16, color: DF }} />
                          </div>
                          <div>
                            <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#1F2937" }}>loss_factor rules</div>
                            <div style={{ fontFamily: FONT, fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                              Apply loss_factor by date range (first matching rule wins)
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const last = lossFactorRules[lossFactorRules.length - 1];
                            const nextId = (last?.id ?? 0) + 1;
                            setLossFactorRules([
                              ...lossFactorRules,
                              {
                                id: nextId,
                                start: last?.start ?? "",
                                end: last?.end ?? "",
                                factor: Number.isFinite(Number(last?.factor)) ? Number(last.factor) : Number(lossFactor),
                              },
                            ]);
                          }}
                          style={{
                            borderRadius: 999,
                            border: "1px solid #CBD5F5",
                            background: "linear-gradient(135deg, #FEE2E2 0%, #FFE4E6 100%)",
                            padding: "3px 12px",
                            fontFamily: FONT,
                            fontSize: 11,
                            fontWeight: 700,
                            color: DF,
                            cursor: "pointer",
                            boxShadow: "0 0 0 1px rgba(254, 205, 211, 0.9), 0 3px 8px rgba(15, 23, 42, 0.12)",
                          }}
                        >
                          + Add rule
                        </button>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                        {lossFactorRules.map((rule, idx) => (
                          <div
                            key={rule.id ?? idx}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(0, 1.6fr) 92px 26px",
                              gap: 6,
                              alignItems: "center",
                            }}
                          >
                            <LossFactorRuleRangeEditor
                              rule={rule}
                              onChange={(updated) => {
                                const next = [...lossFactorRules];
                                next[idx] = updated;
                                setLossFactorRules(next);
                              }}
                            />
                            <input
                              type="number"
                              step={0.1}
                              value={rule.factor ?? ""}
                              onChange={(e) => {
                                const next = [...lossFactorRules];
                                const v = Number(e.target.value);
                                next[idx] = { ...next[idx], factor: Number.isNaN(v) ? "" : v };
                                setLossFactorRules(next);
                              }}
                              placeholder="factor"
                              style={{
                                fontFamily: MONO,
                                fontSize: 11,
                                padding: "6px 8px",
                                borderRadius: 8,
                                border: "1px solid #E2E8F0",
                                background: "#F9FAFB",
                                color: "#0F172A",
                                outline: "none",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (lossFactorRules.length === 1) return;
                                setLossFactorRules(lossFactorRules.filter((r) => r.id !== rule.id));
                              }}
                              style={{
                                border: "none",
                                background: "transparent",
                                cursor: lossFactorRules.length === 1 ? "not-allowed" : "pointer",
                                color: lossFactorRules.length === 1 ? "#CBD5E1" : "#94a3b8",
                                fontSize: 14,
                              }}
                              aria-label="Remove rule"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <PdcComparisonChart comparisonData={comparisonData} />

              {/* Filter formula logic card (above Measured vs Calculated graph) */}
              {pvData && sysData && (
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: 16,
                    border: "1px solid #E2E8F0",
                    boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
                    padding: "16px 20px",
                    marginTop: 20,
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 24,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: "1 1 280px", fontFamily: FONT, fontSize: 12, color: "#334155", lineHeight: 1.6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 999,
                          background: `${DF}08`,
                          border: `1px solid ${DF}30`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <PatternOutlined sx={{ fontSize: 14, color: DF }} />
                      </div>
                      <div style={{ fontWeight: 700, color: "#0F172A", fontSize: 12 }}>Filter logic</div>
                    </div>
                    <div style={{ color: "#64748B", fontSize: 11 }}>
                      <code style={{ display: "block", marginBottom: 2, fontFamily: FONT, fontSize: 11 }}>
                        df['rel_error'] = abs((df['Power'] − df['PVWatts']) / df['Power'])
                      </code>
                      <code style={{ display: "block", fontFamily: FONT, fontSize: 11 }}>
                        df['status'] = df['rel_error'].apply(lambda x: 'valid' if x {"<="} threshold else 'removed')
                      </code>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, position: "relative" }}>
                    <label style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: "#64748B" }} htmlFor="filter-threshold-input">
                      filter threshold (rel. error)
                    </label>
                    <span
                      ref={thresholdHelpTriggerRef}
                      role="button"
                      tabIndex={0}
                      onClick={() => setThresholdHelpOpen((v) => !v)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setThresholdHelpOpen((v) => !v); }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        color: "#64748B",
                        cursor: "pointer",
                        outline: "none",
                      }}
                      aria-label="Explain filter threshold"
                    >
                      <HelpOutline sx={{ fontSize: 18 }} />
                    </span>
                    {thresholdHelpOpen && (
                      <div
                        ref={thresholdHelpRef}
                        style={{
                          position: "absolute",
                          top: "100%",
                          right: 0,
                          marginTop: 8,
                          zIndex: 1001,
                          background: "#fff",
                          borderRadius: 12,
                          border: "1px solid #E2E8F0",
                          boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
                          padding: 14,
                          maxWidth: 340,
                          fontFamily: FONT,
                          fontSize: 11,
                          color: "#475569",
                          lineHeight: 1.55,
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>How the filter works</div>
                        <p style={{ margin: "0 0 8px 0" }}>
                          Relative error is computed as <code style={{ fontFamily: MONO, fontSize: 11, background: "#F1F5F9", padding: "1px 4px", borderRadius: 4 }}>|Power − PVWatts| / PVWatts</code> for each row. Rows where this value is <strong>≤</strong> the threshold (as a fraction, e.g. 0.2 = 20%) are kept as <strong>valid</strong>; rows above the threshold are marked <strong>removed</strong> and excluded from the filtered dataset.
                        </p>
                        <p style={{ margin: 0 }}>
                          Lower thresholds keep only points very close to the PVWatts model; higher thresholds allow more deviation (e.g. 50% keeps points within 50% relative error).
                        </p>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        id="filter-threshold-input"
                        type="number"
                        min={0}
                        max={200}
                        step={5}
                        value={Number.isFinite(Number(filterThreshold)) ? Math.round(Number(filterThreshold) * 100) : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") setFilterThreshold("");
                          else {
                            const pct = Number(v);
                            if (Number.isFinite(pct)) setFilterThreshold(String(pct / 100));
                          }
                        }}
                        style={{
                          width: 58,
                          padding: "6px 9px",
                          borderRadius: 8,
                          border: "1.5px solid #E2E8F0",
                          fontFamily: MONO,
                          fontSize: 12,
                          color: "#0F172A",
                          background: "#FAFBFC",
                        }}
                      />
                      <span style={{ fontFamily: FONT, fontSize: 11, color: "#64748B" }}>%</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, position: "relative" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: FONT, fontSize: 11, color: "#334155" }}>
                      <input
                        type="checkbox"
                        checked={timeWeightEnabled}
                        onChange={(e) => setTimeWeightEnabled(e.target.checked)}
                        style={{ width: 14, height: 14, accentColor: "#2563eb" }}
                      />
                      Soften at dawn/dusk
                    </label>
                    <span
                      ref={timeWeightHelpTriggerRef}
                      role="button"
                      tabIndex={0}
                      onClick={() => setTimeWeightHelpOpen((v) => !v)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setTimeWeightHelpOpen((v) => !v); }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        color: "#64748B",
                        cursor: "pointer",
                        outline: "none",
                      }}
                      aria-label="Explain soften at dawn/dusk"
                    >
                      <HelpOutline sx={{ fontSize: 18 }} />
                    </span>
                    {timeWeightHelpOpen && (
                      <div
                        ref={timeWeightHelpRef}
                        style={{
                          position: "absolute",
                          top: "100%",
                          right: 0,
                          marginTop: 8,
                          zIndex: 1001,
                          background: "#fff",
                          borderRadius: 12,
                          border: "1px solid #E2E8F0",
                          boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
                          padding: 12,
                          width: 500,
                          maxWidth: "min(500px, calc(100vw - 24px))",
                          fontFamily: FONT,
                          fontSize: 12,
                          color: "#334155",
                          lineHeight: 1.5,
                        }}
                      >
                        <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Soften at dawn/dusk</div>
                        <p style={{ margin: "0 0 6px 0" }}>
                          At sunrise and sunset, measured and theoretical power are both low, so the same small absolute difference becomes a large <strong>relative error</strong> and many points get removed even when the difference is acceptable.
                        </p>
                        <p style={{ margin: "0 0 8px 0" }}>
                          When enabled, the relative error is multiplied by a <strong>time-of-day weight</strong>: 1 at solar noon (no change) and lower at dawn/dusk. So the effective threshold is relaxed when the sun is low, and fewer points are removed at the edges of the day. <strong>Min weight</strong> is the minimum multiplier at 6:00 and 18:00 (e.g. 0.2 = 20%).
                        </p>
                        <div style={{ marginTop: 6, height: 100 }}>
                          <Plot
                            data={[{
                              x: timeWeightHelpChartData.x,
                              y: timeWeightHelpChartData.y,
                              type: "scatter",
                              mode: "lines",
                              name: "Weight",
                              line: { color: "#2563eb", width: 2, shape: "spline", smoothing: 0.3 },
                              fill: "tozeroy",
                              fillcolor: "rgba(37, 99, 235, 0.15)",
                            }]}
                            layout={{
                              margin: { t: 16, r: 16, b: 20, l: 36 },
                              height: 100,
                              xaxis: {
                                title: { text: "Hour of day", font: { size: 10 } },
                                range: [0, 24],
                                tickvals: [0, 6, 12, 18, 24],
                                tickfont: { size: 9 },
                                gridcolor: "#F1F5F9",
                              },
                              yaxis: {
                                title: { text: "Weight", font: { size: 10 } },
                                range: [0, 1.05],
                                tickfont: { size: 9 },
                                gridcolor: "#F1F5F9",
                              },
                              showlegend: false,
                              plot_bgcolor: "#fff",
                              paper_bgcolor: "#fff",
                              font: { family: FONT, size: 10 },
                              annotations: [
                                { x: 12, y: 1, text: "noon", showarrow: false, font: { size: 9 }, yshift: 4 },
                                { x: 6, y: 0.2, text: "dawn", showarrow: false, font: { size: 9 }, yshift: -6 },
                                { x: 18, y: 0.2, text: "dusk", showarrow: false, font: { size: 9 }, yshift: -6 },
                              ],
                            }}
                            config={{ displayModeBar: false, responsive: true }}
                            style={{ width: "100%" }}
                          />
                        </div>
                      </div>
                    )}
                    {timeWeightEnabled && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontFamily: FONT, fontSize: 11, color: "#64748B" }}>min weight</span>
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.1}
                          value={timeWeightMin}
                          onChange={(e) => setTimeWeightMin(e.target.value)}
                          style={{
                            width: 55,
                              padding: "5px 7px",
                              borderRadius: 7,
                            border: "1px solid #E2E8F0",
                            fontFamily: MONO,
                              fontSize: 11,
                            color: "#0F172A",
                            background: "#FAFBFC",
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <PdcFilterChart
                comparisonData={comparisonData}
                filterResult={filterResult}
                resampleMinutes={resamplingStepMinutes}
              />

              {/* Power vs PVWatts correlation scatter (above Labeled data table) */}
              {filterResult?.labeled?.length > 0 && (
                <PdcPvWattsCorrelationChart data={filterResult.labeled} />
              )}

              {/* Labeled data table (labeled_df: valid + removed with status) */}
              {filterResult?.labeled?.length > 0 && (
                <FilteredDataTable data={filterResult.labeled} title="Filtered Data" />
              )}

              {/* Filtered Data Summary card (bottom) */}
              {filterResult?.labeled?.length > 0 && (() => {
                const labeled = filterResult.labeled;
                const validCount = labeled.filter((d) => d.status === "valid").length;
                const removedCount = labeled.filter((d) => d.status === "removed").length;
                const validPct = labeled.length > 0 ? ((validCount / labeled.length) * 100).toFixed(1) : "0";
                const removedPct = labeled.length > 0 ? ((removedCount / labeled.length) * 100).toFixed(1) : "0";
                const computeR2 = (arr) => {
                  const x = [];
                  const y = [];
                  for (const d of arr) {
                    const gti = d.weather_POA != null ? Number(d.weather_POA) : NaN;
                    const pdc = d.Power != null ? Number(d.Power) : NaN;
                    if (Number.isFinite(gti) && Number.isFinite(pdc)) {
                      x.push(gti);
                      y.push(pdc);
                    }
                  }
                  if (x.length < 2) return null;
                  return linearRegression(x, y).r2;
                };
                const r2All = computeR2(labeled);
                const r2Valid = computeR2(labeled.filter((d) => d.status === "valid"));
                const timeRange = labeled.length > 0
                  ? (() => {
                      const times = labeled.map((d) => d.time).filter(Boolean);
                      if (times.length === 0) return "—";
                      const first = times[0];
                      const last = times[times.length - 1];
                      return `${first} → ${last}`;
                    })()
                  : "—";
                const rowsToExport = downloadFilter === "all" ? labeled : labeled.filter((d) => d.status === downloadFilter);
                // Target schema for filtered CSV (matches pv_weather_filtered_pvcopilot.csv template)
                const FILTERED_EXPORT_HEADERS = ["Time", "Current", "Voltage", "Power", "Module_Temp", "weather_POA", "weather_GHI", "weather_DNI", "weather_DHI", "weather_Air_Temp", "weather_RH", "weather_Pressure", "weather_Wind_speed", "weather_Rain", "PVWatts", "rel_error", "status"];
                const FILTERED_EXPORT_SOURCE_KEYS = {
                  Time: ["Time", "time"],
                  Current: ["Current", "I1", "I_SUM"],
                  Voltage: ["Voltage", "U_DC"],
                  Power: ["Power", "P_DC"],
                  Module_Temp: ["Module_Temp", "T1"],
                  weather_POA: ["weather_POA", "weather_GTI", "GTI"],
                  weather_GHI: ["weather_GHI"],
                  weather_DNI: ["weather_DNI"],
                  weather_DHI: ["weather_DHI"],
                  weather_Air_Temp: ["weather_Air_Temp"],
                  weather_RH: ["weather_RH"],
                  weather_Pressure: ["weather_Pressure"],
                  weather_Wind_speed: ["weather_Wind_speed"],
                  weather_Rain: ["weather_Rain"],
                  PVWatts: ["PVWatts"],
                  rel_error: ["rel_error"],
                  status: ["status"],
                };
                const handleDownload = () => {
                  const escape = (v) => (v == null ? "" : String(v).includes(",") ? `"${String(v).replace(/"/g, '""')}"` : String(v));
                  const rowToExportRow = (row) => {
                    const out = {};
                    for (const h of FILTERED_EXPORT_HEADERS) {
                      const keys = FILTERED_EXPORT_SOURCE_KEYS[h];
                      let val = "";
                      if (keys) for (const k of keys) { if (row[k] !== undefined && row[k] !== null && row[k] !== "") { val = row[k]; break; } }
                      out[h] = val;
                    }
                    return out;
                  };
                  const line = (outRow) => FILTERED_EXPORT_HEADERS.map((h) => escape(outRow[h])).join(",");
                  const csv = [FILTERED_EXPORT_HEADERS.join(","), ...rowsToExport.map((row) => line(rowToExportRow(row)))].join("\n");
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `filtered_labeled_data_${downloadFilter}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                };
                return (
                  <div
                    style={{
                      marginTop: 20,
                      background: "#ffffff",
                      borderRadius: 16,
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
                      padding: "14px 18px 16px 18px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 9,
                          background: `${DF}10`,
                          border: `1px solid ${DF}26`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <FilterAltOutlined sx={{ fontSize: 16, color: DF }} />
                      </div>
                      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                        Filtered Data Summary
                      </span>
                      <span style={{ fontFamily: FONT, fontSize: 11, color: "#64748B" }}>
                        {labeled.length} labeled points
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "stretch", gap: 16, flexWrap: "wrap", width: "100%" }}>
                        <div style={{ flex: "0 0 auto", width: 260, display: "flex", flexDirection: "column", minWidth: 0 }}>
                          <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#0F172A", display: "block", marginBottom: 6 }}>
                            Correlation R²
                          </span>
                          <div
                            style={{
                              background: "#fff",
                              borderRadius: 12,
                              border: "1px solid #E2E8F0",
                              overflow: "hidden",
                            }}
                          >
                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", borderBottom: "1px solid #E2E8F0" }}>
                              <div style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
                                <span>All</span>
                              </div>
                              <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                                <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#1e40af", background: "#DBEAFE", padding: "4px 12px", borderRadius: 999 }}>
                                  {r2All != null ? `${(r2All * 100).toFixed(1)}%` : "—"}
                                </span>
                              </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto" }}>
                              <div style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
                                <span>Valid</span>
                              </div>
                              <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                                <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#166534", background: "#E0FDC7", padding: "4px 12px", borderRadius: 999 }}>
                                  {r2Valid != null ? `${(r2Valid * 100).toFixed(1)}%` : "—"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div style={{ flex: "0 0 auto", width: 260, display: "flex", flexDirection: "column", minWidth: 0 }}>
                          <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#0F172A", display: "block", marginBottom: 6 }}>
                            Stats
                          </span>
                          <div
                            style={{
                              background: "#fff",
                              borderRadius: 12,
                              border: "1px solid #E2E8F0",
                              overflow: "hidden",
                            }}
                          >
                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", borderBottom: "1px solid #E2E8F0" }}>
                              <div style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
                                <span>Valid</span>
                              </div>
                            <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                              <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#166534", background: "#E0FDC7", padding: "4px 12px", borderRadius: 999 }}>
                                {validCount} ({validPct}%)
                              </span>
                            </div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr auto" }}>
                            <div style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
                              <span>Removed</span>
                            </div>
                            <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                              <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#7f1d1d", background: "#F0BFC2", padding: "4px 12px", borderRadius: 999 }}>
                                {removedCount} ({removedPct}%)
                              </span>
                            </div>
                          </div>
                          </div>
                        </div>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                          <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#0F172A", display: "block", marginBottom: 6 }}>
                            Data range
                          </span>
                          <div
                            style={{
                              flex: 1,
                              background: "#fff",
                              borderRadius: 12,
                              border: "1px solid #E2E8F0",
                              padding: "10px 14px",
                              fontFamily: MONO,
                              fontSize: 10,
                              color: "#64748B",
                              lineHeight: 1.6,
                              overflowX: "auto",
                              minWidth: 0,
                            }}
                          >
                            <div style={{ whiteSpace: "nowrap" }}>Labeled data: {timeRange}</div>
                            <div style={{ whiteSpace: "nowrap" }}>Threshold (rel. error): {Number.isFinite(Number(filterThreshold)) ? `${(Number(filterThreshold) * 100).toFixed(0)}%` : filterThreshold || "—"}</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", gap: 10, flexShrink: 0, alignSelf: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {[
                              { opt: "all", color: B },
                              { opt: "valid", color: Y },
                              { opt: "removed", color: DF },
                            ].map(({ opt, color }) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => setDownloadFilter(opt)}
                                style={{
                                  padding: "4px 10px",
                                  border: `1px solid ${downloadFilter === opt ? color : "#E2E8F0"}`,
                                  borderRadius: 8,
                                  background: downloadFilter === opt ? `${color}14` : "#fff",
                                  color: downloadFilter === opt ? color : "#64748B",
                                  fontFamily: FONT,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  textTransform: "capitalize",
                                }}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={handleDownload}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "5px 14px",
                              borderRadius: 8,
                              background: "#1F2937",
                              color: "#fff",
                              border: "none",
                              cursor: "pointer",
                              fontSize: 10,
                              fontWeight: 600,
                              fontFamily: FONT,
                              letterSpacing: ".03em",
                              transition: "background .15s",
                              whiteSpace: "nowrap",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#374151")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "#1F2937")}
                          >
                            <FileDownloadOutlined style={{ fontSize: 14 }} />
                            Download Filtered Data
                          </button>
                        </div>
                      </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {!pvFile && !sysFile && (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "#CBD5E1",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>
              Upload files above to get started with data filtering
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
