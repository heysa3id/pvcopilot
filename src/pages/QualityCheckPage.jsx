import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import CloudUploadOutlined from "@mui/icons-material/CloudUploadOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import SolarPowerOutlined from "@mui/icons-material/SolarPowerOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import ErrorOutline from "@mui/icons-material/ErrorOutline";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import TimelineOutlined from "@mui/icons-material/TimelineOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import SyncAltOutlined from "@mui/icons-material/SyncAltOutlined";
import ShowChartOutlined from "@mui/icons-material/ShowChartOutlined";
import SummarizeOutlined from "@mui/icons-material/SummarizeOutlined";
import HubOutlined from "@mui/icons-material/HubOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import BarChartOutlined from "@mui/icons-material/BarChartOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import BookmarkAddedOutlinedIcon from "@mui/icons-material/BookmarkAddedOutlined";
import RotateLeftOutlinedIcon from "@mui/icons-material/RotateLeftOutlined";
import Button from "@mui/material/Button";
import TableColumnSelector from "../components/TableColumnSelector";
import SystemInfoHelpIcon from "../components/SystemInfoHelpIcon";
import CSVColumnMapper, { PV_SYNONYMS, PV_TEMPLATE_COLUMNS, PV_TEMPLATE_LABELS, PV_EXPECTED_TYPES, WEATHER_SYNONYMS, WEATHER_TEMPLATE_COLUMNS, WEATHER_TEMPLATE_LABELS, WEATHER_EXPECTED_TYPES } from "../components/CSVColumnMapper";

const Plot = createPlotlyComponent(Plotly);

const G = "#FFB800", B = "#1d9bf0", P = "#8b5cf6", Y = "#16a34a", O = "#ff7a45";
const FONT = "Inter, Arial, sans-serif";
const MONO = "'JetBrains Mono', monospace";
function parseCSV(text) {
  const lines = text.trim().split("\n").filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line => {
    const vals = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    return vals;
  });
  return { headers, rows };
}

function parseJSON(text) {
  try { return JSON.parse(text); }
  catch { return null; }
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

  // Direct match (e.g. "Module_Temp")
  for (const key of templateColumns) {
    if (String(key).toLowerCase() === lower) return key;
  }

  // Normalized match (e.g. "Module Temp" -> "Module_Temp")
  const normalized = lower.replace(/\s+/g, "_");
  if (normalized !== lower) {
    for (const key of templateColumns) {
      if (String(key).toLowerCase() === normalized) return key;
    }
  }

  // Synonym match (covers inputs like "P_DC" / "GTI" / "GHI")
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

  // Keep original (including any weather_ prefix) for the output label.
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

/** Find column index that looks like date/time (first col or name contains time/date). */
function getDateColumnIndex(headers) {
  if (!headers || headers.length === 0) return -1;
  const first = (headers[0] || "").toLowerCase();
  if (/time|date|timestamp|datetime/.test(first)) return 0;
  for (let i = 0; i < headers.length; i++) {
    if (/time|date|timestamp|datetime/.test((headers[i] || "").toLowerCase()))
      return i;
  }
  return 0;
}

/** Parse a cell value as date (ms). Returns NaN if not parseable. */
function parseDateCell(val) {
  if (val == null || String(val).trim() === "") return NaN;
  const s = String(val).trim();
  const d = new Date(s);
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

/** Return first column index whose header matches one of the candidate names. */
function getColumnIndex(headers, candidates) {
  if (!headers?.length || !candidates?.length) return -1;
  const set = new Set(candidates.map((c) => String(c).trim()));
  for (let i = 0; i < headers.length; i++) {
    if (set.has(String(headers[i] ?? "").trim())) return i;
  }
  return -1;
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
const CLEAR_SCALE_TARGET_PERCENTILE = 0.75;
const CLEAR_SCALE_TRIM_LOW = 0.05;
const CLEAR_SCALE_TRIM_HIGH = 0.95;
const CLEAR_SCALE_MIN_COSZ = 0.3;
const CLEAR_SCALE_MIN = 0.7;
const CLEAR_SCALE_MAX = 1.3;

function computeKt(measuredGhi, clearSkyGhi) {
  const meas = Number(measuredGhi);
  const clear = Number(clearSkyGhi);
  if (!Number.isFinite(meas) || !Number.isFinite(clear) || clear <= 0) return null;
  return meas / clear;
}

function estimateClearSkyScale(rawRatios) {
  const ratios = Array.isArray(rawRatios)
    ? rawRatios.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
    : [];
  if (!ratios.length) return 1;

  const lo = percentileSorted(ratios, CLEAR_SCALE_TRIM_LOW);
  const hi = percentileSorted(ratios, CLEAR_SCALE_TRIM_HIGH);
  const trimmed = ratios.filter((v) => v >= lo && v <= hi);
  const pool = trimmed.length ? trimmed : ratios;

  const pTarget = percentileSorted(pool, CLEAR_SCALE_TARGET_PERCENTILE);
  const med = median(pool);
  const raw = Number.isFinite(pTarget) ? pTarget : (Number.isFinite(med) ? med : 1);
  return clamp(raw, CLEAR_SCALE_MIN, CLEAR_SCALE_MAX);
}

/** Format ms as YYYY-MM-DD HH:MM (match backend). */
function formatTimeCell(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

const TEN_MIN_MS = 10 * 60 * 1000;

/** Resample rows to a regular time grid (stepMinutes).
 * - Numeric columns: linear interpolation over time (smooth ramps, no steps)
 * - Non-numeric columns: forward-fill
 */
function resampleRowsToStep(headers, rows, stepMinutes) {
  const stepMs = Math.max(1, Math.min(1440, Number(stepMinutes) || 10)) * 60 * 1000;
  if (!headers?.length || !rows?.length) return { headers: headers || [], rows: rows || [], originalRows: rows?.length ?? 0, resampledRows: rows?.length ?? 0, resampled: false };
  const timeColIdx = getDateColumnIndex(headers);
  if (timeColIdx < 0) return { headers, rows, originalRows: rows.length, resampledRows: rows.length, resampled: false };

  const safeRows = rows.filter((r) => Array.isArray(r));
  const withMs = safeRows.map((row) => {
    const ms = parseDateCell(row[timeColIdx]);
    return { row, ms };
  }).filter((x) => !Number.isNaN(x.ms));
  if (withMs.length === 0) return { headers, rows, originalRows: rows.length, resampledRows: rows.length, resampled: false };

  withMs.sort((a, b) => a.ms - b.ms);
  const tMin = withMs[0].ms;
  const tMax = withMs[withMs.length - 1].ms;
  const tStart = Math.floor(tMin / stepMs) * stepMs;
  const tEnd = Math.ceil(tMax / stepMs) * stepMs;

  const gridTimes = [];
  for (let t = tStart; t <= tEnd; t += stepMs) gridTimes.push(t);

  // Detect numeric columns from a sample (exclude time column)
  const sample = withMs.slice(0, Math.min(200, withMs.length)).map((x) => x.row);
  const numericCols = new Set();
  for (let c = 0; c < headers.length; c++) {
    if (c === timeColIdx) continue;
    let seen = 0;
    let numeric = 0;
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

  // Helper: find prev/next value for interpolation
  function getNumericAt(idx, col) {
    const raw = (withMs[idx]?.row?.[col] ?? "").toString().trim();
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  let lastIdx = 0;
  const resampledRows = gridTimes.map((t) => {
    while (lastIdx + 1 < withMs.length && withMs[lastIdx + 1].ms <= t) lastIdx++;

    // Find next index (for interpolation)
    let nextIdx = lastIdx;
    while (nextIdx < withMs.length && withMs[nextIdx].ms < t) nextIdx++;
    if (nextIdx < lastIdx) nextIdx = lastIdx;

    const baseRow = withMs[lastIdx]?.row ?? [];
    const newRow = [...baseRow];
    newRow[timeColIdx] = formatTimeCell(t);

    // Numeric columns: linear interpolation between nearest known points
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
      const v = v0 + (v1 - v0) * alpha;
      newRow[col] = String(Math.round(v * 1000) / 1000);
    }

    // Non-numeric columns: forward-fill from last known row (baseRow already provides that)
    return newRow;
  });

  return {
    headers,
    rows: resampledRows,
    originalRows: rows.length,
    resampledRows: resampledRows.length,
    resampled: true,
  };
}

function resampleRowsTo10Min(headers, rows) {
  return resampleRowsToStep(headers, rows, 10);
}

/** Get min and max timestamp (ms) from rows using date column. Returns { minMs, maxMs } or null if no valid dates. */
function getDateRangeFromRows(headers, rows) {
  if (!headers?.length || !Array.isArray(rows) || rows.length === 0) return null;
  const dateCol = getDateColumnIndex(headers);
  let minMs = Infinity, maxMs = -Infinity;
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const ms = parseDateCell(row[dateCol]);
    if (!Number.isNaN(ms) && Number.isFinite(ms)) {
      if (ms < minMs) minMs = ms;
      if (ms > maxMs) maxMs = ms;
    }
  }
  if (minMs === Infinity || maxMs === -Infinity) return null;
  return { minMs, maxMs };
}

/** Format ms as YYYY-MM-DD for date inputs. */
function formatDateOnly(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Filter rows by optional date range (inclusive). Uses first column or detected date column. */
function filterRowsByDateRange(headers, rows, dateFrom, dateTo) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const dateCol = getDateColumnIndex(headers || []);
  const fromMs = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
  const toMs = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null;
  if (fromMs == null && toMs == null) return rows;
  return rows.filter((row) => {
    if (!Array.isArray(row)) return false;
    const cell = row[dateCol];
    const ms = parseDateCell(cell);
    if (isNaN(ms)) return true;
    if (fromMs != null && ms < fromMs) return false;
    if (toMs != null && ms > toMs) return false;
    return true;
  });
}

// ── Toast Notification ───────────────────────────────────────────────────────
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2000);
    return () => clearTimeout(t);
  }, [onClose]);

  const isError = type === "error";
  const bg = isError ? "#FEF2F2" : "#F0FDF4";
  const border = isError ? "#FECACA" : "#BBF7D0";
  const textColor = isError ? "#DC2626" : Y;
  const Icon = isError ? ErrorOutline : CheckCircleOutline;

  return (
    <div style={{
      position: "fixed", top: 72, right: 24, zIndex: 9999,
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 16px", borderRadius: 12,
      background: bg, border: `1.5px solid ${border}`,
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      fontFamily: FONT, fontSize: 13, color: textColor, fontWeight: 600,
      animation: "fadeUp 0.3s ease",
      maxWidth: 420,
    }}>
      <Icon sx={{ fontSize: 20, color: textColor, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: textColor, padding: 2, display: "flex", flexShrink: 0,
        }}
      >
        <CloseOutlined sx={{ fontSize: 16 }} />
      </button>
    </div>
  );
}

// ── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ color, size = 20 }) {
  return (
    <div style={{
      width: size, height: size, border: `2.5px solid ${color}30`,
      borderTopColor: color, borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
    }} />
  );
}

// ── Backend CSV Processing ───────────────────────────────────────────────────
const LOCAL_API_BASE = "http://localhost:5001";

function resolveApiBase() {
  const configured = import.meta.env.VITE_API_BASE;
  const allowRemoteOnLocalhost = String(import.meta.env.VITE_ALLOW_REMOTE_API_ON_LOCALHOST || "").toLowerCase() === "1";
  if (typeof window !== "undefined") {
    const h = window.location?.hostname || "";
    const isLocalhost = h === "localhost" || h === "127.0.0.1";
    // In local development, prefer the local backend unless explicitly overridden.
    if (isLocalhost && !allowRemoteOnLocalhost) return LOCAL_API_BASE;
  }
  return configured || LOCAL_API_BASE;
}

const API_BASE = resolveApiBase();

/** True when app is served from a non-local host (e.g. GitHub Pages). */
function isOnlineDemo() {
  if (typeof window === "undefined") return false;
  const h = window.location?.hostname || "";
  return h !== "localhost" && h !== "127.0.0.1";
}

/** Use backend for CSV only when we have a non-local API or are on localhost. */
function shouldUseBackendForCsv() {
  const hasRemoteApi = API_BASE && !API_BASE.includes("localhost");
  return hasRemoteApi || !isOnlineDemo();
}

async function processCSVFile(file) {
  if (!shouldUseBackendForCsv()) {
    const text = await readFileAsText(file);
    return processCSVFileClientSide(text);
  }
  let res;
  const formData = new FormData();
  formData.append("file", file);
  try {
    res = await fetch(`${API_BASE}/api/process-csv`, { method: "POST", body: formData });
  } catch (err) {
    const msg = (err && err.message) ? String(err.message) : "";
    const isNetworkError =
      err.name === "TypeError" && msg.includes("fetch") ||
      msg === "Load failed" ||
      /network|failed to load|load failed/i.test(msg);
    if (isNetworkError) {
      throw new Error(
        "Cannot reach the backend. Start it in a terminal: cd backend && python server.py"
      );
    }
    throw err;
  }

  let data;
  try {
    data = await res.json();
  } catch (_) {
    throw new Error(res.ok ? "Invalid response from server" : `Server error (${res.status}). Is the backend running?`);
  }

  if (!res.ok) throw new Error(data.error || "Backend processing failed");
  return data;
}

/** Client-side CSV parse for when backend is unavailable. Returns raw { headers, rows } for resampling in UI. */
function processCSVFileClientSide(text) {
  const { headers, rows } = parseCSV(text);
  if (headers.length === 0 || rows.length === 0) {
    throw new Error("CSV file is empty or has no data rows.");
  }
  return { headers, rows };
}

async function readFileAsText(file) {
  // Prefer File.text() when available, but provide fallbacks for tricky files/browsers.
  try {
    if (file && typeof file.text === "function") {
      return await file.text();
    }
  } catch (_) {
    // fall through
  }

  try {
    if (file && typeof file.arrayBuffer === "function") {
      const buf = await file.arrayBuffer();
      return new TextDecoder("utf-8", { fatal: false }).decode(buf);
    }
  } catch (_) {
    // fall through
  }

  return await new Promise((resolve, reject) => {
    try {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ""));
      r.onerror = () => reject(new Error("Could not read file"));
      r.readAsText(file);
    } catch (e) {
      reject(new Error("Could not read file"));
    }
  });
}

