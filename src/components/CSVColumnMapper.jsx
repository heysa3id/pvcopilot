import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import CloudUploadOutlined from "@mui/icons-material/CloudUploadOutlined";

const FONT = "'Inter', system-ui, -apple-system, sans-serif";
const Y = "#16a34a";

// ── Synonym tables ──────────────────────────────────────────────────────────

export const PV_SYNONYMS = {
  Time: [
    "time", "timestamp", "date", "datetime", "date_time", "ts", "t",
    "hora", "temps", "zeit", "fecha", "horodatage", "zeitstempel",
    "recorded_at", "measured_at", "log_time", "sample_time",
  ],
  Current: [
    "current", "i", "idc", "isc", "imp", "amp", "amps", "a",
    "courant", "strom", "intensite", "corriente",
    "dc_current", "pv_current", "module_current", "string_current",
    "i_dc", "i_sc", "i_mp", "i_pv",
  ],
  Voltage: [
    "voltage", "v", "vdc", "voc", "vmp", "volt", "volts",
    "tension", "spannung", "voltaje",
    "dc_voltage", "pv_voltage", "module_voltage", "string_voltage",
    "v_dc", "v_oc", "v_mp", "v_pv",
  ],
  Power: [
    "power", "p", "pdc", "pmp", "watt", "watts", "w",
    "puissance", "leistung", "potencia",
    "dc_power", "pv_power", "module_power", "output_power",
    "p_dc", "p_mp", "p_pv", "p_out",
  ],
  Module_Temp: [
    "module_temp", "temp", "temperature", "t_mod", "tmod",
    "module_temperature", "cell_temp", "panel_temp", "tc",
    "temperatura", "temperatur",
    "t_cell", "t_module", "t_panel", "pv_temp",
    "back_temp", "backsheet_temp", "surface_temp",
  ],
};

export const PV_TEMPLATE_COLUMNS = ["Time", "Current", "Voltage", "Power", "Module_Temp"];

export const PV_TEMPLATE_LABELS = {
  Time: "Time",
  Current: "Current (A)",
  Voltage: "Voltage (V)",
  Power: "Power (kW)",
  Module_Temp: "Module Temp (\u00B0C)",
};

export const PV_EXPECTED_TYPES = {
  Time: "datetime",
  Current: "float",
  Voltage: "float",
  Power: "float",
  Module_Temp: "float",
};

// ── Weather / Meteo synonym tables ──────────────────────────────────────────

export const WEATHER_SYNONYMS = {
  Time: [
    "time", "timestamp", "date", "datetime", "date_time", "ts", "t",
    "hora", "temps", "zeit", "fecha", "horodatage", "zeitstempel",
    "recorded_at", "measured_at", "log_time", "sample_time",
  ],
  POA: [
    "poa", "plane_of_array", "poa_irradiance", "g_poa", "irr_poa",
    "tilted_irradiance", "gti", "gpoa", "poa_w_m2", "irradiance_poa",
  ],
  GHI: [
    "ghi", "global_horizontal", "g_hor", "global_irradiance", "irr_ghi",
    "global_horizontal_irradiance", "ghi_w_m2",
  ],
  DNI: [
    "dni", "direct_normal", "beam", "irr_dni", "direct_irradiance",
    "direct_normal_irradiance", "dni_w_m2",
  ],
  DHI: [
    "dhi", "diffuse_horizontal", "diffuse", "irr_dhi", "diffuse_irradiance",
    "diffuse_horizontal_irradiance", "dhi_w_m2",
  ],
  Air_Temp: [
    "air_temp", "ambient_temp", "t_amb", "tamb", "t_air",
    "air_temperature", "ambient_temperature", "ta", "temperatura_aire",
    "temp_air", "outdoor_temp", "t_ambient",
  ],
  RH: [
    "rh", "humidity", "relative_humidity", "rel_humidity",
    "humidite", "feuchtigkeit", "hr", "humid",
  ],
  Pressure: [
    "pressure", "atm_pressure", "baro", "barometric", "p_atm",
    "air_pressure", "pression", "druck", "atmospheric_pressure",
  ],
  Wind_speed: [
    "wind_speed", "windspeed", "ws", "wind", "wind_velocity",
    "vitesse_vent", "windgeschwindigkeit", "viento", "wind_spd",
  ],
  Rain: [
    "rain", "rainfall", "precipitation", "precip",
    "pluie", "regen", "lluvia", "rain_mm",
  ],
};

