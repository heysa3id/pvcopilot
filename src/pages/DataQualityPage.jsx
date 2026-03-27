import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import TimelineOutlined from "@mui/icons-material/TimelineOutlined";
import HubOutlined from "@mui/icons-material/HubOutlined";
import SummarizeOutlined from "@mui/icons-material/SummarizeOutlined";
import BarChartOutlined from "@mui/icons-material/BarChartOutlined";
import ShowChartOutlined from "@mui/icons-material/ShowChartOutlined";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";

const Plot = createPlotlyComponent(Plotly);

const P = "#8b5cf6";
const FONT = "Inter, Arial, sans-serif";
const MONO = "'JetBrains Mono', monospace";
const CACHE_PV = "pvcopilot_quality_pv";
const CACHE_WEATHER = "pvcopilot_quality_weather";
const CACHE_SYS = "pvcopilot_quality_sys";

// ── Pure utility functions ────────────────────────────────────────────────────

function parseDateCellFlexible(val) {
  if (val == null || String(val).trim() === "") return null;
  const raw = String(val).trim();
  const a = new Date(raw);
  if (!Number.isNaN(a.getTime())) return a;
  const b = new Date(raw.replace(" ", "T"));
  if (!Number.isNaN(b.getTime())) return b;
  return null;
}

function parseDateCell(val) {
  if (val == null || String(val).trim() === "") return NaN;
  const s = String(val).trim();
  const d = new Date(s);
  return isNaN(d.getTime()) ? NaN : d.getTime();
}

function toYMDLocal(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateOnly(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
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

function getColumnIndex(headers, ...candidates) {
  if (!headers?.length) return -1;
  const set = new Set(candidates.map((c) => String(c).trim().toLowerCase()));
  for (let i = 0; i < headers.length; i++) {
    if (set.has(String(headers[i] ?? "").trim().toLowerCase())) return i;
  }
  return -1;
}

function findColIndex(headers, ...names) {
  const h = (headers || []).map((x) => String(x ?? "").trim());
  for (const n of names) {
    const want = String(n ?? "").trim();
    const idx = h.findIndex((x) => x.toLowerCase() === want.toLowerCase() || x === want);
    if (idx >= 0) return idx;
  }
  return -1;
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

function pearsonCorrelation(x, y) {
  const n = Math.min(x?.length ?? 0, y?.length ?? 0);
  if (n < 2) return { r: null, n: 0 };
  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i], yi = y[i];
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
    sumX += xi; sumY += yi;
  }
  const meanX = sumX / n, meanY = sumY / n;
  let num = 0, denX = 0, denY = 0, count = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i], yi = y[i];
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
    const dx = xi - meanX, dy = yi - meanY;
    num += dx * dy; denX += dx * dx; denY += dy * dy;
    count++;
  }
  if (count < 2) return { r: null, n: count };
  const denom = Math.sqrt(denX) * Math.sqrt(denY);
  if (!Number.isFinite(denom) || denom === 0) return { r: null, n: count };
  return { r: clamp(num / denom, -1, 1), n: count };
}

function formatTimeCell(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
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

function resampleRowsToStep(headers, rows, stepMinutes) {
  const stepMs = Math.max(1, Math.min(1440, Number(stepMinutes) || 10)) * 60 * 1000;
  if (!headers?.length || !rows?.length)
    return { headers: headers || [], rows: rows || [], resampled: false };
  const timeColIdx = getDateColumnIndex(headers);
  if (timeColIdx < 0) return { headers, rows, resampled: false };

  const safeRows = rows.filter((r) => Array.isArray(r));
  const withMs = safeRows
    .map((row) => ({ row, ms: parseDateCell(row[timeColIdx]) }))
    .filter((x) => !Number.isNaN(x.ms));
  if (withMs.length === 0) return { headers, rows, resampled: false };

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
      const v = v0 + (v1 - v0) * alpha;
      newRow[col] = String(Math.round(v * 1000) / 1000);
    }
    return newRow;
  });

  return { headers, rows: resampledRows, resampled: true };
}

// ── ColumnMultiSelect ─────────────────────────────────────────────────────────

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
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 6, padding: "5px 8px",
          borderRadius: 8, border: "1px solid #E2E8F0", background: "#FAFBFC",
          cursor: "pointer", fontFamily: FONT, color: "#475569", fontSize: 11, fontWeight: 500,
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
            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 20,
            width: 280, maxHeight: 280, overflow: "auto", background: "#fff",
            border: "1px solid #E2E8F0", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(2, 6, 23, 0.1)", padding: 8,
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
                  setOpen(false);
                }}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: "space-between", gap: 8, padding: "6px 8px",
                  border: "none", background: checked ? "#EEF2FF" : "transparent",
                  borderRadius: 8, cursor: "pointer", textAlign: "left",
                  fontFamily: FONT, fontSize: 11, fontWeight: 500,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: 4,
                    border: checked ? "none" : "1px solid #CBD5E1",
                    background: checked ? "#8b5cf6" : "#fff",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
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

