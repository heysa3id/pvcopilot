import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";
import QueryStats from "@mui/icons-material/QueryStats";
import ShowChartOutlined from "@mui/icons-material/ShowChartOutlined";
import SolarPowerOutlined from "@mui/icons-material/SolarPowerOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import TimelineOutlined from "@mui/icons-material/TimelineOutlined";
import BarChart from "@mui/icons-material/BarChart";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CancelOutlined from "@mui/icons-material/CancelOutlined";
import FilterAltOutlined from "@mui/icons-material/FilterAltOutlined";
import FilterListOutlined from "@mui/icons-material/FilterListOutlined";
import HelpOutline from "@mui/icons-material/HelpOutline";
import BookmarkAddedOutlinedIcon from "@mui/icons-material/BookmarkAddedOutlined";
import { Slider } from "@/components/ui/slider-number-flow";
import RotateLeftOutlinedIcon from "@mui/icons-material/RotateLeftOutlined";
import Button from "@mui/material/Button";
import TableColumnSelector from "../components/TableColumnSelector";
import SystemInfoHelpIcon from "../components/SystemInfoHelpIcon";

const Plot = createPlotlyComponent(Plotly);

const FONT = "Inter, Arial, sans-serif";
const CHART_FONT = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
const MONO = "'JetBrains Mono', monospace";
const O = "#ff7a45";
const B = "#1d9bf0";
const KPI = "#16a34a"; // KPI page accent (green)
const Y = "#16a34a"; // green for resampled badge

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

// ── PV data helpers (self-contained for KPI page; separate from Data Filtering) ──
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

function parseDateCell(val) {
  if (val == null || String(val).trim() === "") return NaN;
  const d = new Date(String(val).trim());
  return isNaN(d.getTime()) ? NaN : d.getTime();
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
    let seen = 0, numeric = 0;
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
      if (t1 === t0 || v1 == null) { newRow[col] = v0 != null ? String(v0) : ""; continue; }
      if (v0 == null) { newRow[col] = String(v1); continue; }
      const alpha = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
      newRow[col] = String(Math.round((v0 + (v1 - v0) * alpha) * 1000) / 1000);
    }
    return newRow;
  });
  return { headers, rows: resampledRows, originalRows: rows.length, resampledRows: resampledRows.length, resampled: true };
}

/**
 * Resample rows to hourly: mean for numeric columns, first for others.
 * Used before daily KPI. Returns { headers, rows } or null.
 */
function resampleRowsToHourly(headers, rows) {
  if (!headers?.length || !rows?.length) return null;
  const timeColIdx = getDateColumnIndex(headers);
  if (timeColIdx < 0) return null;
  const HOUR_MS = 60 * 60 * 1000;
  const safeRows = rows.filter((r) => Array.isArray(r));
  const withMs = safeRows
    .map((row) => ({ row, ms: parseDateCell(row[timeColIdx]) }))
    .filter((x) => !Number.isNaN(x.ms));
  if (withMs.length === 0) return null;
  withMs.sort((a, b) => a.ms - b.ms);
  const sample = withMs.slice(0, Math.min(200, withMs.length)).map((x) => x.row);
  const numericCols = new Set();
  for (let c = 0; c < headers.length; c++) {
    if (c === timeColIdx) continue;
    let seen = 0, numeric = 0;
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
  const hourGroups = new Map();
  for (const { row, ms } of withMs) {
    const hourMs = Math.floor(ms / HOUR_MS) * HOUR_MS;
    if (!hourGroups.has(hourMs)) hourGroups.set(hourMs, []);
    hourGroups.get(hourMs).push(row);
  }
  const sortedHours = Array.from(hourGroups.keys()).sort((a, b) => a - b);
  const resampledRows = [];
  const seenHour = new Set();
  for (const hourMs of sortedHours) {
    if (seenHour.has(hourMs)) continue;
    seenHour.add(hourMs);
    const group = hourGroups.get(hourMs);
    const n = group.length;
    const firstRow = group[0];
    const newRow = new Array(headers.length);
    newRow[timeColIdx] = formatTimeCell(hourMs);
    for (let c = 0; c < headers.length; c++) {
      if (c === timeColIdx) continue;
      if (numericCols.has(c)) {
        let sum = 0, count = 0;
        for (const row of group) {
          const v = parseFloat(row[c]);
          if (Number.isFinite(v)) { sum += v; count++; }
        }
        newRow[c] = count > 0 ? String(sum / count) : (firstRow[c] ?? "");
      } else {
        newRow[c] = firstRow[c] ?? "";
      }
    }
    resampledRows.push(newRow);
  }
  return { headers, rows: resampledRows };
}

/** Daily aggregation: sum vs mean per column (supports both bare and weather_ prefix). */
const DAILY_AGG_MAP = {
  P_DC: "sum",
  P_DC_calculee: "sum",
  E_DC: "sum",
  I_SUM: "sum",
  U_DC: "mean",
  T1: "mean",
  Tcell: "mean",
  GTI: "sum",
  GHI: "sum",
  DNI: "sum",
  DHI: "sum",
  Air_Temp: "mean",
  Wind_speed: "mean",
  weather_GTI: "sum",
  weather_GHI: "sum",
  weather_DNI: "sum",
  weather_DHI: "sum",
  weather_Air_Temp: "mean",
  weather_Wind_speed: "mean",
};

/**
 * Resample rows to daily and compute E_DC, Ya, Yr, PR, and temperature-corrected PR (PR_Tcorr).
 *
 * Temperature-corrected PR_Tcorr (NREL-style) at daily level:
 *
 *   PR_Tcorr = Ya / [ Yr × (1 + γ × (T_cell_day - 25)) ]
 *
 * where:
 * - Ya          : daily array yield (kWh/kWp), already computed as E_DC / P_STC.
 * - Yr          : daily reference yield from irradiance (kWh/kWp).
 * - γ           : module temperature coefficient of power (1/°C). If provided in %/°C,
 *                 it is converted to decimal per °C (e.g. -0.38 %/°C → -0.0038 1/°C).
 * - T_cell_day  : daily representative cell temperature (°C), taken as the mean of
 *                 valid T_cell over the day (irradiance above threshold).
 *
 * T_cell at the timestep level is determined by:
 *   1) Direct Tcell column if available
 *   2) Otherwise module temperature (e.g. T1) plus 3°C
 *   3) Otherwise an ambient-based thermal model (same as backend.datafiltering.py)
 *
 * Rows with G_POA <= 20 W/m² or invalid temperature do not contribute to T_cell_day.
 * If Yr <= 0, γ is invalid, or T_cell_day is missing, PR_Tcorr is left blank.
 *
 * tot_power from system (kW). Returns { headers, rows } or null if missing columns.
 */
function resampleRowsToDaily(headers, rows, tot_power, systemConfig) {
  if (!headers?.length || !rows?.length || !Number.isFinite(tot_power) || tot_power <= 0)
    return null;
  const timeColIdx = getDateColumnIndex(headers);
  if (timeColIdx < 0) return null;

  const pdcIdx = getColumnIndex(headers, ["P_DC"]);
  const gtiIdx = getColumnIndex(headers, ["GTI", "weather_GTI"]);
  if (pdcIdx < 0 || gtiIdx < 0) return null;

  // Extract γ (temperature coefficient of power) and thermal model coefficients from system config.
  const cfg = systemConfig && typeof systemConfig === "object" ? systemConfig.config || systemConfig : null;
  let gamma = null; // temperature coefficient in 1/°C
  let coef_a = null;
  let coef_b = null;
  let delta = null;
  if (cfg && typeof cfg === "object") {
    const rawTempCoef = cfg.temp_coef != null ? Number(cfg.temp_coef) : NaN;
    if (Number.isFinite(rawTempCoef) && rawTempCoef !== 0) {
      // Datasheets give temperature coefficient in %/°C (e.g. -0.38 %/°C). Convert to 1/°C.
      // If |temp_coef| >= 0.1 it is in %/°C; if smaller, assume already decimal (e.g. -0.0038).
      const absCoef = Math.abs(rawTempCoef);
      gamma = absCoef >= 0.1 ? rawTempCoef * 1e-2 : rawTempCoef;
    }
    coef_a = cfg.coef_a != null ? Number(cfg.coef_a) : null;
    coef_b = cfg.coef_b != null ? Number(cfg.coef_b) : null;
    delta = cfg.delta != null ? Number(cfg.delta) : null;
  }

  // Temperature source column indices.
  const tcellIdx = getColumnIndex(headers, ["Tcell"]);
  const tModuleIdx = getColumnIndex(headers, ["T_module", "Tmod", "T1"]);
  const airIdx = getColumnIndex(headers, ["Air_Temp", "weather_Air_Temp"]);
  const windIdx = getColumnIndex(headers, ["Wind_speed", "weather_Wind_speed"]);

  const canUseThermalModel =
    Number.isFinite(coef_a) &&
    Number.isFinite(coef_b) &&
    Number.isFinite(delta) &&
    airIdx >= 0 &&
    windIdx >= 0 &&
    gtiIdx >= 0;

  // Helper to determine cell temperature per row following the priority:
  // 1) direct Tcell column
  // 2) module temperature (e.g. T1) + 3°C
  // 3) ambient-based thermal model (Air_Temp, GTI, Wind_speed, and system coefficients)
  function getCellTemperature(row) {
    if (!Array.isArray(row)) return null;
    if (tcellIdx >= 0) {
      const t = parseFloat(row[tcellIdx]);
      if (Number.isFinite(t)) return t;
    }
    if (tModuleIdx >= 0) {
      const tm = parseFloat(row[tModuleIdx]);
      if (Number.isFinite(tm)) return tm + 3; // module → cell offset
    }
    if (canUseThermalModel) {
      const airTemp = parseFloat(row[airIdx]);
      const gpoa = parseFloat(row[gtiIdx]);
      const wind = parseFloat(row[windIdx]);
      if (Number.isFinite(airTemp) && Number.isFinite(gpoa) && Number.isFinite(wind)) {
        // Same structure as backend/datafiltering.py and DataFilteringPage.computePdcComparison.
        return airTemp + gpoa * Math.exp(coef_a + coef_b * wind) + (gpoa * delta) / 1000;
      }
    }
    return null;
  }

  const sumCols = new Set();
  const meanCols = new Set();
  for (const [colName, how] of Object.entries(DAILY_AGG_MAP)) {
    const idx = getColumnIndex(headers, [colName]);
    if (idx >= 0) {
      if (how === "sum") sumCols.add(idx);
      else meanCols.add(idx);
    }
  }
  if (!sumCols.has(pdcIdx)) sumCols.add(pdcIdx);
  if (!meanCols.has(gtiIdx) && sumCols.has(gtiIdx) === false) sumCols.add(gtiIdx);
  if (gtiIdx >= 0 && !meanCols.has(gtiIdx)) sumCols.add(gtiIdx);

  const dayGroups = new Map();
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const ms = parseDateCell(row[timeColIdx]);
    if (Number.isNaN(ms)) continue;
    const d = new Date(ms);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!dayGroups.has(ymd)) dayGroups.set(ymd, []);
    dayGroups.get(ymd).push({ row, ms });
  }

  const sortedDays = Array.from(dayGroups.keys()).sort();
  const dailyRows = sortedDays.map((ymd) => {
    const group = dayGroups.get(ymd);
    const firstRow = group[0].row;
    const newRow = new Array(headers.length);
    newRow[timeColIdx] = ymd;
    for (let c = 0; c < headers.length; c++) {
      if (c === timeColIdx) continue;
      if (sumCols.has(c)) {
        const sum = group.reduce((s, { row }) => s + (parseFloat(row[c]) || 0), 0);
        newRow[c] = String(sum);
      } else if (meanCols.has(c)) {
        let sum = 0, count = 0;
        for (const { row } of group) {
          const v = parseFloat(row[c]);
          if (Number.isFinite(v)) { sum += v; count++; }
        }
        newRow[c] = count > 0 ? String(sum / count) : (firstRow[c] ?? "");
      } else {
        newRow[c] = firstRow[c] ?? "";
      }
    }
    const pdcSum = group.reduce((s, { row }) => s + (parseFloat(row[pdcIdx]) || 0), 0);
    const gtiSum = group.reduce((s, { row }) => s + (parseFloat(row[gtiIdx]) || 0), 0);
    // Standard (uncorrected) daily metrics. E_DC in kWh (P_DC assumed in W, sum in Wh → /1000).
    const E_DC = pdcSum / 1000;
    const Ya = E_DC / tot_power;
    const Yr = gtiSum / 1000;
    const PR = Yr > 0 ? Ya / Yr : "";
    // Temperature-corrected PR_Tcorr = Ya / [ Yr × (1 + γ × (T_cell_day - 25)) ].
    const MIN_G_POA = 20; // W/m² irradiance threshold for valid temperature contribution
    let tSum = 0;
    let tCount = 0;
    if (gamma != null && Number.isFinite(gamma) && group.length > 0) {
      for (const { row } of group) {
        const gpoa = parseFloat(row[gtiIdx]);
        if (!Number.isFinite(gpoa) || gpoa <= MIN_G_POA) continue;
        const tcell = getCellTemperature(row);
        if (!Number.isFinite(tcell)) continue;
        tSum += tcell;
        tCount++;
      }
    }
    const T_cell_day = tCount > 0 ? tSum / tCount : null;
    let PR_Tcorr = "";
    if (
      T_cell_day != null &&
      Number.isFinite(T_cell_day) &&
      gamma != null &&
      Number.isFinite(gamma) &&
      Yr > 0
    ) {
      const tempFactorDay = 1 + gamma * (T_cell_day - 25);
      if (Number.isFinite(tempFactorDay) && Math.abs(tempFactorDay) > 1e-9) {
        PR_Tcorr = Ya / (Yr * tempFactorDay);
      }
    }
    return { row: newRow, E_DC, Ya, Yr, PR, PR_Tcorr };
  });

  const dailyHeaders = [...headers, "E_DC", "Ya", "Yr", "PR", "PR_Tcorr"];
  const outRows = dailyRows.map(({ row, E_DC, Ya, Yr, PR, PR_Tcorr }) => [
    ...row,
    E_DC.toFixed(6),
    Ya.toFixed(6),
    Yr.toFixed(6),
    PR !== "" ? Number(PR).toFixed(6) : "",
    PR_Tcorr !== "" ? Number(PR_Tcorr).toFixed(6) : "",
  ]);
  return { headers: dailyHeaders, rows: outRows };
}