export const WEATHER_TEMPLATE_COLUMNS = [
  "Time", "POA", "GHI", "DNI", "DHI", "Air_Temp", "RH", "Pressure", "Wind_speed", "Rain",
];

export const WEATHER_TEMPLATE_LABELS = {
  Time: "Time",
  POA: "POA (W/m\u00B2)",
  GHI: "GHI (W/m\u00B2)",
  DNI: "DNI (W/m\u00B2)",
  DHI: "DHI (W/m\u00B2)",
  Air_Temp: "Air Temp (\u00B0C)",
  RH: "RH (%)",
  Pressure: "Pressure (hPa)",
  Wind_speed: "Wind Speed (m/s)",
  Rain: "Rain (mm)",
};

export const WEATHER_EXPECTED_TYPES = {
  Time: "datetime",
  POA: "float",
  GHI: "float",
  DNI: "float",
  DHI: "float",
  Air_Temp: "float",
  RH: "float",
  Pressure: "float",
  Wind_speed: "float",
  Rain: "float",
};

// ── CSV parsing utilities ───────────────────────────────────────────────────

function detectType(rows, colIdx) {
  if (colIdx == null || colIdx < 0) return "\u2014";
  const samples = [];
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const v = (rows[i][colIdx] ?? "").trim();
    if (v) samples.push(v);
  }
  if (samples.length === 0) return "\u2014";
  const allNumeric = samples.every((s) => !isNaN(Number(s)) && s !== "");
  if (allNumeric) {
    return samples.every((s) => Number.isInteger(Number(s))) ? "integer" : "float";
  }
  const allDate = samples.every((s) => !isNaN(Date.parse(s)));
  if (allDate) return "datetime";
  return "string";
}

function detectTimeFormat(rows, colIdx) {
  if (colIdx == null || colIdx < 0) return "";
  const sample = (rows[0]?.[colIdx] ?? "").trim();
  if (!sample) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(sample)) return "YYYY-MM-DDTHH:mm:ss";
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(sample)) return "YYYY-MM-DD HH:mm:ss";
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(sample)) return "YYYY-MM-DD HH:mm";
  if (/^\d{4}-\d{2}-\d{2}/.test(sample)) return "YYYY-MM-DD";
  if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/.test(sample)) return "DD/MM/YYYY HH:mm";
  if (/^\d{2}\/\d{2}\/\d{4}/.test(sample)) return "DD/MM/YYYY";
  return sample;
}

function parseTransform(expr) {
  if (!expr || !expr.trim()) return null;
  const s = expr.trim().replace(/×/g, "*");
  const m = s.match(/^([*/])?\s*([0-9]*\.?[0-9]+)$/);
  if (!m) return null;
  const val = parseFloat(m[2]);
  if (isNaN(val) || val === 0) return null;
  return (m[1] === "/") ? (1 / val) : (m[1] === "*" || !m[1]) ? val : null;
}

function parseTimeParts(value) {
  let m;
  // YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD HH:mm:ss
  m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/);
  if (m) return { Y: m[1], M: m[2], D: m[3], h: m[4], m: m[5], s: m[6] };
  // YYYY-MM-DD HH:mm
  m = value.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (m) return { Y: m[1], M: m[2], D: m[3], h: m[4], m: m[5], s: "00" };
  // YYYY-MM-DD
  m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { Y: m[1], M: m[2], D: m[3], h: "00", m: "00", s: "00" };
  // DD/MM/YYYY HH:mm:ss
  m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) return { Y: m[3], M: m[2], D: m[1], h: m[4], m: m[5], s: m[6] };
  // DD/MM/YYYY HH:mm
  m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (m) return { Y: m[3], M: m[2], D: m[1], h: m[4], m: m[5], s: "00" };
  // DD/MM/YYYY
  m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return { Y: m[3], M: m[2], D: m[1], h: "00", m: "00", s: "00" };
  return null;
}

function formatTime(parts, fmt) {
  return fmt
    .replace("YYYY", parts.Y).replace("MM", parts.M).replace("DD", parts.D)
    .replace("HH", parts.h).replace("mm", parts.m).replace("ss", parts.s);
}

function convertTimeValue(value, targetFormat) {
  if (!targetFormat || !value) return value;
  const parts = parseTimeParts(value.trim());
  if (!parts) return value;
  return formatTime(parts, targetFormat);
}

