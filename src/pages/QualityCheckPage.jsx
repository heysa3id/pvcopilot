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

const Plot = createPlotlyComponent(Plotly);

const G = "#FFB800", B = "#1d9bf0", P = "#8b5cf6", Y = "#16a34a", O = "#ff7a45";
const FONT = "'Inter', system-ui, sans-serif";
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
    const t = setTimeout(onClose, 5000);
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
const API_BASE = "http://localhost:5001";

async function processCSVFile(file) {
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

/** Client-side CSV parse for when backend is unavailable. Returns same shape as process-csv API. */
function processCSVFileClientSide(text) {
  const { headers, rows } = parseCSV(text);
  if (headers.length === 0 || rows.length === 0) {
    throw new Error("CSV file is empty or has no data rows.");
  }
  return {
    headers,
    rows,
    originalRows: rows.length,
    resampledRows: rows.length,
    resampled: false,
  };
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
function UploadZone({ label, icon, accept, color, file, onLoad, onFileUpload, onClear, onError }) {
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputId = useRef(`upload-${Math.random().toString(36).slice(2)}`).current;

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
          </div>
        </label>
      )}
    </div>
  );
}

// ── CSV Table (scrollable, 10 visible rows) ─────────────────────────────────
function CSVTable({ title, icon, color, headers, rows, resampled, originalRows }) {
  const [expanded, setExpanded] = useState(true);
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const safeRows = Array.isArray(rows) ? rows : [];

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
            {safeRows.length} rows × {safeHeaders.length} cols
          </span>
          {resampled && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: Y, background: `${Y}14`,
              padding: "2px 10px", borderRadius: 20, fontFamily: MONO,
            }}>
              hourly resampled{originalRows ? ` (from ${originalRows})` : ""}
            </span>
          )}
        </div>
        {expanded
          ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} />
          : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />
        }
      </div>
      {/* Scrollable Table */}
      {expanded && (
        <div style={{ overflowX: "auto", maxHeight: 370, overflowY: "auto" }}>
          <table style={{
            width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: MONO,
          }}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                {safeHeaders.map((h, i) => (
                  <th key={i} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeRows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                  <td style={{ ...tdStyle, color: "#94a3b8", fontWeight: 600 }}>{ri + 1}</td>
                  {safeHeaders.map((_, ci) => (
                    <td key={ci} style={tdStyle}>{Array.isArray(row) ? (row[ci] ?? "") : ""}</td>
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

function CSVChart({ title, color, headers, rows }) {
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

  const [selectedIndices, setSelectedIndices] = useState(() =>
    plottableCols.length > 0 ? [plottableCols[0].index] : []
  );

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
        type: "scattergl",
        mode: "lines",
        name: safeHeaders[colIndex] ?? `Col ${colIndex}`,
        line: { color: CHART_COLORS[i % CHART_COLORS.length], width: 1.5 },
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
          <TimelineOutlined sx={{ fontSize: 20, color }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>
            {title} — Chart
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ minWidth: 200 }}>
            <select
              multiple
              value={selectedIndices.map(String)}
              onChange={(e) => {
                const opts = Array.from(e.target.selectedOptions, (o) => Number(o.value));
                setSelectedIndices(opts.length ? opts : [plottableCols[0].index]);
              }}
              style={{
                padding: "6px 12px", borderRadius: 8, border: "1.5px solid #E2E8F0",
                fontSize: 13, fontFamily: FONT, fontWeight: 600, color: "#0F172A",
                background: "#FAFBFC", cursor: "pointer", outline: "none", width: "100%",
                minHeight: 36,
              }}
              title="Hold Ctrl/Cmd to select multiple columns"
            >
              {plottableCols.map(({ header, index }) => (
                <option key={index} value={index}>{header}</option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Hold Ctrl/Cmd for multiple</div>
          </div>
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
            showlegend: chartData.length > 1,
            legend: { x: 1, y: 1, xanchor: "right", font: { family: FONT, size: 11 } },
            xaxis: {
              title: { text: safeHeaders[0] ?? "Index", font: { family: FONT, size: 12, color: "#94a3b8" } },
              gridcolor: "#F1F5F9",
              tickfont: { family: MONO, size: 10, color: "#94a3b8" },
            },
            yaxis: {
              title: { text: selectedIndices.length === 1 ? (safeHeaders[selectedIndices[0]] ?? "") : "Value", font: { family: FONT, size: 12, color: "#94a3b8" } },
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

function DateRangePickerPopover({ dateFrom, dateTo, onDateFromChange, onDateToChange, onClear, onApply, onCancel }) {
  const today = new Date();
  const [pendingFrom, setPendingFrom] = useState(dateFrom || null);
  const [pendingTo, setPendingTo] = useState(dateTo || null);
  const [leftYear, setLeftYear] = useState(() => (dateFrom ? new Date(dateFrom).getFullYear() : today.getFullYear()));
  const [leftMonth, setLeftMonth] = useState(() => (dateFrom ? new Date(dateFrom).getMonth() : today.getMonth()));

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
      setPendingFrom(parsed[0]);
      setPendingTo(parsed[1]);
    }
  };

  return (
    <div style={{
      background: "#fff",
      borderRadius: 12,
      border: "1px solid #e5e7eb",
      boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
      overflow: "hidden",
      minWidth: 480,
    }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="text"
          value={rangeInput}
          onChange={(e) => setRangeInput(e.target.value)}
          onBlur={applyRangeInput}
          onKeyDown={(e) => { if (e.key === "Enter") applyRangeInput(); }}
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
                color: CALENDAR_PURPLE,
                cursor: "pointer",
                borderRadius: 6,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, display: "flex", gap: 20, padding: 16, justifyContent: "center" }}>
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
      <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onCancel} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}>Cancel</button>
        <button type="button" onClick={() => { onDateFromChange(pendingFrom); onDateToChange(pendingTo); onApply(); }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: CALENDAR_PURPLE, fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}>Apply</button>
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
function DateFilterBar({ dateFrom, dateTo, onDateFromChange, onDateToChange, onClear, totalRows, filteredRows }) {
  const hasFilter = dateFrom || dateTo;
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [rangeText, setRangeText] = useState(() => (dateFrom && dateTo) ? `${dateFrom} → ${dateTo}` : "");
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    setRangeText((dateFrom && dateTo) ? `${dateFrom} → ${dateTo}` : "");
  }, [dateFrom, dateTo]);

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
          <div style={{ width: 36, height: 36, borderRadius: 8, background: `${CALENDAR_PURPLE}14`, border: `1px solid ${CALENDAR_PURPLE}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CalendarMonthOutlined sx={{ fontSize: 20, color: CALENDAR_PURPLE }} />
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
          />
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: "10px 14px", textAlign: "left", fontWeight: 700,
  color: "#64748B", background: "#F8FAFC", borderBottom: "2px solid #E2E8F0",
  whiteSpace: "nowrap", position: "sticky", top: 0,
};
const tdStyle = {
  padding: "8px 14px", borderBottom: "1px solid #F1F5F9",
  color: "#0F172A", whiteSpace: "nowrap",
};

// ── JSON List ────────────────────────────────────────────────────────────────
function JSONList({ data }) {
  const [expanded, setExpanded] = useState(true);

  const renderValue = (val) => {
    if (val === null || val === undefined) return <span style={{ color: "#94a3b8" }}>null</span>;
    if (typeof val === "boolean") return <span style={{ color: P, fontWeight: 600 }}>{val.toString()}</span>;
    if (typeof val === "number") return <span style={{ color: B, fontFamily: MONO }}>{val}</span>;
    if (typeof val === "string") return <span style={{ color: "#0F172A" }}>{val}</span>;
    if (Array.isArray(val)) return <span style={{ color: "#64748B", fontFamily: MONO }}>[{val.join(", ")}]</span>;
    if (typeof val === "object") return <NestedObject obj={val} />;
    return <span>{String(val)}</span>;
  };

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
          <SettingsOutlined sx={{ fontSize: 20, color: O }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", fontFamily: FONT }}>
            System Info
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600, color: O, background: `${O}14`,
            padding: "2px 10px", borderRadius: 20, fontFamily: MONO,
          }}>
            {Object.keys(data).length} fields
          </span>
        </div>
        {expanded
          ? <ExpandLessIcon sx={{ fontSize: 20, color: "#94a3b8" }} />
          : <ExpandMoreIcon sx={{ fontSize: 20, color: "#94a3b8" }} />
        }
      </div>
      {expanded && (
        <div style={{ padding: "8px 0" }}>
          {Object.entries(data).map(([key, val]) => (
            <div key={key} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "8px 20px", fontSize: 13, fontFamily: FONT,
            }}>
              <span style={{
                minWidth: 180, fontWeight: 600, color: "#64748B",
                fontFamily: MONO, fontSize: 12, paddingTop: 1,
              }}>
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

function NestedObject({ obj }) {
  const [open, setOpen] = useState(false);
  const keys = Object.keys(obj);
  if (!open) {
    return (
      <span
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{ color: B, cursor: "pointer", fontSize: 12, fontFamily: MONO }}
      >
        {`{ ${keys.length} fields }`}
      </span>
    );
  }
  return (
    <div style={{
      marginTop: 4, paddingLeft: 16, borderLeft: "2px solid #E2E8F0",
    }}>
      <span
        onClick={(e) => { e.stopPropagation(); setOpen(false); }}
        style={{ fontSize: 11, color: "#94a3b8", cursor: "pointer", fontFamily: MONO }}
      >
        collapse
      </span>
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 12 }}>
          <span style={{ fontWeight: 600, color: "#64748B", fontFamily: MONO }}>{k}:</span>
          <span>
            {typeof v === "object" && v !== null && !Array.isArray(v)
              ? <NestedObject obj={v} />
              : typeof v === "number"
                ? <span style={{ color: B, fontFamily: MONO }}>{v}</span>
                : Array.isArray(v)
                  ? <span style={{ color: "#64748B", fontFamily: MONO }}>[{v.join(", ")}]</span>
                  : <span style={{ color: "#0F172A" }}>{String(v)}</span>
            }
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function QualityCheckPage() {
  const [pvFile, setPvFile] = useState(null);
  const [pvData, setPvData] = useState(null);
  const [weatherFile, setWeatherFile] = useState(null);
  const [weatherData, setWeatherData] = useState(null);
  const [sysFile, setSysFile] = useState(null);
  const [sysData, setSysData] = useState(null);
  const [toast, setToast] = useState(null);
  const [pvDateFrom, setPvDateFrom] = useState(null);
  const [pvDateTo, setPvDateTo] = useState(null);
  const [weatherDateFrom, setWeatherDateFrom] = useState(null);
  const [weatherDateTo, setWeatherDateTo] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type, key: Date.now() });
  }, []);

  const pvFilteredRows = useMemo(
    () => pvData ? filterRowsByDateRange(pvData.headers, pvData.rows, pvDateFrom, pvDateTo) : [],
    [pvData, pvDateFrom, pvDateTo]
  );
  const weatherFilteredRows = useMemo(
    () => weatherData ? filterRowsByDateRange(weatherData.headers, weatherData.rows, weatherDateFrom, weatherDateTo) : [],
    [weatherData, weatherDateFrom, weatherDateTo]
  );

  return (
    <div style={{
      minHeight: "calc(100vh - 56px)", background: "#FAFBFC",
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

      {/* Page Header */}
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `${P}14`, border: `1.5px solid ${P}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <SearchOutlined sx={{ fontSize: 24, color: P }} />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", margin: 0 }}>
              Data Quality Check
            </h1>
            <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
              Upload PV data, weather data, and system configuration to inspect and validate.
            </p>
          </div>
        </div>

        {/* Upload Section */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16,
          marginTop: 28, marginBottom: 32,
        }}>
          <UploadZone
            label="PV Data (CSV)"
            icon={<SolarPowerOutlined sx={{ fontSize: 24, color: P }} />}
            accept=".csv"
            color={P}
            file={pvFile}
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
                    showToast("Backend offline — data loaded in browser (no hourly resampling).", "success");
                  } else {
                    throw err;
                  }
                }
                if (data.headers.length === 0 || data.rows.length === 0) {
                  showToast(`"${file.name}" appears empty or has no data rows.`, "error");
                  return;
                }
                setPvFile(file.name);
                setPvData(data);
                const msg = data.resampled
                  ? `PV data loaded — ${data.resampledRows} hourly rows (from ${data.originalRows} original)`
                  : `PV data loaded — ${data.rows.length} rows, ${data.headers.length} columns`;
                showToast(msg);
              } catch (err) {
                showToast(`Failed to process "${file.name}": ${err.message}`, "error");
              }
            }}
            onClear={() => { setPvFile(null); setPvData(null); setPvDateFrom(null); setPvDateTo(null); }}
            onError={(msg) => showToast(msg, "error")}
          />
          <UploadZone
            label="Weather Data (CSV)"
            icon={<WbSunnyOutlined sx={{ fontSize: 24, color: B }} />}
            accept=".csv"
            color={B}
            file={weatherFile}
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
                    showToast("Backend offline — data loaded in browser (no hourly resampling).", "success");
                  } else {
                    throw err;
                  }
                }
                if (data.headers.length === 0 || data.rows.length === 0) {
                  showToast(`"${file.name}" appears empty or has no data rows.`, "error");
                  return;
                }
                setWeatherFile(file.name);
                setWeatherData(data);
                const msg = data.resampled
                  ? `Weather data loaded — ${data.resampledRows} hourly rows (from ${data.originalRows} original)`
                  : `Weather data loaded — ${data.rows.length} rows, ${data.headers.length} columns`;
                showToast(msg);
              } catch (err) {
                showToast(`Failed to process "${file.name}": ${err.message}`, "error");
              }
            }}
            onClear={() => { setWeatherFile(null); setWeatherData(null); setWeatherDateFrom(null); setWeatherDateTo(null); }}
            onError={(msg) => showToast(msg, "error")}
          />
          <UploadZone
            label="System Info (JSON)"
            icon={<SettingsOutlined sx={{ fontSize: 24, color: O }} />}
            accept=".json"
            color={O}
            file={sysFile}
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
              showToast(`System info loaded — ${Object.keys(parsed).length} fields`);
            }}
            onClear={() => { setSysFile(null); setSysData(null); }}
            onError={(msg) => showToast(msg, "error")}
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
          {pvData && (
            <>
              <DateFilterBar
                dateFrom={pvDateFrom}
                dateTo={pvDateTo}
                onDateFromChange={setPvDateFrom}
                onDateToChange={setPvDateTo}
                onClear={() => { setPvDateFrom(null); setPvDateTo(null); }}
                totalRows={pvData?.rows?.length ?? 0}
                  filteredRows={pvFilteredRows.length}
              />
              <CSVTable
                title="PV Data"
                icon={<SolarPowerOutlined sx={{ fontSize: 20, color: P }} />}
                color={P}
                headers={pvData.headers}
                rows={pvFilteredRows}
                resampled={pvData.resampled}
                originalRows={pvData.originalRows}
              />
              <CSVChart
                title="PV Data"
                color={P}
                headers={pvData.headers}
                rows={pvFilteredRows}
              />
            </>
          )}
          {weatherData && (
            <>
              <DateFilterBar
                dateFrom={weatherDateFrom}
                dateTo={weatherDateTo}
                onDateFromChange={setWeatherDateFrom}
                onDateToChange={setWeatherDateTo}
                onClear={() => { setWeatherDateFrom(null); setWeatherDateTo(null); }}
                totalRows={weatherData?.rows?.length ?? 0}
                  filteredRows={weatherFilteredRows.length}
              />
              <CSVTable
                title="Weather Data"
                icon={<WbSunnyOutlined sx={{ fontSize: 20, color: B }} />}
                color={B}
                headers={weatherData.headers}
                rows={weatherFilteredRows}
                resampled={weatherData.resampled}
                originalRows={weatherData.originalRows}
              />
              <CSVChart
                title="Weather Data"
                color={B}
                headers={weatherData.headers}
                rows={weatherFilteredRows}
              />
            </>
          )}
          {sysData && (
            <JSONList data={sysData} />
          )}
        </div>
      </div>
    </div>
  );
}