// ── Upload Zone ──────────────────────────────────────────────────────────────
function UploadZone({ label, icon, accept, color, file, onLoad, onFileUpload, onClear, onError, onDownloadSuccess, templateFile }) {
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputId = useRef(`upload-${Math.random().toString(36).slice(2)}`).current;

  const loadTemplate = useCallback(async (e) => {
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
        const f = new File([blob], templateFile, { type: res.headers.get("content-type") || (templateFile.endsWith(".csv") ? "text/csv" : "application/json") });
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
  }, [templateFile, onFileUpload, onLoad, onError]);

  const downloadTemplate = useCallback(async (e) => {
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
  }, [templateFile, onError, onDownloadSuccess]);

  const processFile = useCallback((f) => {
    if (!f) return;

    // Validate file extension
    const ext = f.name.split(".").pop().toLowerCase();
    const allowed = accept.split(",").map(a => a.trim().replace(".", ""));
    if (!allowed.includes(ext)) {
      onError(`Invalid file type ".${ext}". Expected: ${accept}`);
      return;
    }

    // Validate file size (max 50MB)
    if (f.size > 50 * 1024 * 1024) {
      onError(`File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Maximum: 50 MB`);
      return;
    }

    // If onFileUpload is provided (CSV → backend), send raw file
    if (onFileUpload) {
      setLoading(true);
      onFileUpload(f).finally(() => setLoading(false));
      return;
    }

    // Otherwise read as text (JSON files)
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
  }, [accept, onLoad, onFileUpload, onError]);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDrag(false);
    processFile(e.dataTransfer.files[0]);
  }, [processFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
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
      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 12,
          background: "rgba(255,255,255,0.85)", display: "flex",
          alignItems: "center", justifyContent: "center", gap: 10,
          zIndex: 2,
        }}>
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
                  background: "none", border: "none", cursor: loading ? "not-allowed" : "pointer",
                  color: "#94a3b8", padding: 4, borderRadius: 6, display: "flex",
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.color = color; }}
                onMouseLeave={e => (e.currentTarget.style.color = "#94a3b8")}
                aria-label="Download template"
              >
                <FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />
              </button>
            )}
            <button
              onClick={onClear}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#94a3b8", padding: 4, borderRadius: 6, display: "flex",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
              onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}
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
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: `${color}14`, border: `1.5px solid ${color}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 12px",
          }}>
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
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    color, fontWeight: 600, textDecoration: "underline", fontFamily: FONT, fontSize: 12,
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

// ── CSV Table (scrollable, 10 visible rows) ─────────────────────────────────
const ROW_NUM_ID = "_rowNum";

function CSVTable({ title, icon, color, headers, rows, resampled, originalRows, resampledStepMinutes = 10, defaultVisibleLabels, columnDisplayNames }) {
  const [expanded, setExpanded] = useState(false);
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const displayNames = columnDisplayNames && typeof columnDisplayNames === "object" ? columnDisplayNames : {};

  const columns = useMemo(
    () => [
      { id: ROW_NUM_ID, label: "#" },
      ...safeHeaders.map((h, i) => {
        const raw = String(h ?? "").trim() || `Column ${i + 1}`;
        const baseLabel = displayNames[raw] ?? displayNames[raw.toLowerCase()] ?? raw;
        const label = formatHeaderWithUnit(baseLabel);
        return { id: i, label };
      }),
    ],
    [safeHeaders, displayNames]
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
    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", cursor: "pointer", userSelect: "none",
          borderBottom: expanded ? "1px solid #E2E8F0" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {icon}
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>{title}</span>
          <span style={{
            fontSize: 11, fontWeight: 600, color, background: `${color}14`,
            padding: "2px 10px", borderRadius: 20, fontFamily: MONO,
          }}>
            {safeRows.length} rows × {visibleColumns.length} cols
          </span>
          {resampled && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: Y, background: `${Y}14`,
              padding: "2px 10px", borderRadius: 20, fontFamily: MONO,
            }}>
              {resampledStepMinutes} min resampled{originalRows ? ` (from ${originalRows})` : ""}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <TableColumnSelector columns={columns} visibleIds={visibleIds} onVisibleChange={setVisibleIds} defaultVisibleIds={defaultVisibleIds} />
          {expanded
            ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} />
            : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />
          }
        </div>
      </div>
      {/* Scrollable Table */}
      {expanded && (
        <div style={{ overflowX: "auto", maxHeight: 370, overflowY: "auto" }}>
          <table style={{
            width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: MONO,
          }}>
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
        <div style={{
          padding: "8px 20px", fontSize: 12, color: "#94a3b8",
          fontFamily: FONT, borderTop: "1px solid #E2E8F0",
        }}>
          Scroll to see all {safeRows.length} rows
        </div>
      )}
    </div>
  );
}

// ── CSV Chart (Plotly): multi-column dropdown, multiple series ─────────────────
const CHART_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];

/** Find column index by name (case-insensitive). Tries exact match then uppercase. */
function findColIndex(headers, ...names) {
  const h = (headers || []).map((x) => String(x ?? "").trim());
  for (const n of names) {
    const want = String(n ?? "").trim();
    const idx = h.findIndex((x) => x.toLowerCase() === want.toLowerCase() || x === want);
    if (idx >= 0) return idx;
  }
  return -1;
}

// ── Sync chart: dual Y-axis — PV time/Power (left) + Weather time/POA (right) ─────
function SyncChart({ pvHeaders, pvRows, weatherHeaders, weatherRows }) {
  const safePvH = Array.isArray(pvHeaders) ? pvHeaders : [];
  const safePvR = Array.isArray(pvRows) ? pvRows : [];
  const safeWh = Array.isArray(weatherHeaders) ? weatherHeaders : [];
  const safeWr = Array.isArray(weatherRows) ? weatherRows : [];

  const config = useMemo(() => {
    const timeColPv = safePvH.length > 0 ? 0 : -1;
    const pdcCol = findColIndex(safePvH, "P_DC", "P DC", "PDC", "P", "Power");
    const timeColWeather = safeWh.length > 0 ? 0 : -1;
    const irrCol = findColIndex(safeWh, "POA", "Poa", "poa", "GTI", "GHI", "Ghi");
    if (timeColPv < 0 || pdcCol < 0 || timeColWeather < 0 || irrCol < 0) return null;

    const pvTimes = safePvR.map((r) => (Array.isArray(r) ? r[timeColPv] : ""));
    const pvPdc = safePvR.map((r) => {
      const v = parseFloat(Array.isArray(r) ? r[pdcCol] : "");
      return isNaN(v) ? null : v;
    });
    const weatherTimes = safeWr.map((r) => (Array.isArray(r) ? r[timeColWeather] : ""));
    const weatherIrr = safeWr.map((r) => {
      const v = parseFloat(Array.isArray(r) ? r[irrCol] : "");
      return isNaN(v) ? null : v;
    });

    const tracePdc = {
      x: pvTimes,
      y: pvPdc,
      type: "scatter",
      mode: "lines",
      name: safePvH[pdcCol] ?? "Power",
      line: { color: O, width: 1.5, shape: "spline", smoothing: 1.2 },
      yaxis: "y",
      hovertemplate: `<b>${safePvH[pdcCol] ?? "Power"}</b>: %{y}<extra></extra>`,
    };
    const traceIrr = {
      x: weatherTimes,
      y: weatherIrr,
      type: "scatter",
      mode: "lines",
      name: safeWh[irrCol] ?? "POA",
      line: { color: B, width: 1.5, shape: "spline", smoothing: 1.2 },
      yaxis: "y2",
      hovertemplate: `<b>${safeWh[irrCol] ?? "POA"}</b>: %{y}<extra></extra>`,
    };

    const layout = {
      height: 360,
      margin: { t: 24, r: 56, b: 50, l: 56 },
      hovermode: "x unified",
      showlegend: true,
      legend: { x: 1, y: 1, xanchor: "right", font: { family: FONT, size: 11 } },
      xaxis: {
        title: { text: formatHeaderWithUnit("Time"), font: { family: FONT, size: 12, color: "#94a3b8" } },
        gridcolor: "#F1F5F9",
        tickfont: { family: MONO, size: 10, color: "#94a3b8" },
      },
      yaxis: {
        title: { text: formatHeaderWithUnit(safePvH[pdcCol] ?? "P_DC"), font: { family: FONT, size: 12, color: O } },
        gridcolor: "#F1F5F9",
        tickfont: { family: MONO, size: 10, color: "#94a3b8" },
        side: "left",
      },
      yaxis2: {
        title: { text: formatHeaderWithUnit(safeWh[irrCol] ?? "POA"), font: { family: FONT, size: 12, color: B } },
        gridcolor: "rgba(0,0,0,0)",
        tickfont: { family: MONO, size: 10, color: "#94a3b8" },
        side: "right",
        overlaying: "y",
        anchor: "x",
      },
      plot_bgcolor: "#fff",
      paper_bgcolor: "#fff",
      font: { family: FONT },
    };

    return { data: [tracePdc, traceIrr], layout };
  }, [safePvH, safePvR, safeWh, safeWr]);

  if (!config) return null;

  return (
    <div style={{
      background: "#ffffff",
      borderRadius: 16,
      border: "1px solid #E2E8F0",
      boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
      padding: "16px 18px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{
          width: 30,
          height: 30,
          borderRadius: 10,
          background: `${P}12`,
          border: `1px solid ${P}35`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <TimelineOutlined sx={{ fontSize: 18, color: P }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
            Power vs POA
          </span>
          <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>
            PV Power (left axis) and plane-of-array irradiance (right axis) over time.
          </span>
        </div>
      </div>
      <Plot
        data={config.data}
        layout={config.layout}
        config={{
          displaylogo: false,
          responsive: true,
          modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
        }}
        style={{ width: "100%" }}
      />
    </div>
  );
}

// ── Helpers to build synced-series arrays from rules on the frontend ───────────
function parseRuleDate(str) {
  if (!str) return null;
  const s = String(str).trim().replace(" ", "T");
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function applySyncRulesToTimes(times, rules, shiftColUnits = "minutes") {
  if (!Array.isArray(times) || !Array.isArray(rules)) return times ?? [];
  return times.map((tStr) => {
    const base = tStr ? new Date(String(tStr).replace(" ", "T")) : null;
    if (!base || Number.isNaN(base.getTime())) return tStr;
    let shifted = base;
    for (const r of rules) {
      const start = parseRuleDate(r.start);
      const end = parseRuleDate(r.end);
      if (!start || !end) continue;
      if (base >= start && base <= end) {
        const minutes = Number(r.shiftMinutes) || 0;
        shifted = new Date(base.getTime() + minutes * 60 * 1000);
        break;
      }
    }
    const yyyy = shifted.getFullYear();
    const mm = String(shifted.getMonth() + 1).padStart(2, "0");
    const dd = String(shifted.getDate()).padStart(2, "0");
    const HH = String(shifted.getHours()).padStart(2, "0");
    const MM = String(shifted.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${HH}:${MM}`;
  });
}

/**
 * Cross-correlation: find the weather time lag (in minutes) that maximises R²
 * between PV power and weather irradiance.
 *
 * pvTimes/whTimes  – arrays of "YYYY-MM-DD HH:MM" strings
 * pvValues/whValues – parallel arrays of numeric values (Power / POA)
 * stepMinutes       – resampling interval (lag granularity)
 * maxLagMinutes     – search range ±
 */