function autoDetectDelimiter(text) {
  const lines = text.split("\n").slice(0, 5);
  const candidates = [",", ";", "\t", "|"];
  let best = ",", bestCount = 0;
  for (const d of candidates) {
    let count = 0;
    for (const line of lines) {
      let inQuote = false;
      for (const ch of line) {
        if (ch === '"') inQuote = !inQuote;
        else if (ch === d && !inQuote) count++;
      }
    }
    if (count > bestCount) { bestCount = count; best = d; }
  }
  return best;
}

function parseCSVWithDelimiter(text, delimiter) {
  const rows = [];
  let current = [];
  let cell = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          cell += '"'; i++;
        } else {
          inQuote = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === delimiter) {
      current.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && i + 1 < text.length && text[i + 1] === "\n") i++;
      current.push(cell.trim());
      if (current.length > 1 || current[0] !== "") rows.push(current);
      current = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell || current.length) {
    current.push(cell.trim());
    if (current.length > 1 || current[0] !== "") rows.push(current);
  }
  return rows;
}

function autoMapColumns(sourceHeaders, templateColumns, synonymTable) {
  const mappings = {};
  const lowerSrc = sourceHeaders.map((h) => h.trim().toLowerCase().replace(/[-\s]+/g, "_"));
  for (const tpl of templateColumns) {
    const tplLower = tpl.toLowerCase().replace(/[-\s]+/g, "_");
    // Exact match first
    const exactIdx = lowerSrc.findIndex((h) => h === tplLower);
    if (exactIdx >= 0) { mappings[tpl] = exactIdx; continue; }
    // Synonym match
    const syns = (synonymTable[tpl] || []).map((s) => s.toLowerCase().replace(/[-\s]+/g, "_"));
    const synIdx = lowerSrc.findIndex((h) => syns.includes(h));
    if (synIdx >= 0) { mappings[tpl] = synIdx; continue; }
    mappings[tpl] = null;
  }
  return mappings;
}

function buildAdaptedData(sourceHeaders, sourceRows, mappings, templateColumns, transforms = {}) {
  const headers = [...templateColumns];
  const factors = {};
  for (const tpl of templateColumns) {
    factors[tpl] = parseTransform(transforms[tpl]);
  }
  const rows = sourceRows.map((row) => {
    return templateColumns.map((tpl) => {
      const srcIdx = mappings[tpl];
      if (srcIdx != null && srcIdx >= 0 && srcIdx < row.length) {
        const val = row[srcIdx];
        if (tpl === "Time" && transforms["Time"]) {
          return convertTimeValue(val, transforms["Time"]);
        }
        const f = factors[tpl];
        if (f != null && tpl !== "Time") {
          const num = parseFloat(val);
          if (!isNaN(num)) return String(num * f);
        }
        return val;
      }
      return tpl === "Time" ? "" : "0.0";
    });
  });
  return { headers, rows };
}

// ── Stepper ─────────────────────────────────────────────────────────────────

const STEPS = ["Upload", "Map columns", "Loading..."];