/** Aggregate daily KPI data to monthly or yearly by taking the mean of daily KPIs. */
function aggregateDailyKpi(dailyKpiData, mode) {
  if (!dailyKpiData?.headers?.length || !dailyKpiData?.rows?.length) return dailyKpiData ?? null;
  if (mode === "daily") return dailyKpiData;
  const headers = dailyKpiData.headers;
  const timeIdx = 0;
  const groups = new Map();
  for (const row of dailyKpiData.rows) {
    if (!Array.isArray(row)) continue;
    const t = String(row[timeIdx] ?? "");
    if (!t) continue;
    let key = t;
    if (mode === "monthly") {
      key = t.slice(0, 7); // "YYYY-MM-DD" → "YYYY-MM"
    } else if (mode === "yearly") {
      key = t.slice(0, 4); // "YYYY-MM-DD" → "YYYY"
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  if (!groups.size) return dailyKpiData;
  const sortedKeys = Array.from(groups.keys()).sort();
  const outRows = [];
  for (const key of sortedKeys) {
    const group = groups.get(key);
    const outRow = new Array(headers.length).fill("");
    outRow[timeIdx] = key;
    for (let c = 1; c < headers.length; c++) {
      let sum = 0;
      let count = 0;
      for (const r of group) {
        const v = parseFloat(r[c]);
        if (Number.isFinite(v)) {
          sum += v;
          count++;
        }
      }
      outRow[c] = count > 0 ? String(sum / count) : "";
    }
    outRows.push(outRow);
  }
  return { headers, rows: outRows };
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

function computeAllowedDaysByAvailabilityPct(headers, rows, stepMinutes, thresholdPct) {
  if (!headers?.length || !Array.isArray(rows) || rows.length === 0) return null;
  if (thresholdPct == null || !Number.isFinite(Number(thresholdPct))) return null;
  const thr = Math.min(100, Math.max(0, Number(thresholdPct)));
  const step = Math.max(1, Math.min(1440, Number(stepMinutes) || 10));
  const timeIdx = getDateColumnIndex(headers);
  if (timeIdx < 0) return null;

  // Count unique step-buckets per day to avoid duplicates.
  const stepMs = step * 60 * 1000;
  const irrIdx = getColumnIndex(headers, ["weather_GHI", "GHI", "weather_GTI", "GTI"]);
  const IRR_ON_WM2 = 20; // treat irradiance > 20 W/m² as daylight

  const bucketsByDay = new Map(); // dayKey -> Set(bucketMs) (all buckets present)
  const irrByDayBucket = new Map(); // dayKey -> Map(bucketMs -> maxIrrInBucket)
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const ms = parseDateCell(row[timeIdx]);
    if (Number.isNaN(ms)) continue;
    const dayKey = toYMD(new Date(ms));
    if (!dayKey) continue;
    const bucket = Math.floor(ms / stepMs) * stepMs;
    if (!bucketsByDay.has(dayKey)) bucketsByDay.set(dayKey, new Set());
    bucketsByDay.get(dayKey).add(bucket);

    if (irrIdx >= 0) {
      const irr = parseFloat(row[irrIdx]);
      const v = Number.isFinite(irr) ? irr : null;
      if (!irrByDayBucket.has(dayKey)) irrByDayBucket.set(dayKey, new Map());
      const m = irrByDayBucket.get(dayKey);
      const prev = m.get(bucket);
      if (v != null) m.set(bucket, prev == null ? v : Math.max(prev, v));
    }
  }
  if (!bucketsByDay.size) return null;

  const allowedDays = new Set();
  for (const [dayKey, buckets] of bucketsByDay.entries()) {
    // Expected buckets only between sunrise & sunset (inferred from irradiance)
    let expected = null;
    let observed = null;
    if (irrIdx >= 0 && irrByDayBucket.has(dayKey)) {
      const byBucket = irrByDayBucket.get(dayKey);
      const onBuckets = [];
      for (const [b, irr] of byBucket.entries()) {
        if (Number.isFinite(irr) && irr > IRR_ON_WM2) onBuckets.push(b);
      }
      if (onBuckets.length) {
        onBuckets.sort((a, b) => a - b);
        const start = onBuckets[0];
        const end = onBuckets[onBuckets.length - 1];
        expected = Math.max(1, Math.round((end - start) / stepMs) + 1);
        let count = 0;
        for (const b of buckets) {
          if (b >= start && b <= end) count++;
        }
        observed = count;
      }
    }
    if (expected == null || observed == null) {
      // Fallback: if irradiance not available, use full-day expected.
      expected = Math.max(1, Math.round(1440 / step));
      observed = buckets.size;
    }

    const pct = (observed / expected) * 100;
    if (pct >= thr) allowedDays.add(dayKey);
  }
  return allowedDays;
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

function toYMD(d) {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Toast (self-contained for KPI page) ──
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

// ── Spinner (self-contained for KPI page) ──
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

// ── Upload Zone (self-contained for KPI page; separate from Data Filtering) ──
function KpiUploadZone({
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
}) {
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputId = useRef(`kpi-upload-${Math.random().toString(36).slice(2)}`).current;

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
            <CheckCircleOutline sx={{ fontSize: 20, color: "#16a34a" }} />
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
    </div>
  );
}

// ── Date filter bar + calendar (self-contained for KPI page; separate from Data Filtering) ──
const DAYS_HEADER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const QUICK_SELECTS_KPI = [
  { label: "Today", getRange: () => { const t = new Date(); const y = toYMD(t); return [y, y]; } },
  { label: "Yesterday", getRange: () => { const t = new Date(); t.setDate(t.getDate() - 1); const y = toYMD(t); return [y, y]; } },
  { label: "Last 7 days", getRange: () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 6); return [toYMD(start), toYMD(end)]; } },
  { label: "Last 30 days", getRange: () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 29); return [toYMD(start), toYMD(end)]; } },
  { label: "This month", getRange: () => { const t = new Date(); const y = t.getFullYear(), m = t.getMonth(); const first = new Date(y, m, 1); const last = new Date(y, m + 1, 0); return [toYMD(first), toYMD(last)]; } },
  { label: "Last month", getRange: () => { const t = new Date(); const y = t.getFullYear(), m = t.getMonth() - 1; const month = m < 0 ? 11 : m; const year = m < 0 ? y - 1 : y; const first = new Date(year, month, 1); const last = new Date(year, month + 1, 0); return [toYMD(first), toYMD(last)]; } },
];

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

const CALENDAR_BLUE = "#2563eb";
const CALENDAR_BLUE_LIGHT = "rgba(37, 99, 235, 0.2)";