function detectTimeOffset(pvTimes, pvValues, whTimes, whValues, stepMinutes, maxLagMinutes = 120) {
  const step = Math.max(1, Math.round(stepMinutes));
  const maxLag = Math.max(step, Math.round(maxLagMinutes));

  // Build PV map (time string → power), daytime only
  const pvMap = new Map();
  for (let i = 0; i < pvTimes.length; i++) {
    const p = Number(pvValues[i]);
    if (!Number.isFinite(p)) continue;
    const t = String(pvTimes[i] ?? "").trim();
    if (t) pvMap.set(t, p);
  }

  // Pre-parse weather entries (keep irradiance ≥ 50 W/m² to skip nighttime)
  const whEntries = [];
  for (let i = 0; i < whTimes.length; i++) {
    const g = Number(whValues[i]);
    if (!Number.isFinite(g) || g < 50) continue;
    const tStr = String(whTimes[i] ?? "").trim();
    if (!tStr) continue;
    const ms = new Date(tStr.replace(" ", "T")).getTime();
    if (!Number.isFinite(ms)) continue;
    whEntries.push({ ms, g });
  }

  if (pvMap.size === 0 || whEntries.length === 0) return null;

  // Helper: ms → "YYYY-MM-DD HH:MM"
  const fmtTime = (ms) => {
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const HH = String(d.getHours()).padStart(2, "0");
    const MM = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${HH}:${MM}`;
  };

  let bestLag = 0;
  let bestR2 = -Infinity;
  let bestCount = 0;
  let baselineR2 = 0;

  for (let lag = -maxLag; lag <= maxLag; lag += step) {
    const shiftMs = lag * 60000;
    const xs = [];
    const ys = [];
    for (const { ms, g } of whEntries) {
      const shifted = fmtTime(ms + shiftMs);
      const p = pvMap.get(shifted);
      if (p != null) {
        xs.push(g);
        ys.push(p);
      }
    }
    if (xs.length < 20) continue;
    const { r2 } = linearRegression(xs, ys);
    if (lag === 0) baselineR2 = r2;
    if (r2 > bestR2) {
      bestR2 = r2;
      bestLag = lag;
      bestCount = xs.length;
    }
  }

  if (bestR2 === -Infinity) return null;
  return { bestLag, bestR2, baselineR2, matchedCount: bestCount };
}

function SyncRuleRangeEditor({ rule, onChange }) {
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
          border: "1px solid #CBD5F5",
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
          border: "1px solid #CBD5F5",
          background: "#F9FAFB",
          color: "#0F172A",
          outline: "none",
        }}
      />
    </div>
  );
}

/** Simple linear regression: returns { slope, intercept, r2 } from x[], y[]. */
function linearRegression(x, y) {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
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

function pearsonCorrelation(x, y) {
  const n = Math.min(x?.length ?? 0, y?.length ?? 0);
  if (n < 2) return { r: null, n: 0 };

  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const yi = y[i];
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
    sumX += xi;
    sumY += yi;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const yi = y[i];
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
    const dx = xi - meanX;
    const dy = yi - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
    count++;
  }
  if (count < 2) return { r: null, n: count };
  const denom = Math.sqrt(denX) * Math.sqrt(denY);
  if (!Number.isFinite(denom) || denom === 0) return { r: null, n: count };
  return { r: clamp(num / denom, -1, 1), n: count };
}

// ── Correlation chart: x = POA, y = Power (aligned by time, same filtered data) ───
function CorrelationChart({ pvHeaders, pvRows, weatherHeaders, weatherRows }) {
  const safePvH = Array.isArray(pvHeaders) ? pvHeaders : [];
  const safePvR = Array.isArray(pvRows) ? pvRows : [];
  const safeWh = Array.isArray(weatherHeaders) ? weatherHeaders : [];
  const safeWr = Array.isArray(weatherRows) ? weatherRows : [];

  const config = useMemo(() => {
    const timeColPv = safePvH.length > 0 ? 0 : -1;
    const pdcCol = findColIndex(safePvH, "P_DC", "P DC", "PDC", "P", "Power");
    const timeColWeather = safeWh.length > 0 ? 0 : -1;
    const irrCol = findColIndex(safeWh, "POA", "Poa", "poa", "GTI", "GHI", "Ghi");
    if (timeColPv < 0 || pdcCol < 0 || timeColWeather < 0 || irrCol < 0) return null;

    // Map time -> POA (or fallback) from weather
    const timeToIrr = new Map();
    for (const r of safeWr) {
      const t = Array.isArray(r) ? String(r[timeColWeather] ?? "").trim() : "";
      const g = parseFloat(Array.isArray(r) ? r[irrCol] : "");
      if (t && !isNaN(g) && isFinite(g)) timeToIrr.set(t, g);
    }

    const irrArr = [];
    const pdcArr = [];
    for (const r of safePvR) {
      const t = Array.isArray(r) ? String(r[timeColPv] ?? "").trim() : "";
      const pdc = parseFloat(Array.isArray(r) ? r[pdcCol] : "");
      if (t === "" || isNaN(pdc) || !isFinite(pdc)) continue;
      const irr = timeToIrr.get(t);
      if (irr == null) continue;
      irrArr.push(irr);
      pdcArr.push(pdc);
    }
    if (irrArr.length === 0) return null;

    const { slope, intercept, r2 } = linearRegression(irrArr, pdcArr);
    const minX = Math.min(...irrArr);
    const maxX = Math.max(...irrArr);
    const lineX = [minX, maxX];
    const lineY = [slope * minX + intercept, slope * maxX + intercept];

    const traceScatter = {
      x: irrArr,
      y: pdcArr,
      type: "scattergl",
      mode: "markers",
      name: "Data",
      marker: {
        size: 8,
        color: P,
        opacity: 0.65,
        line: { width: 1, color: "rgba(255,255,255,0.9)" },
        symbol: "circle",
      },
      hovertemplate: `<b>${safeWh[irrCol] ?? "POA"}</b>: %{x:.2f}<br><b>${safePvH[pdcCol] ?? "Power"}</b>: %{y:.2f}<extra></extra>`,
    };

    const traceLine = {
      x: lineX,
      y: lineY,
      type: "scattergl",
      mode: "lines",
      name: `Trend (R² = ${r2.toFixed(3)})`,
      line: {
        color: O,
        width: 2.5,
        dash: "solid",
      },
      hovertemplate: "Trend: P_DC = %{y:.2f}<extra></extra>",
    };

    const layout = {
      height: 380,
      margin: { t: 40, r: 40, b: 56, l: 60 },
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
        title: {
          text: formatHeaderWithUnit(safeWh[irrCol] ?? "POA"),
          font: { family: FONT, size: 13, color: "#334155", standoff: 10 },
        },
        gridcolor: "#E2E8F0",
        zerolinecolor: "#E2E8F0",
        zerolinewidth: 1,
        tickfont: { family: MONO, size: 11, color: "#64748B" },
        ticklen: 4,
        showline: true,
        linecolor: "#E2E8F0",
        linewidth: 1,
        mirror: false,
      },
      yaxis: {
        title: {
          text: formatHeaderWithUnit(safePvH[pdcCol] ?? "Power"),
          font: { family: FONT, size: 13, color: "#334155", standoff: 10 },
        },
        gridcolor: "#E2E8F0",
        zerolinecolor: "#E2E8F0",
        zerolinewidth: 1,
        tickfont: { family: MONO, size: 11, color: "#64748B" },
        ticklen: 4,
        showline: true,
        linecolor: "#E2E8F0",
        linewidth: 1,
        mirror: false,
      },
      plot_bgcolor: "#FFFFFF",
      paper_bgcolor: "#FFFFFF",
      font: { family: FONT },
    };

    return { data: [traceScatter, traceLine], layout };
  }, [safePvH, safePvR, safeWh, safeWr]);

  if (!config) return null;

  return (
    <div style={{
      background: "#ffffff",
      borderRadius: 16,
      border: "1px solid #E2E8F0",
      boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
      padding: "16px 18px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{
          width: 30,
          height: 30,
          borderRadius: 10,
          background: `${P}12`,
          border: `1px solid ${P}35`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <TimelineOutlined sx={{ fontSize: 18, color: P }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
            Correlation: POA vs P_DC
          </span>
          <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>
            Scatter of PV power vs irradiance (points aligned by time). Same date range as above.
          </span>
        </div>
      </div>
      <Plot
        data={config.data}
        layout={config.layout}
        config={{
          displaylogo: false,
          responsive: true,
          modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
        }}
        style={{ width: "100%" }}
      />
    </div>
  );
}

function CorrelationHeatmapCard({
  pvHeaders,
  pvRows,
  weatherHeaders,
  weatherRows,
  mergedHeaders,
  mergedRows,
  title = "Data Correlation",
  embedded = false,
  defaultExpanded = true,
}) {
  const safePvH = Array.isArray(pvHeaders) ? pvHeaders : [];
  const safePvR = Array.isArray(pvRows) ? pvRows : [];
  const safeWhH = Array.isArray(weatherHeaders) ? weatherHeaders : [];
  const safeWhR = Array.isArray(weatherRows) ? weatherRows : [];
  const safeMergedH = Array.isArray(mergedHeaders) ? mergedHeaders : [];
  const safeMergedR = Array.isArray(mergedRows) ? mergedRows : [];
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));

  const useMerged = safeMergedH.length > 0 && safeMergedR.length > 0;

  const pvPlottableCols = useMemo(() => {
    if (useMerged) return [];
    return safePvH
      .map((h, i) => ({ header: h, index: i }))
      .filter(({ index }) => {
        if (index === 0) return false; // assume time col
        const sample = safePvR.slice(0, Math.min(120, safePvR.length));
        let numCount = 0;
        for (const row of sample) {
          const raw = (Array.isArray(row) ? (row[index] ?? "") : "").toString().trim();
          if (!raw) continue;
          const n = parseFloat(raw);
          if (!Number.isNaN(n) && Number.isFinite(n)) numCount++;
        }
        return numCount >= Math.max(2, sample.length * 0.15);
      });
  }, [safePvH, safePvR]);

  const whPlottableCols = useMemo(() => {
    if (useMerged) return [];
    return safeWhH
      .map((h, i) => ({ header: h, index: i }))
      .filter(({ index }) => {
        if (index === 0) return false; // assume time col
        const sample = safeWhR.slice(0, Math.min(120, safeWhR.length));
        let numCount = 0;
        for (const row of sample) {
          const raw = (Array.isArray(row) ? (row[index] ?? "") : "").toString().trim();
          if (!raw) continue;
          const n = parseFloat(raw);
          if (!Number.isNaN(n) && Number.isFinite(n)) numCount++;
        }
        return numCount >= Math.max(2, sample.length * 0.15);
      });
  }, [safeWhH, safeWhR]);

  const mergedPlottableCols = useMemo(() => {
    if (!useMerged) return [];
    return safeMergedH
      .map((h, i) => ({ header: h, index: i }))
      .filter(({ index }) => {
        if (index === 0) return false; // time
        const sample = safeMergedR.slice(0, Math.min(160, safeMergedR.length));
        let numCount = 0;
        for (const row of sample) {
          const raw = (Array.isArray(row) ? (row[index] ?? "") : "").toString().trim();
          if (!raw) continue;
          const n = parseFloat(raw);
          if (!Number.isNaN(n) && Number.isFinite(n)) numCount++;
        }
        return numCount >= Math.max(2, sample.length * 0.15);
      });
  }, [useMerged, safeMergedH, safeMergedR]);

  const defaultPvSelected = useMemo(() => {
    if (useMerged) return [];
    if (!safePvH.length) return [];
    const idxs = [
      findColIndex(safePvH, "Current", "I", "I_DC", "IDC"),
      findColIndex(safePvH, "Voltage", "V", "V_DC", "VDC"),
      findColIndex(safePvH, "Power", "P", "P_DC", "PDC"),
      findColIndex(safePvH, "Module_Temp", "Module Temp", "T_Module", "Tmod"),
    ].filter((i) => i > 0);
    const uniq = Array.from(new Set(idxs)).filter((i) => pvPlottableCols.some((c) => c.index === i));
    if (uniq.length) return uniq;
    return pvPlottableCols.length ? [pvPlottableCols[0].index] : [];
  }, [safePvH, pvPlottableCols]);

  const defaultWhSelected = useMemo(() => {
    if (useMerged) return [];
    if (!safeWhH.length) return [];
    const idxs = [
      findColIndex(safeWhH, "POA", "Poa", "poa", "GTI"),
      findColIndex(safeWhH, "GHI", "Ghi", "weather_GHI"),
      findColIndex(safeWhH, "DNI", "Dni"),
      findColIndex(safeWhH, "Air_Temp", "Air Temp", "Ta", "weather_Air_Temp"),
      findColIndex(safeWhH, "RH", "Relative Humidity", "weather_RH"),
    ].filter((i) => i > 0);
    const uniq = Array.from(new Set(idxs)).filter((i) => whPlottableCols.some((c) => c.index === i));
    if (uniq.length) return uniq;
    return whPlottableCols.length ? [whPlottableCols[0].index] : [];
  }, [safeWhH, whPlottableCols]);

  const defaultMergedSelected = useMemo(() => {
    if (!useMerged) return [];
    return mergedPlottableCols.map((c) => c.index);
  }, [useMerged, mergedPlottableCols]);

  const [pvSelected, setPvSelected] = useState(() => defaultPvSelected);
  const [whSelected, setWhSelected] = useState(() => defaultWhSelected);
  const [mergedSelectedX, setMergedSelectedX] = useState(() => defaultMergedSelected);
  const [mergedSelectedY, setMergedSelectedY] = useState(() => defaultMergedSelected);

  useEffect(() => {
    setPvSelected((prev) => (prev?.length ? prev : defaultPvSelected));
  }, [defaultPvSelected]);
  useEffect(() => {
    setWhSelected((prev) => (prev?.length ? prev : defaultWhSelected));
  }, [defaultWhSelected]);
  useEffect(() => {
    if (!useMerged) return;
    setMergedSelectedX((prev) => (prev?.length ? prev : defaultMergedSelected));
    setMergedSelectedY((prev) => (prev?.length ? prev : defaultMergedSelected));
  }, [useMerged, defaultMergedSelected]);

  const heatmap = useMemo(() => {
    if (useMerged) {
      if (!safeMergedH.length || !safeMergedR.length) return null;
      if (!mergedSelectedX.length || !mergedSelectedY.length) return null;

      const xLabels = mergedSelectedX.map((i) => safeMergedH[i] ?? `col_${i}`);
      const yLabels = mergedSelectedY.map((i) => safeMergedH[i] ?? `col_${i}`);
      const z = mergedSelectedY.map(() => mergedSelectedX.map(() => null));

      for (let yi = 0; yi < mergedSelectedY.length; yi++) {
        const yIdx = mergedSelectedY[yi];
        for (let xi = 0; xi < mergedSelectedX.length; xi++) {
          const xIdx = mergedSelectedX[xi];
          const xs = [];
          const ys = [];
          for (const row of safeMergedR) {
            if (!Array.isArray(row)) continue;
            const xv = parseFloat(row[xIdx]);
            const yv = parseFloat(row[yIdx]);
            if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
            xs.push(xv);
            ys.push(yv);
          }
          const { r } = pearsonCorrelation(xs, ys);
          z[yi][xi] = r;
        }
      }

      return { pvLabels: xLabels, whLabels: yLabels, z };
    }

    if (!safePvH.length || !safeWhH.length || !safePvR.length || !safeWhR.length) return null;
    if (!pvSelected.length || !whSelected.length) return null;

    const timePvIdx = getDateColumnIndex(safePvH);
    const timeWhIdx = getDateColumnIndex(safeWhH);
    if (timePvIdx < 0 || timeWhIdx < 0) return null;

    const weatherByTime = new Map();
    for (const r of safeWhR) {
      if (!Array.isArray(r)) continue;
      const t = String(r[timeWhIdx] ?? "").trim();
      if (!t) continue;
      weatherByTime.set(t, r);
    }

    const pvLabels = pvSelected.map((i) => safePvH[i] ?? `PV_${i}`);
    const whLabels = whSelected.map((i) => safeWhH[i] ?? `WH_${i}`);

    const z = whSelected.map(() => pvSelected.map(() => null));
    const nMat = whSelected.map(() => pvSelected.map(() => 0));

    for (let yi = 0; yi < whSelected.length; yi++) {
      for (let xi = 0; xi < pvSelected.length; xi++) {
        const whIdx = whSelected[yi];
        const pvIdx = pvSelected[xi];
        const xs = [];
        const ys = [];
        for (const pvRow of safePvR) {
          if (!Array.isArray(pvRow)) continue;
          const t = String(pvRow[timePvIdx] ?? "").trim();
          if (!t) continue;
          const whRow = weatherByTime.get(t);
          if (!Array.isArray(whRow)) continue;

          const pvVal = parseFloat(pvRow[pvIdx]);
          const whVal = parseFloat(whRow[whIdx]);
          if (!Number.isFinite(pvVal) || !Number.isFinite(whVal)) continue;
          xs.push(pvVal);
          ys.push(whVal);
        }
        const { r, n } = pearsonCorrelation(xs, ys);
        z[yi][xi] = r;
        nMat[yi][xi] = n;
      }
    }

    const text = whLabels.map((wLab, yi) =>
      pvLabels.map((pLab, xi) => {
        const r = z[yi][xi];
        const n = nMat[yi][xi];
        return `${wLab} × ${pLab}<br>r=${r == null ? "n/a" : r.toFixed(3)}<br>N=${n}`;
      })
    );

    return { pvLabels, whLabels, z, text };
  }, [
    useMerged,
    safeMergedH,
    safeMergedR,
    mergedSelectedX,
    mergedSelectedY,
    safePvH,
    safeWhH,
    safePvR,
    safeWhR,
    pvSelected,
    whSelected,
  ]);

  if (useMerged ? !safeMergedH.length : (!safePvH.length || !safeWhH.length)) return null;

  const containerStyle = embedded
    ? { background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }
    : {
        background: "#ffffff",
        borderRadius: 16,
        border: "1px solid #E2E8F0",
        boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
        padding: "16px 18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        marginTop: 18,
      };

  return (
    <div style={containerStyle}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          cursor: "pointer",
          userSelect: "none",
          padding: embedded ? "14px 20px" : 0,
          borderBottom: embedded ? (expanded ? "1px solid #E2E8F0" : "none") : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              background: `${P}12`,
              border: `1px solid ${P}35`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <HubOutlined sx={{ fontSize: 18, color: P }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{title}</span>
            <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>
              Pearson correlation heatmap between PV and Weather columns (aligned by Time).
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
          {useMerged ? (
            <>
              <ColumnMultiSelect options={mergedPlottableCols} selected={mergedSelectedX} onChange={setMergedSelectedX} />
              <ColumnMultiSelect options={mergedPlottableCols} selected={mergedSelectedY} onChange={setMergedSelectedY} />
            </>
          ) : (
            <>
              <ColumnMultiSelect options={pvPlottableCols} selected={pvSelected} onChange={setPvSelected} />
              <ColumnMultiSelect options={whPlottableCols} selected={whSelected} onChange={setWhSelected} />
            </>
          )}
          {expanded ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} /> : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />}
        </div>
      </div>

      {expanded && (
        <div style={embedded ? { padding: "10px 12px 12px" } : undefined}>
          {!heatmap ? (
            <div style={{ padding: embedded ? 0 : "10px 2px 2px", color: "#64748B", fontFamily: FONT, fontSize: 12 }}>
              Load PV + Weather data and select at least one numeric column from each to view the heatmap.
            </div>
          ) : (
            <Plot
              data={[
                {
                  type: "heatmap",
                  x: heatmap.pvLabels,
                  y: heatmap.whLabels,
                  z: heatmap.z,
                  zmin: -1,
                  zmax: 1,
                  // Palette matched to the provided example (dark purple -> orange -> near-white).
                  colorscale: [
                    [0.0, "#12092b"],
                    [0.15, "#2b1a5a"],
                    [0.30, "#5a1f73"],
                    [0.50, "#b12a6a"],
                    [0.70, "#f04f2a"],
                    [0.85, "#f7a15a"],
                    [1.0, "#f6f0e6"],
                  ],
                  reversescale: false,
                  showscale: true,
                  colorbar: {
                    title: { text: "Correlation", side: "right", font: { family: FONT, size: 12, color: "#475569" } },
                    tickfont: { family: MONO, size: 10, color: "#64748B" },
                    len: 0.9,
                  },
                  xgap: 1,
                  ygap: 1,
                  text: heatmap.z.map((row) => row.map((v) => (v == null ? "" : Number(v).toFixed(2)))),
                  texttemplate: "%{text}",
                  textfont: { family: MONO, size: 10, color: "#0F172A" },
                  hovertemplate: "%{y} × %{x}<br>r=%{z:.3f}<extra></extra>",
                },
              ]}
              layout={{
                height: 420,
                margin: { t: 10, r: 70, b: 110, l: 140 },
                xaxis: {
                  tickangle: -30,
                  tickfont: { family: FONT, size: 11, color: "#475569" },
                },
                yaxis: {
                  tickfont: { family: FONT, size: 11, color: "#475569" },
                  automargin: true,
                },
                plot_bgcolor: "#FFFFFF",
                paper_bgcolor: "#FFFFFF",
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

// ── Synced data charts (after applying frontend rules) ─────────────────────────
function SyncedLineChart({ merged }) {
  if (!merged || merged.length === 0) return null;
  const x = merged.map((d) => d.time);
  const pdc = merged.map((d) => d.pdc);
  const poa = merged.map((d) => d.poa);

  const data = [
    {
      x,
      y: pdc,
      type: "scatter",
      mode: "lines",
      name: "Power (synced)",
      line: { color: O, width: 1.6, shape: "spline", smoothing: 1.2 },
      yaxis: "y",
      hovertemplate: "<b>Power</b>: %{y:.2f}<extra></extra>",
    },
    {
      x,
      y: poa,
      type: "scatter",
      mode: "lines",
      name: "POA (synced)",
      line: { color: B, width: 1.6, shape: "spline", smoothing: 1.2 },
      yaxis: "y2",
      hovertemplate: "<b>POA</b>: %{y:.2f}<extra></extra>",
    },
  ];

  const layout = {
    height: 360,
    margin: { t: 30, r: 56, b: 50, l: 56 },
    hovermode: "x unified",
    showlegend: true,
    legend: {
      x: 1,
      y: 1,
      xanchor: "right",
      font: { family: FONT, size: 11, color: "#475569" },
    },
    xaxis: {
      title: { text: "Synced time", font: { family: FONT, size: 12, color: "#94a3b8" } },
      gridcolor: "#F1F5F9",
      tickfont: { family: MONO, size: 10, color: "#94a3b8" },
    },
    yaxis: {
      title: { text: formatHeaderWithUnit("Power"), font: { family: FONT, size: 12, color: O } },
      gridcolor: "#F1F5F9",
      tickfont: { family: MONO, size: 10, color: "#94a3b8" },
      side: "left",
    },
    yaxis2: {
      title: { text: formatHeaderWithUnit("POA"), font: { family: FONT, size: 12, color: B } },
      gridcolor: "rgba(0,0,0,0)",
      tickfont: { family: MONO, size: 10, color: "#94a3b8" },
      side: "right",
      overlaying: "y",
      anchor: "x",
    },
    plot_bgcolor: "#fff",
    paper_bgcolor: "#fff",
    font: { family: FONT },
  };

  return (
    <div style={{
      background: "#ffffff",
      borderRadius: 16,
      border: "1px solid #E2E8F0",
      boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
      padding: "16px 18px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{
          width: 30,
          height: 30,
          borderRadius: 10,
          background: `${P}12`,
          border: `1px solid ${P}35`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
            <ShowChartOutlined sx={{ fontSize: 18, color: P }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
            Synced Data — Time Series
          </span>
          <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>
            PV Power and Weather POA after applying time-shift rules.
          </span>
        </div>
      </div>
      <Plot
        data={data}
        layout={layout}
        config={{
          displaylogo: false,
          responsive: true,
          modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
        }}
        style={{ width: "100%" }}
      />
    </div>
  );
}

function SyncedCorrelationChart({ merged }) {
  if (!merged || merged.length === 0) return null;
  const x = merged.map((d) => d.poa);
  const y = merged.map((d) => d.pdc);
  const { slope, intercept, r2 } = linearRegression(x, y);
  const minX = Math.min(...x);
  const maxX = Math.max(...x);
  const lineX = [minX, maxX];
  const lineY = [slope * minX + intercept, slope * maxX + intercept];

  const traceScatter = {
    x,
    y,
    type: "scattergl",
    mode: "markers",
    name: "Synced data",
    marker: {
      size: 8,
      color: P,
      opacity: 0.65,
      line: { width: 1, color: "rgba(255,255,255,0.9)" },
      symbol: "circle",
    },
    hovertemplate: "<b>POA (synced)</b>: %{x:.2f}<br><b>Power</b>: %{y:.2f}<extra></extra>",
  };

  const traceLine = {
    x: lineX,
    y: lineY,
    type: "scattergl",
    mode: "lines",
    name: `Trend (R² = ${r2.toFixed(3)})`,
    line: { color: O, width: 2.5, dash: "solid" },
    hovertemplate: "Trend: P_DC = %{y:.2f}<extra></extra>",
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
      title: {
        text: `${formatHeaderWithUnit("POA")} (synced)`,
        font: { family: FONT, size: 13, color: "#334155", standoff: 10 },
      },
      gridcolor: "#E2E8F0",
      zerolinecolor: "#E2E8F0",
      zerolinewidth: 1,
      tickfont: { family: MONO, size: 11, color: "#64748B" },
      ticklen: 4,
      showline: true,
      linecolor: "#E2E8F0",
      linewidth: 1,
    },
    yaxis: {
      title: {
        text: formatHeaderWithUnit("Power"),
        font: { family: FONT, size: 13, color: "#334155", standoff: 10 },
      },
      gridcolor: "#E2E8F0",
      zerolinecolor: "#E2E8F0",
      zerolinewidth: 1,
      tickfont: { family: MONO, size: 11, color: "#64748B" },
      ticklen: 4,
      showline: true,
      linecolor: "#E2E8F0",
      linewidth: 1,
    },
    plot_bgcolor: "#FFFFFF",
    paper_bgcolor: "#FFFFFF",
    font: { family: FONT },
  };

  return (
    <div style={{
      background: "#ffffff",
      borderRadius: 16,
      border: "1px solid #E2E8F0",
      boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
      padding: "16px 18px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{
          width: 30,
          height: 30,
          borderRadius: 10,
          background: `${P}12`,
          border: `1px solid ${P}35`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
            <ShowChartOutlined sx={{ fontSize: 18, color: P }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
            Synced Data — Correlation
          </span>
          <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>
            Correlation of Power vs POA after applying time-shift rules.
          </span>
        </div>
      </div>
      <Plot
        data={[traceScatter, traceLine]}
        layout={layout}
        config={{
          displaylogo: false,
          responsive: true,
          modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
        }}
        style={{ width: "100%" }}
      />
    </div>
  );
}

function ColumnMultiSelect({ options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      if (popRef.current && popRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selectedLabels = useMemo(() => {
    const map = new Map(options.map((o) => [o.index, o.header]));
    return selected.map((i) => map.get(i)).filter(Boolean);
  }, [options, selected]);

  return (
    <div style={{ position: "relative", minWidth: 182 }}>
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
        title="Select columns"
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selectedLabels.length === 0 ? "Select columns" : selectedLabels.slice(0, 2).join(", ")}
          {selectedLabels.length > 2 ? ` +${selectedLabels.length - 2}` : ""}
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
          <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 500, color: "#94a3b8", padding: "2px 6px 4px" }}>
            Columns
          </div>
          {options.map((opt) => {
            const checked = selected.includes(opt.index);
            return (
              <button
                key={opt.index}
                type="button"
                onClick={() => {
                  const next = checked ? selected.filter((i) => i !== opt.index) : [...selected, opt.index];
                  onChange(next.length ? next : [options[0].index]);
                  setOpen(false); // collapse after selection
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
                      background: checked ? "#8b5cf6" : "#fff",
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
                <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 500, color: "#94a3b8" }}>
                  #{opt.index}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CSVChart({ title, color, headers, rows, defaultYHeader }) {
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

  const [selectedIndices, setSelectedIndices] = useState(() => {
    // If a preferred default header is provided (e.g. "P_DC" for PV data),
    // and it exists beyond the time column, select it.
    if (defaultYHeader && safeHeaders.length > 1) {
      const target = String(defaultYHeader).trim().toLowerCase();
      const idx = safeHeaders.findIndex(
        (h, i) => i > 0 && String(h ?? "").trim().toLowerCase() === target,
      );
      if (idx > 0) return [idx];
    }
    // Otherwise prefer second column (index 1) as default y-series if available,
    // or fall back to the first plottable numeric column.
    if (safeHeaders.length > 1) return [1];
    return plottableCols.length > 0 ? [plottableCols[0].index] : [];
  });

  const xValues = useMemo(() => {
    if (safeRows.length === 0) return [];
    const first = safeHeaders[0];
    if (first) {
      return safeRows.map(r => (Array.isArray(r) ? r[0] : ""));
    }
    return safeRows.map((_, i) => i + 1);
  }, [safeHeaders, safeRows]);

  const chartData = useMemo(() => {
    return selectedIndices.map((colIndex, i) => {
      const yValues = safeRows.map(r => {
        const v = parseFloat(Array.isArray(r) ? r[colIndex] : "");
        return isNaN(v) ? null : v;
      });
      return {
        x: xValues,
        y: yValues,
        type: "scatter",
        mode: "lines",
        name: safeHeaders[colIndex] ?? `Col ${colIndex}`,
        line: { color: CHART_COLORS[i % CHART_COLORS.length], width: 1.5, shape: "spline", smoothing: 1.2 },
        hovertemplate: `<b>%{fullData.name}</b>: %{y}<extra></extra>`,
      };
    });
  }, [safeRows, safeHeaders, selectedIndices, xValues]);

  if (plottableCols.length === 0) return null;

  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0",
      overflow: "hidden",
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", cursor: "pointer", userSelect: "none",
          borderBottom: expanded ? "1px solid #E2E8F0" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LightModeOutlined sx={{ fontSize: 20, color }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>
            {title} — Chart
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }} onClick={(e) => e.stopPropagation()}>
          <ColumnMultiSelect
            options={plottableCols}
            selected={selectedIndices}
            onChange={setSelectedIndices}
          />
          {expanded
            ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} />
            : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />
          }
        </div>
      </div>
      {expanded && (
      <div style={{ padding: "8px 12px 12px" }}>
        {chartData.length === 0 ? (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontFamily: FONT }}>Select at least one column</div>
        ) : (
        <Plot
          data={chartData}
          layout={{
            height: 340,
            margin: { t: 20, r: 24, b: 50, l: 60 },
            hovermode: "x unified",
            showlegend: chartData.length > 1,
            legend: { x: 1, y: 1, xanchor: "right", font: { family: FONT, size: 11 } },
            xaxis: {
              title: { text: formatHeaderWithUnit(safeHeaders[0] ?? "Index"), font: { family: FONT, size: 12, color: "#94a3b8" } },
              gridcolor: "#F1F5F9",
              tickfont: { family: MONO, size: 10, color: "#94a3b8" },
            },
            yaxis: {
              title: { text: selectedIndices.length === 1 ? formatHeaderWithUnit(safeHeaders[selectedIndices[0]] ?? "") : "Value", font: { family: FONT, size: 12, color: "#94a3b8" } },
              gridcolor: "#F1F5F9",
              tickfont: { family: MONO, size: 10, color: "#94a3b8" },
            },
            plot_bgcolor: "#fff",
            paper_bgcolor: "#fff",
            font: { family: FONT },
          }}
          config={{
            displaylogo: false,
            responsive: true,
            modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
          }}
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
      const isScaleSample = sp.cosZenith > CLEAR_SCALE_MIN_COSZ && modeled > 150;

      x.push(tRaw);
      ghiMeas.push(Number.isFinite(meas) ? meas : null);
      ghiClrBase.push(modeled > 0 ? modeled : null);
      cosZ.push(sp.cosZenith);
      dayKey.push(toYMDLocal(d));

      if (isScaleSample && Number.isFinite(meas) && meas > 0 && modeled > 0) ratios.push(meas / modeled);
    }
    if (!x.length) return { error: "no_data" };

    const scale = estimateClearSkyScale(ratios);

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
          <BarChartOutlined sx={{ fontSize: 20, color }} />
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
              Add <span style={{ fontFamily: MONO }}>latitude</span> and <span style={{ fontFamily: MONO }}>longitude</span> to <span style={{ fontFamily: MONO }}>system_info.json</span> to detect clear-sky days from <span style={{ fontFamily: MONO }}>GHI</span>.
            </div>
          ) : derived?.error === "missing_columns" ? (
            <div style={{ padding: "12px 20px", color: "#64748B", fontFamily: FONT, fontSize: 12 }}>
              This chart needs <span style={{ fontFamily: MONO }}>Time</span> and <span style={{ fontFamily: MONO }}>GHI</span> columns in the Weather CSV.
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

function DataAvailabilityCard({ mergedTimes, stepMinutes, color, dateFrom, dateTo }) {
  const [expanded, setExpanded] = useState(true);
  const safeTimes = Array.isArray(mergedTimes) ? mergedTimes : [];
  const step = Number(stepMinutes);
  const stepMin = Number.isFinite(step) && step > 0 ? step : 10;
  const expectedPerDay = Math.max(1, Math.floor(1440 / stepMin));

  const derived = useMemo(() => {
    const dayCounts = new Map();
    const dayMs = [];
    for (const t of safeTimes) {
      const d = parseDateCellFlexible(t);
      if (!d) continue;
      const key = toYMDLocal(d);
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
      dayMs.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
    }

    const fromDateParsed = parseDateCellFlexible(dateFrom);
    const toDateParsed = parseDateCellFlexible(dateTo);
    const minDayFromFilter = fromDateParsed
      ? new Date(fromDateParsed.getFullYear(), fromDateParsed.getMonth(), fromDateParsed.getDate()).getTime()
      : null;
    const maxDayFromFilter = toDateParsed
      ? new Date(toDateParsed.getFullYear(), toDateParsed.getMonth(), toDateParsed.getDate()).getTime()
      : null;

    let minDay = null;
    let maxDay = null;
    if (minDayFromFilter != null && maxDayFromFilter != null) {
      minDay = Math.min(minDayFromFilter, maxDayFromFilter);
      maxDay = Math.max(minDayFromFilter, maxDayFromFilter);
    } else if (dayMs.length) {
      minDay = Math.min(...dayMs);
      maxDay = Math.max(...dayMs);
    } else {
      return { error: "no_data" };
    }

    const keys = [];
    for (let ms = minDay; ms <= maxDay; ms += 24 * 60 * 60 * 1000) {
      keys.push(toYMDLocal(new Date(ms)));
    }

    const availablePct = keys.map((k) => {
      const c = dayCounts.get(k) ?? 0;
      return clamp((c / expectedPerDay) * 100, 0, 100);
    });
    const missingPct = availablePct.map((v) => clamp(100 - v, 0, 100));

    return { error: null, keys, availablePct, missingPct };
  }, [safeTimes, expectedPerDay, dateFrom, dateTo]);

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
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>Data Availability</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "#94a3b8" }}>
            step {stepMin}min · expected {expectedPerDay}/day
          </span>
        </div>
        {expanded ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} /> : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />}
      </div>

      {expanded && (
        <div style={{ padding: "10px 12px 12px" }}>
          {derived?.error ? (
            <div style={{ padding: "6px 8px", color: "#64748B", fontFamily: FONT, fontSize: 12 }}>
              No synced data points to compute availability.
            </div>
          ) : (
            <Plot
              data={[
                {
                  type: "bar",
                  x: derived.keys,
                  y: derived.availablePct,
                  name: "Available (%)",
                  marker: { color: "#00afb9" },
                  hovertemplate: "<b>%{x}</b><br>Available: %{y:.1f}%<extra></extra>",
                },
                {
                  type: "bar",
                  x: derived.keys,
                  y: derived.missingPct,
                  name: "Missing (%)",
                  marker: { color: "#edafb8" },
                  hovertemplate: "<b>%{x}</b><br>Missing: %{y:.1f}%<extra></extra>",
                },
              ]}
              layout={{
                height: 360,
                barmode: "stack",
                margin: { t: 26, r: 20, b: 70, l: 54 },
                hovermode: "x unified",
                showlegend: true,
                legend: { orientation: "h", x: 0.5, y: 1.08, xanchor: "center", yanchor: "bottom", font: { family: FONT, size: 11 } },
                xaxis: {
                  title: { text: "Day", font: { family: FONT, size: 12, color: "#94a3b8" } },
                  gridcolor: "#F1F5F9",
                  tickfont: { family: MONO, size: 10, color: "#94a3b8" },
                  tickangle: -30,
                },
                yaxis: {
                  title: { text: "Availability (%)", font: { family: FONT, size: 12, color: "#94a3b8" } },
                  gridcolor: "#F1F5F9",
                  tickfont: { family: MONO, size: 10, color: "#94a3b8" },
                  range: [0, 100],
                },
                plot_bgcolor: "#fff",
                paper_bgcolor: "#fff",
                font: { family: FONT },
              }}
              config={{ displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] }}
              style={{ width: "100%" }}
            />
          )}
          {!derived?.error && (
            <div style={{ padding: "8px 8px 0", color: "#64748B", fontFamily: FONT, fontSize: 11 }}>
              Each day expects {expectedPerDay} samples (full day) at {stepMin} min. Available points are counted from the synced (merged) timestamps.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DataQualityCheckSummaryCard({ mergedTimes, mergedCount, stepMinutes, clearDaysCount, totalDays, avgAvailPct, avgMissingPct, color }) {
  const step = Number(stepMinutes);
  const stepMin = Number.isFinite(step) && step > 0 ? step : 10;
  const expectedPerDay = Math.max(1, Math.floor(1440 / stepMin));

  const range = useMemo(() => {
    const safe = Array.isArray(mergedTimes) ? mergedTimes : [];
    const days = safe
      .map((t) => parseDateCellFlexible(t))
      .filter(Boolean)
      .map((d) => toYMDLocal(d));
    if (!days.length) return { minDay: "—", maxDay: "—" };
    days.sort();
    return { minDay: days[0], maxDay: days[days.length - 1] };
  }, [mergedTimes]);

  const tileStyle = {
    flex: "1 1 0",
    minWidth: 140,
    padding: "8px 10px",
    borderRadius: 10,
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
  };

  const labelStyle = {
    fontFamily: FONT,
    fontSize: 10,
    fontWeight: 600,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
  };

  const valueStyle = { fontFamily: MONO, fontSize: 14, color: "#0F172A", marginTop: 4, textAlign: "center" };

  return (
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
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 999, background: `${color}10`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SummarizeOutlined sx={{ fontSize: 18, color }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 800, color: "#0F172A" }}>Data Quality Check summary</span>
            <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>
              Synced dataset · coverage, clear-sky days, and availability.
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
        <div style={tileStyle}>
          <div style={labelStyle}>Data range</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: "#0F172A", marginTop: 4, textAlign: "center" }}>
            {range.minDay} <span style={{ color: "#94A3B8" }}>→</span> {range.maxDay}
          </div>
        </div>

        <div style={tileStyle}>
          <div style={labelStyle}>Matched points</div>
          <div style={valueStyle}>{Number.isFinite(mergedCount) ? mergedCount.toLocaleString() : "—"}</div>
        </div>

        <div style={tileStyle}>
          <div style={labelStyle}>Clear-sky days</div>
          <div style={valueStyle}>
            {Number.isFinite(clearDaysCount) && Number.isFinite(totalDays) ? `${clearDaysCount}/${totalDays}` : "—"}
          </div>
        </div>

        <div style={tileStyle}>
          <div style={labelStyle}>Mean available</div>
          <div style={{ ...valueStyle, color: "#0F172A" }}>
            {avgAvailPct != null ? `${avgAvailPct.toFixed(1)} %` : "—"}
          </div>
        </div>

        <div style={tileStyle}>
          <div style={labelStyle}>Mean missing</div>
          <div style={{ ...valueStyle, color: "#0F172A" }}>
            {avgMissingPct != null ? `${avgMissingPct.toFixed(1)} %` : "—"}
          </div>
        </div>

        <div style={tileStyle}>
          <div style={labelStyle}>Expected/day</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#0F172A", marginTop: 6, textAlign: "center" }}>
            {expectedPerDay} <span style={{ fontSize: 10, color: "#94A3B8" }}>@ {stepMin} min</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DataSynchronizationCard({
  pvData,
  weatherData,
  pvFilteredRows,
  weatherFilteredRows,
  resamplingStepMinutes,
  syncRules,
  setSyncRules,
  autoSyncRunning,
  setAutoSyncRunning,
  autoSyncResult,
  setAutoSyncResult,
  merged,
}) {
  if (!pvData || !weatherData) return null;

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
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            background: `${P}12`,
            border: `1px solid ${P}35`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SyncAltOutlined sx={{ fontSize: 18, color: P }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
            Data Synchronization
          </span>
          <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>
            Power vs POA, correlation, time-shift rules, and synced dataset export.
          </span>
        </div>
      </div>

      <SyncChart
        pvHeaders={pvData.headers}
        pvRows={pvFilteredRows}
        weatherHeaders={weatherData.headers}
        weatherRows={weatherFilteredRows}
      />

      <CorrelationChart
        pvHeaders={pvData.headers}
        pvRows={pvFilteredRows}
        weatherHeaders={weatherData.headers}
        weatherRows={weatherFilteredRows}
      />

      {/* Time sync rules (unchanged UI) */}
      <div
        style={{
          marginTop: 6,
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid #E2E8F0",
          background: "#FFFFFF",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          boxShadow: "0 0 0 1px rgba(148, 163, 184, 0.18), 0 8px 18px rgba(15, 23, 42, 0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                background: "#EEF2FF",
                border: "1px solid #C7D2FE",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 0 1px rgba(129, 140, 248, 0.25)",
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 13, color: "#4F46E5" }}>Δt</span>
            </div>
            <div>
              <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#1F2937" }}>Time sync rules</div>
              <div style={{ fontFamily: FONT, fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                Align weather timestamps to PV using editable rules
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={() => {
                const last = syncRules[syncRules.length - 1];
                const nextId = (last?.id ?? 0) + 1;
                setSyncRules([
                  ...syncRules,
                  {
                    id: nextId,
                    start: last?.start ?? "2025-01-01 00:00",
                    end: last?.end ?? "2025-12-31 23:59",
                    shiftMinutes: last?.shiftMinutes ?? 0,
                  },
                ]);
              }}
              style={{
                borderRadius: 999,
                border: "1px solid #CBD5F5",
                background: "linear-gradient(135deg, #EEF2FF 0%, #E0F2FE 100%)",
                padding: "3px 12px",
                fontFamily: FONT,
                fontSize: 11,
                fontWeight: 600,
                color: "#1D4ED8",
                cursor: "pointer",
                boxShadow: "0 0 0 1px rgba(191, 219, 254, 0.8), 0 3px 8px rgba(15, 23, 42, 0.12)",
                whiteSpace: "nowrap",
              }}
            >
              + Add rule
            </button>
            <button
              type="button"
              disabled={autoSyncRunning || !pvFilteredRows.length || !weatherFilteredRows.length || !pvData || !weatherData}
              onClick={() => {
                const pvH = Array.isArray(pvData?.headers) ? pvData.headers : [];
                const whH = Array.isArray(weatherData?.headers) ? weatherData.headers : [];
                const pdcIdx = findColIndex(pvH, "P_DC", "P DC", "PDC", "P", "Power");
                const irrIdx = findColIndex(whH, "POA", "Poa", "poa", "GTI", "GHI", "Ghi");
                if (pdcIdx < 0 || irrIdx < 0) {
                  setAutoSyncResult({ error: "Required columns (Power / POA) not found" });
                  return;
                }
                const pvTimes = pvFilteredRows.map((r) => (Array.isArray(r) ? r[0] : ""));
                const pvVals = pvFilteredRows.map((r) => (Array.isArray(r) ? r[pdcIdx] : NaN));
                const whTimes = weatherFilteredRows.map((r) => (Array.isArray(r) ? r[0] : ""));
                const whVals = weatherFilteredRows.map((r) => (Array.isArray(r) ? r[irrIdx] : NaN));
                setAutoSyncRunning(true);
                setAutoSyncResult(null);
                setTimeout(() => {
                  const result = detectTimeOffset(pvTimes, pvVals, whTimes, whVals, resamplingStepMinutes);
                  setAutoSyncResult(result ?? { error: "Could not detect offset — insufficient data overlap" });
                  setAutoSyncRunning(false);
                }, 0);
              }}
              style={{
                borderRadius: 999,
                border: "1px solid #BBF7D0",
                background: "linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)",
                padding: "3px 12px",
                fontFamily: FONT,
                fontSize: 11,
                fontWeight: 600,
                color: "#15803D",
                cursor: (autoSyncRunning || !pvFilteredRows.length || !weatherFilteredRows.length) ? "not-allowed" : "pointer",
                opacity: (autoSyncRunning || !pvFilteredRows.length || !weatherFilteredRows.length) ? 0.5 : 1,
                boxShadow: "0 0 0 1px rgba(134,239,172,0.8), 0 3px 8px rgba(15,23,42,0.12)",
                whiteSpace: "nowrap",
              }}
            >
              {autoSyncRunning ? "Detecting..." : "Auto-detect sync"}
            </button>
          </div>
        </div>

        {/* Auto-detect result banner */}
        {autoSyncResult && !autoSyncResult.error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid #BBF7D0",
              background: "#F0FDF4",
              fontFamily: FONT,
              fontSize: 12,
              color: "#15803D",
              marginBottom: 4,
            }}
          >
            <span style={{ fontWeight: 700 }}>
              {autoSyncResult.bestLag === 0
                ? "Offset: 0 min — data appears already synchronized"
                : `Detected offset: ${autoSyncResult.bestLag > 0 ? "+" : ""}${autoSyncResult.bestLag} min`}
            </span>
            <span style={{ color: "#64748B", fontSize: 11 }}>
              R² {autoSyncResult.baselineR2.toFixed(3)} → {autoSyncResult.bestR2.toFixed(3)}
            </span>
            <span style={{ color: "#94A3B8", fontSize: 10 }}>({autoSyncResult.matchedCount} pts)</span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => {
                const firstTime = pvFilteredRows.length ? String(pvFilteredRows[0]?.[0] ?? "") : "";
                const lastTime = pvFilteredRows.length ? String(pvFilteredRows[pvFilteredRows.length - 1]?.[0] ?? "") : "";
                setSyncRules([{ id: 1, start: firstTime, end: lastTime, shiftMinutes: autoSyncResult.bestLag }]);
                setAutoSyncResult(null);
              }}
              style={{
                borderRadius: 999,
                border: "1px solid #15803D",
                background: "#15803D",
                padding: "2px 14px",
                fontFamily: FONT,
                fontSize: 11,
                fontWeight: 600,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setAutoSyncResult(null)}
              style={{
                borderRadius: 999,
                border: "1px solid #E2E8F0",
                background: "#fff",
                padding: "2px 10px",
                fontFamily: FONT,
                fontSize: 11,
                fontWeight: 600,
                color: "#64748B",
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </div>
        )}
        {autoSyncResult?.error && (
          <div
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid #FED7AA",
              background: "#FFFBEB",
              fontFamily: FONT,
              fontSize: 12,
              color: "#92400E",
              marginBottom: 4,
            }}
          >
            {autoSyncResult.error}
            <button
              type="button"
              onClick={() => setAutoSyncResult(null)}
              style={{
                marginLeft: 12,
                borderRadius: 999,
                border: "1px solid #E2E8F0",
                background: "#fff",
                padding: "2px 10px",
                fontFamily: FONT,
                fontSize: 11,
                color: "#64748B",
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
          {syncRules.map((rule, idx) => (
            <div
              key={rule.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.6fr) 80px 26px",
                gap: 6,
                alignItems: "center",
              }}
            >
              <SyncRuleRangeEditor
                rule={rule}
                onChange={(updated) => {
                  const next = [...syncRules];
                  next[idx] = updated;
                  setSyncRules(next);
                }}
              />
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  value={rule.shiftMinutes}
                  onChange={(e) => {
                    const next = [...syncRules];
                    const minutes = Number(e.target.value);
                    next[idx] = { ...next[idx], shiftMinutes: Number.isNaN(minutes) ? 0 : minutes };
                    setSyncRules(next);
                  }}
                  placeholder="+/- minutes"
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    padding: "6px 28px 6px 8px",
                    borderRadius: 8,
                    border: "1px solid #CBD5F5",
                    background: "#F9FAFB",
                    color: "#0F172A",
                    outline: "none",
                    width: "100%",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontFamily: MONO,
                    fontSize: 10,
                    color: "#94a3b8",
                    pointerEvents: "none",
                  }}
                >
                  min
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (syncRules.length === 1) return;
                  setSyncRules(syncRules.filter((r) => r.id !== rule.id));
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: syncRules.length === 1 ? "not-allowed" : "pointer",
                  color: syncRules.length === 1 ? "#CBD5E1" : "#94a3b8",
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

      {/* Synced charts + summary */}
      {(() => {
        try {
          const mergedSafe = Array.isArray(merged) ? merged : [];
          if (mergedSafe.length === 0) return null;

          const pvH = Array.isArray(pvData.headers) ? pvData.headers : [];
          const whH = Array.isArray(weatherData.headers) ? weatherData.headers : [];
          const timeColPvIdx = pvH.length > 0 ? 0 : -1;
          const timeColWhIdx = whH.length > 0 ? 0 : -1;
          const pdcIdx = findColIndex(pvH, "P_DC", "P DC", "PDC", "P", "Power");
          const irrIdx = findColIndex(whH, "POA", "Poa", "poa", "GTI", "GHI", "Ghi");
          if (timeColPvIdx < 0 || timeColWhIdx < 0 || pdcIdx < 0 || irrIdx < 0) return null;

          const xs = mergedSafe.map((d) => d.poa);
          const ys = mergedSafe.map((d) => d.pdc);
          const stats = xs.length >= 2 ? linearRegression(xs, ys) : { r2: 0 };
          const r2Display = Number.isFinite(stats.r2) ? stats.r2.toFixed(3) : "0.000";

          // Correlation before syncing (raw alignment by exact timestamp)
          const rawTimeToIrr = new Map();
          weatherFilteredRows.forEach((row) => {
            if (!Array.isArray(row)) return;
            const t = String(row[timeColWhIdx] ?? "").trim();
            const gRaw = row[irrIdx];
            const gVal = parseFloat(gRaw);
            if (!t || Number.isNaN(gVal) || !Number.isFinite(gVal)) return;
            rawTimeToIrr.set(t, gVal);
          });
          const baseXs = [];
          const baseYs = [];
          pvFilteredRows.forEach((row) => {
            if (!Array.isArray(row)) return;
            const t = String(row[timeColPvIdx] ?? "").trim();
            const pRaw = row[pdcIdx];
            const pVal = parseFloat(pRaw);
            if (!t || Number.isNaN(pVal) || !Number.isFinite(pVal)) return;
            const gVal = rawTimeToIrr.get(t);
            if (gVal == null) return;
            baseXs.push(gVal);
            baseYs.push(pVal);
          });
          const baseStats = baseXs.length >= 2 ? linearRegression(baseXs, baseYs) : { r2: 0 };
          const r2Before = Number.isFinite(baseStats.r2) ? baseStats.r2.toFixed(3) : "0.000";

          const times = mergedSafe.map((d) => d.time);
          const windowLabel = times.length ? `${times[0]} → ${times[times.length - 1]}` : "n/a";

          // Auto-fill the first sync rule with the merged data window if empty
          if (times.length && syncRules.length === 1) {
            const onlyRule = syncRules[0];
            if (!onlyRule.start && !onlyRule.end) {
              const next = [...syncRules];
              next[0] = { ...onlyRule, start: times[0], end: times[times.length - 1] };
              setSyncRules(next);
            }
          }

          return (
            <>
              <SyncedLineChart merged={mergedSafe} />
              <SyncedCorrelationChart merged={mergedSafe} />
              {/* Synced Data Summary + download (existing UI) */}
              <div
                style={{
                  marginTop: 12,
                  background: "#ffffff",
                  borderRadius: 16,
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
                  padding: "14px 18px 16px",
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "stretch",
                  gap: 16,
                }}
              >
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 9,
                        background: `${P}10`,
                        border: `1px solid ${P}26`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <SyncAltOutlined sx={{ fontSize: 16, color: P }} />
                    </div>
                    <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                      Synced Data Summary
                    </span>
                    <span style={{ fontFamily: FONT, fontSize: 11, color: "#64748B" }}>
                      {mergedSafe.length} matched points
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "stretch", gap: 16 }}>
                    <div
                      style={{
                        background: "#fff",
                        borderRadius: 12,
                        border: "1px solid #E2E8F0",
                        overflow: "hidden",
                        flex: "0 0 auto",
                        width: 260,
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", borderBottom: "1px solid #E2E8F0" }}>
                        <div style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
                          <span>Correlation R² before</span>
                        </div>
                        <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                          <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#7f1d1d", background: "#F0BFC2", padding: "4px 12px", borderRadius: 999 }}>
                            {(Number(r2Before) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto" }}>
                        <div style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
                          <span>Correlation R² after</span>
                        </div>
                        <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                          <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: "#166534", background: "#E0FDC7", padding: "4px 12px", borderRadius: 999 }}>
                            {(Number(r2Display) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#0F172A", display: "block", marginBottom: 6 }}>
                        Data windows shifted
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
                        <div style={{ whiteSpace: "nowrap" }}>Data window: {windowLabel}</div>
                        {syncRules.length === 0 ? (
                          <div>No sync rules applied.</div>
                        ) : (
                          syncRules.map((r) => (
                            <div key={r.id} style={{ whiteSpace: "nowrap" }}>
                              {r.start || "…"} → {r.end || "…"} · shift {r.shiftMinutes || 0} min
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => {
                      const pvHeader = pvH;
                      const whNonTime = whH.map((name, idx) => ({ name, idx })).filter(({ idx }) => idx !== timeColWhIdx);
                      const header = pvHeader.concat(whNonTime.map(({ name }) => `weather_${name}`));
                      const lines = [header.join(",")].concat(
                          mergedSafe.map((row) => {
                          const pvVals = pvHeader.map((_, idx) => (Array.isArray(row.pvRow) ? (row.pvRow[idx] ?? "") : ""));
                          const whVals = whNonTime.map(({ idx }) => (Array.isArray(row.whRow) ? (row.whRow[idx] ?? "") : ""));
                          return pvVals.concat(whVals).join(",");
                        }),
                      );
                      const csv = lines.join("\n");
                      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "PV & Weather Synced Data PVCopilot.csv";
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
                    <FileDownloadOutlinedIcon style={{ fontSize: 14 }} />
                    Download Synced Data
                  </button>
                </div>
              </div>
            </>
          );
        } catch {
          return null;
        }
      })()}
    </div>
  );
}

// ── Calendar (popover, show on icon click; style: quick select + two months + blue range) ─
const CALENDAR_PURPLE = "#8b5cf6";
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

function SingleMonthGrid({ year, month, fromYmdStr, toYmdStr, onDayClick }) {
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

function DateRangePickerPopover({ dateFrom, dateTo, onDateFromChange, onDateToChange, onClear, onApply, onCancel, accentColor = CALENDAR_PURPLE, compact = false, showHourHint = false }) {
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

  const rangeLabel = (pendingFrom && pendingTo) ? `${pendingFrom} ~ ${pendingTo}` : "YYYY-MM-DD ~ YYYY-MM-DD";

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

  const [rangeInput, setRangeInput] = useState(rangeLabel);
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
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) {
        onCancel();
      }
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
      minWidth: compact ? 420 : 480,
    }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="text"
          value={rangeInput}
          onChange={(e) => setRangeInput(e.target.value)}
          onBlur={applyRangeInput}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyRangeInput();
            }
          }}
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
        {!compact && (
          <div style={{ width: 120, padding: "12px 8px", borderRight: "1px solid #e5e7eb" }}>
            {QUICK_SELECTS.map(({ label, getRange }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  const [from, to] = getRange();
                  setPendingFrom(from);
                  setPendingTo(to);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px 10px",
                  marginBottom: 2,
                  textAlign: "left",
                  border: "none",
                  background: "none",
                  fontFamily: FONT,
                  fontSize: 12,
                  color: accentColor,
                  cursor: "pointer",
                  borderRadius: 6,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div style={{ flex: 1, display: "flex", gap: compact ? 12 : 20, padding: compact ? 12 : 16, justifyContent: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
              <button type="button" onClick={() => { if (leftMonth === 0) { setLeftMonth(11); setLeftYear((y) => y - 1); } else setLeftMonth((m) => m - 1); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><ChevronLeft sx={{ fontSize: 20, color: "#6b7280" }} /></button>
              <select
                value={leftYear}
                onChange={(e) => setLeftYear(Number(e.target.value))}
                style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#374151", padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer" }}
              >
                {Array.from({ length: 31 }, (_, i) => 2000 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button type="button" onClick={() => { if (leftMonth === 11) { setLeftMonth(0); setLeftYear((y) => y + 1); } else setLeftMonth((m) => m + 1); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><ChevronRight sx={{ fontSize: 20, color: "#6b7280" }} /></button>
            </div>
            <SingleMonthGrid year={leftYear} month={leftMonth} fromYmdStr={pendingFrom} toYmdStr={pendingTo} onDayClick={handleDayClick} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
              <button type="button" onClick={() => { if (leftMonth === 0) { setLeftMonth(11); setLeftYear((y) => y - 1); } else setLeftMonth((m) => m - 1); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><ChevronLeft sx={{ fontSize: 20, color: "#6b7280" }} /></button>
              <select
                value={rightYear}
                onChange={(e) => { const y = Number(e.target.value); setLeftYear(rightMonth === 0 ? y - 1 : y); if (rightMonth === 0) setLeftMonth(11); }}
                style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#374151", padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer" }}
              >
                {Array.from({ length: 31 }, (_, i) => 2000 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button type="button" onClick={() => { if (leftMonth === 11) { setLeftMonth(0); setLeftYear((y) => y + 1); } else setLeftMonth((m) => m + 1); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><ChevronRight sx={{ fontSize: 20, color: "#6b7280" }} /></button>
            </div>
            <SingleMonthGrid year={rightYear} month={rightMonth} fromYmdStr={pendingFrom} toYmdStr={pendingTo} onDayClick={handleDayClick} />
          </div>
        </div>
      </div>
      {showHourHint && (
        <div style={{ padding: "6px 16px 0", fontFamily: MONO, fontSize: 10, color: "#94a3b8" }}>
          Hours are controlled via the shift (minutes) field. This calendar selects full days only.
        </div>
      )}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onCancel} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}>Cancel</button>
        <button type="button" onClick={() => { onDateFromChange(pendingFrom); onDateToChange(pendingTo); onApply(); }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: accentColor, fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}>Apply</button>
      </div>
    </div>
  );
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

// ── Date filter bar: calendar only when icon clicked; editable text range ──────
function DateFilterBar({ dateFrom, dateTo, onDateFromChange, onDateToChange, onClear, totalRows, filteredRows, accentColor = CALENDAR_PURPLE, resamplingStepMinutes = 10, onResamplingStepChange }) {
  const hasFilter = dateFrom || dateTo;
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [rangeText, setRangeText] = useState(() => (dateFrom && dateTo) ? `${dateFrom} → ${dateTo}` : "");
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const [stepPopoverOpen, setStepPopoverOpen] = useState(false);
  const [stepDraftValue, setStepDraftValue] = useState(String(resamplingStepMinutes));
  const [resamplingInProgress, setResamplingInProgress] = useState(false);
  const stepPopoverRef = useRef(null);
  const stepTriggerRef = useRef(null);

  useEffect(() => {
    setRangeText((dateFrom && dateTo) ? `${dateFrom} → ${dateTo}` : "");
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (stepPopoverOpen) setStepDraftValue(String(resamplingStepMinutes));
  }, [stepPopoverOpen, resamplingStepMinutes]);

  useEffect(() => {
    if (!calendarOpen) return;
    const handleClick = (e) => {
      if (triggerRef.current && triggerRef.current.contains(e.target)) return;
      if (popoverRef.current && popoverRef.current.contains(e.target)) return;
      setCalendarOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [calendarOpen]);

  useEffect(() => {
    if (!stepPopoverOpen) return;
    const handleClick = (e) => {
      if (stepTriggerRef.current && stepTriggerRef.current.contains(e.target)) return;
      if (stepPopoverRef.current && stepPopoverRef.current.contains(e.target)) return;
      if (resamplingInProgress) return;
      setStepPopoverOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
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

  const handleResetStep = () => {
    setStepDraftValue(String(resamplingStepMinutes));
    setStepPopoverOpen(false);
  };

  const applyRangeText = () => {
    const parsed = parseRangeTextBar(rangeText);
    if (parsed) {
      onDateFromChange(parsed[0]);
      onDateToChange(parsed[1]);
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 12,
      padding: "16px 20px",
      background: "#F8FAFC",
      borderRadius: 14,
      border: "1px solid #E2E8F0",
      position: "relative",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div ref={triggerRef} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setCalendarOpen((o) => !o)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setCalendarOpen((o) => !o); }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: `${accentColor}14`, border: `1px solid ${accentColor}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
            onKeyDown={(e) => { if (e.key === "Enter") applyRangeText(); }}
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
              <button type="button" onClick={onClear} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", fontFamily: FONT, fontSize: 12, fontWeight: 600, color: "#64748B", cursor: "pointer" }}>Clear</button>
              <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: MONO }}>Showing {filteredRows} of {totalRows} rows</span>
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
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setStepPopoverOpen(true); }}
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
                      onKeyDown={(e) => { if (e.key === "Enter") handleValidateStep(); }}
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
                        onClick={handleResetStep}
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
        <div
          ref={popoverRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 8,
            zIndex: 1000,
          }}
        >
          <DateRangePickerPopover
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