// ── DataQualityCheckSummaryCard ───────────────────────────────────────────────

function DataQualityCheckSummaryCard({ mergedTimes, mergedCount, stepMinutes, clearDaysCount, totalDays, avgAvailPct, avgMissingPct, color }) {
  const step = Number(stepMinutes);
  const stepMin = Number.isFinite(step) && step > 0 ? step : 10;
  const expectedPerDay = Math.max(1, Math.floor(1440 / stepMin));

  const range = useMemo(() => {
    const safe = Array.isArray(mergedTimes) ? mergedTimes : [];
    const days = safe.map((t) => parseDateCellFlexible(t)).filter(Boolean).map((d) => toYMDLocal(d));
    if (!days.length) return { minDay: "—", maxDay: "—" };
    days.sort();
    return { minDay: days[0], maxDay: days[days.length - 1] };
  }, [mergedTimes]);

  const tileStyle = {
    flex: "1 1 0", minWidth: 140, padding: "8px 10px",
    borderRadius: 10, background: "#F8FAFC", border: "1px solid #E2E8F0",
  };
  const labelStyle = {
    fontFamily: FONT, fontSize: 10, fontWeight: 600, color: "#64748B",
    textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center",
  };
  const valueStyle = { fontFamily: MONO, fontSize: 14, color: "#0F172A", marginTop: 4, textAlign: "center" };

  return (
    <div style={{
      background: "#ffffff", borderRadius: 16, border: "1px solid #E2E8F0",
      boxShadow: "0 18px 45px rgba(15, 23, 42, 0.08)", padding: "16px 18px 18px",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
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

// ── CorrelationHeatmapCard ────────────────────────────────────────────────────

function CorrelationHeatmapCard({ pvHeaders, pvRows, weatherHeaders, weatherRows, mergedHeaders, mergedRows, title = "Data Correlation", embedded = false, defaultExpanded = true }) {
  const safePvH = useMemo(() => Array.isArray(pvHeaders) ? pvHeaders : [], [pvHeaders]);
  const safePvR = useMemo(() => Array.isArray(pvRows) ? pvRows : [], [pvRows]);
  const safeWhH = useMemo(() => Array.isArray(weatherHeaders) ? weatherHeaders : [], [weatherHeaders]);
  const safeWhR = useMemo(() => Array.isArray(weatherRows) ? weatherRows : [], [weatherRows]);
  const safeMergedH = useMemo(() => Array.isArray(mergedHeaders) ? mergedHeaders : [], [mergedHeaders]);
  const safeMergedR = useMemo(() => Array.isArray(mergedRows) ? mergedRows : [], [mergedRows]);
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));

  const useMerged = safeMergedH.length > 0 && safeMergedR.length > 0;

  const pvPlottableCols = useMemo(() => {
    if (useMerged) return [];
    return safePvH.map((h, i) => ({ header: h, index: i })).filter(({ index }) => {
      if (index === 0) return false;
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
  }, [safePvH, safePvR, useMerged]);

  const whPlottableCols = useMemo(() => {
    if (useMerged) return [];
    return safeWhH.map((h, i) => ({ header: h, index: i })).filter(({ index }) => {
      if (index === 0) return false;
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
  }, [safeWhH, safeWhR, useMerged]);

  const mergedPlottableCols = useMemo(() => {
    if (!useMerged) return [];
    return safeMergedH.map((h, i) => ({ header: h, index: i })).filter(({ index }) => {
      if (index === 0) return false;
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
  }, [safePvH, pvPlottableCols, useMerged]);

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
  }, [safeWhH, whPlottableCols, useMerged]);

  const defaultMergedSelected = useMemo(() => {
    if (!useMerged) return [];
    return mergedPlottableCols.map((c) => c.index);
  }, [useMerged, mergedPlottableCols]);

  const [pvSelected, setPvSelected] = useState(() => defaultPvSelected);
  const [whSelected, setWhSelected] = useState(() => defaultWhSelected);
  const [mergedSelectedX, setMergedSelectedX] = useState(() => defaultMergedSelected);
  const [mergedSelectedY, setMergedSelectedY] = useState(() => defaultMergedSelected);

  useEffect(() => { setPvSelected((prev) => (prev?.length ? prev : defaultPvSelected)); }, [defaultPvSelected]);
  useEffect(() => { setWhSelected((prev) => (prev?.length ? prev : defaultWhSelected)); }, [defaultWhSelected]);
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
          const xs = [], ys = [];
          for (const row of safeMergedR) {
            if (!Array.isArray(row)) continue;
            const xv = parseFloat(row[xIdx]), yv = parseFloat(row[yIdx]);
            if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
            xs.push(xv); ys.push(yv);
          }
          z[yi][xi] = pearsonCorrelation(xs, ys).r;
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
        const whIdx = whSelected[yi], pvIdx = pvSelected[xi];
        const xs = [], ys = [];
        for (const pvRow of safePvR) {
          if (!Array.isArray(pvRow)) continue;
          const t = String(pvRow[timePvIdx] ?? "").trim();
          if (!t) continue;
          const whRow = weatherByTime.get(t);
          if (!Array.isArray(whRow)) continue;
          const pvVal = parseFloat(pvRow[pvIdx]), whVal = parseFloat(whRow[whIdx]);
          if (!Number.isFinite(pvVal) || !Number.isFinite(whVal)) continue;
          xs.push(pvVal); ys.push(whVal);
        }
        const { r, n } = pearsonCorrelation(xs, ys);
        z[yi][xi] = r; nMat[yi][xi] = n;
      }
    }
    return { pvLabels, whLabels, z, nMat };
  }, [useMerged, safeMergedH, safeMergedR, mergedSelectedX, mergedSelectedY, safePvH, safeWhH, safePvR, safeWhR, pvSelected, whSelected]);

  if (useMerged ? !safeMergedH.length : (!safePvH.length || !safeWhH.length)) return null;

  const containerStyle = embedded
    ? { background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }
    : { background: "#ffffff", borderRadius: 16, border: "1px solid #E2E8F0", boxShadow: "0 18px 45px rgba(15, 23, 42, 0.10)", padding: "16px 18px 20px", display: "flex", flexDirection: "column", gap: 12, marginTop: 18 };

  return (
    <div style={containerStyle}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer", userSelect: "none", padding: embedded ? "14px 20px" : 0, borderBottom: embedded ? (expanded ? "1px solid #E2E8F0" : "none") : "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 10, background: `${P}12`, border: `1px solid ${P}35`, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
            <div style={{ padding: "10px 2px 2px", color: "#64748B", fontFamily: FONT, fontSize: 12 }}>
              Load PV + Weather data and select at least one numeric column from each to view the heatmap.
            </div>
          ) : (
            <Plot
              data={[{
                type: "heatmap", x: heatmap.pvLabels, y: heatmap.whLabels, z: heatmap.z,
                zmin: -1, zmax: 1,
                colorscale: [[0.0,"#12092b"],[0.15,"#2b1a5a"],[0.30,"#5a1f73"],[0.50,"#b12a6a"],[0.70,"#f04f2a"],[0.85,"#f7a15a"],[1.0,"#f6f0e6"]],
                reversescale: false, showscale: true,
                colorbar: { title: { text: "Correlation", side: "right", font: { family: FONT, size: 12, color: "#475569" } }, tickfont: { family: MONO, size: 10, color: "#64748B" }, len: 0.9 },
                xgap: 1, ygap: 1,
                text: heatmap.z.map((row) => row.map((v) => (v == null ? "" : Number(v).toFixed(2)))),
                texttemplate: "%{text}", textfont: { family: MONO, size: 10, color: "#0F172A" },
                hovertemplate: "%{y} × %{x}<br>r=%{z:.3f}<extra></extra>",
              }]}
              layout={{
                height: 420, margin: { t: 10, r: 70, b: 110, l: 140 },
                xaxis: { tickangle: -30, tickfont: { family: FONT, size: 11, color: "#475569" } },
                yaxis: { tickfont: { family: FONT, size: 11, color: "#475569" }, automargin: true },
                plot_bgcolor: "#FFFFFF", paper_bgcolor: "#FFFFFF", font: { family: FONT },
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

// ── ClearSkyDaysChart ─────────────────────────────────────────────────────────

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
    const ghiIdx = getColumnIndex(safeHeaders, "weather_GHI", "GHI", "ghi");
    if (timeIdx < 0 || ghiIdx < 0) return { error: "missing_columns" };
    const x = [], ghiMeas = [], ghiClrBase = [], cosZ = [], dayKey = [], ratios = [];
    for (const r of safeRows) {
      if (!Array.isArray(r)) continue;
      const tRaw = r[timeIdx];
      const d = parseDateCellFlexible(tRaw);
      const meas = Number.parseFloat(r[ghiIdx]);
      if (!d) continue;
      const sp = solarPositionZenithRad(d, latitude, longitude);
      const modeled = clearSkyGhiHaurwitz(sp.cosZenith);
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
      const meas = ghiMeas[i], modeled = ghiClr[i];
      const isDay = cosZ[i] > 0.08 && (modeled ?? 0) > 150 && meas != null && Number.isFinite(meas) && meas > 0;
      const kt = isDay ? computeKt(meas, modeled) : null;
      clearMask.push(Boolean(kt != null && kt >= ktMin && kt <= ktMax));
    }
    const dayAgg = new Map();
    for (let i = 0; i < x.length; i++) {
      const k = dayKey[i];
      if (!k) continue;
      const modeled = ghiClr[i], meas = ghiMeas[i];
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
      if (!v || v.daySamples < KT_MIN_DAYTIME_SAMPLES) return 0;
      return (v.clearSamples / v.daySamples) >= KT_CLEAR_DAY_RATIO ? 1 : 0;
    });
    const clearDaysCount = dayIsClear.reduce((a, b) => a + (b ? 1 : 0), 0);
    return { error: null, x, ghiMeas, ghiClr, clearMask, dayKeys, dayIsClear, clearDaysCount, totalDays: dayKeys.length };
  }, [safeHeaders, safeRows, hasCoords, latitude, longitude, ktMin, ktMax]);

  const plotData = useMemo(() => {
    if (!derived || derived.error) return [];
    const clearX = [], clearY = [];
    const dayBarX = derived.dayKeys.map((k) => `${k} 12:00`);
    for (let i = 0; i < derived.x.length; i++) {
      if (derived.clearMask[i] && derived.ghiMeas[i] != null) { clearX.push(derived.x[i]); clearY.push(derived.ghiMeas[i]); }
    }
    return [
      { x: derived.x, y: derived.ghiMeas, type: "scatter", mode: "lines", connectgaps: false, name: "Measured GHI", line: { color: "#0ea5e9", width: 1.6, shape: "spline", smoothing: 1.1 }, hovertemplate: "<b>Measured GHI</b>: %{y}<extra></extra>", yaxis: "y" },
      { x: derived.x, y: derived.ghiClr, type: "scatter", mode: "lines", connectgaps: false, name: "Clear-sky GHI (scaled)", line: { color: "#94a3b8", width: 1.6, dash: "dash", shape: "spline", smoothing: 1.1 }, hovertemplate: "<b>Clear-sky (scaled)</b>: %{y}<extra></extra>", yaxis: "y" },
      { x: clearX, y: clearY, type: "scatter", mode: "markers", name: "Clear intervals", marker: { color: "#ff8800", size: 5, opacity: 0.9 }, hovertemplate: "<b>Clear interval</b>: %{y}<extra></extra>", yaxis: "y" },
      { x: dayBarX, y: derived.dayIsClear, type: "bar", name: "Clear-sky day", width: 24 * 60 * 60 * 1000 * 0.55, marker: { color: derived.dayIsClear.map((v) => (v ? "#ff8800" : "#E2E8F0")) }, hovertemplate: "<b>%{x}</b>: %{y}<extra></extra>", yaxis: "y2" },
    ];
  }, [derived]);

  if (!safeHeaders.length || !safeRows.length) return null;

  const headerRight = derived?.error ? null : (
    <span style={{ fontFamily: MONO, fontSize: 11, color: "#94a3b8" }}>
      clear-days {derived?.clearDaysCount ?? 0}/{derived?.totalDays ?? 0}
    </span>
  );

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer", userSelect: "none", borderBottom: expanded ? "1px solid #E2E8F0" : "none" }}>
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
              <span onClick={() => { setKtMinInput(String(ktMin)); setKtMaxInput(String(ktMax)); setEditingKt(true); }} style={{ fontFamily: MONO, color: "#0F172A", cursor: "pointer", borderBottom: "1px dashed #94a3b8" }} title="Click to edit thresholds">
                {ktMin.toFixed(2)} ≤ k_t ≤ {ktMax.toFixed(2)}
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input type="number" step="0.01" value={ktMinInput} onChange={(e) => setKtMinInput(e.target.value)} style={{ width: 62, fontFamily: MONO, fontSize: 11, padding: "2px 4px", border: "1px solid #CBD5E1", borderRadius: 6 }} />
                <span>≤ k_t ≤</span>
                <input type="number" step="0.01" value={ktMaxInput} onChange={(e) => setKtMaxInput(e.target.value)} style={{ width: 62, fontFamily: MONO, fontSize: 11, padding: "2px 4px", border: "1px solid #CBD5E1", borderRadius: 6 }} />
                <button type="button" onClick={() => { const min = Number(ktMinInput), max = Number(ktMaxInput); if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > min) { setKtMin(min); setKtMax(max); } setEditingKt(false); }} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "1px solid #CBD5E1", background: "#fff", cursor: "pointer" }}>Apply</button>
              </span>
            )}.
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
                height: 420, margin: { t: 30, r: 50, b: 50, l: 60 }, hovermode: "x unified", showlegend: true,
                legend: { orientation: "h", x: 0.5, y: 1.08, xanchor: "center", yanchor: "bottom", font: { family: FONT, size: 11 } },
                xaxis: { title: { text: "Time", font: { family: FONT, size: 12, color: "#94a3b8" } }, gridcolor: "#F1F5F9", tickfont: { family: MONO, size: 10, color: "#94a3b8" } },
                yaxis: { title: { text: "GHI", font: { family: FONT, size: 12, color: "#94a3b8" } }, gridcolor: "#F1F5F9", tickfont: { family: MONO, size: 10, color: "#94a3b8" }, domain: [0.34, 1] },
                yaxis2: { title: { text: "Clear day", font: { family: FONT, size: 12, color: "#94a3b8" } }, gridcolor: "#F1F5F9", tickfont: { family: MONO, size: 10, color: "#94a3b8" }, domain: [0, 0.22], range: [-0.05, 1.05] },
                plot_bgcolor: "#fff", paper_bgcolor: "#fff", font: { family: FONT },
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