function Stepper({ step, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
      {STEPS.map((label, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, fontFamily: FONT,
              background: i <= step ? color : "#E2E8F0",
              color: i <= step ? "#fff" : "#94a3b8",
              transition: "all 0.25s",
            }}>
              {i < step ? "\u2713" : i + 1}
            </div>
            <span style={{
              fontSize: 13, fontWeight: i === step ? 700 : 500, fontFamily: FONT,
              color: i <= step ? "#0F172A" : "#94a3b8",
              whiteSpace: "nowrap",
            }}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{
              flex: 1, height: 2, margin: "0 12px",
              background: i < step ? color : "#E2E8F0",
              borderRadius: 1, transition: "background 0.25s",
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function CSVColumnMapper({
  open, file, onClose, onComplete,
  templateColumns = PV_TEMPLATE_COLUMNS,
  templateLabels = PV_TEMPLATE_LABELS,
  synonymTable = PV_SYNONYMS,
  expectedTypes = PV_EXPECTED_TYPES,
  requiredColumns = ["Time"],
  color = "#ff7a45",
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);
  const [sourceHeaders, setSourceHeaders] = useState([]);
  const [sourceRows, setSourceRows] = useState([]);
  const [selectedCols, setSelectedCols] = useState(new Set());
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [transforms, setTransforms] = useState({});
  const [editingField, setEditingField] = useState(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep(0);
      setError(null);
      setSourceHeaders([]);
      setSourceRows([]);
      setSelectedCols(new Set());
      setMappings({});
      setTransforms({});
      setEditingField(null);
      setLoading(false);
      setFileName("");
      // If a file was already passed, parse it immediately
      if (file) parseFile(file);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const parseFile = useCallback((f) => {
    setError(null);
    setFileName(f.name);
    const ext = f.name.split(".").pop().toLowerCase();
    if (ext !== "csv") {
      setError("Please upload a .csv file.");
      return;
    }
    if (f.size === 0) {
      setError("The file is empty.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      if (!text.trim()) { setError("The file is empty."); return; }
      const delimiter = autoDetectDelimiter(text);
      const allRows = parseCSVWithDelimiter(text, delimiter);
      if (allRows.length < 2) { setError("No data rows found in the CSV."); return; }
      const headers = allRows[0];
      const dataRows = allRows.slice(1);
      if (headers.every((h) => !h)) { setError("No headers found in the CSV."); return; }
      setSourceHeaders(headers);
      setSourceRows(dataRows);
      setSelectedCols(new Set(headers.map((_, i) => i)));
      const auto = autoMapColumns(headers, templateColumns, synonymTable);
      setMappings(auto);
      setStep(1);
    };
    reader.onerror = () => setError("Could not read the file.");
    reader.readAsText(f);
  }, [templateColumns, synonymTable]);

  const handleFileDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) parseFile(f);
  }, [parseFile]);

  const handleFileSelect = useCallback((e) => {
    const f = e.target.files[0];
    if (f) parseFile(f);
    e.target.value = "";
  }, [parseFile]);

  const toggleCol = useCallback((idx) => {
    setSelectedCols((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
    // Clear any mapping that references a deselected column
    setMappings((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key] === idx && !selectedCols.has(idx)) {
          // Will be deselected — but we check after toggle, so invert logic
        }
      }
      return next;
    });
  }, [selectedCols]);

  const setMapping = useCallback((tplCol, srcIdx) => {
    setMappings((prev) => ({ ...prev, [tplCol]: srcIdx }));
  }, []);

  const activeHeaders = useMemo(
    () => sourceHeaders.map((h, i) => ({ header: h, index: i })).filter((x) => selectedCols.has(x.index)),
    [sourceHeaders, selectedCols],
  );

  const canLoad = useMemo(
    () => requiredColumns.every((rc) => mappings[rc] != null && mappings[rc] >= 0),
    [requiredColumns, mappings],
  );

  const previewRows = useMemo(() => sourceRows.slice(0, 1000), [sourceRows]);

  const handleLoad = useCallback(() => {
    setStep(2);
    setLoading(true);
    // Use setTimeout to let the UI update before heavy computation
    setTimeout(() => {
      const adapted = buildAdaptedData(sourceHeaders, sourceRows, mappings, templateColumns, transforms);
      onComplete(adapted, fileName);
      setLoading(false);
    }, 80);
  }, [sourceHeaders, sourceRows, mappings, templateColumns, transforms, fileName, onComplete]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: "16px",
          maxHeight: "88vh",
          fontFamily: FONT,
          overflow: "hidden",
        },
      }}
      slotProps={{
        backdrop: {
          sx: { backdropFilter: "blur(4px)", background: "rgba(15,23,42,0.45)" },
        },
      }}
    >
      {/* Header */}
      <div style={{
        padding: "24px 28px 0",
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0F172A", fontFamily: FONT }}>
            CSV Column Mapper
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8", fontFamily: FONT }}>
            Map your CSV columns to PVCopilot format
          </p>
        </div>
        <IconButton onClick={onClose} size="small" sx={{ color: "#94a3b8", "&:hover": { color: "#0F172A" } }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </div>

      <DialogContent sx={{ padding: "20px 28px 28px", overflow: "auto" }}>
        <Stepper step={step} color={color} />

        {/* ── Step 0: Upload ───────────────────────────────────── */}
        {step === 0 && (
          <div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? color : "#E2E8F0"}`,
                borderRadius: 12,
                padding: "48px 20px",
                textAlign: "center",
                background: dragOver ? `${color}08` : "#FAFBFC",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: `${color}14`, border: `1.5px solid ${color}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 16px",
              }}>
                <CloudUploadOutlined sx={{ fontSize: 28, color }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", fontFamily: FONT, marginBottom: 4 }}>
                Click to browse or drag your CSV file
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: FONT }}>
                Accepts .csv files only
              </div>
            </div>

            {error && (
              <div style={{
                marginTop: 12, padding: "10px 14px", borderRadius: 8,
                background: "#fef2f2", border: "1px solid #fecaca",
                fontSize: 13, color: "#dc2626", fontFamily: FONT,
              }}>
                {error}
              </div>
            )}

            {/* Template reminder */}
            <div style={{ marginTop: 16, fontSize: 12, color: "#64748B", fontFamily: FONT }}>
              <span style={{ fontWeight: 600 }}>Target: data_pv.csv →</span>{" "}
              {templateColumns.map((col, i) => (
                <span key={col} style={{
                  display: "inline-block", padding: "2px 8px", borderRadius: 6,
                  background: `${color}12`, color, fontSize: 11, fontWeight: 600,
                  margin: "2px 3px", fontFamily: FONT,
                }}>
                  {templateLabels[col] || col}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 1: Map Columns ──────────────────────────────── */}
        {step === 1 && (
          <div>
            {/* Source file info */}
            <div style={{
              fontSize: 13, color: "#64748B", fontFamily: FONT, marginBottom: 16,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span><strong>{fileName}</strong> — {sourceHeaders.length} columns, {sourceRows.length.toLocaleString()} rows</span>
            </div>

            {/* Column toggle chips */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", fontFamily: FONT, marginBottom: 8 }}>
                Source columns (deselect irrelevant ones):
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {sourceHeaders.map((h, i) => {
                  const active = selectedCols.has(i);
                  const isMapped = Object.values(mappings).includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleCol(i)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "4px 10px", borderRadius: 20, fontSize: 12, fontFamily: FONT,
                        fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                        border: active
                          ? `1.5px solid ${isMapped ? Y : color}`
                          : "1.5px solid #E2E8F0",
                        background: active
                          ? (isMapped ? `${Y}10` : `${color}08`)
                          : "#f8fafc",
                        color: active ? "#0F172A" : "#94a3b8",
                      }}
                    >
                      <span style={{
                        width: 14, height: 14, borderRadius: 4, display: "inline-flex",
                        alignItems: "center", justifyContent: "center", fontSize: 10,
                        border: active ? `1.5px solid ${isMapped ? Y : color}` : "1.5px solid #cbd5e1",
                        background: active ? (isMapped ? Y : color) : "transparent",
                        color: active ? "#fff" : "transparent",
                      }}>
                        {active ? "\u2713" : ""}
                      </span>
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mapping rows */}
            <div style={{
              border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden",
            }}>
              {templateColumns.map((tpl, i) => {
                const mapped = mappings[tpl] != null && mappings[tpl] >= 0;
                const isRequired = requiredColumns.includes(tpl);
                return (
                  <div
                    key={tpl}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 16px",
                      background: mapped ? `${Y}06` : "transparent",
                      borderBottom: i < templateColumns.length - 1 ? "1px solid #E2E8F0" : "none",
                      transition: "background 0.2s",
                    }}
                  >
                    {/* Template column label */}
                    <div style={{
                      flex: "0 0 200px", fontSize: 13, fontWeight: 700,
                      color: "#0F172A", fontFamily: FONT,
                    }}>
                      {templateLabels[tpl] || tpl}
                      {isRequired && !mapped && (
                        <span style={{ color: "#dc2626", fontSize: 11, marginLeft: 4 }}>required</span>
                      )}
                    </div>

                    {/* Dropdown */}
                    <select
                      value={mappings[tpl] != null ? mappings[tpl] : -1}
                      onChange={(e) => setMapping(tpl, parseInt(e.target.value) >= 0 ? parseInt(e.target.value) : null)}
                      style={{
                        flex: 1, padding: "7px 12px", borderRadius: 8, fontSize: 13,
                        fontFamily: FONT, fontWeight: 500, border: "1.5px solid #E2E8F0",
                        background: "#fff", color: "#0F172A", cursor: "pointer",
                        outline: "none", appearance: "auto",
                      }}
                    >
                      <option value={-1}>— skip (leave empty) —</option>
                      {activeHeaders.map((ah) => (
                        <option key={ah.index} value={ah.index}>{ah.header}</option>
                      ))}
                    </select>

                    {/* Detected type badge */}
                    <span style={{
                      fontSize: 11, fontWeight: 600, fontFamily: FONT,
                      padding: "2px 8px", borderRadius: 6,
                      background: "#f1f5f9", color: "#64748B",
                      whiteSpace: "nowrap", flexShrink: 0,
                      minWidth: 50, textAlign: "center",
                    }}>
                      {detectType(sourceRows, mappings[tpl])}
                    </span>

                    {/* Click-to-edit transform: time format or factor */}
                    {editingField === tpl ? (
                      <input
                        type="text"
                        autoFocus
                        placeholder={tpl === "Time" ? (detectTimeFormat(sourceRows, mappings[tpl]) || "format") : "\u00d71"}
                        value={transforms[tpl] ?? (tpl === "Time" ? (detectTimeFormat(sourceRows, mappings[tpl]) || "") : "")}
                        onChange={(e) => setTransforms((prev) => ({ ...prev, [tpl]: e.target.value }))}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => { if (e.key === "Enter") setEditingField(null); }}
                        style={{
                          width: tpl === "Time" ? 140 : 64, padding: "5px 8px", borderRadius: 6, fontSize: 12,
                          fontFamily: FONT, fontWeight: 500, border: `1.5px solid ${color}`,
                          background: "#fff", color: "#0F172A", textAlign: "center",
                          outline: "none", flexShrink: 0,
                        }}
                      />
                    ) : (
                      <span
                        onClick={() => setEditingField(tpl)}
                        style={{
                          fontSize: 11, fontWeight: 500, fontFamily: FONT,
                          padding: "5px 8px", borderRadius: 6,
                          background: (transforms[tpl]) ? `${color}10` : "#f8fafc",
                          border: (transforms[tpl]) ? `1px solid ${color}40` : "1px solid #E2E8F0",
                          color: (transforms[tpl]) ? color : "#94a3b8",
                          whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer",
                          minWidth: tpl === "Time" ? 90 : 32, textAlign: "center",
                        }}
                      >
                        {tpl === "Time"
                          ? (transforms[tpl] || detectTimeFormat(sourceRows, mappings[tpl]) || "\u2014")
                          : (transforms[tpl] || "\u00d71")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Preview */}
            {previewRows.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", fontFamily: FONT, marginBottom: 8 }}>
                  Preview ({sourceRows.length > 1000 ? `first 1000 of ${sourceRows.length.toLocaleString()}` : `${previewRows.length}`} rows of source data):
                </div>
                <div style={{ overflowX: "auto", maxHeight: 370, overflowY: "auto", borderRadius: 8, border: "1px solid #E2E8F0" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                    <thead>
                      <tr>
                        {sourceHeaders.map((h, i) => (
                          <th key={i} style={{
                            padding: "6px 10px", textAlign: "left",
                            background: "#f8fafc", borderBottom: "1px solid #E2E8F0",
                            fontWeight: 700, color: selectedCols.has(i) ? "#0F172A" : "#cbd5e1",
                            whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 1,
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, ri) => (
                        <tr key={ri}>
                          {sourceHeaders.map((_, ci) => (
                            <td key={ci} style={{
                              padding: "4px 10px",
                              borderBottom: ri < previewRows.length - 1 ? "1px solid #f1f5f9" : "none",
                              color: selectedCols.has(ci) ? "#475569" : "#cbd5e1",
                              whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis",
                            }}>
                              {row[ci] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Load button */}
            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => { setStep(0); setSourceHeaders([]); setSourceRows([]); setError(null); setFileName(""); }}
                style={{
                  padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                  fontFamily: FONT, border: "1.5px solid #E2E8F0", background: "#fff",
                  color: "#64748B", cursor: "pointer",
                }}
              >
                Back
              </button>
              <button
                onClick={handleLoad}
                disabled={!canLoad}
                style={{
                  padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                  fontFamily: FONT, border: "none",
                  background: canLoad ? color : "#E2E8F0",
                  color: canLoad ? "#fff" : "#94a3b8",
                  cursor: canLoad ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                }}
              >
                Load data →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Loading ──────────────────────────────────── */}
        {step === 2 && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              border: `3px solid ${color}30`, borderTopColor: color,
              margin: "0 auto 16px", animation: "spin 0.8s linear infinite",
            }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", fontFamily: FONT }}>
              Mapping {sourceRows.length.toLocaleString()} rows...
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