function KpiSingleMonthGrid({ year, month, fromYmdStr, toYmdStr, onDayClick }) {
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

function KpiDateRangePickerPopover({ dateFrom, dateTo, onDateFromChange, onDateToChange, onClear, onApply, onCancel, accentColor }) {
  const today = new Date();
  const [pendingFrom, setPendingFrom] = useState(dateFrom || null);
  const [pendingTo, setPendingTo] = useState(dateTo || null);
  const [leftYear, setLeftYear] = useState(() => (dateFrom ? new Date(dateFrom).getFullYear() : today.getFullYear()));
  const [leftMonth, setLeftMonth] = useState(() => (dateFrom ? new Date(dateFrom).getMonth() : today.getMonth()));
  const containerRef = useRef(null);
  useEffect(() => { setPendingFrom(dateFrom || null); setPendingTo(dateTo || null); }, [dateFrom, dateTo]);
  const rightYear = leftMonth === 11 ? leftYear + 1 : leftYear;
  const rightMonth = leftMonth === 11 ? 0 : leftMonth + 1;
  const handleDayClick = useCallback((d) => {
    const ymd = toYMD(d);
    if (!pendingFrom) { setPendingFrom(ymd); setPendingTo(ymd); return; }
    if (!pendingTo || pendingFrom === pendingTo) {
      if (ymd < pendingFrom) { setPendingFrom(ymd); setPendingTo(pendingFrom); } else { setPendingTo(ymd); }
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
  useEffect(() => { setRangeInput((pendingFrom && pendingTo) ? `${pendingFrom} ~ ${pendingTo}` : "YYYY-MM-DD ~ YYYY-MM-DD"); }, [pendingFrom, pendingTo]);
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
    const handleClickOutside = (e) => { if (!containerRef.current?.contains(e.target)) onCancel(); };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onCancel]);
  return (
    <div ref={containerRef} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 10px 40px rgba(0,0,0,0.12)", overflow: "hidden", minWidth: 480 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8 }}>
        <input type="text" value={rangeInput} onChange={(e) => setRangeInput(e.target.value)} onBlur={applyRangeInput} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyRangeInput(); } }} placeholder="YYYY-MM-DD ~ YYYY-MM-DD" style={{ flex: 1, fontFamily: MONO, fontSize: 13, color: "#374151", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, outline: "none" }} />
        {(pendingFrom || pendingTo) && (
          <button type="button" onClick={() => { setPendingFrom(null); setPendingTo(null); setRangeInput("YYYY-MM-DD ~ YYYY-MM-DD"); onClear(); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#6b7280" }}>
            <CloseOutlined sx={{ fontSize: 18 }} />
          </button>
        )}
      </div>
      <div style={{ display: "flex" }}>
        <div style={{ width: 120, padding: "12px 8px", borderRight: "1px solid #e5e7eb" }}>
          {QUICK_SELECTS_KPI.map(({ label, getRange }) => (
            <button key={label} type="button" onClick={() => { const [from, to] = getRange(); setPendingFrom(from); setPendingTo(to); }} style={{ display: "block", width: "100%", padding: "8px 10px", marginBottom: 2, textAlign: "left", border: "none", background: "none", fontFamily: FONT, fontSize: 12, color: accentColor, cursor: "pointer", borderRadius: 6 }}>{label}</button>
          ))}
        </div>
        <div style={{ flex: 1, display: "flex", gap: 20, padding: 16, justifyContent: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
              <button type="button" onClick={() => { if (leftMonth === 0) { setLeftMonth(11); setLeftYear((y) => y - 1); } else setLeftMonth((m) => m - 1); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><ChevronLeft sx={{ fontSize: 20, color: "#6b7280" }} /></button>
              <select value={leftYear} onChange={(e) => setLeftYear(Number(e.target.value))} style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#374151", padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer" }}>{Array.from({ length: 31 }, (_, i) => 2000 + i).map((y) => (<option key={y} value={y}>{y}</option>))}</select>
              <button type="button" onClick={() => { if (leftMonth === 11) { setLeftMonth(0); setLeftYear((y) => y + 1); } else setLeftMonth((m) => m + 1); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><ChevronRight sx={{ fontSize: 20, color: "#6b7280" }} /></button>
            </div>
            <KpiSingleMonthGrid year={leftYear} month={leftMonth} fromYmdStr={pendingFrom} toYmdStr={pendingTo} onDayClick={handleDayClick} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
              <button type="button" onClick={() => { if (leftMonth === 0) { setLeftMonth(11); setLeftYear((y) => y - 1); } else setLeftMonth((m) => m - 1); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><ChevronLeft sx={{ fontSize: 20, color: "#6b7280" }} /></button>
              <select value={rightYear} onChange={(e) => { const y = Number(e.target.value); setLeftYear(rightMonth === 0 ? y - 1 : y); if (rightMonth === 0) setLeftMonth(11); }} style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#374151", padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer" }}>{Array.from({ length: 31 }, (_, i) => 2000 + i).map((y) => (<option key={y} value={y}>{y}</option>))}</select>
              <button type="button" onClick={() => { if (leftMonth === 11) { setLeftMonth(0); setLeftYear((y) => y + 1); } else setLeftMonth((m) => m + 1); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><ChevronRight sx={{ fontSize: 20, color: "#6b7280" }} /></button>
            </div>
            <KpiSingleMonthGrid year={rightYear} month={rightMonth} fromYmdStr={pendingFrom} toYmdStr={pendingTo} onDayClick={handleDayClick} />
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

function KpiDateFilterBar({ dateFrom, dateTo, onDateFromChange, onDateToChange, onClear, totalRows, filteredRows, accentColor, resamplingStepMinutes, onResamplingStepChange }) {
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
  useEffect(() => { if (stepPopoverOpen) setStepDraftValue(String(resamplingStepMinutes)); }, [stepPopoverOpen, resamplingStepMinutes]);
  useEffect(() => {
    if (!calendarOpen) return;
    const onDown = (e) => { if (triggerRef.current?.contains(e.target) || popoverRef.current?.contains(e.target)) return; setCalendarOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [calendarOpen]);
  useEffect(() => {
    if (!stepPopoverOpen) return;
    const onDown = (e) => { if (stepTriggerRef.current?.contains(e.target) || stepPopoverRef.current?.contains(e.target)) return; if (resamplingInProgress) return; setStepPopoverOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [stepPopoverOpen, resamplingInProgress]);
  const handleValidateStep = () => {
    const v = parseInt(stepDraftValue, 10);
    if (Number.isNaN(v) || v < 1 || v > 1440) return;
    setResamplingInProgress(true);
    onResamplingStepChange(v);
    setTimeout(() => { setResamplingInProgress(false); setStepPopoverOpen(false); }, 500);
  };
  const applyRangeText = () => {
    const parsed = parseRangeTextBar(rangeText);
    if (parsed) { onDateFromChange(parsed[0]); onDateToChange(parsed[1]); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 20px", background: "#F8FAFC", borderRadius: 14, border: "1px solid #E2E8F0", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div ref={triggerRef} role="button" tabIndex={0} onClick={() => setCalendarOpen((o) => !o)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setCalendarOpen((o) => !o); }} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: `${accentColor}14`, border: `1px solid ${accentColor}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CalendarMonthOutlined sx={{ fontSize: 20, color: accentColor }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>Date range</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <input type="text" value={rangeText} onChange={(e) => setRangeText(e.target.value)} onBlur={applyRangeText} onKeyDown={(e) => e.key === "Enter" && applyRangeText()} placeholder="YYYY-MM-DD → YYYY-MM-DD" style={{ width: 260, padding: "6px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontFamily: MONO, fontSize: 13, color: "#0F172A", background: "#fff", outline: "none" }} />
          {hasFilter && (
            <>
              <button type="button" onClick={onClear} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#64748B", cursor: "pointer" }}>Clear</button>
              <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: MONO }}>Showing {filteredRows} of {totalRows} rows</span>
            </>
          )}
        </div>
        {onResamplingStepChange != null && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
            <span style={{ fontSize: 12, color: "#64748B", fontFamily: FONT, whiteSpace: "nowrap" }}>Resampling step (min)</span>
            <div ref={stepTriggerRef} role="button" tabIndex={0} onClick={() => setStepPopoverOpen(true)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setStepPopoverOpen(true)} style={{ minWidth: 56, padding: "6px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontFamily: MONO, fontSize: 13, color: "#0F172A", background: "#fff", cursor: "pointer", outline: "none" }}>
              {resamplingStepMinutes}
            </div>
            {stepPopoverOpen && (
              <div ref={stepPopoverRef} style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, zIndex: 1001, background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", boxShadow: "0 10px 40px rgba(0,0,0,0.12)", padding: 16, minWidth: 220 }}>
                {resamplingInProgress ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "20px 16px" }}>
                    <Spinner color={accentColor} size={28} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#64748B", fontFamily: FONT }}>Resampling data...</span>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 10, fontFamily: FONT }}>Resampling step (minutes)</div>
                    <input type="text" value={stepDraftValue} onChange={(e) => setStepDraftValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleValidateStep()} placeholder="e.g. 10" autoFocus style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontFamily: MONO, fontSize: 13, color: "#0F172A", background: "#fff", outline: "none", marginBottom: 12, boxSizing: "border-box" }} />
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
                        disabled={(() => { const v = parseInt(stepDraftValue, 10); return Number.isNaN(v) || v < 1 || v > 1440; })()}
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
          <KpiDateRangePickerPopover dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={onDateFromChange} onDateToChange={onDateToChange} onClear={onClear} onApply={() => setCalendarOpen(false)} onCancel={() => setCalendarOpen(false)} accentColor={accentColor} />
        </div>
      )}
    </div>
  );
}

// ── Table styles + PV Data table (KPI page only) ──
const kpiThStyle = { padding: "8px 14px", borderBottom: "1px solid #F1F5F9", color: "#0F172A", whiteSpace: "nowrap", textAlign: "left", fontWeight: 700, fontSize: 11, fontFamily: MONO, background: "#F8FAFC", position: "sticky", top: 0, zIndex: 2 };
const kpiTdStyle = { padding: "8px 14px", borderBottom: "1px solid #F1F5F9", color: "#0F172A", whiteSpace: "nowrap", fontFamily: MONO };

const ROW_NUM_ID = "_rowNum";

function KpiCSVTable({ title, icon, color, headers, rows, resampled, originalRows, resampledStepMinutes = 10, defaultVisibleLabels, titleExtra }) {
  const [expanded, setExpanded] = useState(false);
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const columns = useMemo(
    () => [
      { id: ROW_NUM_ID, label: "#" },
      ...safeHeaders.map((h, i) => ({ id: i, label: String(h ?? "").trim() || `Column ${i + 1}` })),
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
      <div onClick={() => setExpanded(!expanded)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer", userSelect: "none", borderBottom: expanded ? "1px solid #E2E8F0" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {icon}
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>{title}</span>
          {titleExtra != null && <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>{titleExtra}</span>}
          <span style={{ fontSize: 11, fontWeight: 600, color, background: `${color}14`, padding: "2px 10px", borderRadius: 20, fontFamily: MONO }}>{safeRows.length} rows × {visibleColumns.length} cols</span>
          {resampled && (
            <span style={{ fontSize: 11, fontWeight: 600, color: Y, background: `${Y}14`, padding: "2px 10px", borderRadius: 20, fontFamily: MONO }}>{resampledStepMinutes === "D" || resampledStepMinutes === "daily" ? "Daily resampled" : `${resampledStepMinutes} min resampled`}{originalRows ? ` (from ${originalRows})` : ""}</span>
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
                  <th key={c.id} style={kpiThStyle}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeRows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                  {visibleColumns.map((c) => (
                    <td key={c.id} style={c.id === ROW_NUM_ID ? { ...kpiTdStyle, color: "#94a3b8", fontWeight: 600 } : kpiTdStyle}>
                      {c.id === ROW_NUM_ID
                        ? ri + 1
                        : (() => {
                            const raw = Array.isArray(row) ? row[c.id] ?? "" : "";
                            if (raw === "" || raw === null || raw === undefined) return "";
                            const num = Number(raw);
                            if (!Number.isFinite(num)) return raw;
                            return num.toFixed(4);
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
        <div style={{ padding: "8px 20px", fontSize: 12, color: "#94a3b8", fontFamily: FONT, borderTop: "1px solid #E2E8F0" }}>Scroll to see all {safeRows.length} rows</div>
      )}
    </div>
  );
}

// ── Chart column multi-select + dual Y-axis chart (KPI page only) ──
const KPI_CHART_COLORS_LEFT = ["#1f77b4", "#dc2626", "#16a34a"];
const KPI_CHART_COLORS_RIGHT = ["#ff7f0e", "#7c3aed", "#0891b2"];
// Same Ya/Yr colors used in PR chart and Ya/Yr bar chart for consistency
const YA_YR_BAR_COLORS = { Yr: "#14B8A6", Ya: "#6366F1" };

function KpiColumnMultiSelect({ options, selected, onChange, label }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return; setOpen(false); };
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
      {label && <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 500, color: "#94a3b8", marginBottom: 2 }}>{label}</div>}
      <button ref={btnRef} type="button" onClick={() => setOpen((v) => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "5px 8px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#FAFBFC", cursor: "pointer", fontFamily: FONT, color: "#475569", fontSize: 11, fontWeight: 500 }} title={label || "Select columns"}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{buttonText}</span>
        <span style={{ display: "flex", alignItems: "center", color: "#94a3b8" }}>{open ? <ExpandLessIcon sx={{ fontSize: 14 }} /> : <ExpandMoreIcon sx={{ fontSize: 14 }} />}</span>
      </button>
      {open && (
        <div ref={popRef} style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 20, width: 280, maxHeight: 280, overflow: "auto", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, boxShadow: "0 8px 24px rgba(2, 6, 23, 0.1)", padding: 8 }}>
          <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 500, color: "#94a3b8", padding: "2px 6px 4px" }}>{label ? `${label} — columns` : "Columns"}</div>
          {options.map((opt) => {
            const checked = selected.includes(opt.index);
            return (
              <button key={opt.index} type="button" onClick={() => { const next = checked ? selected.filter((i) => i !== opt.index) : [...selected, opt.index]; onChange(next.length ? next : [options[0]?.index ?? 0]); setOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 8px", border: "none", background: checked ? "#EEF2FF" : "transparent", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: FONT, fontSize: 11, fontWeight: 500 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, border: checked ? "none" : "1px solid #CBD5E1", background: checked ? KPI : "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{checked && <CheckCircleOutline sx={{ fontSize: 10, color: "#fff" }} />}</span>
                  <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 500, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.header}</span>
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

/** Parse min/max strings into a valid [min, max] range or null. Ignores empty, invalid, or min > max. */
function parseAxisRange(minStr, maxStr) {
  const a = String(minStr ?? "").trim();
  const b = String(maxStr ?? "").trim();
  if (a === "" || b === "") return null;
  const min = Number(a);
  const max = Number(b);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null;
  return [min, max];
}

function KpiCSVChart({
  title,
  color,
  headers,
  rows,
  fullRowsForGaps,
  defaultYHeader,
  defaultRightYHeader,
  singleYAxis = false,
  traceMode = "lines",
  enableAxisRangeControls = false,
  fixedYHeader = null,
  fixedYAsPercent = false,
}) {
  const [expanded, setExpanded] = useState(true);
  const [leftYMinInput, setLeftYMinInput] = useState("");
  const [leftYMaxInput, setLeftYMaxInput] = useState("");
  const [rightYMinInput, setRightYMinInput] = useState("");
  const [rightYMaxInput, setRightYMaxInput] = useState("");
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeFullRows = Array.isArray(fullRowsForGaps) ? fullRowsForGaps : [];
  const useGaps = safeFullRows.length > 0 && safeRows.length > 0;
  const keptTimeSet = useMemo(() => {
    if (!useGaps) return null;
    return new Set(safeRows.map((r) => String(Array.isArray(r) ? r[0] : "")));
  }, [useGaps, safeRows]);
  const plottableCols = useMemo(() => {
    const source = useGaps && safeFullRows.length ? safeFullRows : safeRows;
    return safeHeaders.map((h, i) => ({ header: h, index: i })).filter(({ index }) => {
      const sample = source.slice(0, Math.min(100, source.length));
      if (sample.length === 0) return false;
      let numCount = 0;
      for (const row of sample) {
        const raw = (Array.isArray(row) ? (row[index] ?? "") : "").trim();
        if (raw === "") continue;
        const n = parseFloat(raw);
        if (!isNaN(n) && isFinite(n)) numCount++;
      }
      // For very small samples (e.g. monthly/yearly KPI with 1–2 rows), allow a column
      // if we have at least one numeric value.
      if (sample.length <= 2) return numCount >= 1;
      return numCount >= Math.max(2, sample.length * 0.15);
    });
  }, [safeHeaders, safeRows, safeFullRows, useGaps]);
  const defaultLeftIdx = useMemo(() => {
    if (plottableCols.length === 0) return [];
    if (fixedYHeader && safeHeaders.length > 1) {
      const target = String(fixedYHeader).trim().toLowerCase();
      const idx = safeHeaders.findIndex((h, i) => i > 0 && String(h ?? "").trim().toLowerCase() === target);
      if (idx > 0 && plottableCols.some((c) => c.index === idx)) return [idx];
    }
    if (defaultYHeader && safeHeaders.length > 1) {
      const target = String(defaultYHeader).trim().toLowerCase();
      const idx = safeHeaders.findIndex((h, i) => i > 0 && String(h ?? "").trim().toLowerCase() === target);
      if (idx > 0 && plottableCols.some((c) => c.index === idx)) return [idx];
    }
    return [plottableCols[0].index];
  }, [safeHeaders, defaultYHeader, fixedYHeader, plottableCols]);
  const defaultRightIdx = useMemo(() => {
    if (singleYAxis || !defaultRightYHeader || plottableCols.length === 0) return [];
    const target = String(defaultRightYHeader).trim().toLowerCase();
    const idx = safeHeaders.findIndex((h, i) => i > 0 && String(h ?? "").trim().toLowerCase() === target);
    if (idx > 0 && plottableCols.some((c) => c.index === idx)) return [idx];
    return [];
  }, [singleYAxis, safeHeaders, defaultRightYHeader, plottableCols]);
  const [selectedIndicesLeft, setSelectedIndicesLeft] = useState(() => defaultLeftIdx);
  const [selectedIndicesRight, setSelectedIndicesRight] = useState(() => defaultRightIdx);
  const xValues = useMemo(() => {
    if (useGaps && safeFullRows.length) return safeFullRows.map((r) => (Array.isArray(r) ? r[0] : ""));
    return safeRows.length === 0 ? [] : safeRows.map((r) => (Array.isArray(r) ? r[0] : ""));
  }, [safeRows, safeFullRows, useGaps]);
  const chartData = useMemo(() => {
    const traces = [];
    const mode = traceMode || "lines";
    const getYValues = (colIndex) => {
      const headerLower = String(safeHeaders[colIndex] ?? "").trim().toLowerCase();
      const fixedLower = fixedYHeader ? String(fixedYHeader).trim().toLowerCase() : null;
      const isPercentCol =
        fixedYAsPercent &&
        fixedLower &&
        (headerLower === fixedLower || headerLower === "pr_tcorr");
      if (useGaps && keptTimeSet && safeFullRows.length) {
        return safeFullRows.map((r) => {
          const key = String(Array.isArray(r) ? r[0] : "");
          if (!keptTimeSet.has(key)) return null;
          const raw = Array.isArray(r) ? r[colIndex] : "";
          const v = parseFloat(raw);
          if (isNaN(v)) return null;
          if (isPercentCol) {
            return v * 100;
          }
          return v;
        });
      }
      return safeRows.map((r) => {
        const raw = Array.isArray(r) ? r[colIndex] : "";
        const v = parseFloat(raw);
        if (isNaN(v)) return null;
        if (isPercentCol) {
          return v * 100;
        }
        return v;
      });
    };
    selectedIndicesLeft.forEach((colIndex, i) => {
      const yValues = getYValues(colIndex);
      const name = safeHeaders[colIndex] ?? `Col ${colIndex}`;
      const headerLower = String(safeHeaders[colIndex] ?? "").trim().toLowerCase();
      const fixedLower = fixedYHeader ? String(fixedYHeader).trim().toLowerCase() : null;
      const isPercentTrace =
        fixedYAsPercent &&
        fixedLower &&
        (headerLower === fixedLower || headerLower === "pr_tcorr");
      const hoverTemplate = isPercentTrace ? "<b>%{fullData.name}</b>: %{y:.2f}%<extra></extra>" : "<b>%{fullData.name}</b>: %{y}<extra></extra>";
      const lineColor =
        fixedLower === "pr" && i === 0
          ? YA_YR_BAR_COLORS.Ya
          : KPI_CHART_COLORS_LEFT[i % KPI_CHART_COLORS_LEFT.length];
      const trace = {
        x: xValues,
        y: yValues,
        type: "scatter",
        mode,
        connectgaps: false,
        name: singleYAxis ? name : name + " (L)",
        line: { color: lineColor, width: 1.5, shape: "spline", smoothing: 1.2 },
        hovertemplate: hoverTemplate,
        yaxis: "y",
      };
      if (mode.includes("markers")) trace.marker = { size: 6 };
      traces.push(trace);
    });
    // For the dedicated Performance Ratio chart, always add a second trace for
    // temperature-corrected PR (PR_Tcorr) if the column exists, so both series
    // share the same x-axis, aggregation, and styling.
    if (fixedYHeader && String(fixedYHeader).trim().toLowerCase() === "pr") {
      const prTcorrIdx = safeHeaders.findIndex((h, i) => i > 0 && String(h ?? "").trim().toLowerCase() === "pr_tcorr");
      if (prTcorrIdx > 0) {
        const yValues = getYValues(prTcorrIdx);
        const isPercentTrace = fixedYAsPercent;
        const hoverTemplate = isPercentTrace ? "<b>%{fullData.name}</b>: %{y:.2f}%<extra></extra>" : "<b>%{fullData.name}</b>: %{y}<extra></extra>";
        const trace = {
          x: xValues,
          y: yValues,
          type: "scatter",
          mode,
          connectgaps: false,
          name: singleYAxis ? "PR Temperature Corrected" : "PR Temperature Corrected (L)",
          line: {
            color: YA_YR_BAR_COLORS.Yr,
            width: 1.5,
            shape: "spline",
            smoothing: 1.2,
          },
          hovertemplate: hoverTemplate,
          yaxis: "y",
        };
        if (mode.includes("markers")) trace.marker = { size: 6 };
        traces.push(trace);
      }
    }
    if (!singleYAxis) {
      selectedIndicesRight.forEach((colIndex, i) => {
        const yValues = getYValues(colIndex);
        const trace = { x: xValues, y: yValues, type: "scatter", mode: "lines", connectgaps: false, name: (safeHeaders[colIndex] ?? `Col ${colIndex}`) + " (R)", line: { color: KPI_CHART_COLORS_RIGHT[i % KPI_CHART_COLORS_RIGHT.length], width: 1.5, shape: "spline", smoothing: 1.2 }, hovertemplate: "<b>%{fullData.name}</b>: %{y}<extra></extra>", yaxis: "y2" };
        traces.push(trace);
      });
    }
    return traces;
  }, [safeRows, safeFullRows, safeHeaders, selectedIndicesLeft, selectedIndicesRight, xValues, useGaps, keptTimeSet, singleYAxis, traceMode]);
  const hasLeft = selectedIndicesLeft.length > 0;
  const hasRight = !singleYAxis && selectedIndicesRight.length > 0;
  const leftTitle =
    fixedYAsPercent && fixedYHeader
      ? "Performance Ratio (%)"
      : hasLeft && selectedIndicesLeft.length === 1
      ? safeHeaders[selectedIndicesLeft[0]] ?? "Left"
      : "Left Y-axis";
  const rightTitle = hasRight && selectedIndicesRight.length === 1 ? (safeHeaders[selectedIndicesRight[0]] ?? "Right") : "Right Y-axis";
  const leftRange = enableAxisRangeControls ? parseAxisRange(leftYMinInput, leftYMaxInput) : null;
  const rightRange = enableAxisRangeControls && hasRight ? parseAxisRange(rightYMinInput, rightYMaxInput) : null;
  const yaxisLayout = {
    ...{
      title: { text: leftTitle, font: { family: CHART_FONT, size: 11, color: "#94a3b8", weight: 500 } },
      showgrid: true,
      gridcolor: "#e5e7eb",
      griddash: "dot",
      gridwidth: 1,
      zeroline: false,
      showline: false,
      tickfont: { family: CHART_FONT, size: 12, color: "#94a3b8" },
      ticklen: 0,
      tickcolor: "rgba(0,0,0,0)",
      side: "left",
    },
    ...(leftRange ? { autorange: false, range: leftRange } : { autorange: true }),
  };
  const yaxis2Layout = hasRight
    ? {
        ...{
          title: { text: rightTitle, font: { family: CHART_FONT, size: 11, color: "#94a3b8", weight: 500 } },
          gridcolor: "transparent",
          zeroline: false,
          showline: false,
          tickfont: { family: CHART_FONT, size: 12, color: "#94a3b8" },
          ticklen: 0,
          tickcolor: "rgba(0,0,0,0)",
          overlaying: "y",
          side: "right",
        },
        ...(rightRange ? { autorange: false, range: rightRange } : { autorange: true }),
      }
    : undefined;
  if (plottableCols.length === 0) return null;
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 26,
        border: "1px solid #e2e8f0",
        boxShadow: "0 8px 30px rgba(15,23,42,0.06)",
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
          borderBottom: expanded ? "1px solid #e2e8f0" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TimelineOutlined sx={{ fontSize: 20, color }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>{title} — Chart</span>
        </div>
        {!fixedYHeader && (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }} onClick={(e) => e.stopPropagation()}>
            <KpiColumnMultiSelect label={singleYAxis ? "Y-axis" : "Left Y-axis"} options={plottableCols} selected={selectedIndicesLeft} onChange={setSelectedIndicesLeft} />
            {!singleYAxis && <KpiColumnMultiSelect label="Right Y-axis" options={plottableCols} selected={selectedIndicesRight} onChange={setSelectedIndicesRight} />}
            {expanded ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} /> : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />}
          </div>
        )}
        {fixedYHeader && (expanded ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} /> : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />)}
      </div>
      {expanded && (
        <div
          style={{
            padding: "16px 16px 20px",
            margin: "0 12px 12px 12px",
            background: "#fff",
            borderRadius: 16,
          }}
        >
          {chartData.length === 0 ? (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontFamily: FONT }}>{singleYAxis ? "Select a column for Y-axis" : "Select at least one column from Left or Right Y-axis"}</div>
          ) : (
            <>
              {enableAxisRangeControls && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 10, padding: "8px 10px", background: "#F8FAFC", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 500, color: "#64748B", whiteSpace: "nowrap" }}>Left Y-axis Min</span>
                    <input type="text" value={leftYMinInput} onChange={(e) => setLeftYMinInput(e.target.value)} placeholder="auto" style={{ width: 64, padding: "4px 6px", fontFamily: MONO, fontSize: 11, color: "#0F172A", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff" }} />
                    <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 500, color: "#64748B" }}>Max</span>
                    <input type="text" value={leftYMaxInput} onChange={(e) => setLeftYMaxInput(e.target.value)} placeholder="auto" style={{ width: 64, padding: "4px 6px", fontFamily: MONO, fontSize: 11, color: "#0F172A", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff" }} />
                    <button type="button" onClick={() => { setLeftYMinInput(""); setLeftYMaxInput(""); }} style={{ padding: "4px 8px", fontFamily: FONT, fontSize: 10, fontWeight: 600, color: "#64748B", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer" }} title="Reset to automatic scaling">Reset</button>
                  </div>
                  {hasRight && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 500, color: "#64748B", whiteSpace: "nowrap" }}>Right Y-axis Min</span>
                      <input type="text" value={rightYMinInput} onChange={(e) => setRightYMinInput(e.target.value)} placeholder="auto" style={{ width: 64, padding: "4px 6px", fontFamily: MONO, fontSize: 11, color: "#0F172A", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff" }} />
                      <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 500, color: "#64748B" }}>Max</span>
                      <input type="text" value={rightYMaxInput} onChange={(e) => setRightYMaxInput(e.target.value)} placeholder="auto" style={{ width: 64, padding: "4px 6px", fontFamily: MONO, fontSize: 11, color: "#0F172A", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff" }} />
                      <button type="button" onClick={() => { setRightYMinInput(""); setRightYMaxInput(""); }} style={{ padding: "4px 8px", fontFamily: FONT, fontSize: 10, fontWeight: 600, color: "#64748B", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer" }} title="Reset to automatic scaling">Reset</button>
                    </div>
                  )}
                </div>
              )}
              <Plot
                data={chartData}
                layout={{
                  height: 340,
                  margin: { t: 52, r: singleYAxis ? 50 : 60, b: 50, l: 60 },
                  hovermode: "x unified",
                  showlegend: chartData.length > 1,
                  legend: {
                    orientation: "h",
                    x: 0.5,
                    y: 1.02,
                    xanchor: "center",
                    yanchor: "bottom",
                    font: { family: CHART_FONT, size: 12, color: "#94a3b8" },
                    bgcolor: "rgba(255,255,255,0)",
                    bordercolor: "rgba(0,0,0,0)",
                  },
                  xaxis: {
                    title: { text: safeHeaders[0] ?? "Index", font: { family: CHART_FONT, size: 11, color: "#94a3b8", weight: 500 } },
                    showgrid: false,
                    zeroline: false,
                    showline: false,
                    tickfont: { family: CHART_FONT, size: 12, color: "#94a3b8" },
                    ticklen: 0,
                    tickcolor: "rgba(0,0,0,0)",
                    rangeslider: { visible: false },
                  },
                  yaxis: yaxisLayout,
                  ...(yaxis2Layout && { yaxis2: yaxis2Layout }),
                  plot_bgcolor: "#fff",
                  paper_bgcolor: "#fff",
                  font: { family: CHART_FONT },
                  hoverlabel: {
                    bgcolor: "#fff",
                    bordercolor: "#e2e8f0",
                    font: { family: CHART_FONT, size: 12, color: "#0F172A" },
                  },
                }}
                config={{ displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] }}
                style={{ width: "100%" }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ya / Yr grouped bar chart (same card style as Daily KPI — Chart) ──
function KpiYaYrBarChart({ title, color, x, ya, yr, xAxisTitle }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 26,
        border: "1px solid #e2e8f0",
        boxShadow: "0 8px 30px rgba(15,23,42,0.06)",
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
          borderBottom: expanded ? "1px solid #e2e8f0" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BarChart sx={{ fontSize: 20, color }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>{title} — Chart</span>
        </div>
        {expanded ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} /> : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />}
      </div>
      {expanded && (
        <div
          style={{
            padding: "16px 16px 20px",
            margin: "0 12px 12px 12px",
            background: "#fff",
            borderRadius: 16,
          }}
        >
          <Plot
            data={[
              {
                x,
                y: yr,
                type: "bar",
                name: "Yr",
                marker: { color: YA_YR_BAR_COLORS.Yr, line: { width: 0 } },
                hovertemplate: "<b>Yr</b>: %{y}<extra></extra>",
              },
              {
                x,
                y: ya,
                type: "bar",
                name: "Ya",
                marker: { color: YA_YR_BAR_COLORS.Ya, line: { width: 0 } },
                hovertemplate: "<b>Ya</b>: %{y}<extra></extra>",
              },
            ]}
            layout={{
              barmode: "group",
              bargap: 0.38,
              bargroupgap: 0.31,
              barcornerradius: 8,
              hovermode: "x unified",
              template: "plotly_white",
              height: 340,
              margin: { t: 52, r: 50, b: 50, l: 60 },
              showlegend: true,
              legend: {
                orientation: "h",
                x: 0.5,
                y: 1.02,
                xanchor: "center",
                yanchor: "bottom",
                font: { family: CHART_FONT, size: 12, color: "#94a3b8" },
                itemclick: "toggle",
                itemdoubleclick: "toggleothers",
                bgcolor: "rgba(255,255,255,0)",
                bordercolor: "rgba(0,0,0,0)",
              },
              xaxis: {
                title: { text: xAxisTitle, font: { family: CHART_FONT, size: 11, color: "#94a3b8", weight: 500 } },
                showgrid: false,
                zeroline: false,
                showline: false,
                tickfont: { family: CHART_FONT, size: 12, color: "#94a3b8" },
                ticklen: 0,
                tickcolor: "rgba(0,0,0,0)",
              },
              yaxis: {
                title: { text: "Yield (kWh/kWp)", font: { family: CHART_FONT, size: 11, color: "#94a3b8", weight: 500 } },
                showgrid: true,
                gridcolor: "#e5e7eb",
                griddash: "dot",
                gridwidth: 1,
                zeroline: false,
                showline: false,
                tickfont: { family: CHART_FONT, size: 12, color: "#94a3b8" },
                ticklen: 0,
                tickcolor: "rgba(0,0,0,0)",
              },
              plot_bgcolor: "#fff",
              paper_bgcolor: "#fff",
              font: { family: CHART_FONT },
              hoverlabel: {
                bgcolor: "#fff",
                bordercolor: "#e2e8f0",
                font: { family: CHART_FONT, size: 12, color: "#0F172A" },
              },
            }}
            config={{ displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] }}
            style={{ width: "100%" }}
          />
        </div>
      )}
    </div>
  );
}

// ── System Info display (self-contained for KPI page; separate from Data Filtering) ──
function KpiNestedObject({ obj }) {
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
              <KpiNestedObject obj={v} />
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

function KpiSystemInfo({ data }) {
  const [expanded, setExpanded] = useState(true);

  const renderValue = (val) => {
    if (val === null || val === undefined) return <span style={{ color: "#94a3b8" }}>null</span>;
    if (typeof val === "boolean") return <span style={{ color: KPI, fontWeight: 600 }}>{val.toString()}</span>;
    if (typeof val === "number") return <span style={{ color: B, fontFamily: MONO }}>{val}</span>;
    if (typeof val === "string") return <span style={{ color: "#0F172A" }}>{val}</span>;
    if (Array.isArray(val)) return <span style={{ color: "#64748B", fontFamily: MONO }}>[{val.join(", ")}]</span>;
    if (typeof val === "object") return <KpiNestedObject obj={val} />;
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SettingsOutlined sx={{ fontSize: 20, color: O }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>
            System Info
          </span>
          <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
            <SystemInfoHelpIcon linkColor={KPI} />
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

const CACHE_KEY_PV = "pvcopilot_kpi_pv_cache";
const CACHE_KEY_SYSTEM = "pvcopilot_kpi_system_cache";

export default function KpiAnalysisPage() {
  const [pvFile, setPvFile] = useState(null);
  const [pvRawData, setPvRawData] = useState(null);
  const [sysFile, setSysFile] = useState(null);
  const [sysData, setSysData] = useState(null);
  const [toast, setToast] = useState(null);
  const [kpiOverviewOpen, setKpiOverviewOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [resamplingStepMinutes, setResamplingStepMinutes] = useState(10);
  // IEC61724 filter bounds (GHI W/m², T_amb °C, Wind_speed m/s)
  const [iecGhiMin, setIecGhiMin] = useState("20");
  const [iecGhiMax, setIecGhiMax] = useState("1500");
  const [iecAirTempMin, setIecAirTempMin] = useState("-40");
  const [iecAirTempMax, setIecAirTempMax] = useState("60");
  const [iecWindSpeedMin, setIecWindSpeedMin] = useState("0");
  const [iecWindSpeedMax, setIecWindSpeedMax] = useState("30");
  const [iecPowerMin, setIecPowerMin] = useState("10");
  const [iecPowerMax, setIecPowerMax] = useState(""); // empty = use max of P_DC in data
  const [iecDataAvailabilityPct, setIecDataAvailabilityPct] = useState("0"); // percent threshold; 0 = disabled
  const [iecStatusFilter, setIecStatusFilter] = useState("all"); // "all" | "valid"
  const [iecStatusHover, setIecStatusHover] = useState(null); // "all" | "valid" | null
  const [iecHelpOpen, setIecHelpOpen] = useState(false);
  const iecHelpRef = useRef(null);
  const [ghiPopoverOpen, setGhiPopoverOpen] = useState(false);
  const [ghiDraftValue, setGhiDraftValue] = useState([0, 0]);
  const ghiTriggerRef = useRef(null);
  const ghiPopoverRef = useRef(null);
  const [airPopoverOpen, setAirPopoverOpen] = useState(false);
  const [airDraftValue, setAirDraftValue] = useState([0, 0]);
  const airTriggerRef = useRef(null);
  const airPopoverRef = useRef(null);
  const [windPopoverOpen, setWindPopoverOpen] = useState(false);
  const [windDraftValue, setWindDraftValue] = useState([0, 0]);
  const windTriggerRef = useRef(null);
  const windPopoverRef = useRef(null);
  const [powerPopoverOpen, setPowerPopoverOpen] = useState(false);
  const [powerDraftValue, setPowerDraftValue] = useState([0, 0]);
  const powerTriggerRef = useRef(null);
  const powerPopoverRef = useRef(null);
  const [availabilityPopoverOpen, setAvailabilityPopoverOpen] = useState(false);
  const [availabilityDraftValue, setAvailabilityDraftValue] = useState([0]);
  const availabilityTriggerRef = useRef(null);
  const availabilityPopoverRef = useRef(null);
  const [inlineEditField, setInlineEditField] = useState(null); // enables manual typing on dblclick
  const ghiMinInputRef = useRef(null);
  const ghiMaxInputRef = useRef(null);
  const airMinInputRef = useRef(null);
  const airMaxInputRef = useRef(null);
  const windMinInputRef = useRef(null);
  const windMaxInputRef = useRef(null);
  const powerMinInputRef = useRef(null);
  const powerMaxInputRef = useRef(null);
  const availabilityInputRef = useRef(null);
  const [kpiFormulasHelpOpen, setKpiFormulasHelpOpen] = useState(false);
  const kpiFormulasHelpRef = useRef(null);
  // Applied IEC61724 + status filter (used for actual filtering; draft = inputs until Apply)
  const [appliedIecGhiMin, setAppliedIecGhiMin] = useState("20");
  const [appliedIecGhiMax, setAppliedIecGhiMax] = useState("1500");
  const [appliedIecAirTempMin, setAppliedIecAirTempMin] = useState("-40");
  const [appliedIecAirTempMax, setAppliedIecAirTempMax] = useState("60");
  const [appliedIecWindSpeedMin, setAppliedIecWindSpeedMin] = useState("0");
  const [appliedIecWindSpeedMax, setAppliedIecWindSpeedMax] = useState("30");
  const [appliedIecPowerMin, setAppliedIecPowerMin] = useState("10");
  const [appliedIecPowerMax, setAppliedIecPowerMax] = useState(null); // null = use max P_DC in data
  const [appliedIecDataAvailabilityPct, setAppliedIecDataAvailabilityPct] = useState(0); // 0 = disabled
  const [appliedIecStatusFilter, setAppliedIecStatusFilter] = useState("all");

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type, key: Date.now() });
  }, []);

  const IEC_DEFAULTS = useMemo(() => ({ ghiMin: "20", ghiMax: "1500", airMin: "-40", airMax: "60", windMin: "0", windMax: "30", powerMin: "10", powerMax: "", dataAvailabilityPct: "0", status: "all" }), []);
  const iecAppliedSignature = useMemo(
    () =>
      [
        appliedIecGhiMin,
        appliedIecGhiMax,
        appliedIecAirTempMin,
        appliedIecAirTempMax,
        appliedIecWindSpeedMin,
        appliedIecWindSpeedMax,
        appliedIecPowerMin,
        appliedIecPowerMax ?? "maxPdc",
        appliedIecDataAvailabilityPct ?? "noAvail",
        appliedIecStatusFilter,
      ].join("|"),
    [
      appliedIecGhiMin,
      appliedIecGhiMax,
      appliedIecAirTempMin,
      appliedIecAirTempMax,
      appliedIecWindSpeedMin,
      appliedIecWindSpeedMax,
      appliedIecPowerMin,
      appliedIecPowerMax,
      appliedIecDataAvailabilityPct,
      appliedIecStatusFilter,
    ]
  );
  const handleIecApply = useCallback(() => {
    setAppliedIecGhiMin(iecGhiMin);
    setAppliedIecGhiMax(iecGhiMax);
    setAppliedIecAirTempMin(iecAirTempMin);
    setAppliedIecAirTempMax(iecAirTempMax);
    setAppliedIecWindSpeedMin(iecWindSpeedMin);
    setAppliedIecWindSpeedMax(iecWindSpeedMax);
    setAppliedIecPowerMin(iecPowerMin);
    setAppliedIecPowerMax(iecPowerMax !== "" && !Number.isNaN(Number(iecPowerMax)) ? iecPowerMax : null);
    {
      const n = Number(iecDataAvailabilityPct);
      const clamped = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
      setAppliedIecDataAvailabilityPct(clamped);
    }
    setAppliedIecStatusFilter(iecStatusFilter);
    showToast("IEC61724 and status filters applied; data recalculated.");
  }, [iecGhiMin, iecGhiMax, iecAirTempMin, iecAirTempMax, iecWindSpeedMin, iecWindSpeedMax, iecPowerMin, iecPowerMax, iecDataAvailabilityPct, iecStatusFilter, showToast]);
  const handleIecReset = useCallback(() => {
    const d = IEC_DEFAULTS;
    setIecGhiMin(d.ghiMin);
    setIecGhiMax(d.ghiMax);
    setIecAirTempMin(d.airMin);
    setIecAirTempMax(d.airMax);
    setIecWindSpeedMin(d.windMin);
    setIecWindSpeedMax(d.windMax);
    setIecPowerMin(d.powerMin);
    setIecPowerMax(d.powerMax);
    setIecDataAvailabilityPct(d.dataAvailabilityPct);
    setIecStatusFilter(d.status);
    setAppliedIecGhiMin(d.ghiMin);
    setAppliedIecGhiMax(d.ghiMax);
    setAppliedIecAirTempMin(d.airMin);
    setAppliedIecAirTempMax(d.airMax);
    setAppliedIecWindSpeedMin(d.windMin);
    setAppliedIecWindSpeedMax(d.windMax);
    setAppliedIecPowerMin(d.powerMin);
    setAppliedIecPowerMax(null);
    setAppliedIecDataAvailabilityPct(Number(d.dataAvailabilityPct) || 0);
    setAppliedIecStatusFilter(d.status);
    showToast("IEC61724 filters reset to defaults and applied.");
  }, [IEC_DEFAULTS, showToast]);

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
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!availabilityPopoverOpen) return;
    const raw = Number(iecDataAvailabilityPct);
    const v = Number.isFinite(raw) ? Math.min(100, Math.max(0, Math.round(raw))) : 0;
    setAvailabilityDraftValue([v]);
    const onDown = (e) => {
      const t = e.target;
      if (availabilityPopoverRef.current && availabilityPopoverRef.current.contains(t)) return;
      if (availabilityTriggerRef.current && availabilityTriggerRef.current.contains(t)) return;
      setAvailabilityPopoverOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [availabilityPopoverOpen, iecDataAvailabilityPct]);

  useEffect(() => {
    if (!inlineEditField) return;
    const map = {
      ghiMin: ghiMinInputRef,
      ghiMax: ghiMaxInputRef,
      airMin: airMinInputRef,
      airMax: airMaxInputRef,
      windMin: windMinInputRef,
      windMax: windMaxInputRef,
      powerMin: powerMinInputRef,
      powerMax: powerMaxInputRef,
      availability: availabilityInputRef,
    };
    const ref = map[inlineEditField];
    if (ref?.current) {
      // next tick to ensure readOnly flips before focusing
      setTimeout(() => {
        try {
          ref.current.focus();
          ref.current.select?.();
        } catch (_) {}
      }, 0);
    }
  }, [inlineEditField]);

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
      } catch (_) {}
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

  const pvRawFilteredRowsForAvailability = useMemo(
    () => (pvRawData ? filterRowsByDateRange(pvRawData.headers, pvRawData.rows, dateFrom, dateTo) : []),
    [pvRawData, dateFrom, dateTo]
  );

  // Max P_DC in current (date-filtered) data for Power (kW) filter default
  const maxPdcInData = useMemo(() => {
    if (!pvData?.headers?.length || !pvFilteredRows.length) return null;
    const pdcIdx = getColumnIndex(pvData.headers, ["P_DC"]);
    if (pdcIdx < 0) return null;
    let max = -Infinity;
    for (const row of pvFilteredRows) {
      const v = parseFloat(Array.isArray(row) ? row[pdcIdx] : "");
      if (Number.isFinite(v) && v > max) max = v;
    }
    return max === -Infinity ? null : max;
  }, [pvData, pvFilteredRows]);

  const commitInlineEdit = useCallback((field) => {
    const clampInt = (n, min, max) => Math.round(Math.min(max, Math.max(min, n)));
    const maxP = Math.max(0, Number(maxPdcInData) || 0);

    if (field === "ghiMin" || field === "ghiMax") {
      const a = Number(field === "ghiMin" ? iecGhiMin : iecGhiMax);
      const v = Number.isFinite(a) ? clampInt(a, 0, 2000) : (field === "ghiMin" ? 0 : 2000);
      if (field === "ghiMin") setIecGhiMin(String(v)); else setIecGhiMax(String(v));
      const lo = Number(iecGhiMin), hi = Number(iecGhiMax);
      if (Number.isFinite(lo) && Number.isFinite(hi) && lo > hi) { setIecGhiMin(String(hi)); setIecGhiMax(String(lo)); }
    }
    if (field === "airMin" || field === "airMax") {
      const a = Number(field === "airMin" ? iecAirTempMin : iecAirTempMax);
      const v = Number.isFinite(a) ? clampInt(a, -50, 80) : (field === "airMin" ? -50 : 80);
      if (field === "airMin") setIecAirTempMin(String(v)); else setIecAirTempMax(String(v));
      const lo = Number(iecAirTempMin), hi = Number(iecAirTempMax);
      if (Number.isFinite(lo) && Number.isFinite(hi) && lo > hi) { setIecAirTempMin(String(hi)); setIecAirTempMax(String(lo)); }
    }
    if (field === "windMin" || field === "windMax") {
      const a = Number(field === "windMin" ? iecWindSpeedMin : iecWindSpeedMax);
      const v = Number.isFinite(a) ? clampInt(a, 0, 50) : (field === "windMin" ? 0 : 50);
      if (field === "windMin") setIecWindSpeedMin(String(v)); else setIecWindSpeedMax(String(v));
      const lo = Number(iecWindSpeedMin), hi = Number(iecWindSpeedMax);
      if (Number.isFinite(lo) && Number.isFinite(hi) && lo > hi) { setIecWindSpeedMin(String(hi)); setIecWindSpeedMax(String(lo)); }
    }
    if (field === "powerMin" || field === "powerMax") {
      if (field === "powerMin") {
        const a = Number(iecPowerMin);
        const v = Number.isFinite(a) ? clampInt(a, 0, maxP) : 0;
        setIecPowerMin(String(v));
      } else {
        // allow empty max (means "auto/max(P_DC)")
        if (String(iecPowerMax ?? "").trim() === "") {
          setIecPowerMax("");
        } else {
          const a = Number(iecPowerMax);
          const v = Number.isFinite(a) ? clampInt(a, 0, maxP) : maxP;
          setIecPowerMax(String(v));
        }
      }
      const lo = Number(iecPowerMin);
      const hi = iecPowerMax === "" ? maxP : Number(iecPowerMax);
      if (Number.isFinite(lo) && Number.isFinite(hi) && lo > hi) { setIecPowerMin(String(Math.round(hi))); setIecPowerMax(String(Math.round(lo))); }
    }
    if (field === "availability") {
      const a = Number(iecDataAvailabilityPct);
      const v = Number.isFinite(a) ? clampInt(a, 0, 100) : 0;
      setIecDataAvailabilityPct(String(v));
    }
    setInlineEditField(null);
  }, [
    iecGhiMin,
    iecGhiMax,
    iecAirTempMin,
    iecAirTempMax,
    iecWindSpeedMin,
    iecWindSpeedMax,
    iecPowerMin,
    iecPowerMax,
    iecDataAvailabilityPct,
    maxPdcInData,
  ]);

  useEffect(() => {
    if (!ghiPopoverOpen) return;
    const rawMin = Number(iecGhiMin);
    const rawMax = Number(iecGhiMax);
    let lo = Number.isFinite(rawMin) ? rawMin : 0;
    let hi = Number.isFinite(rawMax) ? rawMax : 0;
    lo = Math.min(2000, Math.max(0, lo));
    hi = Math.min(2000, Math.max(0, hi));
    if (lo > hi) [lo, hi] = [hi, lo];
    setGhiDraftValue([Math.round(lo), Math.round(hi)]);
    const onDown = (e) => {
      const t = e.target;
      if (ghiPopoverRef.current && ghiPopoverRef.current.contains(t)) return;
      if (ghiTriggerRef.current && ghiTriggerRef.current.contains(t)) return;
      setGhiPopoverOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ghiPopoverOpen, iecGhiMin, iecGhiMax]);

  useEffect(() => {
    if (!airPopoverOpen) return;
    const rawMin = Number(iecAirTempMin);
    const rawMax = Number(iecAirTempMax);
    let lo = Number.isFinite(rawMin) ? rawMin : -50;
    let hi = Number.isFinite(rawMax) ? rawMax : 80;
    lo = Math.min(80, Math.max(-50, lo));
    hi = Math.min(80, Math.max(-50, hi));
    if (lo > hi) [lo, hi] = [hi, lo];
    setAirDraftValue([Math.round(lo), Math.round(hi)]);
    const onDown = (e) => {
      const t = e.target;
      if (airPopoverRef.current && airPopoverRef.current.contains(t)) return;
      if (airTriggerRef.current && airTriggerRef.current.contains(t)) return;
      setAirPopoverOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [airPopoverOpen, iecAirTempMin, iecAirTempMax]);

  useEffect(() => {
    if (!windPopoverOpen) return;
    const rawMin = Number(iecWindSpeedMin);
    const rawMax = Number(iecWindSpeedMax);
    let lo = Number.isFinite(rawMin) ? rawMin : 0;
    let hi = Number.isFinite(rawMax) ? rawMax : 50;
    lo = Math.min(50, Math.max(0, lo));
    hi = Math.min(50, Math.max(0, hi));
    if (lo > hi) [lo, hi] = [hi, lo];
    setWindDraftValue([Math.round(lo), Math.round(hi)]);
    const onDown = (e) => {
      const t = e.target;
      if (windPopoverRef.current && windPopoverRef.current.contains(t)) return;
      if (windTriggerRef.current && windTriggerRef.current.contains(t)) return;
      setWindPopoverOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [windPopoverOpen, iecWindSpeedMin, iecWindSpeedMax]);

  useEffect(() => {
    if (!powerPopoverOpen) return;
    const max = Math.max(0, Number(maxPdcInData) || 0);
    const rawMin = Number(iecPowerMin);
    const rawMax = iecPowerMax === "" ? max : Number(iecPowerMax);
    let lo = Number.isFinite(rawMin) ? rawMin : 0;
    let hi = Number.isFinite(rawMax) ? rawMax : max;
    lo = Math.min(max, Math.max(0, lo));
    hi = Math.min(max, Math.max(0, hi));
    if (lo > hi) [lo, hi] = [hi, lo];
    setPowerDraftValue([Math.round(lo), Math.round(hi)]);
    const onDown = (e) => {
      const t = e.target;
      if (powerPopoverRef.current && powerPopoverRef.current.contains(t)) return;
      if (powerTriggerRef.current && powerTriggerRef.current.contains(t)) return;
      setPowerPopoverOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [powerPopoverOpen, iecPowerMin, iecPowerMax, maxPdcInData]);

  // IEC61724 filter (uses APPLIED bounds; Apply button commits draft inputs)
  const pvIecFilteredRows = useMemo(() => {
    if (!pvData?.headers?.length || !pvFilteredRows.length) return pvFilteredRows;
    const headers = pvData.headers;
    const ghiIdx = getColumnIndex(headers, ["GHI", "weather_GHI"]);
    const airTempIdx = getColumnIndex(headers, ["Air_Temp", "weather_Air_Temp"]);
    const windIdx = getColumnIndex(headers, ["Wind_speed", "weather_Wind_speed"]);
    const pdcIdx = getColumnIndex(headers, ["P_DC"]);
    const ghiMin = Number(appliedIecGhiMin);
    const ghiMax = Number(appliedIecGhiMax);
    const airMin = Number(appliedIecAirTempMin);
    const airMax = Number(appliedIecAirTempMax);
    const windMin = Number(appliedIecWindSpeedMin);
    const windMax = Number(appliedIecWindSpeedMax);
    const powerMin = Number(appliedIecPowerMin) || 0;
    const powerMax = appliedIecPowerMax != null && appliedIecPowerMax !== "" ? Number(appliedIecPowerMax) : maxPdcInData;
    return pvFilteredRows.filter((row) => {
      if (!Array.isArray(row)) return false;
      if (ghiIdx >= 0) {
        const v = parseFloat(row[ghiIdx]);
        if (Number.isFinite(v) && (v < ghiMin || v > ghiMax)) return false;
      }
      if (airTempIdx >= 0) {
        const v = parseFloat(row[airTempIdx]);
        if (Number.isFinite(v) && (v < airMin || v > airMax)) return false;
      }
      if (windIdx >= 0) {
        const v = parseFloat(row[windIdx]);
        if (Number.isFinite(v) && (v < windMin || v > windMax)) return false;
      }
      if (pdcIdx >= 0 && powerMax != null && Number.isFinite(powerMax)) {
        const v = parseFloat(row[pdcIdx]);
        if (Number.isFinite(v) && (v < powerMin || v > powerMax)) return false;
      }
      return true;
    });
  }, [pvData, pvFilteredRows, appliedIecGhiMin, appliedIecGhiMax, appliedIecAirTempMin, appliedIecAirTempMax, appliedIecWindSpeedMin, appliedIecWindSpeedMax, appliedIecPowerMin, appliedIecPowerMax, maxPdcInData]);

  // Status filter (uses APPLIED status; "valid" = keep only status column === "valid")
  const pvStatusFilteredRows = useMemo(() => {
    if (!pvData?.headers?.length || !pvIecFilteredRows.length) return pvIecFilteredRows;
    if (appliedIecStatusFilter !== "valid") return pvIecFilteredRows;
    const statusIdx = getColumnIndex(pvData.headers, ["status"]);
    if (statusIdx < 0) return pvIecFilteredRows;
    return pvIecFilteredRows.filter((row) => {
      const val = Array.isArray(row) ? row[statusIdx] : "";
      return String(val).toLowerCase().trim() === "valid";
    });
  }, [pvData, pvIecFilteredRows, appliedIecStatusFilter]);

  const allowedDaysByAvailability = useMemo(() => {
    if (!pvRawData?.headers?.length || !pvRawFilteredRowsForAvailability.length) return null;
    if (!Number.isFinite(Number(appliedIecDataAvailabilityPct)) || Number(appliedIecDataAvailabilityPct) <= 0) return null;

    // Apply the same IEC/status rules to the *loaded* (non-resampled) data before counting availability.
    const headers = pvRawData.headers;
    const ghiIdx = getColumnIndex(headers, ["GHI", "weather_GHI"]);
    const airTempIdx = getColumnIndex(headers, ["Air_Temp", "weather_Air_Temp"]);
    const windIdx = getColumnIndex(headers, ["Wind_speed", "weather_Wind_speed"]);
    const pdcIdx = getColumnIndex(headers, ["P_DC"]);
    const statusIdx = getColumnIndex(headers, ["status"]);
    const ghiMin = Number(appliedIecGhiMin);
    const ghiMax = Number(appliedIecGhiMax);
    const airMin = Number(appliedIecAirTempMin);
    const airMax = Number(appliedIecAirTempMax);
    const windMin = Number(appliedIecWindSpeedMin);
    const windMax = Number(appliedIecWindSpeedMax);
    const powerMin = Number(appliedIecPowerMin) || 0;
    const powerMax = appliedIecPowerMax != null && appliedIecPowerMax !== "" ? Number(appliedIecPowerMax) : maxPdcInData;

    const filtered = pvRawFilteredRowsForAvailability.filter((row) => {
      if (!Array.isArray(row)) return false;
      if (ghiIdx >= 0) {
        const v = parseFloat(row[ghiIdx]);
        if (Number.isFinite(v) && (v < ghiMin || v > ghiMax)) return false;
      }
      if (airTempIdx >= 0) {
        const v = parseFloat(row[airTempIdx]);
        if (Number.isFinite(v) && (v < airMin || v > airMax)) return false;
      }
      if (windIdx >= 0) {
        const v = parseFloat(row[windIdx]);
        if (Number.isFinite(v) && (v < windMin || v > windMax)) return false;
      }
      if (pdcIdx >= 0 && powerMax != null && Number.isFinite(powerMax)) {
        const v = parseFloat(row[pdcIdx]);
        if (Number.isFinite(v) && (v < powerMin || v > powerMax)) return false;
      }
      if (appliedIecStatusFilter === "valid" && statusIdx >= 0) {
        const v = String(row[statusIdx] ?? "").toLowerCase().trim();
        if (v !== "valid") return false;
      }
      return true;
    });

    return computeAllowedDaysByAvailabilityPct(headers, filtered, resamplingStepMinutes, appliedIecDataAvailabilityPct);
  }, [
    pvRawData,
    pvRawFilteredRowsForAvailability,
    resamplingStepMinutes,
    appliedIecDataAvailabilityPct,
    appliedIecGhiMin,
    appliedIecGhiMax,
    appliedIecAirTempMin,
    appliedIecAirTempMax,
    appliedIecWindSpeedMin,
    appliedIecWindSpeedMax,
    appliedIecPowerMin,
    appliedIecPowerMax,
    appliedIecStatusFilter,
    maxPdcInData,
  ]);

  const pvAvailabilityFilteredRows = useMemo(() => {
    if (!pvData?.headers?.length || !pvStatusFilteredRows.length) return pvStatusFilteredRows;
    // If availability threshold is active but no days meet it, allowedDaysByAvailability will be an empty Set
    // and we should filter everything out (not fall back to unfiltered rows).
    if (!allowedDaysByAvailability) return pvStatusFilteredRows;
    const timeIdx = getDateColumnIndex(pvData.headers);
    if (timeIdx < 0) return pvStatusFilteredRows;
    return pvStatusFilteredRows.filter((row) => {
      if (!Array.isArray(row)) return false;
      const ms = parseDateCell(row[timeIdx]);
      if (Number.isNaN(ms)) return false;
      const dayKey = toYMD(new Date(ms));
      if (!dayKey) return false;
      return allowedDaysByAvailability.has(dayKey);
    });
  }, [pvData, pvStatusFilteredRows, allowedDaysByAvailability]);

  // tot_power from system info (config.tot_power or top-level tot_power)
  const totPower = useMemo(() => {
    if (!sysData || typeof sysData !== "object") return null;
    const p = sysData.config?.tot_power ?? sysData.tot_power;
    const n = Number(p);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [sysData]);

  // Hourly resample (mean for numeric, first for others) before daily KPI
  const pvHourlyForKpi = useMemo(() => {
    if (!pvData?.headers?.length || !pvAvailabilityFilteredRows.length) return null;
    const out = resampleRowsToHourly(pvData.headers, pvAvailabilityFilteredRows);
    return out ? out.rows : null;
  }, [pvData, pvAvailabilityFilteredRows]);

  // Daily resample + E_DC, Ya, Yr, PR (for KPI page); uses hourly-resampled data when available
  const dailyKpiData = useMemo(() => {
    if (!pvData?.headers?.length || totPower == null) return null;
    const rowsForDaily = pvHourlyForKpi ?? pvAvailabilityFilteredRows;
    if (!rowsForDaily.length) return null;
    return resampleRowsToDaily(pvData.headers, rowsForDaily, totPower, sysData);
  }, [pvData, pvAvailabilityFilteredRows, pvHourlyForKpi, totPower, sysData]);

  // KPI aggregation level for Analysis card (daily, monthly, yearly)
  const [kpiAggregation, setKpiAggregation] = useState("daily");

  const aggregatedKpiData = useMemo(() => {
    if (!dailyKpiData) return null;
    return aggregateDailyKpi(dailyKpiData, kpiAggregation);
  }, [dailyKpiData, kpiAggregation]);

  // KPI summary (date range + filters + mean PR/Ya/Yr for current aggregation)
  const kpiSummary = useMemo(() => {
    if (!aggregatedKpiData?.headers?.length || !aggregatedKpiData?.rows?.length) return null;
    const headers = aggregatedKpiData.headers;
    const timeIdx = 0;
    const prIdx = getColumnIndex(headers, ["PR"]);
    const prTcorrIdx = getColumnIndex(headers, ["PR_Tcorr"]);
    const yaIdx = getColumnIndex(headers, ["Ya"]);
    const yrIdx = getColumnIndex(headers, ["Yr"]);
    let prSum = 0, prCount = 0;
    let prTcorrSum = 0, prTcorrCount = 0;
    let yaSum = 0, yaCount = 0;
    let yrSum = 0, yrCount = 0;
    let minTime = null;
    let maxTime = null;
    for (const row of aggregatedKpiData.rows) {
      if (!Array.isArray(row)) continue;
      const t = row[timeIdx];
      if (t != null && t !== "") {
        if (minTime == null || String(t) < String(minTime)) minTime = t;
        if (maxTime == null || String(t) > String(maxTime)) maxTime = t;
      }
      if (prIdx >= 0) {
        const v = parseFloat(row[prIdx]);
        if (Number.isFinite(v)) { prSum += v; prCount++; }
      }
      if (prTcorrIdx >= 0) {
        const v = parseFloat(row[prTcorrIdx]);
        if (Number.isFinite(v)) { prTcorrSum += v; prTcorrCount++; }
      }
      if (yaIdx >= 0) {
        const v = parseFloat(row[yaIdx]);
        if (Number.isFinite(v)) { yaSum += v; yaCount++; }
      }
      if (yrIdx >= 0) {
        const v = parseFloat(row[yrIdx]);
        if (Number.isFinite(v)) { yrSum += v; yrCount++; }
      }
    }
    const meanPr = prCount > 0 ? prSum / prCount : null;
    const meanPrTcorr = prTcorrCount > 0 ? prTcorrSum / prTcorrCount : null;
    const meanYa = yaCount > 0 ? yaSum / yaCount : null;
    const meanYr = yrCount > 0 ? yrSum / yrCount : null;
    const powerMaxDisplay = appliedIecPowerMax != null && appliedIecPowerMax !== "" ? appliedIecPowerMax : (maxPdcInData != null ? String(maxPdcInData) : "max(P_DC)");
    const filters = [
      `Date range: ${minTime ?? "—"} → ${maxTime ?? "—"}`,
      `GHI ∈ [${appliedIecGhiMin}, ${appliedIecGhiMax}] W/m²`,
      `Air Temp ∈ [${appliedIecAirTempMin}, ${appliedIecAirTempMax}] °C`,
      `Wind speed ∈ [${appliedIecWindSpeedMin}, ${appliedIecWindSpeedMax}] m/s`,
      `Power ∈ [${appliedIecPowerMin}, ${powerMaxDisplay}] kW`,
      `Data availability ≥ ${appliedIecDataAvailabilityPct != null ? `${appliedIecDataAvailabilityPct}%` : "—"}`,
      `Status: ${appliedIecStatusFilter === "valid" ? "Valid only" : "All statuses"}`,
    ];
    return {
      minTime,
      maxTime,
      meanPr,
      meanPrTcorr,
      meanYa,
      meanYr,
      filters,
    };
  }, [
    aggregatedKpiData,
    appliedIecGhiMin,
    appliedIecGhiMax,
    appliedIecAirTempMin,
    appliedIecAirTempMax,
    appliedIecWindSpeedMin,
    appliedIecWindSpeedMax,
    appliedIecPowerMin,
    appliedIecPowerMax,
    appliedIecDataAvailabilityPct,
    appliedIecStatusFilter,
    maxPdcInData,
  ]);

  // Ya / Yr grouped bar chart data (from (possibly aggregated) KPI)
  const yaYrBarChartData = useMemo(() => {
    if (!aggregatedKpiData?.headers?.length || !aggregatedKpiData?.rows?.length) return null;
    const headers = aggregatedKpiData.headers;
    const timeIdx = 0;
    const yaIdx = getColumnIndex(headers, ["Ya"]);
    const yrIdx = getColumnIndex(headers, ["Yr"]);
    if (yaIdx < 0 || yrIdx < 0) return null;
    const x = [];
    const ya = [];
    const yr = [];
    for (const row of aggregatedKpiData.rows) {
      if (!Array.isArray(row)) continue;
      x.push(row[timeIdx] ?? "");
      const yaVal = parseFloat(row[yaIdx]);
      const yrVal = parseFloat(row[yrIdx]);
      ya.push(Number.isFinite(yaVal) ? yaVal : null);
      yr.push(Number.isFinite(yrVal) ? yrVal : null);
    }
    return { x, ya, yr };
  }, [aggregatedKpiData]);

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
    if (!iecHelpOpen) return;
    const onDown = (e) => {
      if (iecHelpRef.current?.contains(e.target)) return;
      setIecHelpOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [iecHelpOpen]);

  useEffect(() => {
    if (!kpiFormulasHelpOpen) return;
    const onDown = (e) => {
      if (kpiFormulasHelpRef.current?.contains(e.target)) return;
      setKpiFormulasHelpOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [kpiFormulasHelpOpen]);

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
      } catch (_) {}
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
        {/* ──────────── KPI Analysis (collapsible header card, same style as Data Filtering) ──────────── */}
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
            onClick={() => setKpiOverviewOpen((o) => !o)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: `${KPI}14`,
                  border: `1.5px solid ${KPI}30`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <QueryStats sx={{ fontSize: 24, color: KPI }} />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", fontFamily: FONT }}>
                  KPI Analysis
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, fontFamily: FONT }}>
                  IEC 61724 performance metrics: PR, capacity factor, degradation rate, and yield ratios.
                </div>
              </div>
            </div>
            <div style={{ marginLeft: "auto", borderRadius: "999px", background: "#F8FAFC", border: "1px solid #E2E8F0", padding: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {kpiOverviewOpen ? (
                <ExpandLessIcon sx={{ fontSize: 18, color: "#94a3b8" }} />
              ) : (
                <ExpandMoreIcon sx={{ fontSize: 18, color: "#94a3b8" }} />
              )}
            </div>
          </div>
          {kpiOverviewOpen && (
            <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {/* Data import, IEC filters & daily PR */}
              <div style={{ background: "#FFFBEB", borderRadius: 12, padding: 18, border: "1px solid #FDE68A" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4, fontFamily: FONT }}>
                  DATA IMPORT & IEC FILTERING
                </div>
                <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7, marginBottom: 10, fontFamily: FONT }}>
                  Import PV and weather CSVs, then apply IEC 61724 data quality filters before any KPI is calculated. This ensures that PR, capacity factor, and yield metrics are based only on realistic, validated operating conditions.
                </p>
                <ul style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6, paddingLeft: 18, margin: 0, fontFamily: FONT }}>
                  <li>Upload PV status data, weather data, and optional system info to the KPI page.</li>
                  <li>IEC 61724 bounds for irradiance, temperature, wind, and power are applied to remove implausible rows.</li>
                  <li>The resulting filtered dataset feeds all daily PR, capacity factor, and yield calculations below.</li>
                </ul>
              </div>

              {/* Degradation and trends */}
              <div style={{ background: "#FFFBEB", borderRadius: 12, padding: 18, border: "1px solid #FDE68A" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4, fontFamily: FONT }}>
                  DEGRADATION & LONG-TERM TRENDS
                </div>
                <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7, marginBottom: 10, fontFamily: FONT }}>
                  Track PR and yield over months or years to estimate performance drift and degradation. Use consistent filters and resampling steps to avoid weather-driven noise.
                </p>
                <ul style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6, paddingLeft: 18, margin: 0, fontFamily: FONT }}>
                  <li>Year-over-year comparison of PR and capacity factor.</li>
                  <li>Optional linear trend on aggregated KPIs to estimate degradation.</li>
                  <li>Quickly spot step changes after events or configuration updates.</li>
                </ul>
              </div>

              {/* Yield breakdowns & export */}
              <div style={{ background: "#FFFBEB", borderRadius: 12, padding: 18, border: "1px solid #FDE68A" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4, fontFamily: FONT }}>
                  YIELD BREAKDOWNS & EXPORT
                </div>
                <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7, marginBottom: 10, fontFamily: FONT }}>
                  Visualize daily array yield vs reference yield, and export KPI tables for reporting. Combine PR, capacity factor, and yield ratios in one place for quick diagnostics.
                </p>
                <ul style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6, paddingLeft: 18, margin: 0, fontFamily: FONT }}>
                  <li>Daily KPI tables aligned with the chart views on this page.</li>
                  <li>Array vs reference yield comparisons for each day.</li>
                  <li>CSV export ready for external dashboards or monthly reports.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* 1. Data Visualization card */}
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
                background: `${KPI}12`,
                border: `1px solid ${KPI}35`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShowChartOutlined sx={{ fontSize: 18, color: KPI }} />
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

        {/* 2 & 3. Upload cards: PV Data + System Info */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginTop: 0,
            marginBottom: 32,
          }}
        >
          <KpiUploadZone
            label="Load PV & Weather Synced Data (.csv)"
            icon={<SolarPowerOutlined sx={{ fontSize: 24, color: O }} />}
            accept=".csv"
            color={O}
            file={pvFile}
            templateFile="pv_weather_filtered_pvcopilot.csv"
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
          <KpiUploadZone
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

        {/* System Info section (when JSON loaded) */}
        {sysData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 32 }}>
            <KpiSystemInfo data={sysData} />
          </div>
        )}

        {/* PV Data Analysis (duplicated from Data Filtering; separate code for KPI page) */}
        {pvData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 32 }}>
            <KpiDateFilterBar
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
              onClear={() => { setDateFrom(null); setDateTo(null); }}
              totalRows={pvData.rows?.length ?? 0}
              filteredRows={pvAvailabilityFilteredRows.length}
              accentColor={O}
              resamplingStepMinutes={resamplingStepMinutes}
              onResamplingStepChange={setResamplingStepMinutes}
            />
            {/* IEC61724 Filtering card (always open, above PV & Weather Data Analysis) */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: 16,
                border: "1px solid #E2E8F0",
                boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
                padding: "12px 16px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: `${KPI}12`,
                      border: `1px solid ${KPI}35`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <FilterAltOutlined sx={{ fontSize: 16, color: KPI }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 800, color: "#0F172A", display: "flex", alignItems: "center", gap: 6 }}>
                      IEC61724 Filtering
                      <span ref={iecHelpRef} style={{ position: "relative", display: "inline-flex" }}>
                        <button
                          type="button"
                          onClick={() => setIecHelpOpen((o) => !o)}
                          aria-label="Explain IEC61724 filters"
                          style={{ width: 20, height: 20, borderRadius: "50%", border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                        >
                          <HelpOutline sx={{ fontSize: 14 }} />
                        </button>
                        {iecHelpOpen && (
                          <div
                            style={{
                              position: "absolute",
                              left: 0,
                              bottom: "100%",
                              marginBottom: 8,
                              zIndex: 1002,
                              width: 380,
                              maxWidth: "90vw",
                              maxHeight: "70vh",
                              overflow: "auto",
                              background: "#fff",
                              borderRadius: 12,
                              border: "1px solid #E2E8F0",
                              boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
                              padding: 14,
                              fontFamily: FONT,
                              fontSize: 11,
                              color: "#475569",
                              lineHeight: 1.55,
                            }}
                          >
                            <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>IEC-61724 Filters</div>
                            <p style={{ margin: "0 0 10px 0", fontFamily: FONT, fontWeight: 400 }}>
                              IEC61724 filters are used to improve PV monitoring data quality by excluding weather measurements outside realistic operating ranges. The filtering step screens global horizontal irradiance (GHI), ambient temperature, and wind speed to remove implausible values, sensor faults, and abnormal spikes before KPI calculation and performance analysis. These variables are commonly checked because they directly influence PV performance interpretation and downstream diagnostics.
                            </p>
                            <p style={{ margin: "0 0 8px 0" }}>
                              <strong>References:</strong>
                            </p>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              <li>
                                <a href="https://webstore.iec.ch/en/publication/65561" target="_blank" rel="noopener noreferrer" style={{ color: KPI, textDecoration: "underline" }}>IEC 61724-1:2021 — Photovoltaic system performance monitoring</a>
                                {" "}(<a href="https://iea-pvps.org/research-tasks/performance-operation-and-reliability-of-photovoltaic-systems/" target="_blank" rel="noopener noreferrer" style={{ color: KPI, textDecoration: "underline" }} title="Reliability and Performance of Photovoltaic Systems">IEA-PVPS</a>)
                              </li>
                              <li>
                                <a href="https://doi.org/10.3390/en13195099" target="_blank" rel="noopener noreferrer" style={{ color: KPI, textDecoration: "underline" }}>Lindig et al. (2020), <em>Outdoor PV System Monitoring—Input Data Quality, Data Imputation and Filtering Approaches</em></a>
                                {" "}(<a href="https://iea-pvps.org/wp-content/uploads/2026/02/IEA-PVPS-T13-34-2026-REPORT-Digitalisation-Twins.pdf" target="_blank" rel="noopener noreferrer" style={{ color: KPI, textDecoration: "underline" }} title="Twins in Photovoltaic Systems">IEA-PVPS</a>)
                              </li>
                              <li>
                                <a href="https://iea-pvps.org/research-tasks/reliability-and-performance-of-pv-systems/" target="_blank" rel="noopener noreferrer" style={{ color: KPI, textDecoration: "underline" }}>IEA PVPS Task 13 — Reliability and Performance of PV Systems</a>
                                {" "}(<a href="https://iea-pvps.org/research-tasks/reliability-and-performance-of-pv-systems/" target="_blank" rel="noopener noreferrer" style={{ color: KPI, textDecoration: "underline" }} title="Reliability and Performance of PV Systems">IEA-PVPS</a>)
                              </li>
                              <li>
                                <a href="https://bsrn.awi.de/products/quality-code/physically-possible-limits/" target="_blank" rel="noopener noreferrer" style={{ color: KPI, textDecoration: "underline" }}>BSRN physically possible limits / QC tests</a>
                              </li>
                            </ul>
                          </div>
                        )}
                      </span>
                    </span>
                    <span style={{ fontFamily: FONT, fontSize: 10, color: "#94a3b8" }}>
                      Filter and clean PV and weather time series for analysis.
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<RotateLeftOutlinedIcon />}
                    onClick={handleIecReset}
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
                    Reset
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<BookmarkAddedOutlinedIcon />}
                    onClick={handleIecApply}
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
              </div>
              <div style={{ marginTop: 4, paddingTop: 14, borderTop: "1px solid #E2E8F0", display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
                <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 16, flexWrap: "nowrap", width: "100%", minWidth: 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, alignItems: "stretch", flex: "1 1 auto", minWidth: 0 }}>
                  {/* GHI */}
                  <div style={{ display: "flex", justifyContent: "center", minWidth: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "3px 4px", background: "#fff", borderRadius: 6, border: "1px solid #E2E8F0", minWidth: 0, width: "92%", maxWidth: "100%", boxSizing: "border-box" }}>
                    <span style={{ fontFamily: FONT, fontSize: 7, fontWeight: 600, color: "#64748B", letterSpacing: "0.02em", textAlign: "center", width: "100%" }}>GHI (W/m²)</span>
                    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 2 }}>
                      <div ref={ghiTriggerRef} style={{ flex: 1, minWidth: 0, position: "relative" }}>
                        <input
                          type="text"
                          ref={ghiMinInputRef}
                          readOnly={inlineEditField !== "ghiMin"}
                          className="kpi-iec-num-input"
                          value={iecGhiMin}
                          onChange={(e) => setIecGhiMin(e.target.value)}
                          onClick={(e) => { if (e.detail > 1) return; if (inlineEditField) return; setGhiPopoverOpen(true); }}
                          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setInlineEditField("ghiMin"); }}
                          onBlur={() => inlineEditField === "ghiMin" && commitInlineEdit("ghiMin")}
                          onKeyDown={(e) => e.key === "Enter" && commitInlineEdit("ghiMin")}
                          style={{ width: "100%", height: 26, padding: "6px 4px", borderRadius: 6, border: "none", background: "transparent", fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "-0.02em", color: "#94a3b8", textAlign: "center", fontVariantNumeric: "tabular-nums", boxSizing: "border-box", cursor: inlineEditField === "ghiMin" ? "text" : "pointer" }}
                        />
                      </div>
                      <div style={{ width: 16, height: 26, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", flexShrink: 0, fontSize: 9 }}>→</div>
                      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                        <input
                          type="text"
                          ref={ghiMaxInputRef}
                          readOnly={inlineEditField !== "ghiMax"}
                          className="kpi-iec-num-input"
                          value={iecGhiMax}
                          onChange={(e) => setIecGhiMax(e.target.value)}
                          onClick={(e) => { if (e.detail > 1) return; if (inlineEditField) return; setGhiPopoverOpen(true); }}
                          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setInlineEditField("ghiMax"); }}
                          onBlur={() => inlineEditField === "ghiMax" && commitInlineEdit("ghiMax")}
                          onKeyDown={(e) => e.key === "Enter" && commitInlineEdit("ghiMax")}
                          style={{ width: "100%", height: 26, padding: "6px 4px", borderRadius: 6, border: "none", background: "transparent", fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "-0.02em", color: "#94a3b8", textAlign: "center", fontVariantNumeric: "tabular-nums", boxSizing: "border-box", cursor: inlineEditField === "ghiMax" ? "text" : "pointer" }}
                        />
                      </div>
                      {ghiPopoverOpen && (
                        <div
                          ref={ghiPopoverRef}
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: "50%",
                            transform: "translateX(-50%)",
                            marginTop: 10,
                            zIndex: 1005,
                            background: "#fff",
                            border: "1px solid #E2E8F0",
                            borderRadius: 12,
                            boxShadow: "0 18px 45px rgba(15, 23, 42, 0.14)",
                            padding: 14,
                            width: 320,
                            overflow: "hidden",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                            <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 500, color: "#0F172A" }}>GHI range (W/m²)</span>
                            <button
                              type="button"
                              onClick={() => setGhiPopoverOpen(false)}
                              aria-label="Cancel"
                              style={{ border: "1px solid #E2E8F0", background: "#fff", borderRadius: 8, padding: "4px 8px", fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#64748B", cursor: "pointer" }}
                            >
                              <CancelOutlined sx={{ fontSize: 18 }} />
                            </button>
                          </div>
                          <div className="flex items-center justify-center pt-10 pb-2">
                            <Slider
                              value={ghiDraftValue}
                              onValueChange={(v) => {
                                setGhiDraftValue(v);
                                const a = Number(v?.[0]);
                                const b = Number(v?.[1]);
                                let lo = Number.isFinite(a) ? a : 0;
                                let hi = Number.isFinite(b) ? b : 0;
                                lo = Math.min(2000, Math.max(0, Math.round(lo)));
                                hi = Math.min(2000, Math.max(0, Math.round(hi)));
                                if (lo > hi) [lo, hi] = [hi, lo];
                                setIecGhiMin(String(lo));
                                setIecGhiMax(String(hi));
                              }}
                              min={0}
                              max={2000}
                              step={1}
                              aria-label="GHI range"
                            />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => { setIecGhiMin(IEC_DEFAULTS.ghiMin); setIecGhiMax(IEC_DEFAULTS.ghiMax); setGhiPopoverOpen(false); }}
                              style={{ flex: 1, border: "1px solid #E2E8F0", background: "#fff", borderRadius: 10, padding: "8px 10px", fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#64748B", cursor: "pointer" }}
                            >
                              Reset
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                  {/* T_amb */}
                  <div style={{ display: "flex", justifyContent: "center", minWidth: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "3px 4px", background: "#fff", borderRadius: 6, border: "1px solid #E2E8F0", minWidth: 0, width: "92%", maxWidth: "100%", boxSizing: "border-box" }}>
                    <span style={{ fontFamily: FONT, fontSize: 7, fontWeight: 600, color: "#64748B", letterSpacing: "0.02em", textAlign: "center", width: "100%" }}>T_amb (°C)</span>
                    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 2 }}>
                      <div ref={airTriggerRef} style={{ flex: 1, minWidth: 0, position: "relative" }}>
                        <input
                          type="text"
                          ref={airMinInputRef}
                          readOnly={inlineEditField !== "airMin"}
                          className="kpi-iec-num-input"
                          value={iecAirTempMin}
                          onChange={(e) => setIecAirTempMin(e.target.value)}
                          onClick={(e) => { if (e.detail > 1) return; if (inlineEditField) return; setAirPopoverOpen(true); }}
                          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setInlineEditField("airMin"); }}
                          onBlur={() => inlineEditField === "airMin" && commitInlineEdit("airMin")}
                          onKeyDown={(e) => e.key === "Enter" && commitInlineEdit("airMin")}
                          style={{ width: "100%", height: 26, padding: "6px 4px", borderRadius: 6, border: "none", background: "transparent", fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "-0.02em", color: "#94a3b8", textAlign: "center", fontVariantNumeric: "tabular-nums", boxSizing: "border-box", cursor: inlineEditField === "airMin" ? "text" : "pointer" }}
                        />
                      </div>
                      <div style={{ width: 16, height: 26, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", flexShrink: 0, fontSize: 9 }}>→</div>
                      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                        <input
                          type="text"
                          ref={airMaxInputRef}
                          readOnly={inlineEditField !== "airMax"}
                          className="kpi-iec-num-input"
                          value={iecAirTempMax}
                          onChange={(e) => setIecAirTempMax(e.target.value)}
                          onClick={(e) => { if (e.detail > 1) return; if (inlineEditField) return; setAirPopoverOpen(true); }}
                          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setInlineEditField("airMax"); }}
                          onBlur={() => inlineEditField === "airMax" && commitInlineEdit("airMax")}
                          onKeyDown={(e) => e.key === "Enter" && commitInlineEdit("airMax")}
                          style={{ width: "100%", height: 26, padding: "6px 4px", borderRadius: 6, border: "none", background: "transparent", fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "-0.02em", color: "#94a3b8", textAlign: "center", fontVariantNumeric: "tabular-nums", boxSizing: "border-box", cursor: inlineEditField === "airMax" ? "text" : "pointer" }}
                        />
                      </div>
                      {airPopoverOpen && (
                        <div
                          ref={airPopoverRef}
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: "50%",
                            transform: "translateX(-50%)",
                            marginTop: 10,
                            zIndex: 1005,
                            background: "#fff",
                            border: "1px solid #E2E8F0",
                            borderRadius: 12,
                            boxShadow: "0 18px 45px rgba(15, 23, 42, 0.14)",
                            padding: 14,
                            width: 320,
                            overflow: "hidden",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                            <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 500, color: "#0F172A" }}>T_amb range (°C)</span>
                            <button
                              type="button"
                              onClick={() => setAirPopoverOpen(false)}
                              aria-label="Cancel"
                              style={{ border: "1px solid #E2E8F0", background: "#fff", borderRadius: 8, padding: "4px 8px", fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#64748B", cursor: "pointer" }}
                            >
                              <CancelOutlined sx={{ fontSize: 18 }} />
                            </button>
                          </div>
                          <div className="flex items-center justify-center pt-10 pb-2">
                            <Slider
                              value={airDraftValue}
                              onValueChange={(v) => {
                                setAirDraftValue(v);
                                const a = Number(v?.[0]);
                                const b = Number(v?.[1]);
                                let lo = Number.isFinite(a) ? a : -50;
                                let hi = Number.isFinite(b) ? b : 80;
                                lo = Math.min(80, Math.max(-50, Math.round(lo)));
                                hi = Math.min(80, Math.max(-50, Math.round(hi)));
                                if (lo > hi) [lo, hi] = [hi, lo];
                                setIecAirTempMin(String(lo));
                                setIecAirTempMax(String(hi));
                              }}
                              min={-50}
                              max={80}
                              step={1}
                              aria-label="Air temperature range"
                            />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => { setIecAirTempMin(IEC_DEFAULTS.airMin); setIecAirTempMax(IEC_DEFAULTS.airMax); setAirPopoverOpen(false); }}
                              style={{ flex: 1, border: "1px solid #E2E8F0", background: "#fff", borderRadius: 10, padding: "8px 10px", fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#64748B", cursor: "pointer" }}
                            >
                              Reset
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                  {/* Wind */}
                  <div style={{ display: "flex", justifyContent: "center", minWidth: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "3px 4px", background: "#fff", borderRadius: 6, border: "1px solid #E2E8F0", minWidth: 0, width: "92%", maxWidth: "100%", boxSizing: "border-box" }}>
                    <span style={{ fontFamily: FONT, fontSize: 7, fontWeight: 600, color: "#64748B", letterSpacing: "0.02em", textAlign: "center", width: "100%" }}>Wind (m/s)</span>
                    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 2 }}>
                      <div ref={windTriggerRef} style={{ flex: 1, minWidth: 0, position: "relative" }}>
                        <input
                          type="text"
                          ref={windMinInputRef}
                          readOnly={inlineEditField !== "windMin"}
                          className="kpi-iec-num-input"
                          value={iecWindSpeedMin}
                          onChange={(e) => setIecWindSpeedMin(e.target.value)}
                          onClick={(e) => { if (e.detail > 1) return; if (inlineEditField) return; setWindPopoverOpen(true); }}
                          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setInlineEditField("windMin"); }}
                          onBlur={() => inlineEditField === "windMin" && commitInlineEdit("windMin")}
                          onKeyDown={(e) => e.key === "Enter" && commitInlineEdit("windMin")}
                          style={{ width: "100%", height: 26, padding: "6px 4px", borderRadius: 6, border: "none", background: "transparent", fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "-0.02em", color: "#94a3b8", textAlign: "center", fontVariantNumeric: "tabular-nums", boxSizing: "border-box", cursor: inlineEditField === "windMin" ? "text" : "pointer" }}
                        />
                      </div>
                      <div style={{ width: 16, height: 26, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", flexShrink: 0, fontSize: 9 }}>→</div>
                      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                        <input
                          type="text"
                          ref={windMaxInputRef}
                          readOnly={inlineEditField !== "windMax"}
                          className="kpi-iec-num-input"
                          value={iecWindSpeedMax}
                          onChange={(e) => setIecWindSpeedMax(e.target.value)}
                          onClick={(e) => { if (e.detail > 1) return; if (inlineEditField) return; setWindPopoverOpen(true); }}
                          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setInlineEditField("windMax"); }}
                          onBlur={() => inlineEditField === "windMax" && commitInlineEdit("windMax")}
                          onKeyDown={(e) => e.key === "Enter" && commitInlineEdit("windMax")}
                          style={{ width: "100%", height: 26, padding: "6px 4px", borderRadius: 6, border: "none", background: "transparent", fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "-0.02em", color: "#94a3b8", textAlign: "center", fontVariantNumeric: "tabular-nums", boxSizing: "border-box", cursor: inlineEditField === "windMax" ? "text" : "pointer" }}
                        />
                      </div>
                      {windPopoverOpen && (
                        <div
                          ref={windPopoverRef}
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: "50%",
                            transform: "translateX(-50%)",
                            marginTop: 10,
                            zIndex: 1005,
                            background: "#fff",
                            border: "1px solid #E2E8F0",
                            borderRadius: 12,
                            boxShadow: "0 18px 45px rgba(15, 23, 42, 0.14)",
                            padding: 14,
                            width: 320,
                            overflow: "hidden",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                            <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 500, color: "#0F172A" }}>Wind range (m/s)</span>
                            <button
                              type="button"
                              onClick={() => setWindPopoverOpen(false)}
                              aria-label="Cancel"
                              style={{ border: "1px solid #E2E8F0", background: "#fff", borderRadius: 8, padding: "4px 8px", fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#64748B", cursor: "pointer" }}
                            >
                              <CancelOutlined sx={{ fontSize: 18 }} />
                            </button>
                          </div>
                          <div className="flex items-center justify-center pt-10 pb-2">
                            <Slider
                              value={windDraftValue}
                              onValueChange={(v) => {
                                setWindDraftValue(v);
                                const a = Number(v?.[0]);
                                const b = Number(v?.[1]);
                                let lo = Number.isFinite(a) ? a : 0;
                                let hi = Number.isFinite(b) ? b : 50;
                                lo = Math.min(50, Math.max(0, Math.round(lo)));
                                hi = Math.min(50, Math.max(0, Math.round(hi)));
                                if (lo > hi) [lo, hi] = [hi, lo];
                                setIecWindSpeedMin(String(lo));
                                setIecWindSpeedMax(String(hi));
                              }}
                              min={0}
                              max={50}
                              step={1}
                              aria-label="Wind range"
                            />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => { setIecWindSpeedMin(IEC_DEFAULTS.windMin); setIecWindSpeedMax(IEC_DEFAULTS.windMax); setWindPopoverOpen(false); }}
                              style={{ flex: 1, border: "1px solid #E2E8F0", background: "#fff", borderRadius: 10, padding: "8px 10px", fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#64748B", cursor: "pointer" }}
                            >
                              Reset
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                  {/* Power (kW) — P_DC */}
                  <div style={{ display: "flex", justifyContent: "center", minWidth: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "3px 4px", background: "#fff", borderRadius: 6, border: "1px solid #E2E8F0", minWidth: 0, width: "92%", maxWidth: "100%", boxSizing: "border-box" }}>
                    <span style={{ fontFamily: FONT, fontSize: 7, fontWeight: 600, color: "#64748B", letterSpacing: "0.02em", textAlign: "center", width: "100%" }}>Power (kW)</span>
                    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 2 }}>
                      <div ref={powerTriggerRef} style={{ flex: 1, minWidth: 0, position: "relative" }}>
                        <input
                          type="text"
                          ref={powerMinInputRef}
                          readOnly={inlineEditField !== "powerMin"}
                          className="kpi-iec-num-input"
                          value={iecPowerMin}
                          onChange={(e) => setIecPowerMin(e.target.value)}
                          onClick={(e) => { if (e.detail > 1) return; if (inlineEditField) return; setPowerPopoverOpen(true); }}
                          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setInlineEditField("powerMin"); }}
                          onBlur={() => inlineEditField === "powerMin" && commitInlineEdit("powerMin")}
                          onKeyDown={(e) => e.key === "Enter" && commitInlineEdit("powerMin")}
                          style={{ width: "100%", height: 26, padding: "6px 4px", borderRadius: 6, border: "none", background: "transparent", fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "-0.02em", color: "#94a3b8", textAlign: "center", fontVariantNumeric: "tabular-nums", boxSizing: "border-box", cursor: inlineEditField === "powerMin" ? "text" : "pointer" }}
                        />
                      </div>
                      <div style={{ width: 16, height: 26, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", flexShrink: 0, fontSize: 9 }}>→</div>
                      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                        <input
                          type="text"
                          ref={powerMaxInputRef}
                          readOnly={inlineEditField !== "powerMax"}
                          className="kpi-iec-num-input"
                          value={iecPowerMax !== "" ? iecPowerMax : (maxPdcInData != null ? String(maxPdcInData) : "")}
                          onChange={(e) => setIecPowerMax(e.target.value)}
                          onClick={(e) => { if (e.detail > 1) return; if (inlineEditField) return; setPowerPopoverOpen(true); }}
                          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setInlineEditField("powerMax"); }}
                          onBlur={() => inlineEditField === "powerMax" && commitInlineEdit("powerMax")}
                          onKeyDown={(e) => e.key === "Enter" && commitInlineEdit("powerMax")}
                          placeholder={maxPdcInData != null ? String(maxPdcInData) : "—"}
                          style={{ width: "100%", height: 26, padding: "6px 4px", borderRadius: 6, border: "none", background: "transparent", fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "-0.02em", color: "#94a3b8", textAlign: "center", fontVariantNumeric: "tabular-nums", boxSizing: "border-box", cursor: inlineEditField === "powerMax" ? "text" : "pointer" }}
                        />
                      </div>
                      {powerPopoverOpen && (
                        <div
                          ref={powerPopoverRef}
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: "50%",
                            transform: "translateX(-50%)",
                            marginTop: 10,
                            zIndex: 1005,
                            background: "#fff",
                            border: "1px solid #E2E8F0",
                            borderRadius: 12,
                            boxShadow: "0 18px 45px rgba(15, 23, 42, 0.14)",
                            padding: 14,
                            width: 320,
                            overflow: "hidden",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                            <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 500, color: "#0F172A" }}>Power range (kW)</span>
                            <button
                              type="button"
                              onClick={() => setPowerPopoverOpen(false)}
                              aria-label="Cancel"
                              style={{ border: "1px solid #E2E8F0", background: "#fff", borderRadius: 8, padding: "4px 8px", fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#64748B", cursor: "pointer" }}
                            >
                              <CancelOutlined sx={{ fontSize: 18 }} />
                            </button>
                          </div>
                          <div className="flex items-center justify-center pt-10 pb-2">
                            <Slider
                              value={powerDraftValue}
                              onValueChange={(v) => {
                                setPowerDraftValue(v);
                                const a = Number(v?.[0]);
                                const b = Number(v?.[1]);
                                const max = Math.max(0, Number(maxPdcInData) || 0);
                                let lo = Number.isFinite(a) ? a : 0;
                                let hi = Number.isFinite(b) ? b : max;
                                lo = Math.min(max, Math.max(0, Math.round(lo)));
                                hi = Math.min(max, Math.max(0, Math.round(hi)));
                                if (lo > hi) [lo, hi] = [hi, lo];
                                setIecPowerMin(String(lo));
                                setIecPowerMax(String(hi));
                              }}
                              min={0}
                              max={Math.max(1, Math.round(Number(maxPdcInData) || 0))}
                              step={1}
                              aria-label="Power range"
                            />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setIecPowerMin(IEC_DEFAULTS.powerMin);
                                setIecPowerMax(IEC_DEFAULTS.powerMax);
                                setPowerPopoverOpen(false);
                              }}
                              style={{ flex: 1, border: "1px solid #E2E8F0", background: "#fff", borderRadius: 10, padding: "8px 10px", fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#64748B", cursor: "pointer" }}
                            >
                              Reset
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                  {/* Data Availability (%) */}
                  <div style={{ display: "flex", justifyContent: "center", minWidth: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "3px 4px", background: "#fff", borderRadius: 6, border: "1px solid #E2E8F0", minWidth: 0, width: "92%", maxWidth: "100%", boxSizing: "border-box" }}>
                      <span style={{ fontFamily: FONT, fontSize: 7, fontWeight: 600, color: "#64748B", letterSpacing: "0.02em", textAlign: "center", width: "100%" }}>Data Availability (%)</span>
                      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 2 }}>
                        <div ref={availabilityTriggerRef} style={{ flex: 1, minWidth: 0, position: "relative" }}>
                          <input
                            type="text"
                            ref={availabilityInputRef}
                            readOnly={inlineEditField !== "availability"}
                            className="kpi-iec-num-input"
                            value={iecDataAvailabilityPct}
                            onChange={(e) => setIecDataAvailabilityPct(e.target.value)}
                            onClick={(e) => { if (e.detail > 1) return; if (inlineEditField) return; setAvailabilityPopoverOpen(true); }}
                            onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setInlineEditField("availability"); }}
                            onBlur={() => inlineEditField === "availability" && commitInlineEdit("availability")}
                            onKeyDown={(e) => e.key === "Enter" && commitInlineEdit("availability")}
                            placeholder="Click to set"
                            style={{ width: "100%", height: 26, padding: "6px 4px", borderRadius: 6, border: "none", background: "transparent", fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: "-0.02em", color: "#94a3b8", textAlign: "center", fontVariantNumeric: "tabular-nums", boxSizing: "border-box", cursor: inlineEditField === "availability" ? "text" : "pointer" }}
                          />
                        </div>
                        <div style={{ width: 16, height: 26, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", flexShrink: 0, fontSize: 10 }}>%</div>
                        {availabilityPopoverOpen && (
                          <div
                            ref={availabilityPopoverRef}
                            style={{
                              position: "absolute",
                              top: "100%",
                              left: "50%",
                              transform: "translateX(-50%)",
                              marginTop: 10,
                              zIndex: 1005,
                              background: "#fff",
                              border: "1px solid #E2E8F0",
                              borderRadius: 12,
                              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.14)",
                              padding: 14,
                              width: 280,
                              overflow: "hidden",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                              <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 500, color: "#0F172A" }}>Data availability Treshhold (%)</span>
                              <button
                                type="button"
                                onClick={() => setAvailabilityPopoverOpen(false)}
                                aria-label="Cancel"
                                style={{ border: "1px solid #E2E8F0", background: "#fff", borderRadius: 8, padding: "4px 8px", fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#64748B", cursor: "pointer" }}
                              >
                                <CancelOutlined sx={{ fontSize: 18 }} />
                              </button>
                            </div>
                            <div className="flex items-center justify-center pt-8 pb-2">
                              <Slider
                                value={availabilityDraftValue}
                                onValueChange={(v) => {
                                  setAvailabilityDraftValue(v);
                                  const n = Number(v?.[0]);
                                  const clamped = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
                                  setIecDataAvailabilityPct(String(clamped));
                                }}
                                min={0}
                                max={100}
                                step={1}
                                aria-label="Data availability"
                              />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => { setIecDataAvailabilityPct("0"); setAvailabilityPopoverOpen(false); }}
                                style={{ flex: 1, border: "1px solid #E2E8F0", background: "#fff", borderRadius: 10, padding: "8px 10px", fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#64748B", cursor: "pointer" }}
                              >
                                Reset
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <FilterListOutlined sx={{ fontSize: 18, color: "#64748B" }} />
                    <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#475569" }}>Data Status Filter</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIecStatusFilter("all")}
                    onMouseEnter={() => setIecStatusHover("all")}
                    onMouseLeave={() => setIecStatusHover(null)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      height: 34,
                      padding: "0 15px",
                      fontFamily: FONT,
                      fontSize: 11,
                      fontWeight: 500,
                      color:
                        iecStatusFilter === "all"
                          ? "#5f7696"
                          : "#CBD5E1",
                      background:
                        iecStatusFilter === "all"
                          ? iecStatusHover === "all"
                            ? "#c5def8"
                            : "#cfe4fa"
                          : "#F8FAFC",
                      border:
                        iecStatusFilter === "all"
                          ? "1px solid #d7e5f4"
                          : "1px solid #E2E8F0",
                      borderRadius: 9999,
                      cursor: "pointer",
                      boxShadow: "none",
                      transition: "background-color 150ms ease, border-color 150ms ease, color 150ms ease",
                    }}
                  >
                    <FilterListOutlined sx={{ fontSize: 18, color: "inherit" }} />
                    <span>All</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIecStatusFilter("valid")}
                    onMouseEnter={() => setIecStatusHover("valid")}
                    onMouseLeave={() => setIecStatusHover(null)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      height: 34,
                      padding: "0 15px",
                      fontFamily: FONT,
                      fontSize: 11,
                      fontWeight: 500,
                      color:
                        iecStatusFilter === "valid"
                          ? "#4f8a68"
                          : "#CBD5E1",
                      background:
                        iecStatusFilter === "valid"
                          ? iecStatusHover === "valid"
                            ? "#e6f4ec"
                            : "#edf8f2"
                          : "#F8FAFC",
                      border:
                        iecStatusFilter === "valid"
                          ? "1px solid #cfe8dc"
                          : "1px solid #E2E8F0",
                      borderRadius: 9999,
                      cursor: "pointer",
                      boxShadow: "none",
                      transition: "background-color 150ms ease, border-color 150ms ease, color 150ms ease",
                    }}
                  >
                    <CheckCircleOutline sx={{ fontSize: 18, color: "inherit" }} />
                    <span>Valid</span>
                  </button>
                </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                  <span style={{ fontSize: 10, color: "#64748B", fontFamily: FONT }}>Rows outside ranges excluded.</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: KPI, background: `${KPI}14`, padding: "2px 8px", borderRadius: 6, fontFamily: MONO }}>
                    {pvAvailabilityFilteredRows.length} / {pvFilteredRows.length} rows
                  </span>
                </div>
              </div>
            </div>
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
                <div style={{ width: 30, height: 30, borderRadius: 10, background: `${O}12`, border: `1px solid ${O}35`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <SolarPowerOutlined sx={{ fontSize: 18, color: O }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>PV & Weather Data Analysis</span>
                  <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>Explore, filter, and visualize PV performance data.</span>
                </div>
              </div>
              <KpiCSVTable
                key={`pv-table-${iecAppliedSignature}`}
                title="PV & Weather Data"
                icon={<SolarPowerOutlined sx={{ fontSize: 20, color: O }} />}
                color={O}
                headers={pvData.headers}
                rows={pvAvailabilityFilteredRows}
                resampled={pvData.resampled}
                originalRows={pvData.originalRows}
                resampledStepMinutes={pvData.resampledStepMinutes}
                defaultVisibleLabels={[
                  "time",
                  "I1",
                  "U_DC",
                  "P_DC",
                  "T1",
                  "weather_GHI",
                  "weather_GTI",
                  "weather_air_temp",
                  "weather_wind speed",
                  "PVWatts",
                  "status",
                ]}
              />
                <KpiCSVChart
                  key={`pv-chart-${iecAppliedSignature}`}
                  title="PV & Weather Data"
                  color={O}
                  headers={pvData.headers}
                  rows={pvAvailabilityFilteredRows}
                  fullRowsForGaps={pvFilteredRows}
                  defaultYHeader="P_DC"
                  defaultRightYHeader="weather_GTI"
                />
            </div>

            {/* KPI Analysis card — Daily/Monthly/Yearly KPI resample + E_DC, Ya, Yr, PR (requires System Info with tot_power) */}
            {aggregatedKpiData && (
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 2 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 10, background: `${KPI}12`, border: `1px solid ${KPI}35`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <QueryStats sx={{ fontSize: 18, color: KPI }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>KPI Analysis</span>
                      <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>Daily performance metrics: E_DC, Ya, Yr, and PR.</span>
                    </div>
                    <span ref={kpiFormulasHelpRef} style={{ position: "relative", display: "inline-flex" }}>
                      <button
                        type="button"
                        onClick={() => setKpiFormulasHelpOpen((o) => !o)}
                        aria-label="Explain Yr, Ya, PR and PR Temperature Corrected"
                        style={{ width: 20, height: 20, borderRadius: "50%", border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                      >
                        <HelpOutline sx={{ fontSize: 14 }} />
                      </button>
                      {kpiFormulasHelpOpen && (
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            bottom: "100%",
                            marginBottom: 8,
                            zIndex: 1002,
                            width: 400,
                            maxWidth: "90vw",
                            maxHeight: "70vh",
                            overflow: "auto",
                            background: "#fff",
                            borderRadius: 12,
                            border: "1px solid #E2E8F0",
                            boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
                            padding: 14,
                            fontFamily: FONT,
                            fontSize: 11,
                            color: "#475569",
                            lineHeight: 1.55,
                          }}
                        >
                          <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>KPI formulas (IEC 61724)</div>
                          <p style={{ margin: "0 0 8px 0" }}>
                            <strong>E_DC</strong> — Daily DC energy (kWh): sum of measured DC power over the period, divided by 1000 when P_DC is in watts.
                          </p>
                          <p style={{ margin: "0 0 8px 0" }}>
                            <strong>Yr</strong> (Reference yield) — Daily in-plane irradiance expressed as equivalent sun hours: <em>Yr = G_POA_sum / 1000</em> (kWh/kWp). G_POA is plane-of-array irradiance (e.g. GTI) in W/m².
                          </p>
                          <p style={{ margin: "0 0 8px 0" }}>
                            <strong>Ya</strong> (Array yield) — Specific energy delivered by the array: <em>Ya = E_DC / P_STC</em> (kWh/kWp). P_STC is installed nominal DC power at STC (kW).
                          </p>
                          <p style={{ margin: "0 0 8px 0" }}>
                            <strong>PR</strong> (Performance ratio) — Ratio of actual to reference yield: <em>PR = Ya / Yr</em>. Typically 0.75–0.90 (75–90%). Independent of location and size; lower values indicate losses or underperformance.
                          </p>
                          <p style={{ margin: "0 0 0 0" }}>
                            <strong>PR Temperature Corrected</strong> — PR with module temperature effect removed: <em>PR_Tcorr = Ya / [ Yr × (1 + γ × (T_cell − 25)) ]</em>. γ is the module temperature coefficient of power (1/°C); T_cell is a daily representative cell temperature (°C). Allows comparison across seasons and sites with different temperatures.
                          </p>
                        </div>
                      )}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {["daily", "monthly", "yearly"].map((mode) => {
                      const label = mode === "daily" ? "Daily" : mode === "monthly" ? "Monthly" : "Yearly";
                      const isActive = kpiAggregation === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setKpiAggregation(mode)}
                          style={{
                            padding: "4px 10px",
                            fontSize: 11,
                            fontFamily: FONT,
                            borderRadius: 999,
                            border: isActive ? `1px solid ${KPI}` : "1px solid #E2E8F0",
                            background: isActive ? `${KPI}14` : "#FFFFFF",
                            color: isActive ? "#166534" : "#64748B",
                            cursor: "pointer",
                            fontWeight: isActive ? 700 : 500,
                            boxShadow: "none",
                            transition: "background-color 120ms ease, border-color 120ms ease, color 120ms ease",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <KpiCSVTable
                  title={kpiAggregation === "daily" ? "Daily KPI (resampled D)" : kpiAggregation === "monthly" ? "Monthly KPI (mean of daily)" : "Yearly KPI (mean of daily)"}
                  icon={<QueryStats sx={{ fontSize: 20, color: KPI }} />}
                  color={KPI}
                  headers={aggregatedKpiData.headers}
                  rows={aggregatedKpiData.rows}
                  resampled={true}
                  resampledStepMinutes={kpiAggregation === "daily" ? "D" : kpiAggregation === "monthly" ? "M" : "Y"}
                  defaultVisibleLabels={["time", "E_DC", "Ya", "Yr", "PR"]}
                />
                <KpiCSVChart
                  title={kpiAggregation === "daily" ? "Daily Performance Ratio" : kpiAggregation === "monthly" ? "Monthly Performance Ratio" : "Yearly Performance Ratio"}
                  color={KPI}
                  headers={aggregatedKpiData.headers}
                  rows={aggregatedKpiData.rows}
                  defaultYHeader="PR"
                  singleYAxis
                  traceMode="lines+markers"
                  fixedYHeader="PR"
                  fixedYAsPercent
                />
                {/* Array Yield and Reference Yield — Chart (grouped bar, same card style as Daily KPI) */}
                {yaYrBarChartData && (
                  <KpiYaYrBarChart
                    title={kpiAggregation === "daily" ? "Daily Array Yield and Reference Yield" : kpiAggregation === "monthly" ? "Monthly Array Yield and Reference Yield" : "Yearly Array Yield and Reference Yield"}
                    color={KPI}
                    x={yaYrBarChartData.x}
                    ya={yaYrBarChartData.ya}
                    yr={yaYrBarChartData.yr}
                    xAxisTitle={aggregatedKpiData.headers[0] ?? "time"}
                  />
                )}
              </div>
            )}

            {/* KPI Analysis summary card — placed last on page */}
            {kpiSummary && (
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: 16,
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 18px 45px rgba(15, 23, 42, 0.08)",
                  padding: "16px 18px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  marginTop: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 999, background: `${KPI}10`, border: `1px solid ${KPI}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <QueryStats sx={{ fontSize: 18, color: KPI }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 800, color: "#0F172A" }}>KPI Analysis summary</span>
                      <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>
                        {kpiAggregation === "daily" ? "Daily" : kpiAggregation === "monthly" ? "Monthly" : "Yearly"} view · PR, PR corrected, Ya, Yr averages.
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 12,
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    style={{
                      flex: "1 1 0",
                      minWidth: 140,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center" }}>Data range</div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: "#0F172A", marginTop: 4, textAlign: "center" }}>
                      {kpiSummary.minTime || "—"}{" "}
                      <span style={{ color: "#94A3B8" }}>→</span> {kpiSummary.maxTime || "—"}
                    </div>
                  </div>
                  <div
                    style={{
                      flex: "1 1 0",
                      minWidth: 140,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center" }}>Mean PR</div>
                    <div style={{ fontFamily: MONO, fontSize: 14, color: "#166534", marginTop: 4, textAlign: "center" }}>
                      {kpiSummary.meanPr != null ? `${(kpiSummary.meanPr * 100).toFixed(2)} %` : "—"}
                    </div>
                  </div>
                  <div
                    style={{
                      flex: "1 1 0",
                      minWidth: 140,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center" }}>Mean PR corrected</div>
                    <div style={{ fontFamily: MONO, fontSize: 14, color: "#166534", marginTop: 4, textAlign: "center" }}>
                      {kpiSummary.meanPrTcorr != null ? `${(kpiSummary.meanPrTcorr * 100).toFixed(2)} %` : "—"}
                    </div>
                  </div>
                  <div
                    style={{
                      flex: "1 1 0",
                      minWidth: 140,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center" }}>Mean Ya</div>
                    <div style={{ fontFamily: MONO, fontSize: 14, color: "#0F172A", marginTop: 4, textAlign: "center" }}>
                      {kpiSummary.meanYa != null ? kpiSummary.meanYa.toFixed(3) : "—"} <span style={{ fontSize: 10, color: "#94A3B8" }}>kWh/kWp</span>
                    </div>
                  </div>
                  <div
                    style={{
                      flex: "1 1 0",
                      minWidth: 140,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center" }}>Mean Yr</div>
                    <div style={{ fontFamily: MONO, fontSize: 14, color: "#0F172A", marginTop: 4, textAlign: "center" }}>
                      {kpiSummary.meanYr != null ? kpiSummary.meanYr.toFixed(3) : "—"} <span style={{ fontSize: 10, color: "#94A3B8" }}>kWh/m²</span>
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 4,
                    paddingTop: 6,
                    borderTop: "1px dashed #E2E8F0",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      fontFamily: FONT,
                      fontSize: 10,
                      color: "#64748B",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      maxWidth: "70%",
                    }}
                  >
                    <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Filters applied</span>
                    <span>{kpiSummary.filters.join(" · ")}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!aggregatedKpiData?.headers?.length || !aggregatedKpiData?.rows?.length) return;
                      const csvRows = [];
                      csvRows.push(aggregatedKpiData.headers.map((h) => `"${String(h ?? "").replace(/"/g, '""')}"`).join(","));
                      for (const row of aggregatedKpiData.rows) {
                        if (!Array.isArray(row)) continue;
                        csvRows.push(row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
                      }
                      const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      const prefix = kpiAggregation === "daily" ? "daily" : kpiAggregation === "monthly" ? "monthly" : "yearly";
                      a.download = `kpi_${prefix}_data.csv`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
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
                    <FileDownloadOutlined sx={{ fontSize: 14, color: "#ffffff" }} />
                    <span>Download KPI Data</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