// ── DataAvailabilityCard ──────────────────────────────────────────────────────

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
    const minDayFromFilter = fromDateParsed ? new Date(fromDateParsed.getFullYear(), fromDateParsed.getMonth(), fromDateParsed.getDate()).getTime() : null;
    const maxDayFromFilter = toDateParsed ? new Date(toDateParsed.getFullYear(), toDateParsed.getMonth(), toDateParsed.getDate()).getTime() : null;
    let minDay = null, maxDay = null;
    if (minDayFromFilter != null && maxDayFromFilter != null) {
      minDay = Math.min(minDayFromFilter, maxDayFromFilter);
      maxDay = Math.max(minDayFromFilter, maxDayFromFilter);
    } else if (dayMs.length) {
      minDay = Math.min(...dayMs); maxDay = Math.max(...dayMs);
    } else {
      return { error: "no_data" };
    }
    const keys = [];
    for (let ms = minDay; ms <= maxDay; ms += 24 * 60 * 60 * 1000) keys.push(toYMDLocal(new Date(ms)));
    const availablePct = keys.map((k) => { const c = dayCounts.get(k) ?? 0; return clamp((c / expectedPerDay) * 100, 0, 100); });
    const missingPct = availablePct.map((v) => clamp(100 - v, 0, 100));
    return { error: null, keys, availablePct, missingPct };
  }, [safeTimes, expectedPerDay, dateFrom, dateTo]);

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer", userSelect: "none", borderBottom: expanded ? "1px solid #E2E8F0" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TimelineOutlined sx={{ fontSize: 20, color }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>Data Availability</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "#94a3b8" }}>step {stepMin}min · expected {expectedPerDay}/day</span>
        </div>
        {expanded ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} /> : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />}
      </div>
      {expanded && (
        <div style={{ padding: "10px 12px 12px" }}>
          {derived?.error ? (
            <div style={{ padding: "6px 8px", color: "#64748B", fontFamily: FONT, fontSize: 12 }}>No synced data points to compute availability.</div>
          ) : (
            <Plot
              data={[
                { type: "bar", x: derived.keys, y: derived.availablePct, name: "Available (%)", marker: { color: "#00afb9" }, hovertemplate: "<b>%{x}</b><br>Available: %{y:.1f}%<extra></extra>" },
                { type: "bar", x: derived.keys, y: derived.missingPct, name: "Missing (%)", marker: { color: "#edafb8" }, hovertemplate: "<b>%{x}</b><br>Missing: %{y:.1f}%<extra></extra>" },
              ]}
              layout={{
                height: 360, barmode: "stack", margin: { t: 26, r: 20, b: 70, l: 54 }, hovermode: "x unified", showlegend: true,
                legend: { orientation: "h", x: 0.5, y: 1.08, xanchor: "center", yanchor: "bottom", font: { family: FONT, size: 11 } },
                xaxis: { title: { text: "Day", font: { family: FONT, size: 12, color: "#94a3b8" } }, gridcolor: "#F1F5F9", tickfont: { family: MONO, size: 10, color: "#94a3b8" }, tickangle: -30 },
                yaxis: { title: { text: "Availability (%)", font: { family: FONT, size: 12, color: "#94a3b8" } }, gridcolor: "#F1F5F9", tickfont: { family: MONO, size: 10, color: "#94a3b8" }, range: [0, 100] },
                plot_bgcolor: "#fff", paper_bgcolor: "#fff", font: { family: FONT },
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

// ── Main Page ─────────────────────────────────────────────────────────────────

function loadCached(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function DataQualityPage() {
  const [pvRawData, setPvRawData] = useState(null);
  const [weatherRawData, setWeatherRawData] = useState(null);
  const [sysData, setSysData] = useState(null);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [resamplingStepMinutes] = useState(10);

  // Load from localStorage on mount
  useEffect(() => {
    const pv = loadCached(CACHE_PV);
    if (pv?.data?.headers && pv?.data?.rows) {
      setPvRawData({ headers: pv.data.headers, rows: pv.data.rows });
    }
    const weather = loadCached(CACHE_WEATHER);
    if (weather?.data?.headers && weather?.data?.rows) {
      setWeatherRawData({ headers: weather.data.headers, rows: weather.data.rows });
    }
    const sys = loadCached(CACHE_SYS);
    if (sys?.data) setSysData(sys.data);
  }, []);

  // Default date range from data
  const defaultDateRange = useMemo(() => {
    const pvRange = pvRawData ? getDateRangeFromRows(pvRawData.headers, pvRawData.rows) : null;
    const weatherRange = weatherRawData ? getDateRangeFromRows(weatherRawData.headers, weatherRawData.rows) : null;
    if (!pvRange && !weatherRange) return null;
    let minMs = Infinity, maxMs = -Infinity;
    if (pvRange) { if (pvRange.minMs < minMs) minMs = pvRange.minMs; if (pvRange.maxMs > maxMs) maxMs = pvRange.maxMs; }
    if (weatherRange) { if (weatherRange.minMs < minMs) minMs = weatherRange.minMs; if (weatherRange.maxMs > maxMs) maxMs = weatherRange.maxMs; }
    if (minMs === Infinity || maxMs === -Infinity) return null;
    return { dateFrom: formatDateOnly(minMs), dateTo: formatDateOnly(maxMs) };
  }, [pvRawData, weatherRawData]);

  useEffect(() => {
    if (defaultDateRange && dateFrom == null && dateTo == null) {
      setDateFrom(defaultDateRange.dateFrom);
      setDateTo(defaultDateRange.dateTo);
    }
  }, [defaultDateRange]);

  // Filtered + resampled data
  const pvData = useMemo(() => {
    if (!pvRawData?.headers?.length || !pvRawData?.rows?.length) return null;
    const filtered = filterRowsByDateRange(pvRawData.headers, pvRawData.rows, dateFrom, dateTo);
    return resampleRowsToStep(pvRawData.headers, filtered, resamplingStepMinutes);
  }, [pvRawData, dateFrom, dateTo, resamplingStepMinutes]);

  const weatherData = useMemo(() => {
    if (!weatherRawData?.headers?.length || !weatherRawData?.rows?.length) return null;
    const filtered = filterRowsByDateRange(weatherRawData.headers, weatherRawData.rows, dateFrom, dateTo);
    return resampleRowsToStep(weatherRawData.headers, filtered, resamplingStepMinutes);
  }, [weatherRawData, dateFrom, dateTo, resamplingStepMinutes]);

  // Merge by exact timestamp (no sync rules needed for quality check)
  const merged = useMemo(() => {
    if (!pvData || !weatherData) return [];
    const pvH = Array.isArray(pvData.headers) ? pvData.headers : [];
    const whH = Array.isArray(weatherData.headers) ? weatherData.headers : [];
    const pvRows = Array.isArray(pvData.rows) ? pvData.rows : [];
    const whRows = Array.isArray(weatherData.rows) ? weatherData.rows : [];
    if (!pvH.length || !whH.length) return [];
    const pdcIdx = findColIndex(pvH, "P_DC", "P DC", "PDC", "P", "Power");
    const irrIdx = findColIndex(whH, "POA", "Poa", "poa", "GTI", "GHI", "Ghi");
    if (pdcIdx < 0 || irrIdx < 0) return [];
    const whMap = new Map();
    whRows.forEach((r) => { if (Array.isArray(r) && r[0]) whMap.set(String(r[0]).trim(), r); });
    const result = [];
    pvRows.forEach((pvRow) => {
      if (!Array.isArray(pvRow) || !pvRow[0]) return;
      const t = String(pvRow[0]).trim();
      const pdcVal = parseFloat(pvRow[pdcIdx]);
      if (!Number.isFinite(pdcVal)) return;
      const whRow = whMap.get(t);
      if (!Array.isArray(whRow)) return;
      const irrVal = parseFloat(whRow[irrIdx]);
      if (!Number.isFinite(irrVal)) return;
      result.push({ time: t, pdc: pdcVal, poa: irrVal, pvRow, whRow });
    });
    return result;
  }, [pvData, weatherData]);

  const pvH = pvData?.headers ?? [];
  const whH = weatherData?.headers ?? [];
  const timeColWhIdx = whH.length > 0 ? 0 : -1;
  const hasData = pvRawData != null && weatherRawData != null;

  // Compute merged headers/rows for the correlation heatmap
  const mergedHeaders = useMemo(() => {
    if (!pvH.length || !whH.length) return [];
    const whNonTime = whH.map((name, idx) => ({ name, idx })).filter(({ idx }) => idx !== timeColWhIdx);
    return pvH.concat(whNonTime.map(({ name }) => `weather_${name}`));
  }, [pvH, whH, timeColWhIdx]);

  const mergedRows = useMemo(() => {
    if (!pvH.length || !whH.length || !merged.length) return [];
    const whNonTime = whH.map((name, idx) => ({ name, idx })).filter(({ idx }) => idx !== timeColWhIdx);
    return merged.map((row) => {
      const pvVals = pvH.map((_, idx) => (Array.isArray(row.pvRow) ? (row.pvRow[idx] ?? "") : ""));
      const whVals = whNonTime.map(({ idx }) => (Array.isArray(row.whRow) ? (row.whRow[idx] ?? "") : ""));
      return pvVals.concat(whVals);
    });
  }, [pvH, whH, merged, timeColWhIdx]);

  // GHI rows for clear-sky chart
  const ghiIdx = findColIndex(whH, "GHI", "Ghi", "weather_GHI");
  const syncedGhiHeaders = ["Time", "GHI"];
  const syncedGhiRows = useMemo(() => {
    if (ghiIdx < 0) return [];
    return merged.map((d) => [d.time, d?.whRow?.[ghiIdx]]);
  }, [merged, ghiIdx]);

  // Compute summary stats
  const mergedTimes = useMemo(() => merged.map((d) => d.time), [merged]);
  const stepMin = resamplingStepMinutes;
  const expectedPerDay = Math.max(1, Math.floor(1440 / stepMin));

  const { avgAvailPct, avgMissingPct, clearDaysCount, totalDays } = useMemo(() => {
    const dayCounts = new Map();
    const dayMs = [];
    for (const t of mergedTimes) {
      const d = parseDateCellFlexible(t);
      if (!d) continue;
      const key = toYMDLocal(d);
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
      dayMs.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
    }

    let avgAvailPct = null, avgMissingPct = null;
    if (dayMs.length) {
      const fromP = parseDateCellFlexible(dateFrom), toP = parseDateCellFlexible(dateTo);
      const minDayF = fromP ? new Date(fromP.getFullYear(), fromP.getMonth(), fromP.getDate()).getTime() : null;
      const maxDayF = toP ? new Date(toP.getFullYear(), toP.getMonth(), toP.getDate()).getTime() : null;
      let minDay = minDayF != null && maxDayF != null ? Math.min(minDayF, maxDayF) : Math.min(...dayMs);
      let maxDay = minDayF != null && maxDayF != null ? Math.max(minDayF, maxDayF) : Math.max(...dayMs);
      let sumAvail = 0, days = 0;
      for (let ms = minDay; ms <= maxDay; ms += 24 * 60 * 60 * 1000) {
        const key = toYMDLocal(new Date(ms));
        const c = dayCounts.get(key) ?? 0;
        sumAvail += clamp((c / expectedPerDay) * 100, 0, 100);
        days++;
      }
      avgAvailPct = days ? sumAvail / days : null;
      avgMissingPct = avgAvailPct != null ? 100 - avgAvailPct : null;
    }

    let clearDaysCount = null, totalDays = null;
    try {
      const cfg = sysData && typeof sysData === "object" ? (sysData.config || sysData) : null;
      const latitude = Number(cfg?.latitude), longitude = Number(cfg?.longitude);
      const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
      const ghiI = findColIndex(whH, "GHI", "Ghi", "weather_GHI");
      if (hasCoords && ghiI >= 0) {
        const ratios = [], cosZArr = [], keysArr = [], measArr = [], modeledArr = [];
        for (const d of merged) {
          const dt = parseDateCellFlexible(d.time);
          if (!dt) continue;
          const meas = parseFloat(d?.whRow?.[ghiI]);
          const sp = solarPositionZenithRad(dt, latitude, longitude);
          const modeled = clearSkyGhiHaurwitz(sp.cosZenith);
          const isScaleSample = sp.cosZenith > CLEAR_SCALE_MIN_COSZ && modeled > 150;
          cosZArr.push(sp.cosZenith); keysArr.push(toYMDLocal(dt));
          measArr.push(Number.isFinite(meas) ? meas : null);
          modeledArr.push(modeled > 0 ? modeled : null);
          if (isScaleSample && Number.isFinite(meas) && meas > 0 && modeled > 0) ratios.push(meas / modeled);
        }
        const scale = estimateClearSkyScale(ratios);
        const clearMask = [];
        for (let i = 0; i < keysArr.length; i++) {
          const meas = measArr[i], modeled = (modeledArr[i] ?? 0) * scale;
          const isDay = cosZArr[i] > 0.08 && modeled > 150 && meas != null && Number.isFinite(meas) && meas > 0;
          const kt = isDay ? computeKt(meas, modeled) : null;
          clearMask.push(Boolean(kt != null && kt >= KT_CLEAR_MIN && kt <= KT_CLEAR_MAX));
        }
        const dayAgg = new Map();
        for (let i = 0; i < keysArr.length; i++) {
          const k = keysArr[i], meas = measArr[i], modeled = (modeledArr[i] ?? 0) * scale;
          const isDay = cosZArr[i] > 0.08 && modeled > 150 && meas != null && Number.isFinite(meas) && meas > 0;
          if (!isDay) continue;
          const cur = dayAgg.get(k) || { daySamples: 0, clearSamples: 0 };
          cur.daySamples++; if (clearMask[i]) cur.clearSamples++;
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
    } catch (_) {}

    return { avgAvailPct, avgMissingPct, clearDaysCount, totalDays };
  }, [mergedTimes, dateFrom, dateTo, expectedPerDay, sysData, whH, merged]);

  return (
    <div style={{ minHeight: "calc(100vh - 56px)", background: "#FAFBFC", fontFamily: FONT, paddingBottom: 48 }}>
      {/* Page header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E2E8F0", padding: "24px 40px 20px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${P}14`, border: `1.5px solid ${P}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <ShowChartOutlined sx={{ fontSize: 22, color: P }} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Data Quality Check</h1>
              <p style={{ margin: 0, fontSize: 13, color: "#64748B", marginTop: 2 }}>
                Correlation, clear-sky detection, and data availability on the synced dataset.
              </p>
            </div>
          </div>

          {hasData && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <span style={{ fontFamily: FONT, fontSize: 12, color: "#64748B" }}>Date range:</span>
              <input
                type="date"
                value={dateFrom ?? ""}
                onChange={(e) => setDateFrom(e.target.value || null)}
                style={{ fontFamily: MONO, fontSize: 11, padding: "4px 8px", border: "1px solid #E2E8F0", borderRadius: 8, color: "#0F172A", background: "#FAFBFC" }}
              />
              <span style={{ color: "#94A3B8", fontSize: 13 }}>→</span>
              <input
                type="date"
                value={dateTo ?? ""}
                onChange={(e) => setDateTo(e.target.value || null)}
                style={{ fontFamily: MONO, fontSize: 11, padding: "4px 8px", border: "1px solid #E2E8F0", borderRadius: 8, color: "#0F172A", background: "#FAFBFC" }}
              />
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => { setDateFrom(defaultDateRange?.dateFrom ?? null); setDateTo(defaultDateRange?.dateTo ?? null); }}
                  style={{ fontFamily: FONT, fontSize: 11, color: "#64748B", background: "none", border: "1px solid #E2E8F0", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}
                >
                  Reset
                </button>
              )}
              <span style={{ fontFamily: MONO, fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>
                {merged.length.toLocaleString()} matched points
              </span>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 40px 0" }}>
        {!hasData ? (
          /* No data state */
          <div style={{ textAlign: "center", padding: "80px 24px" }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: `${P}12`, border: `2px solid ${P}30`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <ShowChartOutlined sx={{ fontSize: 32, color: P }} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>No data loaded</h2>
            <p style={{ fontSize: 14, color: "#64748B", marginBottom: 28, maxWidth: 400, margin: "0 auto 28px" }}>
              Upload PV and Weather CSV files in the Data Ingestion page to run the quality check.
            </p>
            <Link
              to="/data-ingestion"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 22px", borderRadius: 10, background: P, color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: 14, fontFamily: FONT }}
            >
              Go to Data Ingestion →
            </Link>
          </div>
        ) : merged.length === 0 ? (
          /* Data loaded but no matched points */
          <div style={{ textAlign: "center", padding: "60px 24px" }}>
            <p style={{ fontSize: 14, color: "#64748B", marginBottom: 16 }}>
              No matched points found between PV and Weather data in the selected date range.
            </p>
            <p style={{ fontSize: 12, color: "#94a3b8" }}>
              Make sure both datasets share the same timestamps (after resampling to {resamplingStepMinutes} min).
            </p>
          </div>
        ) : (
          /* Charts */
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

            <CorrelationHeatmapCard
              embedded
              title="Data Correlation"
              mergedHeaders={mergedHeaders}
              mergedRows={mergedRows}
            />

            <ClearSkyDaysChart
              title="Synced Data"
              color={P}
              headers={syncedGhiHeaders}
              rows={syncedGhiRows}
              systemInfo={sysData}
            />

            <DataAvailabilityCard
              mergedTimes={mergedTimes}
              stepMinutes={resamplingStepMinutes}
              color={P}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          </div>
        )}
      </div>
    </div>
  );
}