const thStyle = {
  padding: "10px 14px", textAlign: "left", fontWeight: 700,
  color: "#64748B", background: "#F8FAFC", borderBottom: "2px solid #E2E8F0",
  whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 2,
};
const tdStyle = {
  padding: "8px 14px", borderBottom: "1px solid #F1F5F9",
  color: "#0F172A", whiteSpace: "nowrap",
};

// ── System Info display (same as DataFilteringPage) ──
function QualityNestedObject({ obj }) {
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
              <QualityNestedObject obj={v} />
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

function QualitySystemInfo({ data }) {
  const [expanded, setExpanded] = useState(true);

  const renderValue = (val) => {
    if (val === null || val === undefined) return <span style={{ color: "#94a3b8" }}>null</span>;
    if (typeof val === "boolean") return <span style={{ color: P, fontWeight: 600 }}>{val.toString()}</span>;
    if (typeof val === "number") return <span style={{ color: B, fontFamily: MONO }}>{val}</span>;
    if (typeof val === "string") return <span style={{ color: "#0F172A" }}>{val}</span>;
    if (Array.isArray(val)) return <span style={{ color: "#64748B", fontFamily: MONO }}>[{val.join(", ")}]</span>;
    if (typeof val === "object") return <QualityNestedObject obj={val} />;
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
            <SystemInfoHelpIcon linkColor={P} />
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

// ── Default time-sync rules (will be auto-filled from merged data window) ────
const DEFAULT_SYNC_RULES = [
  { id: 1, start: "", end: "", shiftMinutes: 0 },
];

// ── Cache keys for saved uploads (persist until user clears) ──────────────────
const CACHE_PV = "pvcopilot_quality_pv";
const CACHE_WEATHER = "pvcopilot_quality_weather";
const CACHE_SYS = "pvcopilot_quality_sys";
/** Cache version: bump to invalidate old PV/weather cache when resample interval changes (e.g. 1h → 10min). */
const CACHE_RESAMPLE_VERSION = "10min";

function loadCached(key, options = {}) {
  try {
    const raw = localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : null;
    if (!data) return null;
    // PV and weather caches must have been saved with current resample interval
    if (options.requireResampleVersion && data?.data?.resampled && data?.resampleVersion !== CACHE_RESAMPLE_VERSION) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveCache(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else {
      const payload = { ...value, resampleVersion: CACHE_RESAMPLE_VERSION };
      localStorage.setItem(key, JSON.stringify(payload));
    }
  } catch (e) {
    if (e.name === "QuotaExceededError") {
      try { localStorage.removeItem(key); } catch (_) {}
    }
  }
}

/** Required PV CSV columns (case-insensitive). */
const PV_REQUIRED_HEADERS = ["time", "current", "voltage", "power", "module_temp"];
function isValidPvHeaders(headers) {
  if (!Array.isArray(headers) || headers.length === 0) return false;
  const lower = headers.map((h) => String(h ?? "").trim().toLowerCase().replace(/-/g, "_"));
  return PV_REQUIRED_HEADERS.every((r) => lower.includes(r));
}

/** Required Weather CSV columns (case-insensitive). */
const WEATHER_REQUIRED_HEADERS = ["time", "poa", "ghi", "dni", "dhi", "air_temp", "rh", "pressure", "wind_speed", "rain"];
function isValidWeatherHeaders(headers) {
  if (!Array.isArray(headers) || headers.length === 0) return false;
  const lower = headers.map((h) => String(h ?? "").trim().toLowerCase().replace(/-/g, "_"));
  return WEATHER_REQUIRED_HEADERS.every((r) => lower.includes(r));
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function QualityCheckPage() {
  const [pvFile, setPvFile] = useState(null);
  const [pvRawData, setPvRawData] = useState(null);
  const [pvLoadError, setPvLoadError] = useState(null);
  const [weatherFile, setWeatherFile] = useState(null);
  const [weatherRawData, setWeatherRawData] = useState(null);
  const [weatherLoadError, setWeatherLoadError] = useState(null);
  const [sysFile, setSysFile] = useState(null);
  const [sysData, setSysData] = useState(null);
  const [toast, setToast] = useState(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [resamplingStepMinutes, setResamplingStepMinutes] = useState(10);
  const [syncRules, setSyncRules] = useState(DEFAULT_SYNC_RULES);
  const [autoSyncResult, setAutoSyncResult] = useState(null);
  const [autoSyncRunning, setAutoSyncRunning] = useState(false);
  const [mapperFile, setMapperFile] = useState(null);
  const [weatherMapperFile, setWeatherMapperFile] = useState(null);

  const pvRangeRawRows = useMemo(
    () => (pvRawData ? filterRowsByDateRange(pvRawData.headers, pvRawData.rows, dateFrom, dateTo) : []),
    [pvRawData, dateFrom, dateTo]
  );
  const weatherRangeRawRows = useMemo(
    () => (weatherRawData ? filterRowsByDateRange(weatherRawData.headers, weatherRawData.rows, dateFrom, dateTo) : []),
    [weatherRawData, dateFrom, dateTo]
  );

  const pvData = useMemo(() => {
    if (!pvRawData?.headers?.length || !pvRawData?.rows?.length) return null;
    const r = resampleRowsToStep(pvRawData.headers, pvRangeRawRows, resamplingStepMinutes);
    return {
      headers: r.headers,
      rows: r.rows,
      originalRows: pvRangeRawRows.length,
      resampledRows: r.rows.length,
      resampled: r.resampled,
      resampledStepMinutes: resamplingStepMinutes,
    };
  }, [pvRawData, pvRangeRawRows, resamplingStepMinutes]);

  const weatherData = useMemo(() => {
    if (!weatherRawData?.headers?.length || !weatherRawData?.rows?.length) return null;
    const r = resampleRowsToStep(weatherRawData.headers, weatherRangeRawRows, resamplingStepMinutes);
    return {
      headers: r.headers,
      rows: r.rows,
      originalRows: weatherRangeRawRows.length,
      resampledRows: r.rows.length,
      resampled: r.resampled,
      resampledStepMinutes: resamplingStepMinutes,
    };
  }, [weatherRawData, weatherRangeRawRows, resamplingStepMinutes]);

  // Default date range: start = min of PV and weather start; end = max of PV and weather end
  const defaultDateRange = useMemo(() => {
    const pvRange = pvRawData ? getDateRangeFromRows(pvRawData.headers, pvRawData.rows) : null;
    const weatherRange = weatherRawData ? getDateRangeFromRows(weatherRawData.headers, weatherRawData.rows) : null;
    if (!pvRange && !weatherRange) return null;
    let minMs = Infinity, maxMs = -Infinity;
    if (pvRange) {
      if (pvRange.minMs < minMs) minMs = pvRange.minMs;
      if (pvRange.maxMs > maxMs) maxMs = pvRange.maxMs;
    }
    if (weatherRange) {
      if (weatherRange.minMs < minMs) minMs = weatherRange.minMs;
      if (weatherRange.maxMs > maxMs) maxMs = weatherRange.maxMs;
    }
    if (minMs === Infinity || maxMs === -Infinity) return null;
    return { dateFrom: formatDateOnly(minMs), dateTo: formatDateOnly(maxMs) };
  }, [pvRawData, weatherRawData]);

  useEffect(() => {
    if (defaultDateRange) {
      setDateFrom(defaultDateRange.dateFrom);
      setDateTo(defaultDateRange.dateTo);
    }
  }, [defaultDateRange]);

  useEffect(() => {
    const pv = loadCached(CACHE_PV, { requireResampleVersion: true });
    if (pv?.fileName && pv?.data) {
      const d = pv.data;
      setPvFile(pv.fileName);
      setPvRawData({ headers: d.headers, rows: d.rows });
    } else {
      try {
        const raw = localStorage.getItem(CACHE_PV);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.data?.resampled && parsed?.resampleVersion !== CACHE_RESAMPLE_VERSION) {
            localStorage.removeItem(CACHE_PV);
          }
        }
      } catch (_) {}
    }
    const weather = loadCached(CACHE_WEATHER, { requireResampleVersion: true });
    if (weather?.fileName && weather?.data) {
      const d = weather.data;
      setWeatherFile(weather.fileName);
      setWeatherRawData({ headers: d.headers, rows: d.rows });
    } else {
      try {
        const raw = localStorage.getItem(CACHE_WEATHER);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.data?.resampled && parsed?.resampleVersion !== CACHE_RESAMPLE_VERSION) {
            localStorage.removeItem(CACHE_WEATHER);
          }
        }
      } catch (_) {}
    }
    const sys = loadCached(CACHE_SYS);
    if (sys?.fileName && sys?.data) {
      setSysFile(sys.fileName);
      setSysData(sys.data);
    }
  }, []);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type, key: Date.now() });
  }, []);

  const pvFilteredRows = useMemo(
    () => (pvData?.rows ?? []),
    [pvData]
  );
  const weatherFilteredRows = useMemo(
    () => (weatherData?.rows ?? []),
    [weatherData]
  );

  const mergedSynced = useMemo(() => {
    try {
      if (!pvData || !weatherData) return [];
      const pvH = Array.isArray(pvData.headers) ? pvData.headers : [];
      const whH = Array.isArray(weatherData.headers) ? weatherData.headers : [];
      const timeColPvIdx = pvH.length > 0 ? 0 : -1;
      const timeColWhIdx = whH.length > 0 ? 0 : -1;
      const pdcIdx = findColIndex(pvH, "P_DC", "P DC", "PDC", "P", "Power");
      const irrIdx = findColIndex(whH, "POA", "Poa", "poa", "GTI", "GHI", "Ghi");
      if (timeColPvIdx < 0 || timeColWhIdx < 0 || pdcIdx < 0 || irrIdx < 0) return [];

      const pvTimes = pvFilteredRows.map((r) => (Array.isArray(r) ? r[timeColPvIdx] : ""));
      const whTimesShifted = applySyncRulesToTimes(
        weatherFilteredRows.map((r) => (Array.isArray(r) ? r[timeColWhIdx] : "")),
        syncRules,
      );

      const whMap = new Map();
      whTimesShifted.forEach((t, i) => {
        const row = weatherFilteredRows[i];
        if (!Array.isArray(row) || !t) return;
        whMap.set(t, row);
      });

      const merged = [];
      pvTimes.forEach((t, i) => {
        const pvRow = pvFilteredRows[i];
        if (!Array.isArray(pvRow) || !t) return;
        const pdcVal = parseFloat(pvRow[pdcIdx]);
        if (!Number.isFinite(pdcVal)) return;
        const whRow = whMap.get(t);
        if (!Array.isArray(whRow)) return;
        const irrVal = parseFloat(whRow[irrIdx]);
        if (!Number.isFinite(irrVal)) return;
        merged.push({ time: t, pdc: pdcVal, poa: irrVal, pvRow, whRow });
      });
      return merged;
    } catch {
      return [];
    }
  }, [pvData, weatherData, pvFilteredRows, weatherFilteredRows, syncRules]);

  return (
    <div style={{
      minHeight: "calc(100vh - 56px)", background: "#FFFFFF",
      fontFamily: FONT, padding: "32px 40px 60px",
    }}>
      {/* Toast */}
      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* CSV Column Mapper */}
      <CSVColumnMapper
        open={!!mapperFile}
        file={mapperFile}
        onClose={() => setMapperFile(null)}
        onComplete={(adaptedData, fileName) => {
          setPvLoadError(null);
          setPvFile(fileName);
          setPvRawData(adaptedData);
          saveCache(CACHE_PV, { fileName, data: adaptedData });
          showToast(`Custom PV data loaded — ${adaptedData.rows.length.toLocaleString()} rows mapped to PVCopilot format`);
          setMapperFile(null);
        }}
        templateColumns={PV_TEMPLATE_COLUMNS}
        templateLabels={PV_TEMPLATE_LABELS}
        synonymTable={PV_SYNONYMS}
        expectedTypes={PV_EXPECTED_TYPES}
        requiredColumns={["Time", "Power"]}
        color={O}
      />

      {/* Weather CSV Column Mapper */}
      <CSVColumnMapper
        open={!!weatherMapperFile}
        file={weatherMapperFile}
        onClose={() => setWeatherMapperFile(null)}
        onComplete={(adaptedData, fileName) => {
          setWeatherLoadError(null);
          setWeatherFile(fileName);
          setWeatherRawData(adaptedData);
          saveCache(CACHE_WEATHER, { fileName, data: adaptedData });
          showToast(`Custom weather data loaded — ${adaptedData.rows.length.toLocaleString()} rows mapped to PVCopilot format`);
          setWeatherMapperFile(null);
        }}
        templateColumns={WEATHER_TEMPLATE_COLUMNS}
        templateLabels={WEATHER_TEMPLATE_LABELS}
        synonymTable={WEATHER_SYNONYMS}
        expectedTypes={WEATHER_EXPECTED_TYPES}
        requiredColumns={["Time", "POA", "Air_Temp", "RH", "Wind_speed"]}
        color={B}
      />

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* ──────────── TOOL OVERVIEW (COLLAPSIBLE) ──────────── */}
        <div style={{
          background: "#FFFFFF",
          border: "1px solid #E2E8F0",
          borderRadius: 12,
          padding: "18px 20px",
          boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 0 0 1.5px #E2E8F0",
          marginBottom: 20,
        }}>
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer", gap: 16 }}
            onClick={() => setOverviewOpen(o => !o)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `${P}14`, border: `1.5px solid ${P}30`,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <SearchOutlined sx={{ fontSize: 24, color: P }} />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>
                  Data Ingestion & Synchronization
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                  Upload PV data, weather data, and system configuration to inspect and validate.
                </div>
              </div>
            </div>
            <div style={{ marginLeft: "auto", borderRadius: "999px", background: "#F8FAFC", border: "1px solid #E2E8F0", padding: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {overviewOpen ? (
                <ExpandLessIcon sx={{ fontSize: 18, color: "#94a3b8" }} />
              ) : (
                <ExpandMoreIcon sx={{ fontSize: 18, color: "#94a3b8" }} />
              )}
            </div>
          </div>
          {overviewOpen && (
            <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {/* Data Upload & Parsing */}
              <div style={{ background: "#FFFBEB", borderRadius: 12, padding: 18, border: "1px solid #FDE68A" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>
                  Data Upload & Parsing
                </div>
                <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7, marginBottom: 10 }}>
                  Upload PV production data, weather station data, and system configuration files in CSV format. The tool automatically detects timestamp columns, parses numeric fields, and validates data structure.
                </p>
                <ul style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
                  <li>Auto-detection of date/time columns across common formats.</li>
                  <li>System config CSV for metadata (capacity, location, tilt, azimuth).</li>
                  <li>Configurable resampling step (1–60 min) for temporal alignment.</li>
                </ul>
              </div>

              {/* Time Synchronization */}
              <div style={{ background: "#FFFBEB", borderRadius: 12, padding: 18, border: "1px solid #FDE68A" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>
                  Time Synchronization
                </div>
                <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7, marginBottom: 10 }}>
                  Align PV and weather datasets by matching timestamps with configurable time-shift rules. This corrects for logger clock drift, timezone mismatches, or deliberate offsets between data sources.
                </p>
                <ul style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
                  <li>Custom sync rules with start/end windows and minute-level shifts.</li>
                  <li>Nearest-neighbor timestamp matching within tolerance.</li>
                  <li>Before/after correlation comparison (R²) to validate sync quality.</li>
                </ul>
              </div>

              {/* Visualization & Export */}
              <div style={{ background: "#FFFBEB", borderRadius: 12, padding: 18, border: "1px solid #FDE68A" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>
                  Visualization & Export
                </div>
                <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7, marginBottom: 10 }}>
                  Interactive time-series plots and scatter correlation charts help visually confirm synchronization accuracy. Once validated, export the merged dataset as a single CSV file.
                </p>
                <ul style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
                  <li>Time-series overlay of PV power vs. GHI irradiance.</li>
                  <li>Scatter plot with linear regression and R² metric.</li>
                  <li>One-click CSV export of the synchronized, merged dataset.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Data Visualization card */}
        <div style={{
          background: "#ffffff",
          borderRadius: 16,
          border: "1px solid #E2E8F0",
          boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
          padding: "16px 18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          marginBottom: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
            <div style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              background: `${P}12`,
              border: `1px solid ${P}35`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <ShowChartOutlined sx={{ fontSize: 18, color: P }} />
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

        {/* Upload Section */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16,
          marginTop: 0,
          marginBottom: 32,
        }}>
          <UploadZone
            label="PV Data (CSV)"
            icon={<SolarPowerOutlined sx={{ fontSize: 24, color: O }} />}
            accept=".csv"
            color={O}
            file={pvFile}
            templateFile="data_pv.csv"
            onFileUpload={async (file) => {
              try {
                let data;
                try {
                  data = await processCSVFile(file);
                } catch (err) {
                  const isOffline = err.message.includes("Cannot reach the backend");
                  if (isOffline) {
                    const text = await readFileAsText(file);
                    data = processCSVFileClientSide(text);
                    showToast("Backend offline — data loaded and resampled to 10 min in browser.", "success");
                  } else {
                    throw err;
                  }
                }
                if (data.headers.length === 0 || data.rows.length === 0) {
                  showToast(`"${file.name}" appears empty or has no data rows.`, "error");
                  return;
                }
                if (!isValidPvHeaders(data.headers)) {
                  setMapperFile(file);
                  return;
                }
                setPvLoadError(null);
                const raw = { headers: data.headers, rows: data.rows };
                setPvFile(file.name);
                setPvRawData(raw);
                saveCache(CACHE_PV, { fileName: file.name, data: raw });
                const msg = `PV data loaded — ${data.rows.length} rows, ${data.headers.length} columns (resampled to ${resamplingStepMinutes} min)`;
                showToast(msg);
              } catch (err) {
                showToast(`Failed to process "${file.name}": ${err.message}`, "error");
              }
            }}
            onClear={() => {
              setPvFile(null); setPvRawData(null); setPvLoadError(null);
              saveCache(CACHE_PV, null);
            }}
            onError={(msg) => showToast(msg, "error")}
            onDownloadSuccess={(msg) => showToast(msg, "success")}
          />
          <UploadZone
            label="Weather Data (CSV)"
            icon={<WbSunnyOutlined sx={{ fontSize: 24, color: B }} />}
            accept=".csv"
            color={B}
            file={weatherFile}
            templateFile="data_meteo.csv"
            onFileUpload={async (file) => {
              try {
                let data;
                try {
                  data = await processCSVFile(file);
                } catch (err) {
                  const isOffline = err.message.includes("Cannot reach the backend");
                  if (isOffline) {
                    const text = await readFileAsText(file);
                    data = processCSVFileClientSide(text);
                    showToast("Backend offline — data loaded and resampled to 10 min in browser.", "success");
                  } else {
                    throw err;
                  }
                }
                if (data.headers.length === 0 || data.rows.length === 0) {
                  showToast(`"${file.name}" appears empty or has no data rows.`, "error");
                  return;
                }
                if (!isValidWeatherHeaders(data.headers)) {
                  setWeatherMapperFile(file);
                  return;
                }
                setWeatherLoadError(null);
                const raw = { headers: data.headers, rows: data.rows };
                setWeatherFile(file.name);
                setWeatherRawData(raw);
                saveCache(CACHE_WEATHER, { fileName: file.name, data: raw });
                const msg = `Weather data loaded — ${data.rows.length} rows, ${data.headers.length} columns (resampled to ${resamplingStepMinutes} min)`;
                showToast(msg);
              } catch (err) {
                showToast(`Failed to process "${file.name}": ${err.message}`, "error");
              }
            }}
            onClear={() => {
              setWeatherFile(null); setWeatherRawData(null); setWeatherLoadError(null);
              saveCache(CACHE_WEATHER, null);
            }}
            onError={(msg) => showToast(msg, "error")}
            onDownloadSuccess={(msg) => showToast(msg, "success")}
          />
          <UploadZone
            label="System Info (.json)"
            icon={<SettingsOutlined sx={{ fontSize: 24, color: O }} />}
            accept=".json"
            color={O}
            file={sysFile}
            templateFile="system_info.json"
            onLoad={(name, text) => {
              const parsed = parseJSON(text);
              if (!parsed) {
                showToast(`"${name}" contains invalid JSON. Check the file format.`, "error");
                return;
              }
              if (typeof parsed !== "object" || Array.isArray(parsed)) {
                showToast(`"${name}" must be a JSON object (not an array or primitive).`, "error");
                return;
              }
              setSysFile(name); setSysData(parsed);
              saveCache(CACHE_SYS, { fileName: name, data: parsed });
              showToast(`System info loaded — ${Object.keys(parsed).length} fields`);
            }}
            onClear={() => {
              setSysFile(null); setSysData(null);
              saveCache(CACHE_SYS, null);
            }}
            onError={(msg) => showToast(msg, "error")}
            onDownloadSuccess={(msg) => showToast(msg, "success")}
          />
        </div>

        {/* Data Preview Section */}
        {(!pvData && !weatherData && !sysData) && (
          <div style={{
            textAlign: "center", padding: "60px 20px", color: "#CBD5E1",
          }}>
            <CloudUploadOutlined sx={{ fontSize: 48, color: "#E2E8F0", mb: 1 }} />
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>
              Upload files above to preview data
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {sysData && (
            <QualitySystemInfo data={sysData} />
          )}
          {(pvData || weatherData) && (
            <DateFilterBar
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
              onClear={() => { setDateFrom(null); setDateTo(null); }}
              totalRows={pvRangeRawRows.length + weatherRangeRawRows.length}
              filteredRows={pvFilteredRows.length + weatherFilteredRows.length}
              accentColor={P}
              resamplingStepMinutes={resamplingStepMinutes}
              onResamplingStepChange={setResamplingStepMinutes}
            />
          )}
          {pvLoadError && (
            <div style={{
              background: "#FEF2F2",
              borderRadius: 16,
              border: "1px solid #FECACA",
              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.08)",
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginBottom: 20,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "#FEE2E2",
                  border: "1px solid #FECACA",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 20, color: "#DC2626" }}>!</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>
                    Invalid PV data format
                  </div>
                  <p style={{ fontFamily: FONT, fontSize: 13, color: "#475569", lineHeight: 1.6, margin: 0 }}>
                    Load a CSV file with columns <strong>Time</strong>, <strong>Current</strong>, <strong>Voltage</strong>, <strong>Power</strong>, <strong>Module_Temp</strong>. You can use &quot;Load template&quot; or download the template from the <strong>PV Data (CSV)</strong> card above.
                  </p>
                </div>
              </div>
            </div>
          )}
          {pvData && (
            <div style={{
              background: "#ffffff",
              borderRadius: 16,
              border: "1px solid #E2E8F0",
              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
              padding: "16px 18px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
                <div style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  background: `${O}12`,
                  border: `1px solid ${O}35`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <SolarPowerOutlined sx={{ fontSize: 18, color: O }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
                    PV Data Analysis
                  </span>
                  <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>
                    Explore, filter, and visualize PV performance data.
                  </span>
                </div>
              </div>
              <CSVTable
                title="PV Data"
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
                  formatHeaderWithUnit("Module_Temp"),
                ]}
                columnDisplayNames={{
                  Time: "Time",
                  Current: "Current",
                  Voltage: "Voltage",
                  Power: "Power",
                  Module_Temp: "Module_Temp",
                  time: "Time",
                  current: "Current",
                  voltage: "Voltage",
                  power: "Power",
                  module_temp: "Module_Temp",
                }}
              />
              <CSVChart
                title="PV Data"
                color={O}
                headers={pvData.headers}
                rows={pvFilteredRows}
                defaultYHeader="Power"
              />
            </div>
          )}
          {weatherLoadError && (
            <div style={{
              background: "#FEF2F2",
              borderRadius: 16,
              border: "1px solid #FECACA",
              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.08)",
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginBottom: 20,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "#FEE2E2",
                  border: "1px solid #FECACA",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 20, color: "#DC2626" }}>!</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>
                    Invalid Weather data format
                  </div>
                  <p style={{ fontFamily: FONT, fontSize: 13, color: "#475569", lineHeight: 1.6, margin: 0 }}>
                    Load a CSV file with columns <strong>Time</strong>, <strong>POA</strong>, <strong>GHI</strong>, <strong>DNI</strong>, <strong>DHI</strong>, <strong>Air_Temp</strong>, <strong>RH</strong>, <strong>Pressure</strong>, <strong>Wind_speed</strong>, <strong>Rain</strong>. You can use &quot;Load template&quot; or download the template from the <strong>Weather Data (CSV)</strong> card above.
                  </p>
                </div>
              </div>
            </div>
          )}
          {weatherData && (
            <div style={{
              background: "#ffffff",
              borderRadius: 16,
              border: "1px solid #E2E8F0",
              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
              padding: "16px 18px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
                <div style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  background: `${B}12`,
                  border: `1px solid ${B}35`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <WbSunnyOutlined sx={{ fontSize: 18, color: B }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
                    Weather Data Analysis
                  </span>
                  <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>
                    Correlate irradiance and climate with plant output.
                  </span>
                </div>
              </div>
              <CSVTable
                title="Weather Data"
                icon={<WbSunnyOutlined sx={{ fontSize: 20, color: B }} />}
                color={B}
                headers={weatherData.headers}
                rows={weatherFilteredRows}
                resampled={weatherData.resampled}
                originalRows={weatherData.originalRows}
                resampledStepMinutes={weatherData.resampledStepMinutes}
                defaultVisibleLabels={[
                  formatHeaderWithUnit("Time"),
                  formatHeaderWithUnit("POA"),
                  formatHeaderWithUnit("GHI"),
                  formatHeaderWithUnit("Air_Temp"),
                  formatHeaderWithUnit("RH"),
                ]}
              />
              <CSVChart
                title="Weather Data"
                color={B}
                headers={weatherData.headers}
                rows={weatherFilteredRows}
              />
            </div>
          )}

          {/* Data Synchronization section */}
          {pvData && weatherData && (
            <DataSynchronizationCard
              pvData={pvData}
              weatherData={weatherData}
              pvFilteredRows={pvFilteredRows}
              weatherFilteredRows={weatherFilteredRows}
              resamplingStepMinutes={resamplingStepMinutes}
              syncRules={syncRules}
              setSyncRules={setSyncRules}
              autoSyncRunning={autoSyncRunning}
              setAutoSyncRunning={setAutoSyncRunning}
              autoSyncResult={autoSyncResult}
              setAutoSyncResult={setAutoSyncResult}
              merged={mergedSynced}
            />
          )}

          {/* Dual-axis chart: P_DC (PV) + GHI (Weather) */}
          {pvData && weatherData && (
            <>
              {false && (
                <>
              <SyncChart
                pvHeaders={pvData.headers}
                pvRows={pvFilteredRows}
                weatherHeaders={weatherData.headers}
                weatherRows={weatherFilteredRows}
              />
              <CorrelationChart
                pvHeaders={pvData.headers}
                pvRows={pvFilteredRows}
                weatherHeaders={weatherData.headers}
                weatherRows={weatherFilteredRows}
              />
              {/* Editable sync rules (start, end, shift minutes) */}
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #E2E8F0",
                  background: "#FFFFFF",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  boxShadow:
                    "0 0 0 1px rgba(148, 163, 184, 0.18), 0 8px 18px rgba(15, 23, 42, 0.06)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 999,
                        background: "#EEF2FF",
                        border: "1px solid #C7D2FE",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 0 0 1px rgba(129, 140, 248, 0.25)",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 13,
                          color: "#4F46E5",
                        }}
                      >
                        Δt
                      </span>
                    </div>
                    <div>
                      <div
                        style={{
                          fontFamily: FONT,
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#1F2937",
                        }}
                      >
                        Time sync rules
                      </div>
                      <div
                        style={{
                          fontFamily: FONT,
                          fontSize: 10,
                          color: "#94a3b8",
                          marginTop: 2,
                        }}
                      >
                        Align weather timestamps to PV using editable rules
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const last = syncRules[syncRules.length - 1];
                        const nextId = (last?.id ?? 0) + 1;
                        setSyncRules([
                          ...syncRules,
                          {
                            id: nextId,
                            start: last?.start ?? "2025-01-01 00:00",
                            end: last?.end ?? "2025-12-31 23:59",
                            shiftMinutes: last?.shiftMinutes ?? 0,
                          },
                        ]);
                      }}
                      style={{
                        borderRadius: 999,
                        border: "1px solid #CBD5F5",
                        background:
                          "linear-gradient(135deg, #EEF2FF 0%, #E0F2FE 100%)",
                        padding: "3px 12px",
                        fontFamily: FONT,
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#1D4ED8",
                        cursor: "pointer",
                        boxShadow:
                          "0 0 0 1px rgba(191, 219, 254, 0.8), 0 3px 8px rgba(15, 23, 42, 0.12)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      + Add rule
                    </button>
                    <button
                      type="button"
                      disabled={autoSyncRunning || !pvFilteredRows.length || !weatherFilteredRows.length || !pvData || !weatherData}
                      onClick={() => {
                        const pvH = Array.isArray(pvData?.headers) ? pvData.headers : [];
                        const whH = Array.isArray(weatherData?.headers) ? weatherData.headers : [];
                        const pdcIdx = findColIndex(pvH, "P_DC", "P DC", "PDC", "P", "Power");
                        const irrIdx = findColIndex(whH, "POA", "Poa", "poa", "GTI", "GHI", "Ghi");
                        if (pdcIdx < 0 || irrIdx < 0) {
                          setAutoSyncResult({ error: "Required columns (Power / POA) not found" });
                          return;
                        }
                        const pvTimes = pvFilteredRows.map((r) => (Array.isArray(r) ? r[0] : ""));
                        const pvVals = pvFilteredRows.map((r) => (Array.isArray(r) ? r[pdcIdx] : NaN));
                        const whTimes = weatherFilteredRows.map((r) => (Array.isArray(r) ? r[0] : ""));
                        const whVals = weatherFilteredRows.map((r) => (Array.isArray(r) ? r[irrIdx] : NaN));
                        setAutoSyncRunning(true);
                        setAutoSyncResult(null);
                        setTimeout(() => {
                          const result = detectTimeOffset(pvTimes, pvVals, whTimes, whVals, resamplingStepMinutes);
                          setAutoSyncResult(result ?? { error: "Could not detect offset — insufficient data overlap" });
                          setAutoSyncRunning(false);
                        }, 0);
                      }}
                      style={{
                        borderRadius: 999,
                        border: "1px solid #BBF7D0",
                        background: "linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)",
                        padding: "3px 12px",
                        fontFamily: FONT,
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#15803D",
                        cursor: (autoSyncRunning || !pvFilteredRows.length || !weatherFilteredRows.length) ? "not-allowed" : "pointer",
                        opacity: (autoSyncRunning || !pvFilteredRows.length || !weatherFilteredRows.length) ? 0.5 : 1,
                        boxShadow: "0 0 0 1px rgba(134,239,172,0.8), 0 3px 8px rgba(15,23,42,0.12)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {autoSyncRunning ? "Detecting..." : "Auto-detect sync"}
                    </button>
                  </div>
                </div>
                {/* Auto-detect result banner */}
                {autoSyncResult && !autoSyncResult.error && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "8px 14px",
                    borderRadius: 10, border: "1px solid #BBF7D0", background: "#F0FDF4",
                    fontFamily: FONT, fontSize: 12, color: "#15803D", marginBottom: 4,
                  }}>
                    <span style={{ fontWeight: 700 }}>
                      {autoSyncResult.bestLag === 0
                        ? "Offset: 0 min — data appears already synchronized"
                        : `Detected offset: ${autoSyncResult.bestLag > 0 ? "+" : ""}${autoSyncResult.bestLag} min`}
                    </span>
                    <span style={{ color: "#64748B", fontSize: 11 }}>
                      R² {autoSyncResult.baselineR2.toFixed(3)} → {autoSyncResult.bestR2.toFixed(3)}
                    </span>
                    <span style={{ color: "#94A3B8", fontSize: 10 }}>
                      ({autoSyncResult.matchedCount} pts)
                    </span>
                    <div style={{ flex: 1 }} />
                    <button
                      type="button"
                      onClick={() => {
                        const firstTime = pvFilteredRows.length ? String(pvFilteredRows[0]?.[0] ?? "") : "";
                        const lastTime = pvFilteredRows.length ? String(pvFilteredRows[pvFilteredRows.length - 1]?.[0] ?? "") : "";
                        setSyncRules([{ id: 1, start: firstTime, end: lastTime, shiftMinutes: autoSyncResult.bestLag }]);
                        setAutoSyncResult(null);
                      }}
                      style={{
                        borderRadius: 999, border: "1px solid #15803D", background: "#15803D",
                        padding: "2px 14px", fontFamily: FONT, fontSize: 11, fontWeight: 600,
                        color: "#fff", cursor: "pointer",
                      }}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoSyncResult(null)}
                      style={{
                        borderRadius: 999, border: "1px solid #E2E8F0", background: "#fff",
                        padding: "2px 10px", fontFamily: FONT, fontSize: 11, fontWeight: 600,
                        color: "#64748B", cursor: "pointer",
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                {autoSyncResult?.error && (
                  <div style={{
                    padding: "8px 14px", borderRadius: 10, border: "1px solid #FED7AA",
                    background: "#FFFBEB", fontFamily: FONT, fontSize: 12, color: "#92400E", marginBottom: 4,
                  }}>
                    {autoSyncResult.error}
                    <button
                      type="button"
                      onClick={() => setAutoSyncResult(null)}
                      style={{
                        marginLeft: 12, borderRadius: 999, border: "1px solid #E2E8F0", background: "#fff",
                        padding: "2px 10px", fontFamily: FONT, fontSize: 11, color: "#64748B", cursor: "pointer",
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                  {syncRules.map((rule, idx) => (
                    <div
                      key={rule.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1.6fr) 80px 26px",
                        gap: 6,
                        alignItems: "center",
                      }}
                    >
                      <SyncRuleRangeEditor
                        rule={rule}
                        onChange={(updated) => {
                          const next = [...syncRules];
                          next[idx] = updated;
                          setSyncRules(next);
                        }}
                      />
                      <div style={{ position: "relative" }}>
                        <input
                          type="number"
                          value={rule.shiftMinutes}
                          onChange={(e) => {
                            const next = [...syncRules];
                            const minutes = Number(e.target.value);
                            next[idx] = { ...next[idx], shiftMinutes: Number.isNaN(minutes) ? 0 : minutes };
                            setSyncRules(next);
                          }}
                          placeholder="+/- minutes"
                          style={{
                            fontFamily: MONO,
                            fontSize: 11,
                            padding: "6px 28px 6px 8px",
                            borderRadius: 8,
                            border: "1px solid #CBD5F5",
                            background: "#F9FAFB",
                            color: "#0F172A",
                            outline: "none",
                            width: "100%",
                          }}
                        />
                        <span style={{
                          position: "absolute",
                          right: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          fontFamily: MONO,
                          fontSize: 10,
                          color: "#94a3b8",
                          pointerEvents: "none",
                        }}>
                          min
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (syncRules.length === 1) return;
                          setSyncRules(syncRules.filter((r) => r.id !== rule.id));
                        }}
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: syncRules.length === 1 ? "not-allowed" : "pointer",
                          color: syncRules.length === 1 ? "#CBD5E1" : "#94a3b8",
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
                </>
              )}
              {/* Synced data section: apply rules, merge, and visualize */}
              {(() => {
                try {
                  const pvH = Array.isArray(pvData.headers) ? pvData.headers : [];
                  const whH = Array.isArray(weatherData.headers) ? weatherData.headers : [];
                  const timeColPvIdx = pvH.length > 0 ? 0 : -1;
                  const timeColWhIdx = whH.length > 0 ? 0 : -1;
                  const pdcIdx = findColIndex(pvH, "P_DC", "P DC", "PDC", "P", "Power");
                  const irrIdx = findColIndex(whH, "POA", "Poa", "poa", "GTI", "GHI", "Ghi");
                  if (timeColPvIdx < 0 || timeColWhIdx < 0 || pdcIdx < 0 || irrIdx < 0) return null;

                  const merged = Array.isArray(mergedSynced) ? mergedSynced : [];
                  if (merged.length === 0) return null;

                  const xs = merged.map((d) => d.poa);
                  const ys = merged.map((d) => d.pdc);
                  const stats = xs.length >= 2 ? linearRegression(xs, ys) : { r2: 0 };
                  const r2Display = Number.isFinite(stats.r2) ? stats.r2.toFixed(3) : "0.000";
                  // Correlation before syncing (raw alignment by exact timestamp)
                  const rawTimeToIrr = new Map();
                  weatherFilteredRows.forEach((row) => {
                    if (!Array.isArray(row)) return;
                    const t = String(row[timeColWhIdx] ?? "").trim();
                    const gRaw = row[irrIdx];
                    const gVal = parseFloat(gRaw);
                    if (!t || Number.isNaN(gVal) || !Number.isFinite(gVal)) return;
                    rawTimeToIrr.set(t, gVal);
                  });
                  const baseXs = [];
                  const baseYs = [];
                  pvFilteredRows.forEach((row) => {
                    if (!Array.isArray(row)) return;
                    const t = String(row[timeColPvIdx] ?? "").trim();
                    const pRaw = row[pdcIdx];
                    const pVal = parseFloat(pRaw);
                    if (!t || Number.isNaN(pVal) || !Number.isFinite(pVal)) return;
                    const gVal = rawTimeToIrr.get(t);
                    if (gVal == null) return;
                    baseXs.push(gVal);
                    baseYs.push(pVal);
                  });
                  const baseStats = baseXs.length >= 2 ? linearRegression(baseXs, baseYs) : { r2: 0 };
                  const r2Before = Number.isFinite(baseStats.r2) ? baseStats.r2.toFixed(3) : "0.000";

                  const times = merged.map((d) => d.time);
                  const windowLabel = times.length
                    ? `${times[0]} → ${times[times.length - 1]}`
                    : "n/a";

                  // Auto-fill the first sync rule with the merged data window if empty
                  if (times.length && syncRules.length === 1) {
                    const onlyRule = syncRules[0];
                    if (!onlyRule.start && !onlyRule.end) {
                      const next = [...syncRules];
                      next[0] = {
                        ...onlyRule,
                        start: times[0],
                        end: times[times.length - 1],
                      };
                      setSyncRules(next);
                    }
                  }

                  return (
                    <>
                      {false && (
                        <>
                      <SyncedLineChart merged={merged} />
                      <SyncedCorrelationChart merged={merged} />
                      <div style={{
                        marginTop: 12,
                        background: "#ffffff",
                        borderRadius: 16,
                        border: "1px solid #E2E8F0",
                        boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)",
                        padding: "14px 18px 16px",
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "stretch",
                        gap: 16,
                      }}>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{
                              width: 26,
                              height: 26,
                              borderRadius: 9,
                              background: `${P}10`,
                              border: `1px solid ${P}26`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}>
                              <SyncAltOutlined sx={{ fontSize: 16, color: P }} />
                            </div>
                            <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                              Synced Data Summary
                            </span>
                            <span style={{ fontFamily: FONT, fontSize: 11, color: "#64748B" }}>
                              {merged.length} matched points
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "stretch", gap: 16 }}>
                            <div style={{
                              background: "#fff",
                              borderRadius: 12,
                              border: "1px solid #E2E8F0",
                              overflow: "hidden",
                              flex: "0 0 auto",
                              width: 260,
                            }}>
                              <div style={{
                                display: "grid",
                                gridTemplateColumns: "1fr auto",
                                borderBottom: "1px solid #E2E8F0",
                              }}>
                                <div style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
                                  <span>Correlation R² before</span>
                                </div>
                                <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                                  <span style={{
                                    fontFamily: FONT,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "#7f1d1d",
                                    background: "#F0BFC2",
                                    padding: "4px 12px",
                                    borderRadius: 999,
                                  }}>
                                    {(Number(r2Before) * 100).toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                              <div style={{
                                display: "grid",
                                gridTemplateColumns: "1fr auto",
                              }}>
                                <div style={{ padding: "10px 14px", fontFamily: FONT, fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
                                  <span>Correlation R² after</span>
                                </div>
                                <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                                  <span style={{
                                    fontFamily: FONT,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "#166534",
                                    background: "#E0FDC7",
                                    padding: "4px 12px",
                                    borderRadius: 999,
                                  }}>
                                    {(Number(r2Display) * 100).toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                              <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: "#0F172A", display: "block", marginBottom: 6 }}>
                                Data windows shifted
                              </span>
                              <div style={{
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
                              }}>
                                <div style={{ whiteSpace: "nowrap" }}>Data window: {windowLabel}</div>
                                {syncRules.length === 0 ? (
                                  <div>No sync rules applied.</div>
                                ) : (
                                  syncRules.map((r) => (
                                    <div key={r.id} style={{ whiteSpace: "nowrap" }}>
                                      {r.start || "…"} → {r.end || "…"} · shift {r.shiftMinutes || 0} min
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-end", flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => {
                              const pvHeader = pvH;
                              const whNonTime = whH
                                .map((name, idx) => ({ name, idx }))
                                .filter(({ idx }) => idx !== timeColWhIdx);
                              const header = pvHeader.concat(
                                whNonTime.map(({ name }) => `weather_${name}`),
                              );
                              const lines = [header.join(",")].concat(
                                merged.map((row) => {
                                  const pvVals = pvHeader.map((_, idx) =>
                                    Array.isArray(row.pvRow) ? (row.pvRow[idx] ?? "") : "",
                                  );
                                  const whVals = whNonTime.map(({ idx }) =>
                                    Array.isArray(row.whRow) ? (row.whRow[idx] ?? "") : "",
                                  );
                                  return pvVals.concat(whVals).join(",");
                                }),
                              );
                              const csv = lines.join("\n");
                              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = "PV & Weather Synced Data PVCopilot.csv";
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
                            onMouseEnter={e => e.currentTarget.style.background = "#374151"}
                            onMouseLeave={e => e.currentTarget.style.background = "#1F2937"}
                          >
                            <FileDownloadOutlinedIcon style={{ fontSize: 14 }} />
                            Download Synced Data
                          </button>
                        </div>
                      </div>
                        </>
                      )}
                      <div
                        style={{
                          marginTop: 14,
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
                              background: `${P}12`,
                              border: `1px solid ${P}35`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <ShowChartOutlined sx={{ fontSize: 18, color: P }} />
                          </div>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, color: "#0F172A" }}>Data Quality Check</span>
                            <span style={{ fontFamily: FONT, fontSize: 11, color: "#94a3b8" }}>
                              Quick correlation + clear-sky checks on the synced dataset.
                            </span>
                          </div>
                        </div>

                        {(() => {
                          const mergedTimes = merged.map((d) => d.time);
                          const step = Number(resamplingStepMinutes);
                          const stepMin = Number.isFinite(step) && step > 0 ? step : 10;
                          const expectedPerDay = Math.max(1, Math.floor(1440 / stepMin));

                          // Daily availability mean
                          const dayCounts = new Map();
                          const dayMs = [];
                          for (const t of mergedTimes) {
                            const d = parseDateCellFlexible(t);
                            if (!d) continue;
                            const key = toYMDLocal(d);
                            dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
                            dayMs.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
                          }
                          let avgAvailPct = null;
                          let avgMissingPct = null;
                          if (dayMs.length) {
                            const fromDateParsed = parseDateCellFlexible(dateFrom);
                            const toDateParsed = parseDateCellFlexible(dateTo);
                            const minDayFromFilter = fromDateParsed
                              ? new Date(fromDateParsed.getFullYear(), fromDateParsed.getMonth(), fromDateParsed.getDate()).getTime()
                              : null;
                            const maxDayFromFilter = toDateParsed
                              ? new Date(toDateParsed.getFullYear(), toDateParsed.getMonth(), toDateParsed.getDate()).getTime()
                              : null;
                            let minDay = null;
                            let maxDay = null;
                            if (minDayFromFilter != null && maxDayFromFilter != null) {
                              minDay = Math.min(minDayFromFilter, maxDayFromFilter);
                              maxDay = Math.max(minDayFromFilter, maxDayFromFilter);
                            } else {
                              minDay = Math.min(...dayMs);
                              maxDay = Math.max(...dayMs);
                            }
                            let sumAvail = 0;
                            let days = 0;
                            for (let ms = minDay; ms <= maxDay; ms += 24 * 60 * 60 * 1000) {
                              const key = toYMDLocal(new Date(ms));
                              const c = dayCounts.get(key) ?? 0;
                              const avail = clamp((c / expectedPerDay) * 100, 0, 100);
                              sumAvail += avail;
                              days += 1;
                            }
                            avgAvailPct = days ? sumAvail / days : null;
                            avgMissingPct = avgAvailPct != null ? (100 - avgAvailPct) : null;
                          }

                          // Clear-sky days count (reuse ClearSkyDaysChart kt rule)
                          let clearDaysCount = null;
                          let totalDays = null;
                          try {
                            const cfg = sysData && typeof sysData === "object" ? (sysData.config || sysData) : null;
                            const latitude = Number(cfg?.latitude);
                            const longitude = Number(cfg?.longitude);
                            const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
                            const ghiIdx = findColIndex(whH, "GHI", "Ghi", "weather_GHI");
                            if (hasCoords && ghiIdx >= 0) {
                              const ratios = [];
                              const cosZ = [];
                              const keys = [];
                              const measArr = [];
                              const modeledArr = [];
                              for (const d of merged) {
                                const dt = parseDateCellFlexible(d.time);
                                if (!dt) continue;
                                const meas = parseFloat(d?.whRow?.[ghiIdx]);
                                const sp = solarPositionZenithRad(dt, latitude, longitude);
                                const modeled = clearSkyGhiHaurwitz(sp.cosZenith);
                                const isDay = sp.cosZenith > 0.08 && modeled > 50;
                                const isScaleSample = sp.cosZenith > CLEAR_SCALE_MIN_COSZ && modeled > 150;
                                cosZ.push(sp.cosZenith);
                                keys.push(toYMDLocal(dt));
                                measArr.push(Number.isFinite(meas) ? meas : null);
                                modeledArr.push(modeled > 0 ? modeled : null);
                                if (isScaleSample && Number.isFinite(meas) && meas > 0 && modeled > 0) {
                                  ratios.push(meas / modeled);
                                }
                              }
                              const scale = estimateClearSkyScale(ratios);

                              const clearMask = [];
                              for (let i = 0; i < keys.length; i++) {
                                const meas = measArr[i];
                                const modeled = (modeledArr[i] ?? 0) * scale;
                                const isDay = cosZ[i] > 0.08 && modeled > 150 && meas != null && Number.isFinite(meas) && meas > 0;
                                const kt = isDay ? computeKt(meas, modeled) : null;
                                clearMask.push(Boolean(kt != null && kt >= KT_CLEAR_MIN && kt <= KT_CLEAR_MAX));
                              }

                              const dayAgg = new Map();
                              for (let i = 0; i < keys.length; i++) {
                                const k = keys[i];
                                const meas = measArr[i];
                                const modeled = (modeledArr[i] ?? 0) * scale;
                                const isDay = cosZ[i] > 0.08 && modeled > 150 && meas != null && Number.isFinite(meas) && meas > 0;
                                if (!isDay) continue;
                                const cur = dayAgg.get(k) || { daySamples: 0, clearSamples: 0 };
                                cur.daySamples += 1;
                                if (clearMask[i]) cur.clearSamples += 1;
                                dayAgg.set(k, cur);
                              }
                              const dayKeys = Array.from(dayAgg.keys()).sort();
                              totalDays = dayKeys.length;
                              clearDaysCount = dayKeys.reduce((acc, k) => {
                                const v = dayAgg.get(k);
                                if (!v || v.daySamples < KT_MIN_DAYTIME_SAMPLES) return acc;
                                return acc + ((v.clearSamples / v.daySamples) >= KT_CLEAR_DAY_RATIO ? 1 : 0);
                              }, 0);
                            }
                          } catch (_) {
                            // ignore
                          }

                          return (
                            <DataQualityCheckSummaryCard
                              mergedTimes={mergedTimes}
                              mergedCount={merged.length}
                              stepMinutes={resamplingStepMinutes}
                              clearDaysCount={clearDaysCount}
                              totalDays={totalDays}
                              avgAvailPct={avgAvailPct}
                              avgMissingPct={avgMissingPct}
                              color={P}
                            />
                          );
                        })()}

                        <CorrelationHeatmapCard
                          embedded
                          title="Data Correlation"
                          mergedHeaders={(() => {
                            const pvHeader = pvH;
                            const whNonTime = whH
                              .map((name, idx) => ({ name, idx }))
                              .filter(({ idx }) => idx !== timeColWhIdx);
                            return pvHeader.concat(whNonTime.map(({ name }) => `weather_${name}`));
                          })()}
                          mergedRows={(() => {
                            const pvHeader = pvH;
                            const whNonTime = whH
                              .map((name, idx) => ({ name, idx }))
                              .filter(({ idx }) => idx !== timeColWhIdx);
                            return merged.map((row) => {
                              const pvVals = pvHeader.map((_, idx) => (Array.isArray(row.pvRow) ? (row.pvRow[idx] ?? "") : ""));
                              const whVals = whNonTime.map(({ idx }) => (Array.isArray(row.whRow) ? (row.whRow[idx] ?? "") : ""));
                              return pvVals.concat(whVals);
                            });
                          })()}
                        />

                        {(() => {
                          const ghiIdx = findColIndex(whH, "GHI", "Ghi", "weather_GHI");
                          const syncedGhiHeaders = ["Time", "GHI"];
                          const syncedGhiRows =
                            ghiIdx < 0
                              ? []
                              : merged.map((d) => {
                                  const ghiRaw = d?.whRow?.[ghiIdx];
                                  return [d.time, ghiRaw];
                                });
                          return (
                            <ClearSkyDaysChart
                              title="Synced Data"
                              color={P}
                              headers={syncedGhiHeaders}
                              rows={syncedGhiRows}
                              systemInfo={sysData}
                            />
                          );
                        })()}

                        <DataAvailabilityCard
                          mergedTimes={merged.map((d) => d.time)}
                          stepMinutes={resamplingStepMinutes}
                          color={P}
                          dateFrom={dateFrom}
                          dateTo={dateTo}
                        />
                      </div>
                    </>
                  );
                } catch {
                  return null;
                }
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
