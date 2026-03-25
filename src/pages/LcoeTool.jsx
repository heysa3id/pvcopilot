import { useState, useMemo, useCallback, useEffect } from "react";
import Chart from "react-apexcharts";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import WbSunnyOutlinedIcon from "@mui/icons-material/WbSunnyOutlined";
import SolarPowerOutlinedIcon from "@mui/icons-material/SolarPowerOutlined";
import ElectricBoltOutlinedIcon from "@mui/icons-material/ElectricBoltOutlined";
import BatteryChargingFullOutlinedIcon from "@mui/icons-material/BatteryChargingFullOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import { parsePvsystPdfClient } from "../utils/parsePvsystPdfClient";
import { generateLcoeReport } from "../utils/generateLcoeReport";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import CurrencyExchangeIcon from "@mui/icons-material/CurrencyExchange";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import BookmarkAddedOutlinedIcon from "@mui/icons-material/BookmarkAddedOutlined";
import RotateLeftOutlinedIcon from "@mui/icons-material/RotateLeftOutlined";
import ShowChartOutlined from "@mui/icons-material/ShowChartOutlined";
import CalculateOutlinedIcon from "@mui/icons-material/CalculateOutlined";

// ── Currency data ─────────────────────────────────────────────────────────────
const CURRENCIES = [
  { code:"USD", symbol:"$",  name:"US Dollar" },
  { code:"EUR", symbol:"€",  name:"Euro" },
  { code:"GBP", symbol:"£",  name:"British Pound" },
  { code:"AED", symbol:"د.إ", name:"UAE Dirham" },
  { code:"SAR", symbol:"﷼",  name:"Saudi Riyal" },
  { code:"MAD", symbol:"MAD", name:"Moroccan Dirham" },
  { code:"JPY", symbol:"¥",  name:"Japanese Yen" },
  { code:"CNY", symbol:"¥",  name:"Chinese Yuan" },
  { code:"INR", symbol:"₹",  name:"Indian Rupee" },
  { code:"BRL", symbol:"R$", name:"Brazilian Real" },
  { code:"ZAR", symbol:"R",  name:"South African Rand" },
  { code:"AUD", symbol:"A$", name:"Australian Dollar" },
  { code:"CAD", symbol:"C$", name:"Canadian Dollar" },
  { code:"CHF", symbol:"Fr", name:"Swiss Franc" },
  { code:"SEK", symbol:"kr", name:"Swedish Krona" },
  { code:"NOK", symbol:"kr", name:"Norwegian Krone" },
  { code:"DKK", symbol:"kr", name:"Danish Krone" },
  { code:"PLN", symbol:"zł", name:"Polish Zloty" },
  { code:"CZK", symbol:"Kč", name:"Czech Koruna" },
  { code:"HUF", symbol:"Ft", name:"Hungarian Forint" },
  { code:"TRY", symbol:"₺",  name:"Turkish Lira" },
  { code:"MXN", symbol:"$",  name:"Mexican Peso" },
  { code:"ARS", symbol:"$",  name:"Argentine Peso" },
  { code:"CLP", symbol:"$",  name:"Chilean Peso" },
  { code:"COP", symbol:"$",  name:"Colombian Peso" },
  { code:"PEN", symbol:"S/", name:"Peruvian Sol" },
  { code:"EGP", symbol:"£",  name:"Egyptian Pound" },
  { code:"NGN", symbol:"₦",  name:"Nigerian Naira" },
  { code:"KES", symbol:"KSh",name:"Kenyan Shilling" },
  { code:"GHS", symbol:"₵",  name:"Ghanaian Cedi" },
  { code:"PKR", symbol:"₨",  name:"Pakistani Rupee" },
  { code:"BDT", symbol:"৳",  name:"Bangladeshi Taka" },
  { code:"IDR", symbol:"Rp", name:"Indonesian Rupiah" },
  { code:"MYR", symbol:"RM", name:"Malaysian Ringgit" },
  { code:"THB", symbol:"฿",  name:"Thai Baht" },
  { code:"VND", symbol:"₫",  name:"Vietnamese Dong" },
  { code:"PHP", symbol:"₱",  name:"Philippine Peso" },
  { code:"KRW", symbol:"₩",  name:"South Korean Won" },
  { code:"TWD", symbol:"NT$",name:"Taiwan Dollar" },
  { code:"SGD", symbol:"S$", name:"Singapore Dollar" },
  { code:"HKD", symbol:"HK$",name:"Hong Kong Dollar" },
  { code:"NZD", symbol:"NZ$",name:"New Zealand Dollar" },
  { code:"ILS", symbol:"₪",  name:"Israeli Shekel" },
  { code:"QAR", symbol:"﷼",  name:"Qatari Riyal" },
  { code:"KWD", symbol:"د.ك", name:"Kuwaiti Dinar" },
  { code:"BHD", symbol:"BD", name:"Bahraini Dinar" },
  { code:"OMR", symbol:"﷼",  name:"Omani Rial" },
  { code:"JOD", symbol:"JD", name:"Jordanian Dinar" },
];

// ── Constants ─────────────────────────────────────────────────────────────────
const G = "#FFB800", B = "#1d9bf0", O = "#ff7a45", Y = "#16a34a", P = "#8b5cf6";
const ICON_COLOR = G;
const fmt = (n, d = 2) => (isNaN(n)||n==null)?"—":Number(n.toFixed(d)).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtK = n => n>=1e6?`${fmt(n/1e6,2)}M`:n>=1e3?`${fmt(n/1e3,1)}k`:fmt(n,0);

const CAPEX_CATS = [
  { id:"hardware", label:"Module & Inverter Hardware", color:B, items:[
    { id:"modules",   label:"Modules",   def:200  },
    { id:"inverters", label:"Inverters", def:80   },
  ]},
  { id:"bos", label:"Balance of System", color:P, items:[
    { id:"racking",    label:"Racking & Mounting",   def:100  },
    { id:"grid",       label:"Grid Connection",      def:40   },
    { id:"cabling",    label:"Cabling / Wiring",     def:40   },
    { id:"safety",     label:"Safety & Security",    def:7.6  },
    { id:"monitoring", label:"Monitoring & Control", def:3.2  },
  ]},
  { id:"install", label:"Installation", color:Y, items:[
    { id:"mech_inst",  label:"Mechanical Installation", def:60   },
    { id:"elec_inst",  label:"Electrical Installation", def:56.9 },
    { id:"inspection", label:"Inspection",              def:8.2  },
  ]},
  { id:"soft", label:"Soft Costs", color:O, items:[
    { id:"margin",    label:"Margin",               def:47   },
    { id:"financing", label:"Financing Costs",      def:3.4  },
    { id:"design",    label:"System Design",        def:8.7  },
    { id:"permit",    label:"Permitting",           def:12.9 },
    { id:"incentive", label:"Incentive Application",def:10.9 },
    { id:"custacq",   label:"Customer Acquisition", def:3.5  },
  ]},
];

const INIT_CAPEX = Object.fromEntries(CAPEX_CATS.flatMap(c => c.items.map(i => [i.id, i.def])));
const cloneCapexCats = (cats) => cats.map((cat) => ({ ...cat, items: cat.items.map((item) => ({ ...item })) }));
const normalizeCapexName = (name) => String(name ?? "").trim().replace(/\s+/g, " ");
function makeCapexItemId(label, existingIds) {
  const base = normalizeCapexName(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "item";
  let next = base;
  let suffix = 2;
  while (existingIds.has(next)) {
    next = `${base}_${suffix}`;
    suffix += 1;
  }
  return next;
}
function titleFromItemId(itemId) {
  return String(itemId ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim() || "Custom Item";
}
/** USD/kWp from quantity × unit price (USD) and plant capacity (kWp). */
function capexPerKwpFromQtyUnit(qty, unitUsd, capacityKwp) {
  const cap = Number(capacityKwp);
  if (!Number.isFinite(cap) || cap <= 0) return 0;
  const q = Math.max(0, Number(qty) || 0);
  const u = Number(unitUsd);
  if (!Number.isFinite(u)) return 0;
  return (q * u) / cap;
}
const DEFAULTS = {
  systemCapacity:    1,
  ratedPowerAC:      8.754,
  dcAcRatio:         1.14,
  modulePower:       605,
  specificYield:     1883,
  annualEnergy:      1883,
  performanceRatio:  82.53,
  firstYearFactor:   0.975,
  linearDeg:         0.0042,
  discountRate:      5.0,
  projectLifetime:   25,
  omPerKwp:          12,
  tariffPrice:       0.09,
  capex:             INIT_CAPEX,
  _energySource:     "calculated",
};

// ── LCOE Engine ───────────────────────────────────────────────────────────────
function calcAll(p, capexCats = CAPEX_CATS) {
  const n = p.projectLifetime;
  const r = p.discountRate / 100;
  const capexUsdKwp = Object.values(p.capex).reduce((s, v) => s + (v||0), 0);
  const capexTotal  = capexUsdKwp * p.systemCapacity;
  const omAnnual    = p.omPerKwp * p.systemCapacity;

  let totalDiscE = p.annualEnergy;
  let totalDiscC = capexTotal;
  const rows = [];
  for (let t = 1; t <= n; t++) {
    const degF  = Math.max(0, p.firstYearFactor - p.linearDeg * t);
    const disc  = Math.pow(1 + r, t);
    const dE    = p.annualEnergy * degF / disc;
    const dC    = omAnnual / disc;
    totalDiscE += dE;
    totalDiscC += dC;
    rows.push({ year: t, energyMWh: p.annualEnergy * degF / 1000, degF: degF*100,
                discEnergy: dE, discCost: dC, omAnnual });
  }

  const lcoe    = totalDiscC / totalDiscE;
  const opexNpv = totalDiscC - capexTotal;
  const capacityFactor = (p.annualEnergy / (p.systemCapacity * 8760)) * 100;

  let lifeEnMWh = p.annualEnergy / 1000;
  for (let t = 1; t <= n; t++) lifeEnMWh += p.annualEnergy * Math.max(0, p.firstYearFactor - p.linearDeg * t) / 1000;

  const yr1Rev = p.annualEnergy * p.firstYearFactor * p.tariffPrice;
  const simplePayback = yr1Rev > omAnnual ? capexTotal / (yr1Rev - omAnnual) : Infinity;

  function npv(irr) {
    let v = -capexTotal;
    for (let t = 1; t <= n; t++) {
      const degF = Math.max(0, p.firstYearFactor - p.linearDeg * t);
      v += (p.annualEnergy * degF * p.tariffPrice - omAnnual) / Math.pow(1+irr, t);
    }
    return v;
  }
  let lo = -0.5, hi = 5.0, irr = null;
  if (npv(0.001) > 0) {
    for (let i = 0; i < 70; i++) { const m = (lo+hi)/2; npv(m)>0 ? (lo=m) : (hi=m); }
    irr = (lo+hi)/2*100;
  }
  const projectNpv = npv(r);

  const catTotals = capexCats.map(cat => ({
    id: cat.id, label: cat.label, color: cat.color,
    usdKwp:     cat.items.reduce((s,i) => s+(p.capex[i.id]||0), 0),
    localTotal: cat.items.reduce((s,i) => s+(p.capex[i.id]||0), 0) * p.systemCapacity,
  }));

  const cashFlowRows = [];
  let cumCashFlow = 0;
  let discPayback = null;
  let prevCum = -capexTotal;
  for (let t = 1; t <= n; t++) {
    const df    = Math.pow(1 + r, t - 1);
    const degF2 = Math.max(0, p.firstYearFactor - p.linearDeg * t);
    const rev   = p.annualEnergy * degF2 * p.tariffPrice;
    const dRev  = rev   / df;
    const dOpex = omAnnual / df;
    const dCapex = t === 1 ? capexTotal : 0;
    const dNet  = dRev - dOpex - dCapex;
    cumCashFlow += dNet;
    if (discPayback === null && cumCashFlow >= 0 && dNet > 0) {
      const frac = Math.abs(prevCum) / dNet;
      discPayback = t - 1 + frac;
    }
    prevCum = cumCashFlow;
    cashFlowRows.push({
      year: t,
      discountedRevenue:            dRev,
      discountedCapex:              -dCapex,
      discountedOpex:               -dOpex,
      discountedNetCashFlow:        dNet,
      cumulativeDiscountedCashFlow: cumCashFlow,
    });
  }

  return { lcoe, opexNpv, capexTotal, capexUsdKwp, omAnnual,
           totalDiscE, totalDiscC, capacityFactor, lifeEnMWh,
           simplePayback, irr, projectNpv, rows, catTotals,
           cashFlowRows, discountedPayback: discPayback };
}

function sensitivity(base, R, capexCats = CAPEX_CATS) {
  const params = [
    { label:"CAPEX Components",  fn:(p,f)=>({...p, capex:Object.fromEntries(Object.entries(p.capex).map(([k,v])=>[k,v*f]))})},
    { label:"Discount Rate",     fn:(p,f)=>({...p, discountRate:p.discountRate*f}) },
    { label:"Annual Energy",     fn:(p,f)=>({...p, annualEnergy:p.annualEnergy*f}) },
    { label:"O&M Cost",          fn:(p,f)=>({...p, omPerKwp:p.omPerKwp*f}) },
    { label:"Project Lifetime",  fn:(p,f)=>({...p, projectLifetime:Math.round(p.projectLifetime*f)}) },
    { label:"Degradation Rate",  fn:(p,f)=>({...p, linearDeg:p.linearDeg*f}) },
    { label:"Tariff / PPA",      fn:(p,f)=>({...p, tariffPrice:p.tariffPrice*f}) },
  ];
  return params.map(({label,fn}) => {
    const low  = calcAll(fn(base, 0.8), capexCats).lcoe;
    const high = calcAll(fn(base, 1.2), capexCats).lcoe;
    return { label, low:low-R.lcoe, high:high-R.lcoe, swing:high-low };
  }).sort((a,b)=>b.swing-a.swing);
}

// ── PVsyst PDF Parser (Python backend; set VITE_PARSER_URL for production) ──
const PARSER_URL = import.meta.env.VITE_PARSER_URL || "http://localhost:5001/api/parse-pvsyst";
const MAX_PVSYST_PDF_UPLOAD_BYTES = 10 * 1024 * 1024; // keep aligned with backend default

async function parsePVsystPDF(file) {
  const formData = new FormData();
  formData.append("file", file);
  try {
    const controller = new AbortController();
    const timeoutMs = 45000; // large enough for slower PDFs, bounded to protect concurrent users
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(PARSER_URL, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      throw new Error(data.error || `Parser error ${response.status}`);
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (e) {
    const msg = e?.message || "";
    const backendUnavailable =
      /failed to fetch|network|load failed|cors|refused|aborted|abort|timeout/i.test(msg) || e?.name === "AbortError";
    if (backendUnavailable) {
      return parsePvsystPdfClient(file);
    }
    throw e;
  }
}

// ── UI Helpers ────────────────────────────────────────────────────────────────
function Lbl({ children, sub }) {
  return (
    <div style={{ marginBottom: 5 }}>
      <span style={{
        fontSize:11,
        fontFamily:"Inter, Arial, sans-serif",
        fontWeight:600,
        color:"#1F2933",
        letterSpacing:".06em",
        textTransform:"uppercase"
      }}>
        {children}
      </span>
      {sub && <span style={{ fontSize:10, color:"#64748B", marginLeft:6 }}>{sub}</span>}
    </div>
  );
}

function NI({ label, sub, value, unit, onChange, min, max, step=1 }) {
  return (
    <div style={{ marginBottom:13 }}>
      <Lbl sub={sub}>{label}</Lbl>
      <div style={{ position:"relative" }}>
        <input type="number" value={value} min={min} max={max} step={step}
          onChange={e => onChange(parseFloat(e.target.value)||0)}
          style={{ paddingRight: unit ? 46 : 10 }} />
        {unit && <span style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)",
          fontSize:11, color:"#64748B", fontFamily:"'JetBrains Mono'", pointerEvents:"none" }}>{unit}</span>}
      </div>
    </div>
  );
}

function Sl({ label, sub, value, min, max, step, unit, onChange, dp=1 }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:7 }}>
        <Lbl sub={sub}>{label}</Lbl>
        <span style={{ fontFamily:"'JetBrains Mono'", fontSize:12, color:G }}>{fmt(value,dp)}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} />
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10,
        color:"#64748B", fontFamily:"'JetBrains Mono'", marginTop:3 }}>
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

function Card({ children, style:s, glow, className="" }) {
  return (
    <div className={className} style={{ background:"#FFFFFF", border:`1px solid ${glow?glow+"33":"#E2E8F0"}`,
      borderRadius:12, padding:"18px 20px", boxShadow:glow?`0 0 0 2px ${glow}40, 0 4px 16px ${glow}20, 0 1px 4px rgba(0,0,0,.06)` : `0 1px 3px rgba(0,0,0,.06), 0 0 0 1.5px #E2E8F0`, ...s }}>
      {children}
    </div>
  );
}

function Div({ label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, margin:"16px 0 12px" }}>
      <div style={{ flex:1, height:1, background:"#CBD5E1" }} />
      {label && <span style={{ fontSize:10, color:"#64748B", fontFamily:"Inter, Arial, sans-serif",
        fontWeight:700, letterSpacing:".1em", textTransform:"uppercase" }}>{label}</span>}
      <div style={{ flex:1, height:1, background:"#CBD5E1" }} />
    </div>
  );
}

// ── Shared ApexCharts base config ─────────────────────────────────────────────
const APEX_BASE = {
  chart: { fontFamily: "Inter, Arial, sans-serif", toolbar: { show: false }, zoom: { enabled: false }, background: "transparent" },
  grid: { borderColor: "#E2E8F0", strokeDashArray: 3 },
  tooltip: {
    theme: "light",
    style: { fontFamily: "'JetBrains Mono', monospace", fontSize: "11px" },
    y: { formatter: v => `${fmt(v, 2)}` },
  },
  legend: { fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", labels: { colors: "#64748B" } },
  xaxis: { labels: { style: { colors: "#64748B", fontSize: "10px" } }, axisBorder: { color: "#E2E8F0" }, axisTicks: { color: "#E2E8F0" } },
  yaxis: { labels: { style: { colors: "#64748B", fontSize: "10px" } } },
};

// ── Main LCoE Tool Component ──────────────────────────────────────────────────
export default function LcoeTool() {
  const [p, setP]     = useState(DEFAULTS);
  const [capexCats, setCapexCats] = useState(() => cloneCapexCats(CAPEX_CATS));
  const [panel, setPanel] = useState("system");
  const [chart, setChart] = useState("energy");
  const [hiddenCfSeries, setHiddenCfSeries] = useState({});
  const [openCat, setOpenCat] = useState({});
  const [pdfState, setPdfState] = useState({ status: "idle", filename: "", extracted: null, error: null });
  const [dragOver, setDragOver] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [showCurrencyPopup, setShowCurrencyPopup] = useState(false);
  const [showBrowserRecommendDialog, setShowBrowserRecommendDialog] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [tempCurrency, setTempCurrency] = useState("USD");
  const [tempRate, setTempRate] = useState(1);
  const [showLcoeThresholdsPopup, setShowLcoeThresholdsPopup] = useState(false);
  const [showLcoeStatusHelpPopup, setShowLcoeStatusHelpPopup] = useState(false);
  const [showLcoeMeaningPopup, setShowLcoeMeaningPopup] = useState(false);
  const [showSimplePaybackHelpPopup, setShowSimplePaybackHelpPopup] = useState(false);
  const [showDiscPaybackHelpPopup, setShowDiscPaybackHelpPopup] = useState(false);
  const [showTotalCapexHelpPopup, setShowTotalCapexHelpPopup] = useState(false);
  const [showCapacityFactorHelpPopup, setShowCapacityFactorHelpPopup] = useState(false);
  const [showIrrHelpPopup, setShowIrrHelpPopup] = useState(false);
  const [showProjectNpvHelpPopup, setShowProjectNpvHelpPopup] = useState(false);
  const [showAddCapexItemDialog, setShowAddCapexItemDialog] = useState(false);
  const [newCapexCategoryId, setNewCapexCategoryId] = useState(CAPEX_CATS[0].id);
  const [newCapexItemName, setNewCapexItemName] = useState("");
  const [newCapexItemError, setNewCapexItemError] = useState("");
  const [capexInputMode, setCapexInputMode] = useState("per_kwp");
  const [showCapexInputModePopup, setShowCapexInputModePopup] = useState(false);
  const [capexQtyById, setCapexQtyById] = useState({});
  const [capexUnitUsdById, setCapexUnitUsdById] = useState({});
  const [reportDownloadedOpen, setReportDownloadedOpen] = useState(false);
  const [lcoeExcellentMaxKwh, setLcoeExcellentMaxKwh] = useState(0.034);
  const [lcoeLowMinKwh, setLcoeLowMinKwh] = useState(0.045);

  const currObj = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0];
  const currSym = currObj.symbol;
  const cx = useCallback(v => v * exchangeRate, [exchangeRate]);

  const set = useCallback(key => val => setP(prev => {
    const next = { ...prev, [key]: val };
    if (key === "systemCapacity" || key === "specificYield") {
      const cap    = key === "systemCapacity" ? val : prev.systemCapacity;
      const yld    = key === "specificYield"  ? val : prev.specificYield;
      next.annualEnergy  = Math.round(cap * yld);
      next._energySource = "calculated";
    }
    return next;
  }), []);

  const setCapex = useCallback((id, val) =>
    setP(prev=>({...prev, capex:{...prev.capex,[id]:val}})), []);

  useEffect(() => {
    if (capexInputMode !== "quantity") return;
    const cap = Number(p.systemCapacity);
    let nextQty = capexQtyById;
    let nextUnit = capexUnitUsdById;
    let qtyChanged = false;
    let unitChanged = false;
    for (const cat of capexCats) {
      for (const item of cat.items) {
        if (nextQty[item.id] === undefined) {
          if (!qtyChanged) { nextQty = { ...capexQtyById }; qtyChanged = true; }
          nextQty[item.id] = 1;
        }
        if (nextUnit[item.id] === undefined) {
          if (!unitChanged) { nextUnit = { ...capexUnitUsdById }; unitChanged = true; }
          const q = nextQty[item.id] ?? 1;
          const pk = p.capex[item.id] ?? 0;
          nextUnit[item.id] = cap > 0 && Number.isFinite(cap) ? (pk * cap) / Math.max(q, 1e-12) : 0;
        }
      }
    }
    if (qtyChanged) setCapexQtyById(nextQty);
    if (unitChanged) setCapexUnitUsdById(nextUnit);
  }, [capexInputMode, capexCats, p.capex, p.systemCapacity, capexQtyById, capexUnitUsdById]);

  useEffect(() => {
    if (capexInputMode !== "quantity") return;
    const cap = p.systemCapacity;
    if (!cap || cap <= 0) return;
    setP((prev) => {
      const nextCapex = { ...prev.capex };
      let touched = false;
      for (const cat of capexCats) {
        for (const item of cat.items) {
          const q = Math.max(0, capexQtyById[item.id] ?? 1);
          const u = capexUnitUsdById[item.id];
          if (u === undefined || !Number.isFinite(u)) continue;
          const v = (q * u) / cap;
          if (nextCapex[item.id] !== v) touched = true;
          nextCapex[item.id] = v;
        }
      }
      if (!touched) return prev;
      return { ...prev, capex: nextCapex };
    });
  }, [p.systemCapacity, capexInputMode, capexCats, capexQtyById, capexUnitUsdById]);

  const resetAddCapexDialog = useCallback(() => {
    setNewCapexCategoryId(CAPEX_CATS[0].id);
    setNewCapexItemName("");
    setNewCapexItemError("");
  }, []);

  const closeAddCapexDialog = useCallback(() => {
    setShowAddCapexItemDialog(false);
    resetAddCapexDialog();
  }, [resetAddCapexDialog]);

  const handleApplyNewCapexItem = useCallback(() => {
    const normalizedName = normalizeCapexName(newCapexItemName);
    if (!normalizedName) {
      setNewCapexItemError("Name is required.");
      return;
    }
    const target = capexCats.find((cat) => cat.id === newCapexCategoryId);
    if (!target) {
      setNewCapexItemError("Please select a category.");
      return;
    }
    const hasDuplicateName = target.items.some((item) => normalizeCapexName(item.label).toLowerCase() === normalizedName.toLowerCase());
    if (hasDuplicateName) {
      setNewCapexItemError("This item already exists in the selected category.");
      return;
    }
    const existingIds = new Set(capexCats.flatMap((cat) => cat.items.map((item) => item.id)));
    const id = makeCapexItemId(normalizedName, existingIds);
    const newItem = { id, label: normalizedName, def: 0, custom: true };
    setCapexCats((prev) => prev.map((cat) => (
      cat.id === newCapexCategoryId ? { ...cat, items: [...cat.items, newItem] } : cat
    )));
    setP((prev) => ({ ...prev, capex: { ...prev.capex, [id]: 0 } }));
    setCapexQtyById((prev) => ({ ...prev, [id]: 1 }));
    setCapexUnitUsdById((prev) => ({ ...prev, [id]: 0 }));
    setOpenCat((prev) => ({ ...prev, [newCapexCategoryId]: true }));
    closeAddCapexDialog();
  }, [capexCats, newCapexCategoryId, newCapexItemName, closeAddCapexDialog]);

  const handleSaveTemplate = useCallback(() => {
    const grouped = {};
    for (const cat of capexCats) {
      grouped[cat.label] = Object.fromEntries(
        cat.items.map(i => [i.id, p.capex[i.id] ?? i.def])
      );
    }
    const blob = new Blob([JSON.stringify(grouped, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "capex_template.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [capexCats, p.capex]);

  const handleLoadTemplate = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (typeof data === "object" && data !== null && !Array.isArray(data)) {
            const categoryEntries = new Map(
              Object.entries(data).map(([k, v]) => [String(k).trim().toLowerCase(), v])
            );
            const requiredLabels = CAPEX_CATS.map((c) => c.label.toLowerCase());
            const hasAllCategories = requiredLabels.every((label) => categoryEntries.has(label));
            if (!hasAllCategories) return;

            const baseByCategory = new Map(capexCats.map((cat) => [cat.id, cat]));
            const nextCats = capexCats.map((cat) => ({ ...cat, items: [...cat.items] }));
            const flat = {};
            const knownIds = new Set(capexCats.flatMap((cat) => cat.items.map((item) => item.id)));

            for (const baseCat of CAPEX_CATS) {
              const incoming = categoryEntries.get(baseCat.label.toLowerCase());
              if (typeof incoming !== "object" || incoming === null || Array.isArray(incoming)) continue;
              const runtimeCat = nextCats.find((c) => c.id === baseCat.id) || baseByCategory.get(baseCat.id);
              if (!runtimeCat) continue;
              const labelsToIds = new Map(runtimeCat.items.map((item) => [normalizeCapexName(item.label).toLowerCase(), item.id]));

              for (const [rawItemKey, rawItemValue] of Object.entries(incoming)) {
                const itemValue = Number(rawItemValue);
                if (!Number.isFinite(itemValue)) continue;
                const itemKey = String(rawItemKey).trim();
                if (!itemKey) continue;

                let resolvedId = knownIds.has(itemKey) ? itemKey : labelsToIds.get(normalizeCapexName(itemKey).toLowerCase());
                if (!resolvedId) {
                  resolvedId = makeCapexItemId(itemKey, knownIds);
                  knownIds.add(resolvedId);
                  labelsToIds.set(normalizeCapexName(itemKey).toLowerCase(), resolvedId);
                  runtimeCat.items.push({
                    id: resolvedId,
                    label: normalizeCapexName(itemKey),
                    def: 0,
                    custom: true,
                  });
                }
                flat[resolvedId] = itemValue;
              }
            }

            setCapexCats(nextCats);
            setP((prev) => ({ ...prev, capex: { ...prev.capex, ...flat } }));
          }
        } catch { /* ignore invalid JSON */ }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [capexCats]);

  const handlePDF = useCallback(async (file) => {
    if (!file) {
      setPdfState({ status: "error", filename: file?.name || "", extracted: null, error: "Please upload a PDF file." });
      return;
    }
    const isPdfByName = /\.pdf$/i.test(file.name || "");
    if (!isPdfByName && file.type && file.type !== "application/pdf") {
      setPdfState({ status: "error", filename: file.name, extracted: null, error: "Please upload a PDF file." });
      return;
    }
    if (Number.isFinite(file.size) && file.size > MAX_PVSYST_PDF_UPLOAD_BYTES) {
      const maxMb = Math.round((MAX_PVSYST_PDF_UPLOAD_BYTES / (1024 * 1024)) * 10) / 10;
      setPdfState({
        status: "error",
        filename: file.name,
        extracted: null,
        error: `PDF too large. Max ${maxMb} MB.`,
      });
      return;
    }
    setPdfState({ status: "loading", filename: file.name, extracted: null, error: null });
    try {
      const extracted = await parsePVsystPDF(file);
      const pdfCap   = extracted.systemCapacity ?? null;
      const pdfYield = extracted.specificYield  ?? null;
      const pdfEnergy = extracted.annualEnergy  ?? (pdfCap && pdfYield ? Math.round(pdfCap * pdfYield) : null);
      setP(prev => ({
        ...prev,
        ...(pdfCap                              && { systemCapacity:   pdfCap }),
        ...(extracted.specificYield  != null    && { specificYield:    extracted.specificYield }),
        ...(extracted.performanceRatio != null  && { performanceRatio: extracted.performanceRatio }),
        ...(pdfEnergy != null                   && { annualEnergy:     pdfEnergy }),
        ...(extracted.degradationRate != null   && { linearDeg:        extracted.degradationRate / 100 }),
        ...(extracted.ratedPowerAC   != null    && { ratedPowerAC:     extracted.ratedPowerAC }),
        ...(extracted.dcAcRatio      != null    && { dcAcRatio:        extracted.dcAcRatio }),
        ...(extracted.modulePower    != null    && { modulePower:      extracted.modulePower }),
        ...(extracted.numModules     != null    && { numModules:       extracted.numModules }),
        _energySource: "pdf",
      }));
      setPdfState({ status: "done", filename: file.name, extracted, error: null });
      setPanel("system");
    } catch(e) {
      const msg = e?.message || "PDF parsing failed.";
      setPdfState({ status: "error", filename: file.name, extracted: null, error: msg });
      const clientParserLikely =
        /client-side pdf|pdf engine failed|pdfjs|worker|undefined is not a function/i.test(msg);
      if (clientParserLikely) setShowBrowserRecommendDialog(true);
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    handlePDF(e.dataTransfer.files[0]);
  }, [handlePDF]);

  const R   = useMemo(() => calcAll(p, capexCats), [p, capexCats]);
  const sens = useMemo(() => sensitivity(p, R, capexCats), [p, R, capexCats]);
  const lcoeMwh = R.lcoe * 1000;
  const excellentMaxKwh = lcoeExcellentMaxKwh;
  const lowMinKwh = lcoeLowMinKwh;
  const lcoeColor  = R.lcoe > lowMinKwh ? "#dc2626" : R.lcoe < excellentMaxKwh ? Y : G;
  const lcoeRating = R.lcoe > lowMinKwh ? "Low" : R.lcoe < excellentMaxKwh ? "Excellent" : "Acceptable";

  return (
    <div style={{ minHeight:"100vh", background:"#FFFFFF", fontFamily:"Inter, Arial, sans-serif",
      color:"#0F172A", padding:"28px 20px" }}>

      {/* LCOE status thresholds popup */}
      <Dialog open={showLcoeThresholdsPopup} onClose={() => setShowLcoeThresholdsPopup(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, fontSize: 16 }}>
          LCOE status thresholds ({currSym}/kWh)
        </DialogTitle>
        <DialogContent>
          <p style={{ fontSize: 12, color: "#64748B", marginBottom: 16 }}>
            Set the {currSym}/kWh limits used to label LCOE as Excellent, Acceptable, or Low.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6 }}>
                Excellent (max)
              </label>
              <input
                type="number"
                value={lcoeExcellentMaxKwh}
                min={0}
                max={1}
                step={0.001}
                onChange={e => setLcoeExcellentMaxKwh(parseFloat(e.target.value) || 0)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}
              />
              <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>{currSym}/kWh — LCOE below this = Excellent</span>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6 }}>
                Low (min)
              </label>
              <input
                type="number"
                value={lcoeLowMinKwh}
                min={0}
                max={1}
                step={0.001}
                onChange={e => setLcoeLowMinKwh(parseFloat(e.target.value) || 0)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}
              />
              <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 8 }}>{currSym}/kWh — LCOE above this = Low</span>
            </div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>
              Between these two = Acceptable.
            </div>
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowLcoeThresholdsPopup(false)}>Close</Button>
          <Button onClick={() => setShowLcoeThresholdsPopup(false)} variant="contained" sx={{ bgcolor: G, "&:hover": { bgcolor: "#e6a200" } }}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>

      {/* LCOE meaning & equation popup */}
      <Dialog open={showLcoeMeaningPopup} onClose={() => setShowLcoeMeaningPopup(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>What is Levelized Cost of Energy (LCOE)?</DialogTitle>
        <DialogContent>
          <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, marginBottom: 12 }}>
            <strong>LCOE</strong> is the average cost per unit of energy (e.g. per kWh) over the project lifetime, in today&apos;s money. It allows you to compare different energy sources or projects on an equal basis. Lower LCOE means cheaper energy.
          </p>
          <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, marginBottom: 12 }}>
            All future costs (CAPEX at start, annual O&amp;M) and energy production are discounted to present value, then LCOE = total discounted costs ÷ total discounted energy.
          </p>
          <div style={{ background: "#FFFBEB", borderRadius: 12, padding: 16, border: "1px solid #FDE68A", marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8 }}>
              Equation used
            </div>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, fontFamily: "'JetBrains Mono', monospace" }}>
              <div style={{ marginBottom: 6 }}>LCOE = Σ Costₜ/(1+r)ᵗ ÷ Σ Eₜ/(1+r)ᵗ</div>
              <div style={{ fontSize: 12, marginTop: 8 }}>E₀ = annual energy (year 0, no degradation)</div>
              <div>Eₜ = E₀ × (f₁ − d×t), t ≥ 1 &nbsp;&nbsp;(linear degradation)</div>
              <div style={{ marginTop: 4 }}>Cost₀ = CAPEX</div>
              <div>Costₜ = annual O&amp;M (constant), t ≥ 1</div>
              <div style={{ marginTop: 6, fontSize: 11, color: "#64748B" }}>r = discount rate, t = year</div>
            </div>
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowLcoeMeaningPopup(false)} variant="outlined" size="small">Close</Button>
        </DialogActions>
      </Dialog>

      {/* LCOE status logic help popup */}
      <Dialog open={showLcoeStatusHelpPopup} onClose={() => setShowLcoeStatusHelpPopup(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>LCOE status logic</DialogTitle>
        <DialogContent>
          <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, marginBottom: 12 }}>
            The status (Excellent, Acceptable, Low) is based on your LCOE compared to two thresholds in {currSym}/kWh:
          </p>
          <ul style={{ fontSize: 13, color: "#475569", lineHeight: 1.8, paddingLeft: 20, margin: "0 0 16px" }}>
            <li><strong>Excellent</strong> — LCOE below the &quot;Excellent (max)&quot; threshold</li>
            <li><strong>Acceptable</strong> — LCOE between the two thresholds</li>
            <li><strong>Low</strong> — LCOE above the &quot;Low (min)&quot; threshold</li>
          </ul>
          <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, margin: 0 }}>
            <strong>Click the status badge</strong> (Excellent / Acceptable / Low) next to the LCOE value to open the thresholds popup and input or change these values.
          </p>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowLcoeStatusHelpPopup(false)}>Close</Button>
          <Button onClick={() => { setShowLcoeStatusHelpPopup(false); setShowLcoeThresholdsPopup(true); }} variant="contained" sx={{ bgcolor: G, "&:hover": { bgcolor: "#e6a200" } }}>
            Open thresholds
          </Button>
        </DialogActions>
      </Dialog>

      {/* Simple Payback help popup */}
      <Dialog open={showSimplePaybackHelpPopup} onClose={() => setShowSimplePaybackHelpPopup(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>What is Simple Payback?</DialogTitle>
        <DialogContent>
          <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, margin: 0 }}>
            <strong>Simple Payback</strong> is how many years it takes to recover your initial investment (CAPEX) from the project&apos;s net income. No discounting is applied.
          </p>
          <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, marginTop: 10, marginBottom: 0, fontFamily: "inherit" }}>
            <strong>Equation:</strong><br />
            Year 1 revenue = Annual energy (kWh) × First-year factor × Tariff (per kWh)<br />
            Simple Payback (years) = Total CAPEX ÷ (Year 1 revenue − Annual O&M)
          </p>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowSimplePaybackHelpPopup(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Disc. Payback (TRI) help popup */}
      <Dialog open={showDiscPaybackHelpPopup} onClose={() => setShowDiscPaybackHelpPopup(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>What is Disc. Payback (TRI)?</DialogTitle>
        <DialogContent>
          <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, margin: 0 }}>
            <strong>Discounted Payback</strong> is how many years it takes for the project&apos;s cumulative discounted net cash flow to reach zero (the green line crossing zero on the Cash Flow chart).
          </p>
          <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, marginTop: 10, marginBottom: 0 }}>
            <strong>Equation:</strong><br />
            Discount factor in year t: DF_t = (1 + r)^(t−1), with r = discount rate<br />
            Discounted net CF in year t = (Revenue_t − O&M_t) ÷ DF_t (and −CAPEX in year 1 only)<br />
            Discounted payback = time when cumulative Σ Discounted net CF = 0
          </p>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowDiscPaybackHelpPopup(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Total CAPEX help popup */}
      <Dialog open={showTotalCapexHelpPopup} onClose={() => setShowTotalCapexHelpPopup(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>What is Total CAPEX?</DialogTitle>
        <DialogContent>
          <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, margin: 0 }}>
            <strong>Total CAPEX</strong> (capital expenditure) is the full upfront cost to build the PV system (modules, inverters, BOS, installation, soft costs).
          </p>
          <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, marginTop: 10, marginBottom: 0 }}>
            <strong>Equation:</strong><br />
            Total CAPEX = Σ (each CAPEX item per kWp) × System capacity (kWp)<br />
            Cost per kWp = Total CAPEX ÷ System capacity (kWp)
          </p>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowTotalCapexHelpPopup(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Capacity Factor help popup */}
      <Dialog open={showCapacityFactorHelpPopup} onClose={() => setShowCapacityFactorHelpPopup(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>What is Capacity Factor?</DialogTitle>
        <DialogContent>
          <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, margin: 0 }}>
            <strong>Capacity Factor</strong> is the ratio of actual energy produced to the energy the system would produce at full nameplate power 24/7. Expressed as %; typical PV is about 15–25%.
          </p>
          <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, marginTop: 10, marginBottom: 0 }}>
            <strong>Equation:</strong><br />
            Capacity Factor (%) = [Annual energy (kWh) ÷ (System capacity (kWp) × 8760 h)] × 100
          </p>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowCapacityFactorHelpPopup(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* IRR / Project IRR help popup */}
      <Dialog open={showIrrHelpPopup} onClose={() => setShowIrrHelpPopup(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>What is IRR (Project IRR)?</DialogTitle>
        <DialogContent>
          <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, margin: 0 }}>
            <strong>IRR</strong> (Internal Rate of Return) is the discount rate at which the project&apos;s NPV equals zero—the &quot;effective&quot; annual return. If IRR &gt; your cost of capital (WACC), the project is attractive.
          </p>
          <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, marginTop: 10, marginBottom: 0 }}>
            <strong>Equation:</strong><br />
            IRR is the rate r such that: −CAPEX + Σ_t [(Revenue_t − O&M_t) ÷ (1 + r)^t] = 0<br />
            where Revenue_t = Annual energy × degradation factor in year t × Tariff.
          </p>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowIrrHelpPopup(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Project NPV help popup */}
      <Dialog open={showProjectNpvHelpPopup} onClose={() => setShowProjectNpvHelpPopup(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>What is Project NPV?</DialogTitle>
        <DialogContent>
          <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, margin: 0 }}>
            <strong>NPV</strong> (Net Present Value) is the value of all future cash flows discounted to today, minus the initial CAPEX. A positive NPV means the project adds value at your discount rate (WACC).
          </p>
          <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, marginTop: 10, marginBottom: 0 }}>
            <strong>Equation:</strong><br />
            NPV = −CAPEX + Σ_t [(Revenue_t − O&M_t) ÷ (1 + r)^t]<br />
            where r = discount rate (WACC), Revenue_t = Annual energy × degradation factor_t × Tariff, and the sum runs over the project lifetime.
          </p>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowProjectNpvHelpPopup(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Report downloaded success popup */}
      <Snackbar
        open={reportDownloadedOpen}
        autoHideDuration={4000}
        onClose={() => setReportDownloadedOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setReportDownloadedOpen(false)} severity="success" sx={{ width: "100%" }}>
          Report downloaded successfully.
        </Alert>
      </Snackbar>

      {/* Parse failed: recommend Chrome or Opera */}
      <Dialog open={showBrowserRecommendDialog} onClose={() => setShowBrowserRecommendDialog(false)}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningAmberOutlinedIcon sx={{ color: O }} />
          PDF parsing failed
        </DialogTitle>
        <DialogContent>
          <p style={{ margin: 0, color: "#334155" }}>
            This browser may not support PDF parsing correctly. For the best experience, please try again using <strong>Chrome</strong> or <strong>Opera</strong>.
          </p>
          {pdfState.error && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>{pdfState.error}</p>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBrowserRecommendDialog(false)} variant="contained" sx={{ bgcolor: G, "&:hover": { bgcolor: "#e6a200" } }}>
            OK
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={showAddCapexItemDialog} onClose={closeAddCapexDialog} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>Add CAPEX Item</DialogTitle>
        <DialogContent>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6 }}>
                Category
              </label>
              <select
                value={newCapexCategoryId}
                onChange={(e) => setNewCapexCategoryId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #E2E8F0",
                  background: "#fff",
                  color: "#0F172A",
                  fontSize: 12,
                  fontFamily: "Inter, Arial, sans-serif",
                }}
              >
                {capexCats.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6 }}>
                Name
              </label>
              <input
                type="text"
                value={newCapexItemName}
                onChange={(e) => {
                  setNewCapexItemName(e.target.value);
                  if (newCapexItemError) setNewCapexItemError("");
                }}
                placeholder="e.g. Battery"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #E2E8F0",
                  fontSize: 12,
                  color: "#0F172A",
                  fontFamily: "Inter, Arial, sans-serif",
                }}
              />
              {newCapexItemError ? (
                <div style={{ marginTop: 6, fontSize: 11, color: "#dc2626" }}>{newCapexItemError}</div>
              ) : null}
            </div>
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeAddCapexDialog}>Cancel</Button>
          <Button onClick={handleApplyNewCapexItem} variant="contained" sx={{ bgcolor: G, "&:hover": { bgcolor: "#e6a200" } }}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>

      {/* ──────────── TOOL OVERVIEW (COLLAPSIBLE) ──────────── */}
      <div className="lcoe-page-wrap" style={{ maxWidth:1380, margin:"0 auto 24px", padding:"0 20px" }}>
        <Card>
          <div
            className="lcoe-overview-header"
            style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", cursor:"pointer", gap:16 }}
            onClick={() => setOverviewOpen(o => !o)}
          >
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div style={{
                width:44, height:44, borderRadius:12,
                background:`${G}14`, border:`1.5px solid ${G}30`,
                display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
              }}>
                <CurrencyExchangeIcon sx={{ fontSize:24, color:G }} />
              </div>
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:"#0F172A" }}>
                  PV LCOE and payback calculator
                </div>
                <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>
                  Estimate levelized cost of energy, discounted payback, and key financial indicators.
                </div>
              </div>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", justifyContent:"flex-end" }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open("/docs?module=lcoe-tool", "_blank", "noopener,noreferrer");
                }}
                style={{
                  display:"inline-flex",
                  alignItems:"center",
                  gap:6,
                  padding:"5px 10px",
                  borderRadius:8,
                  background:"#F1F5F9",
                  border:"1px solid #CBD5E1",
                  color:"#475569",
                  fontSize:11,
                  fontWeight:600,
                  fontFamily:"Inter, Arial, sans-serif",
                  cursor:"pointer",
                  whiteSpace:"nowrap",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "#E2E8F0";
                  e.currentTarget.style.borderColor = "#94A3B8";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "#F1F5F9";
                  e.currentTarget.style.borderColor = "#CBD5E1";
                }}
              >
                <DescriptionOutlinedIcon sx={{ fontSize: 14, color:"#64748B" }} />
                Read Docs
              </button>
              <div style={{ borderRadius:"999px", background:"#F8FAFC", border:"1px solid #E2E8F0", padding:4, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {overviewOpen ? (
                  <ExpandLessIcon sx={{ fontSize:18, color:"#94a3b8" }} />
                ) : (
                  <ExpandMoreIcon sx={{ fontSize:18, color:"#94a3b8" }} />
                )}
              </div>
            </div>
          </div>
          {overviewOpen && (
            <div className="lcoe-overview-grid" style={{ marginTop:20, display:"grid", gridTemplateColumns:"2fr 2fr 1.6fr", gap:16 }}>
              {/* Overview & Assumptions */}
              <div style={{ background:"#FFFBEB", borderRadius:12, padding:18, border:"1px solid #FDE68A" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#0F172A", letterSpacing:".08em", textTransform:"uppercase", marginBottom:4 }}>
                  Overview & Assumptions
                </div>
                <p style={{ fontSize:12, color:"#475569", lineHeight:1.7, marginBottom:10 }}>
                  This tool estimates project economics for a utility-scale PV system using discounted lifecycle
                  costs and discounted energy output. It combines production assumptions, a linear degradation model,
                  detailed CAPEX, and constant annual O&amp;M to calculate LCOE, discounted payback, and supporting
                  financial indicators.
                </p>
                <ul style={{ fontSize:12, color:"#64748B", lineHeight:1.6, paddingLeft:18, margin:0 }}>
                  <li>Discounted cash-flow with WACC applied to both costs and energy.</li>
                  <li>Linear annual degradation using first-year factor f₁ and yearly loss d.</li>
                  <li>CAPEX applied upfront and O&amp;M treated as constant annual cost.</li>
                </ul>
              </div>

              {/* LCOE formula & parameters */}
              <div style={{ background:"#FFFBEB", borderRadius:12, padding:18, border:"1px solid #FDE68A" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#0F172A", letterSpacing:".08em", textTransform:"uppercase", marginBottom:4 }}>
                  LCOE formula &amp; parameters
                </div>
                <div style={{ fontSize:12, color:"#475569", lineHeight:1.6, fontFamily:"'JetBrains Mono'" }}>
                  <div style={{ marginBottom:6 }}>
                    LCOE = Σ Costₜ/(1+r)ᵗ / Σ Eₜ/(1+r)ᵗ
                  </div>
                  <div>E₀ = E_grid (yr 0, no degradation)</div>
                  <div>Eₜ = E₀ × (f₁ − d×t), t ≥ 1</div>
                  <div>Cost₀ = CAPEX · Costₜ = O&amp;M (constant)</div>
                </div>
                <div style={{ marginTop:10, fontSize:11, color:"#64748B", lineHeight:1.5 }}>
                  WACC = {fmt(p.discountRate,2)}% · Time = {p.projectLifetime} yrs<br/>
                  f₁ = {fmt(p.firstYearFactor,3)} · d = {fmt(p.linearDeg*100,2)} %/yr
                </div>
              </div>

              {/* Key results snapshot */}
              <div style={{ background:"#FFFBEB", borderRadius:12, padding:18, border:"1px solid #FDE68A" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#0F172A", letterSpacing:".08em", textTransform:"uppercase", marginBottom:4 }}>
                  Key results (current inputs)
                </div>
                <div style={{ fontSize:12, color:"#1F2933", lineHeight:1.6, fontFamily:"'JetBrains Mono'" }}>
                  <div>LCOE = {fmt(cx(R.lcoe),4)} {currency}/kWh</div>
                  <div>CAPEX = {currSym}{fmtK(cx(R.capexTotal))}</div>
                  <div>NPV Costs = {currSym}{fmtK(cx(R.totalDiscC))}</div>
                  <div>Disc. Energy ≈ {fmt(R.totalDiscE/1000,2)} MWh</div>
                </div>
                <p style={{ fontSize:11, color:"#64748B", marginTop:8, lineHeight:1.6 }}>
                  Use this card as a quick methodology reference before exploring the SYSTEM, CAPEX, and FINANCE panels.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="lcoe-main-grid" style={{ maxWidth:1380, margin:"0 auto 40px", padding:"0 20px", display:"grid", gridTemplateColumns:"360px 1fr", gap:"20px", alignItems:"start" }}>
        {/* ──────────── LEFT PANEL ──────────── */}
        <div className="left-panel" style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {/* ── PDF Upload Zone ── */}
          <div
            onDragOver={e=>{e.preventDefault();setDragOver(true)}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={onDrop}
            style={{
              border: `2px dashed ${dragOver ? G : pdfState.status==="done" ? G+"66" : pdfState.status==="error" ? O+"66" : "#E2E8F0"}`,
              borderRadius:10, padding:"16px 18px", cursor:"pointer",
              background: dragOver ? `${G}08` : pdfState.status==="done" ? `${G}06` : "#fffdf7",
              transition:"all .2s", position:"relative"
            }}
            onClick={()=>document.getElementById("pdf-input").click()}
          >
            <input id="pdf-input" type="file" accept=".pdf" style={{ display:"none" }}
              onChange={e=>handlePDF(e.target.files[0])} />
            {pdfState.status === "idle" && (
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", width:32, height:32, borderRadius:8, background:`${G}10`, border:`1px solid ${G}30` }}>
                  <DescriptionOutlinedIcon sx={{ fontSize:20, color: ICON_COLOR }} />
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:"#475569" }}>Load PVsyst Report</div>
                  <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>Drop PDF here or click to browse · auto-fills system parameters (works online)</div>
                </div>
              </div>
            )}
            {pdfState.status === "loading" && (
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", width:28, height:28, borderRadius:"50%", background:`${G}10`, animation:"spin 1s linear infinite" }}>
                  <AutorenewOutlinedIcon sx={{ fontSize:18, color: ICON_COLOR }} />
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:G }}>Parsing report…</div>
                  <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>{pdfState.filename}</div>
                </div>
              </div>
            )}
            {pdfState.status === "done" && pdfState.extracted && (
              <div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <CheckCircleOutlineIcon sx={{ fontSize:18, color: G }} />
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:G }}>
                        {pdfState.extracted.projectName || "Report"} loaded
                        {pdfState.extracted.pvSystVersion && <span style={{ color:"#94a3b8", fontWeight:400 }}> · PVsyst {pdfState.extracted.pvSystVersion}</span>}
                      </div>
                      <div style={{ fontSize:10, color:"#94a3b8" }}>{pdfState.filename}</div>
                    </div>
                  </div>
                  <button onClick={e=>{e.stopPropagation();setPdfState({status:"idle",filename:"",extracted:null,error:null});
                    setP(prev => ({ ...prev, _energySource: "calculated", annualEnergy: Math.round(prev.systemCapacity * prev.specificYield) }))}}
                    style={{ background:"none", border:"1px solid #E2E8F0", borderRadius:4, padding:"3px 8px",
                      color:"#64748B", fontSize:10, cursor:"pointer", fontFamily:"Inter, Arial, sans-serif" }}>Clear</button>
                </div>
                {pdfState.extracted.systemType && (
                  <div style={{ marginBottom:8 }}>
                    <span style={{
                      background: pdfState.extracted.systemType.includes("battery") ? `${Y}18` : `${G}18`,
                      color: pdfState.extracted.systemType.includes("battery") ? Y : G,
                      border: `1px solid ${pdfState.extracted.systemType.includes("battery") ? Y : G}44`,
                      borderRadius:20, padding:"2px 10px", fontSize:10, fontWeight:700, letterSpacing:".06em"
                    }}>
                      {pdfState.extracted.systemType === "battery" ? (
                        <>
                          <BatteryChargingFullOutlinedIcon sx={{ fontSize:14, color: Y }} style={{ marginRight:4 }} />
                          Battery / Self-Consumption
                        </>
                      ) : pdfState.extracted.systemType === "grid-connected-battery" ? (
                        <>
                          <BatteryChargingFullOutlinedIcon sx={{ fontSize:14, color: Y }} style={{ marginRight:2 }} />
                          <ElectricBoltOutlinedIcon sx={{ fontSize:14, color: G }} style={{ marginRight:4 }} />
                          Grid + Battery
                        </>
                      ) : (
                        <>
                          <ElectricBoltOutlinedIcon sx={{ fontSize:14, color: G }} style={{ marginRight:4 }} />
                          Grid-Connected
                        </>
                      )}
                    </span>
                    {pdfState.extracted.simulationYear && (
                      <span style={{ marginLeft:8, fontSize:10, color:"#94a3b8" }}>Year {pdfState.extracted.simulationYear} simulation</span>
                    )}
                  </div>
                )}
                <div className="lcoe-input-row" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5 }}>
                  {[
                    { l:"kWp DC",       u:"kWp",      v:pdfState.extracted.systemCapacity },
                    { l:"E_Solar/Grid", u:"kWh/yr",   v:pdfState.extracted.annualEnergy ? Math.round(pdfState.extracted.annualEnergy).toLocaleString() : null },
                    { l:"PR",           u:"%",         v:pdfState.extracted.performanceRatio },
                    { l:"Spec. Yield",  u:"kWh/kWp",  v:pdfState.extracted.specificYield },
                    { l:"kWac",         u:"kWac",      v:pdfState.extracted.ratedPowerAC },
                    { l:"DC/AC",        u:"",          v:pdfState.extracted.dcAcRatio },
                    { l:"Degradation",  u:"%/yr",      v:pdfState.extracted.degradationRate },
                    { l:"Modules",      u:"×"+( pdfState.extracted.modulePower||"")+"Wp", v:pdfState.extracted.numModules },
                  ].filter(x=>x.v!=null).map(({l,u,v})=>(
                    <div key={l} style={{ background:"#FFF8E1", borderRadius:5, padding:"5px 8px", border:"1.5px solid #FFE082" }}>
                      <span style={{ fontSize:9, color:"#64748B", fontWeight:700, letterSpacing:".06em", textTransform:"uppercase" }}>{l} </span>
                      <span style={{ fontFamily:"'JetBrains Mono'", fontSize:11, color:G }}>
                        {v} <span style={{ color:"#64748B", fontSize:9 }}>{u}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:8, display:"flex", flexWrap:"wrap", gap:6 }}>
                  {pdfState.extracted.location && (
                    <span style={{ fontSize:10, color:"#64748B" }}>
                      <LocationOnOutlinedIcon sx={{ fontSize:12, color: ICON_COLOR }} style={{ marginRight:2 }} />
                      {pdfState.extracted.location}{pdfState.extracted.country ? ", "+pdfState.extracted.country : ""}
                      {pdfState.extracted.latitude != null ? ` (${fmt(pdfState.extracted.latitude,2)}°N, ${fmt(Math.abs(pdfState.extracted.longitude),2)}°${pdfState.extracted.longitude<0?"W":"E"})` : ""}
                    </span>
                  )}
                  {pdfState.extracted.ghi && (
                    <span style={{ fontSize:10, color:"#94a3b8", display:"inline-flex", alignItems:"center", gap:4 }}>
                      <WbSunnyOutlinedIcon sx={{ fontSize:12, color: ICON_COLOR }} />
                      GHI {fmt(pdfState.extracted.ghi,0)} · GTI {fmt(pdfState.extracted.gti,0)} kWh/m²
                    </span>
                  )}
                </div>
                {(pdfState.extracted.moduleModel || pdfState.extracted.inverterModel) && (
                  <div style={{ marginTop:5, fontSize:10, color:"#94a3b8", lineHeight:1.6 }}>
                    {pdfState.extracted.moduleManufacturer && pdfState.extracted.moduleModel &&
                      <span>
                        <SolarPowerOutlinedIcon sx={{ fontSize:11, color: ICON_COLOR }} style={{ marginRight:4 }} />
                        {pdfState.extracted.moduleManufacturer} {pdfState.extracted.moduleModel} &nbsp;
                      </span>}
                    {pdfState.extracted.inverterManufacturer && pdfState.extracted.inverterModel &&
                      <span>
                        <ElectricBoltOutlinedIcon sx={{ fontSize:11, color: ICON_COLOR }} style={{ marginRight:4 }} />
                        {pdfState.extracted.inverterManufacturer} {pdfState.extracted.inverterModel}
                      </span>}
                  </div>
                )}
                {pdfState.extracted.systemType?.includes("battery") && (
                  <div style={{ marginTop:8, background:`${Y}12`, border:`1px solid ${Y}40`,
                    borderRadius:6, padding:"6px 10px", fontSize:10, color:Y, lineHeight:1.5, display:"flex", alignItems:"flex-start", gap:6 }}>
                    <WarningAmberOutlinedIcon sx={{ fontSize:14, color: Y }} />
                    <span>Battery system: annualEnergy set to E_Solar (solar energy used). For pure grid-injection LCOE, use the E_Grid value instead.</span>
                  </div>
                )}
              </div>
            )}
            {pdfState.status === "error" && (
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <WarningAmberOutlinedIcon sx={{ fontSize:20, color: O }} />
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:O }}>Parse failed</div>
                  <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>{pdfState.error}</div>
                  <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>Click to try again</div>
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", background:"#FFFFFF", borderRadius:8, padding:4, gap:2, border:"1px solid #E2E8F0" }}>
            {[{id:"system",label:"System"},{id:"capex",label:"CAPEX"},{id:"finance",label:"Finance"}]
              .map(t=>(
                <button key={t.id} className={`tab${panel===t.id?" active":""}`}
                  onClick={()=>setPanel(t.id)} style={{ flex:1 }}>{t.label}</button>
              ))}
          </div>

          {/* ── System ── */}
          {panel==="system" && (
            <Card className="fu">
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18, paddingBottom:14, borderBottom:"1px solid #E2E8F0" }}>
                <ElectricBoltOutlinedIcon sx={{ fontSize:20, color: ICON_COLOR }} />
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:"#0F172A" }}>PVsyst Simulation Results</div>
                  <div style={{ fontSize:10, color:"#94a3b8" }}>
                    {pdfState.status==="done" ? "Auto-filled from PVsyst report · adjust if needed" : "Load a PVsyst PDF above, or enter values manually"}
                  </div>
                </div>
              </div>
              <Div label="System Inputs" />
              <NI label="Installed Capacity" sub="DC array power (STC)"
                value={p.systemCapacity} unit="kWp" min={1} max={500000} step={1} onChange={set("systemCapacity")} />
              <div className="lcoe-input-row" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <NI label="Specific Yield" sub="From PVsyst simulation"
                  value={p.specificYield} unit="kWh/kWp" min={100} max={3000} step={10} onChange={set("specificYield")} />
                <NI label="Performance Ratio" sub="PR from PVsyst"
                  value={p.performanceRatio} unit="%" min={50} max={100} step={0.01} onChange={set("performanceRatio")} />
              </div>
              <div className="lcoe-input-row" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <NI label="DC/AC Ratio" sub="Inverter sizing ratio"
                  value={p.dcAcRatio} unit="" min={1} max={2} step={0.01} onChange={set("dcAcRatio")} />
                <div style={{ marginBottom:13 }}>
                  <Lbl sub="DC capacity / DC·AC ratio">Installed Capacity AC</Lbl>
                  <div style={{
                    background:"#F8FAFC", border:"1.5px solid #E2E8F0", borderRadius:8,
                    padding:"7px 10px", fontFamily:"'JetBrains Mono'", fontSize:13,
                    color:G, fontWeight:600
                  }}>
                    {fmt(p.systemCapacity / p.dcAcRatio, 1)} <span style={{ fontSize:11, color:"#64748B", fontWeight:400 }}>kWac</span>
                  </div>
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#64748B", letterSpacing:".07em", textTransform:"uppercase", marginBottom:6 }}>
                  Annual Energy Production
                </div>
                <div style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  background: p._energySource === "pdf" ? "#FFF8E1" : "#F8FAFC",
                  border: `1.5px solid ${p._energySource === "pdf" ? "#FFE082" : "#E2E8F0"}`,
                  borderRadius:8, padding:"10px 14px"
                }}>
                  <div>
                    {(() => {
                      const val = Math.round(p.annualEnergy);
                      const abs = Math.abs(val);
                      let display = "";
                      let unit = "";
                      if (abs >= 1_000_000) {
                        display = (val / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 });
                        unit = "GWh / yr";
                      } else if (abs >= 1_000) {
                        display = (val / 1_000).toLocaleString(undefined, { maximumFractionDigits: 2 });
                        unit = "MWh / yr";
                      } else {
                        display = val.toLocaleString();
                        unit = "kWh / yr";
                      }
                      return (
                        <>
                          <span style={{ fontFamily:"'JetBrains Mono'", fontSize:20, fontWeight:500,
                            color: p._energySource === "pdf" ? "#8a6200" : "#334155" }}>
                            {display}
                          </span>
                          <span style={{ fontSize:11, color:"#94a3b8", marginLeft:6 }}>{unit}</span>
                        </>
                      );
                    })()}
                  </div>
                  <div style={{ textAlign:"right" }}>
                    {p._energySource === "pdf" ? (
                      <span style={{ fontSize:10, fontWeight:700, color:"#b07d00",
                        background:"#FFF3CD", border:"1px solid #FFE082", borderRadius:20, padding:"2px 9px", display:"inline-flex", alignItems:"center", gap:4 }}>
                        <DescriptionOutlinedIcon sx={{ fontSize:12, color:"#b07d00" }} />
                        from PDF
                      </span>
                    ) : (
                      <span style={{ fontSize:10, fontWeight:600, color:"#64748B",
                        background:"#F1F5F9", border:"1px solid #E2E8F0", borderRadius:20, padding:"2px 9px" }}>
                        ƒ = {p.systemCapacity} × {p.specificYield}
                      </span>
                    )}
                    <div style={{ fontSize:9, color:"#94a3b8", marginTop:3 }}>
                      {p._energySource === "pdf" ? "Edit capacity or yield to recalculate" : "Auto-updates when you change inputs above"}
                    </div>
                  </div>
                </div>
              </div>
              <Div label="Degradation Model" />
              <div style={{ background:"#fffdf7", borderRadius:7, padding:"9px 12px",
                border:"1px solid #E2E8F0", marginBottom:14, fontSize:11,
                color:"#64748B", fontFamily:"'JetBrains Mono'", lineHeight:1.6 }}>
                E<sub>t</sub> = E₀ × (f₁ − d×t) &nbsp;[linear, t ≥ 1]<br/>
                Year-25 output: {fmt((p.firstYearFactor - p.linearDeg * 25)*100, 1)}% of initial
              </div>
              <Sl label="First-Year Factor (f₁)" sub="Accounts for LID + initial soiling"
                value={p.firstYearFactor} min={0.9} max={1.0} step={0.001} unit="" onChange={set("firstYearFactor")} dp={3} />
              <Sl label="Degradation Rate (d)" sub="Annual linear loss fraction"
                value={p.linearDeg} min={0.001} max={0.015} step={0.0001} unit="/yr" onChange={set("linearDeg")} dp={4} />
              {pdfState.status==="done" && pdfState.extracted && (
                (() => {
                  const ex = pdfState.extracted;
                  const pills = [
                    ex.ghi        != null && { label:"GHI",     v:`${fmt(ex.ghi,0)} kWh/m²` },
                    ex.gti        != null && { label:"GTI",     v:`${fmt(ex.gti,0)} kWh/m²` },
                    ex.tilt       != null && { label:"Tilt",    v:`${ex.tilt}°` },
                    ex.azimuth    != null && { label:"Azimuth", v:`${ex.azimuth}°` },
                    ex.numModules != null && { label:"Modules", v:`${ex.numModules} × ${ex.modulePower||"?"}Wp` },
                    ex.dcAcRatio  != null && { label:"DC/AC",   v:`${ex.dcAcRatio}` },
                  ].filter(Boolean);
                  return pills.length > 0 ? (
                    <>
                      <Div label="Report Info (read-only)" />
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:4 }}>
                        {pills.map(({label,v})=>(
                          <div key={label} style={{ background:"#F8FAFC", borderRadius:20,
                            padding:"4px 10px", border:"1px solid #E2E8F0",
                            display:"flex", alignItems:"center", gap:5 }}>
                            <span style={{ fontSize:9, fontWeight:700, color:"#94a3b8",
                              textTransform:"uppercase", letterSpacing:".07em" }}>{label}</span>
                            <span style={{ fontFamily:"'JetBrains Mono'", fontSize:10, color:"#475569" }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null;
                })()
              )}
              <Div label="Derived Stats" />
              <div className="lcoe-metrics-row" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                {[
                  { label:"Capacity Factor", v:`${fmt(R.capacityFactor,2)}%` },
                  { label:"Lifetime Energy",  v:`${fmt(R.lifeEnMWh/1000,2)} GWh` },
                  { label:"Yr-25 Output",     v:`${fmt((p.firstYearFactor-p.linearDeg*25)*100,1)}%` },
                ].map(({label,v})=>(
                  <div key={label} style={{ background:"#fffdf7", borderRadius:6, padding:"8px 10px", border:"1px solid #E2E8F0" }}>
                    <div style={{ fontSize:9, color:"#94a3b8", marginBottom:3, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase" }}>{label}</div>
                    <div style={{ fontFamily:"'JetBrains Mono'", fontSize:13, color:"#0F172A" }}>{v}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── CAPEX ── */}
          {panel==="capex" && (
            <Card className="fu">
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18, paddingBottom:14, borderBottom:"1px solid #E2E8F0", flexWrap:"wrap" }}>
                <AccountTreeOutlinedIcon sx={{ fontSize:20, color: ICON_COLOR }} />
                <div style={{ flex:1, minWidth:140 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:"#0F172A" }}>CAPEX Breakdown</div>
                  <div style={{ fontSize:10, color:"#94a3b8" }}>{currency}/kWp per item · total converts to {currency}</div>
                  {capexInputMode === "quantity" ? (
                    <div style={{ fontSize:9, color:"#94a3b8", marginTop:4, lineHeight:1.35 }}>
                      Line total = quantity × unit price; values roll into {currency}/kWp for LCOE.
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setShowCapexInputModePopup(true)}
                  style={{
                    display:"flex", alignItems:"center", gap:4,
                    padding:"4px 10px", borderRadius:8,
                    background:"#F1F5F9", color:"#334155",
                    border:"1px solid #E2E8F0", cursor:"pointer",
                    fontSize:10, fontWeight:600, fontFamily:"Inter, Arial, sans-serif",
                    flexShrink:0,
                  }}
                  title="CAPEX input mode"
                >
                  <CalculateOutlinedIcon sx={{ fontSize:13, color:"#64748B" }} />
                  Currency/Qt
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddCapexItemDialog(true)}
                  style={{
                    flexShrink:0,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: "1px solid #D1D5DB",
                    background: "#fff",
                    color: "#475569",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="add new CAPEX item"
                >
                  +
                </button>
              </div>
              {capexCats.map(cat => {
                const catSum = cat.items.reduce((s,i)=>s+(p.capex[i.id]||0),0);
                const isOpen = openCat[cat.id] !== false;
                return (
                  <div key={cat.id} style={{ marginBottom:10 }}>
                    <button onClick={()=>setOpenCat(prev=>({...prev,[cat.id]:!isOpen}))}
                      style={{ width:"100%", background:`${cat.color}10`, border:`1px solid ${cat.color}28`,
                        borderRadius:7, padding:"8px 12px", cursor:"pointer",
                        display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:7, height:7, borderRadius:"50%", background:cat.color }} />
                        <span style={{ fontFamily:"Inter, Arial, sans-serif", fontWeight:700, fontSize:11,
                          color:cat.color, letterSpacing:".05em", textTransform:"uppercase" }}>{cat.label}</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontFamily:"'JetBrains Mono'", fontSize:11, color:"#475569" }}>{fmt(cx(catSum),1)} {currency}/kWp</span>
                        <span style={{ color:"#64748B", fontSize:11 }}>{isOpen?"▲":"▼"}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ paddingTop:8 }}>
                        {cat.items.map((item) => {
                          const cap = p.systemCapacity;
                          const q = Math.max(0, capexQtyById[item.id] ?? 1);
                          const uUsd = capexUnitUsdById[item.id] ?? (
                            cap > 0 ? ((p.capex[item.id] ?? 0) * cap) / Math.max(q, 1e-12) : 0
                          );
                          const lineTotalUsd = q * uUsd;

                          if (capexInputMode === "quantity") {
                            return (
                              <div key={item.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, flexWrap:"wrap" }}>
                                <div style={{ fontSize:11, color:"#64748B", flex:"1 1 100px", minWidth:90 }}>{item.label}</div>
                                <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", flex:"1 1 200px" }}>
                                  <input
                                    type="number"
                                    value={q}
                                    min={0}
                                    step={0.01}
                                    onChange={(e) => {
                                      const newQ = Math.max(0, parseFloat(e.target.value) || 0);
                                      const u = capexUnitUsdById[item.id] ?? (
                                        cap > 0 ? ((p.capex[item.id] ?? 0) * cap) / Math.max(capexQtyById[item.id] ?? 1, 1e-12) : 0
                                      );
                                      setCapexQtyById((prev) => ({ ...prev, [item.id]: newQ }));
                                      if (capexUnitUsdById[item.id] === undefined) {
                                        setCapexUnitUsdById((prev) => ({ ...prev, [item.id]: u }));
                                      }
                                      if (cap > 0) setCapex(item.id, capexPerKwpFromQtyUnit(newQ, u, cap));
                                    }}
                                    style={{
                                      width:72, padding:"6px 8px", borderRadius:7, border:"1px solid #E2E8F0",
                                      fontSize:11, fontFamily:"'JetBrains Mono', monospace", color:"#0F172A", background:"#fff",
                                    }}
                                  />
                                  <span style={{ fontSize:10, color:"#94a3b8" }}>×</span>
                                  <div style={{ width:100, position:"relative" }}>
                                    <input
                                      type="number"
                                      value={parseFloat(cx(uUsd).toFixed(2))}
                                      min={0}
                                      step={0.01}
                                      onChange={(e) => {
                                        const uDisp = parseFloat(e.target.value) || 0;
                                        const uUsdNew = uDisp / exchangeRate;
                                        const qn = Math.max(0, capexQtyById[item.id] ?? 1);
                                        setCapexUnitUsdById((prev) => ({ ...prev, [item.id]: uUsdNew }));
                                        if (cap > 0) setCapex(item.id, capexPerKwpFromQtyUnit(qn, uUsdNew, cap));
                                      }}
                                      style={{ width:"100%", padding:"6px 36px 6px 8px", borderRadius:7, border:"1px solid #E2E8F0",
                                        fontSize:11, fontFamily:"'JetBrains Mono', monospace", color:"#0F172A", background:"#fff" }}
                                    />
                                    <span style={{ position:"absolute", right:7, top:"50%", transform:"translateY(-50%)",
                                      fontSize:9, color:"#64748B", fontFamily:"'JetBrains Mono'", pointerEvents:"none" }}>{currSym}</span>
                                  </div>
                                  <span style={{ fontSize:10, color:"#94a3b8" }}>=</span>
                                  <span style={{ fontFamily:"'JetBrains Mono'", fontSize:11, color:"#0F172A", minWidth:72 }}>
                                    {currSym}{fmt(cx(lineTotalUsd), 2)}
                                  </span>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={item.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
                              <div style={{ fontSize:11, color:"#64748B", flex:1 }}>{item.label}</div>
                              <div style={{ width:110, position:"relative" }}>
                                <input
                                  type="number"
                                  value={parseFloat(cx(p.capex[item.id]).toFixed(2))}
                                  min={0}
                                  step={0.1}
                                  onChange={(e) => {
                                    const valUsd = (parseFloat(e.target.value) || 0) / exchangeRate;
                                    setCapex(item.id, valUsd);
                                    const c = p.systemCapacity;
                                    if (c > 0) {
                                      const qn = capexQtyById[item.id] ?? 1;
                                      setCapexUnitUsdById((prev) => ({
                                        ...prev,
                                        [item.id]: (valUsd * c) / Math.max(qn, 1e-12),
                                      }));
                                    }
                                  }}
                                  style={{ paddingRight:42 }}
                                />
                                <span style={{ position:"absolute", right:7, top:"50%", transform:"translateY(-50%)",
                                  fontSize:9, color:"#64748B", fontFamily:"'JetBrains Mono'", pointerEvents:"none" }}>{currSym}/kWp</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ background:"#fffdf7", borderRadius:7, padding:"12px 14px", border:"1.5px solid #FFE082", marginTop:10 }}>
                {[
                  { label:`Total (${currency}/kWp)`,      v:`${fmt(cx(R.capexUsdKwp),1)} ${currency}/kWp` },
                  { label:`Total (${currency})`, v:`${currSym}${fmtK(cx(R.capexTotal))}`, hi:true },
                  { label:`Per kWp (${currSym}/kWp)`, v:`${fmt(cx(R.capexTotal/p.systemCapacity),0)} ${currSym}/kWp` },
                ].map(({label,v,hi})=>(
                  <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #E2E8F0" }}>
                    <span style={{ fontSize:11, color:"#64748B" }}>{label}</span>
                    <span style={{ fontFamily:"'JetBrains Mono'", fontSize:12, color:hi?G:"#0F172A" }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:10, marginTop:12 }}>
                <button onClick={handleLoadTemplate} style={{
                  flex:1, padding:"8px 0", fontSize:11, fontWeight:600, border:"1.5px solid #E2E8F0",
                  borderRadius:7, background:"#fff", color:"#475569", cursor:"pointer",
                  transition:"all 0.15s", display:"flex", alignItems:"center", justifyContent:"center", gap:5
                }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="#FFB800";e.currentTarget.style.color="#B8860B"}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="#E2E8F0";e.currentTarget.style.color="#475569"}}
                >
                  <span style={{ fontSize:14 }}>&#8593;</span> Load Template
                </button>
                <button onClick={handleSaveTemplate} style={{
                  flex:1, padding:"8px 0", fontSize:11, fontWeight:600, border:"none",
                  borderRadius:7, background:"#FFB800", color:"#fff", cursor:"pointer",
                  transition:"all 0.15s", display:"flex", alignItems:"center", justifyContent:"center", gap:5
                }}
                  onMouseEnter={e=>e.currentTarget.style.background="#E5A600"}
                  onMouseLeave={e=>e.currentTarget.style.background="#FFB800"}
                >
                  <span style={{ fontSize:14 }}>&#8595;</span> Save Template
                </button>
              </div>
            </Card>
          )}

          {/* ── Finance ── */}
          {panel==="finance" && (
            <Card className="fu">
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18, paddingBottom:14, borderBottom:"1px solid #E2E8F0" }}>
                <CurrencyExchangeIcon sx={{ fontSize:20, color: ICON_COLOR }} />
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:"#0F172A" }}>Financial Parameters</div>
                  <div style={{ fontSize:10, color:"#94a3b8" }}>WACC · O&M · tariff · project life</div>
                </div>
              </div>
              <NI label="O&M Cost" sub={`${currSym}/kWp/yr · constant (no escalation)`}
                value={parseFloat(cx(p.omPerKwp).toFixed(2))} unit={`${currSym}/kWp`} min={0} max={cx(500)} step={0.5} onChange={v => set("omPerKwp")(v/exchangeRate)} />
              <Sl label="Discount Rate (WACC)" value={p.discountRate}
                min={1} max={20} step={0.25} unit="%" onChange={set("discountRate")} />
              <Sl label="Project Lifetime" value={p.projectLifetime}
                min={10} max={40} step={1} unit=" yrs" onChange={set("projectLifetime")} dp={0} />
              <Div label="Revenue (for IRR & Payback)" />
              <NI label="PPA / Feed-in Tariff" sub="used for IRR and payback only — not for LCOE"
                value={parseFloat(cx(p.tariffPrice).toFixed(4))} unit={`${currSym}/kWh`} min={0} max={cx(0.5)} step={0.001} onChange={v => set("tariffPrice")(v/exchangeRate)} />
              <Div label="Financial Summary" />
              <div className="lcoe-input-row" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[
                  { label:"Annual O&M",     v:`${currSym}${fmtK(cx(R.omAnnual))}` },
                  { label:"O&M NPV",        v:`${currSym}${fmtK(cx(R.opexNpv))}` },
                  { label:"Annual Revenue (yr 1)", v:`${currSym}${fmtK(cx(p.annualEnergy*p.firstYearFactor*p.tariffPrice))}` },
                  { label:"Net yr-1 Cashflow", v:`${currSym}${fmtK(cx(p.annualEnergy*p.firstYearFactor*p.tariffPrice-R.omAnnual))}` },
                ].map(({label,v})=>(
                  <div key={label} style={{ background:"#fffdf7", borderRadius:6, padding:"8px 10px", border:"1px solid #E2E8F0" }}>
                    <div style={{ fontSize:9, color:"#94a3b8", marginBottom:3, fontWeight:700, letterSpacing:".07em", textTransform:"uppercase" }}>{label}</div>
                    <div style={{ fontFamily:"'JetBrains Mono'", fontSize:12, color:"#0F172A" }}>{v}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ──────────── RIGHT PANEL ──────────── */}
        <div style={{ display:"flex", flexDirection:"column", gap:16, minWidth:0, width:"100%" }}>
          {/* ── KPI Row ── */}
          {/* ── Row 1: LCOE hero (full width) ── */}
          <div className="fu fu1" style={{ marginBottom:4 }}>
            <Card className="kpi-lcoe" glow={lcoeColor} style={{ background:"#FFFFFF", boxShadow:"0 2px 20px rgba(232,160,32,.08)", position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:-20, right:-20, width:100, height:100,
                borderRadius:"50%", background:`radial-gradient(circle,${lcoeColor}22,transparent 70%)` }} />
              {/* ── Currency badge top-right ── */}
              <div className="lcoe-hero-currency" style={{ position:"absolute", top:12, right:14, zIndex:2 }}>
                <button
                  onClick={() => { setTempCurrency(currency); setTempRate(exchangeRate); setShowCurrencyPopup(true); }}
                  style={{
                    display:"flex", alignItems:"center", gap:4,
                    padding:"4px 10px", borderRadius:8,
                    background:"#F1F5F9", color:"#334155",
                    border:"1.5px solid #E2E8F0", cursor:"pointer",
                    fontSize:10, fontWeight:700,
                    fontFamily:"'JetBrains Mono', monospace",
                    letterSpacing:".04em",
                    transition:"all .15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background="#E2E8F0"; e.currentTarget.style.borderColor="#CBD5E1"; }}
                  onMouseLeave={e => { e.currentTarget.style.background="#F1F5F9"; e.currentTarget.style.borderColor="#E2E8F0"; }}
                >
                  <CurrencyExchangeIcon style={{ fontSize:13 }} />
                  {currency}
                  {exchangeRate !== 1 && <span style={{ fontSize:8, color:"#94a3b8", fontWeight:400 }}>×{fmt(exchangeRate,2)}</span>}
                </button>
              </div>
              {/* ── Currency popup (rendered via portal-like fixed positioning) ── */}
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                <span style={{ fontSize:9, color:"#94a3b8", fontWeight:700, letterSpacing:".08em",
                  textTransform:"uppercase", whiteSpace:"nowrap" }}>Levelized Cost of Energy</span>
                <button
                  type="button"
                  onClick={() => setShowLcoeMeaningPopup(true)}
                  title="What is LCOE?"
                  style={{
                    display:"inline-flex", alignItems:"center", justifyContent:"center",
                    width:16, height:16, padding:0, border:"none", borderRadius:"50%",
                    background:"#E2E8F0", color:"#64748B", cursor:"pointer",
                    flexShrink:0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#CBD5E1"; e.currentTarget.style.color = "#475569"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#E2E8F0"; e.currentTarget.style.color = "#64748B"; }}
                >
                  <HelpOutlineIcon sx={{ fontSize: 12 }} />
                </button>
              </div>
              <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:8 }}>
                <span style={{ fontFamily:"'JetBrains Mono'", fontSize:"clamp(28px,4vw,42px)", fontWeight:700,
                  color:lcoeColor, lineHeight:1 }}>{fmt(cx(R.lcoe),4)}</span>
                <span style={{ fontSize:12, color:"#64748B" }}>{currency}/kWh</span>
              </div>
              <div className="lcoe-hero-actions" style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"space-between" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <button
                    type="button"
                    onClick={() => setShowLcoeThresholdsPopup(true)}
                    title="Click to set LCOE status thresholds"
                    style={{
                      fontSize:10,
                      fontWeight:700,
                      letterSpacing:".08em",
                      textTransform:"uppercase",
                      padding:"3px 10px",
                      borderRadius:9999,
                      background:lcoeColor+"15",
                      border:`1px solid ${lcoeColor}33`,
                      color:lcoeColor,
                      fontFamily:"Inter, Arial, sans-serif",
                      cursor:"pointer",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; e.currentTarget.style.transform = "scale(1.02)"; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "scale(1)"; }}
                  >
                    {lcoeRating}
                  </button>
                  <span style={{ fontSize:10, color:"#94a3b8", fontFamily:"'JetBrains Mono'", display:"inline-flex", alignItems:"center", gap:4 }}>
                    {fmt(cx(R.lcoe*1000),2)} {currSym}/MWh
                    <button
                      type="button"
                      onClick={() => setShowLcoeStatusHelpPopup(true)}
                      title="How is LCOE status determined?"
                      style={{
                        display:"inline-flex", alignItems:"center", justifyContent:"center",
                        width:18, height:18, padding:0, border:"none", borderRadius:"50%",
                        background:"#E2E8F0", color:"#64748B", cursor:"pointer",
                        flexShrink:0,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#CBD5E1"; e.currentTarget.style.color = "#475569"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#E2E8F0"; e.currentTarget.style.color = "#64748B"; }}
                    >
                      <HelpOutlineIcon sx={{ fontSize: 14 }} />
                    </button>
                  </span>
                </div>
                <button
                  onClick={() => generateLcoeReport(p, R, sens, capexCats, { currency, exchangeRate, currSym })
                    .then(() => setReportDownloadedOpen(true))
                    .catch(err => console.error("PDF generation failed:", err))}
                  style={{
                    display:"flex", alignItems:"center", gap:5,
                    padding:"5px 14px", borderRadius:8,
                    background:"#1F2937", color:"#fff",
                    border:"none", cursor:"pointer",
                    fontSize:10, fontWeight:600,
                    fontFamily:"Inter, Arial, sans-serif",
                    letterSpacing:".03em",
                    transition:"background .15s",
                    zIndex:1,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#374151"}
                  onMouseLeave={e => e.currentTarget.style.background="#1F2937"}
                >
                  <FileDownloadOutlinedIcon style={{ fontSize:14 }} />
                  Download Report
                </button>
              </div>
            </Card>
          </div>
          {/* ── Row 2: 4 metric cards ── */}
          <div className="lcoe-kpi-cards fu fu1" style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginBottom:4 }}>
            {[
              { label:"Total CAPEX", value:`${currSym}${fmtK(cx(R.capexTotal))}`,
                sub:`${fmt(cx(R.capexTotal/p.systemCapacity),0)} ${currSym}/kWp`, color:B },
              { label:"Capacity Factor", value:`${fmt(R.capacityFactor,2)}%`,
                sub:`${fmt(R.lifeEnMWh,0)} MWh lifetime`, color:P },
              { label:"Payback (TRI)",
                value:isFinite(R.simplePayback)?`${fmt(R.simplePayback,2)} yrs`:"—",
                sub:`at ${fmt(cx(p.tariffPrice),3)} ${currSym}/kWh`, color:Y },
              { label:"IRR", value:R.irr?`${fmt(R.irr,2)}%`:"—",
                sub:R.projectNpv>=0?`NPV +${currSym}${fmtK(cx(R.projectNpv))}`:`NPV -${currSym}${fmtK(cx(Math.abs(R.projectNpv)))}`,
                color:R.irr&&R.irr>p.discountRate?G:O },
            ].map(({label,value,sub,color})=>(
              <Card key={label} style={{ border:`1px solid ${color}1e` }}>
                <div style={{ fontSize:9, color:"#94a3b8", fontWeight:700, letterSpacing:".1em",
                  textTransform:"uppercase", marginBottom:8, display:"flex", alignItems:"center", gap:4 }}>
                  {label}
                  {label === "Total CAPEX" && (
                    <button type="button" onClick={() => setShowTotalCapexHelpPopup(true)} title="What is Total CAPEX?"
                      style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:18, height:18, padding:0, border:"none", borderRadius:"50%", background:"#E2E8F0", color:"#64748B", cursor:"pointer", flexShrink:0 }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#CBD5E1"; e.currentTarget.style.color = "#475569"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#E2E8F0"; e.currentTarget.style.color = "#64748B"; }}>
                      <HelpOutlineIcon sx={{ fontSize: 14 }} />
                    </button>
                  )}
                  {label === "Capacity Factor" && (
                    <button type="button" onClick={() => setShowCapacityFactorHelpPopup(true)} title="What is Capacity Factor?"
                      style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:18, height:18, padding:0, border:"none", borderRadius:"50%", background:"#E2E8F0", color:"#64748B", cursor:"pointer", flexShrink:0 }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#CBD5E1"; e.currentTarget.style.color = "#475569"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#E2E8F0"; e.currentTarget.style.color = "#64748B"; }}>
                      <HelpOutlineIcon sx={{ fontSize: 14 }} />
                    </button>
                  )}
                  {label === "Payback (TRI)" && (
                    <button
                      type="button"
                      onClick={() => setShowSimplePaybackHelpPopup(true)}
                      title="What is Simple Payback?"
                      style={{
                        display:"inline-flex", alignItems:"center", justifyContent:"center",
                        width:18, height:18, padding:0, border:"none", borderRadius:"50%",
                        background:"#E2E8F0", color:"#64748B", cursor:"pointer",
                        flexShrink:0,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#CBD5E1"; e.currentTarget.style.color = "#475569"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#E2E8F0"; e.currentTarget.style.color = "#64748B"; }}
                    >
                      <HelpOutlineIcon sx={{ fontSize: 14 }} />
                    </button>
                  )}
                  {label === "IRR" && (
                    <button type="button" onClick={() => setShowIrrHelpPopup(true)} title="What is IRR?"
                      style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:18, height:18, padding:0, border:"none", borderRadius:"50%", background:"#E2E8F0", color:"#64748B", cursor:"pointer", flexShrink:0 }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#CBD5E1"; e.currentTarget.style.color = "#475569"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#E2E8F0"; e.currentTarget.style.color = "#64748B"; }}>
                      <HelpOutlineIcon sx={{ fontSize: 14 }} />
                    </button>
                  )}
                </div>
                <div style={{ fontFamily:"'JetBrains Mono'", fontSize:"clamp(16px,2vw,22px)", color, marginBottom:4, fontWeight:600 }}>{value}</div>
                <div style={{ fontSize:10, color:"#94a3b8" }}>{sub}</div>
              </Card>
            ))}
          </div>

          {/* ── Chart area ── */}
          <Card className="fu fu2">
            <div className="lcoe-chart-tabs" style={{ display:"flex", gap:4, marginBottom:20,
              background:"#fffdf7", borderRadius:7, padding:4, width:"fit-content" }}>
              {[{id:"energy",label:"Energy Profile"},{id:"cashflow",label:"Cash Flow"},{id:"costs",label:"Cost Breakdown"},{id:"tornado",label:"Sensitivity"}]
                .map(t=>(
                  <button key={t.id} className={`tab${chart===t.id?" active":""}`}
                    onClick={()=>setChart(t.id)}>{t.label}</button>
                ))}
            </div>

            {/* Energy Profile */}
            {chart==="energy" && (
              <div>
                <div style={{ fontSize:11, color:"#64748B", marginBottom:14 }}>
                  Annual energy (MWh) with linear degradation · discounted O&M over {p.projectLifetime} years
                </div>
                <Chart key={`energy-${p.projectLifetime}`} type="area" height={300} series={[
                    { name: "Energy (MWh)", data: R.rows.map(r => r.energyMWh) },
                    { name: `Disc. O&M (${currSym})`, data: R.rows.map(r => cx(r.discCost)) },
                  ]} options={{
                    ...APEX_BASE,
                    chart: { ...APEX_BASE.chart, type: "area" },
                    colors: [G, O],
                    stroke: { curve: "smooth", width: 2 },
                    fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.25, opacityTo: 0, stops: [5, 95] } },
                    dataLabels: { enabled: false },
                    xaxis: { ...APEX_BASE.xaxis, categories: R.rows.map(r => r.year), tickAmount: Math.min(p.projectLifetime, 20), title: { text: "Year", style: { color: "#94a3b8", fontSize: "10px" } }, labels: { ...APEX_BASE.xaxis.labels, rotate: p.projectLifetime > 25 ? -45 : 0, rotateAlways: p.projectLifetime > 25 } },
                    yaxis: [
                      { ...APEX_BASE.yaxis, labels: { ...APEX_BASE.yaxis.labels, formatter: v => v.toFixed(1) }, title: { text: "MWh", style: { color: "#94a3b8", fontSize: "10px" } } },
                      { ...APEX_BASE.yaxis, opposite: true, labels: { ...APEX_BASE.yaxis.labels, formatter: v => v.toFixed(1) }, title: { text: "", style: { color: "#94a3b8", fontSize: "10px" } } },
                    ],
                    tooltip: { ...APEX_BASE.tooltip, y: { formatter: v => fmt(v, 2) } },
                  }} />
              </div>
            )}

            {/* Cash Flow Chart */}
            {chart==="cashflow" && (
              <div>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#0F172A", marginBottom:4 }}>
                    Cash flow evolution over {p.projectLifetime} years
                  </div>
                  <div style={{ fontSize:11, color:"#64748B", lineHeight:1.6 }}>
                    Bars and lines built from the same discounted series used for TRI.
                    The green line crossing zero marks the discounted payback
                    {R.discountedPayback ? ` ≈ ${fmt(R.discountedPayback,1)} yrs` : ""}.
                  </div>
                </div>
                {(() => {
                    const vis = (name, data) => hiddenCfSeries[name] ? data.map(() => null) : data;
                    const visVals = (name, vals) => hiddenCfSeries[name] ? [] : vals;
                    const leftVals  = [
                      ...visVals("Discounted revenue",  R.cashFlowRows.map(r => cx(r.discountedRevenue))),
                      ...visVals("Discounted OPEX (−)", R.cashFlowRows.map(r => cx(r.discountedOpex))),
                    ];
                    const rightVals = [
                      ...visVals("Discounted CAPEX (−)",       R.cashFlowRows.map(r => cx(r.discountedCapex))),
                      ...visVals("Discounted net cash flow",   R.cashFlowRows.map(r => cx(r.discountedNetCashFlow))),
                      ...visVals("Cumulative disc. cash flow", R.cashFlowRows.map(r => cx(r.cumulativeDiscountedCashFlow))),
                    ];
                    // Compute natural pos/neg extents per axis, then align zeros
                    const posL = (Math.max(...leftVals.filter(v => v >= 0),  0) || 1) * 1.15;
                    const negL = (Math.max(...leftVals.filter(v => v <  0).map(Math.abs), 0) || 1) * 1.15;
                    const posR = (Math.max(...rightVals.filter(v => v >= 0), 0) || 1) * 1.15;
                    const negR = (Math.max(...rightVals.filter(v => v <  0).map(Math.abs), 0) || 1) * 1.15;
                    // zeroRatio = fraction of total height below zero; must be same on both axes
                    const zeroRatio = Math.max(negL / (negL + posL), negR / (negR + posR));
                    const totalL = Math.max(posL / (1 - zeroRatio), negL / zeroRatio);
                    const totalR = Math.max(posR / (1 - zeroRatio), negR / zeroRatio);
                    const [minL, maxL] = [-totalL * zeroRatio, totalL * (1 - zeroRatio)];
                    const [minR, maxR] = [-totalR * zeroRatio, totalR * (1 - zeroRatio)];
                    return (
                      <Chart key={`cashflow-${p.projectLifetime}`} type="line" height={340} series={[
                          { name: "Discounted revenue",        type: "column", data: vis("Discounted revenue",        R.cashFlowRows.map(r => cx(r.discountedRevenue))) },
                          { name: "Discounted OPEX (−)",       type: "column", data: vis("Discounted OPEX (−)",        R.cashFlowRows.map(r => cx(r.discountedOpex))) },
                          { name: "Discounted CAPEX (−)",      type: "column", data: vis("Discounted CAPEX (−)",       R.cashFlowRows.map(r => cx(r.discountedCapex))) },
                          { name: "Discounted net cash flow",  type: "line",   data: vis("Discounted net cash flow",   R.cashFlowRows.map(r => cx(r.discountedNetCashFlow))) },
                          { name: "Cumulative disc. cash flow",type: "line",   data: vis("Cumulative disc. cash flow", R.cashFlowRows.map(r => cx(r.cumulativeDiscountedCashFlow))) },
                        ]} options={{
                          ...APEX_BASE,
                          chart: { ...APEX_BASE.chart, type: "line", stacked: false },
                          colors: ["#FFB800", "#94a3b8", "#1f2937", "#f97316", "#16a34a"],
                          stroke: { width: [0, 0, 0, 2, 2], curve: "smooth" },
                          fill: { opacity: [0.85, 0.85, 0.85, 1, 1] },
                          dataLabels: { enabled: false },
                          legend: { show: false },
                          plotOptions: { bar: { columnWidth: "55%", borderRadius: 2 } },
                          xaxis: { ...APEX_BASE.xaxis, categories: R.cashFlowRows.map(r => r.year), tickAmount: Math.min(p.projectLifetime, 20), title: { text: "Year", style: { color: "#94a3b8", fontSize: "10px" } }, labels: { ...APEX_BASE.xaxis.labels, rotate: p.projectLifetime > 25 ? -45 : 0, rotateAlways: p.projectLifetime > 25 } },
                          yaxis: [
                            { ...APEX_BASE.yaxis, min: minL, max: maxL, seriesName: "Discounted revenue",   labels: { ...APEX_BASE.yaxis.labels, formatter: v => fmtK(v) }, title: { text: `Revenue & OPEX (${currSym})`, style: { color: "#94a3b8", fontSize: "10px" } } },
                            { ...APEX_BASE.yaxis, min: minL, max: maxL, seriesName: "Discounted revenue",   show: false },
                            { ...APEX_BASE.yaxis, min: minR, max: maxR, seriesName: "Discounted CAPEX (−)", opposite: true, labels: { ...APEX_BASE.yaxis.labels, formatter: v => fmtK(v) }, title: { text: `CAPEX · Net CF · Cumulative (${currSym})`, style: { color: "#1f2937", fontSize: "10px" } } },
                            { ...APEX_BASE.yaxis, min: minR, max: maxR, seriesName: "Discounted CAPEX (−)", show: false },
                            { ...APEX_BASE.yaxis, min: minR, max: maxR, seriesName: "Discounted CAPEX (−)", show: false },
                          ],
                          annotations: { yaxis: [{ y: 0, borderColor: "#CBD5E1", strokeDashArray: 4 }] },
                          tooltip: { ...APEX_BASE.tooltip, y: { formatter: v => `${currSym}${fmtK(Math.abs(v))} ${v < 0 ? "(−)" : ""}` } },
                        }} />
                    );
                  })()}

                {/* Custom legend — 5 items in one row, clickable to toggle */}
                <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:20, marginTop:10, marginBottom:4, flexWrap:"nowrap" }}>
                  {[
                    { label:"Discounted revenue",        color:"#FFB800", type:"bar" },
                    { label:"Discounted OPEX (−)",        color:"#94a3b8", type:"bar" },
                    { label:"Discounted CAPEX (−)",       color:"#1f2937", type:"bar" },
                    { label:"Discounted net cash flow",   color:"#f97316", type:"line" },
                    { label:"Cumulative disc. cash flow", color:"#16a34a", type:"line" },
                  ].map(({ label, color, type }) => {
                    const hidden = !!hiddenCfSeries[label];
                    return (
                      <div
                        key={label}
                        onClick={() => setHiddenCfSeries(prev => ({ ...prev, [label]: !prev[label] }))}
                        style={{ display:"flex", alignItems:"center", gap:6, whiteSpace:"nowrap", cursor:"pointer", opacity: hidden ? 0.35 : 1, transition:"opacity .15s" }}
                      >
                        {type === "bar"
                          ? <span style={{ width:12, height:12, borderRadius:2, background: hidden ? "#CBD5E1" : color, display:"inline-block", flexShrink:0, transition:"background .15s" }} />
                          : <span style={{ width:18, height:2, background: hidden ? "#CBD5E1" : color, display:"inline-block", flexShrink:0, borderRadius:2, transition:"background .15s" }} />
                        }
                        <span style={{ fontSize:10, color: hidden ? "#CBD5E1" : "#64748B", fontFamily:"'JetBrains Mono', monospace", transition:"color .15s" }}>{label}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginTop:16 }}>
                  {[
                    { label:"Disc. Payback (TRI)", v: R.discountedPayback ? `${fmt(R.discountedPayback,1)} yrs` : "—", color:"#16a34a" },
                    { label:"Simple Payback",       v: isFinite(R.simplePayback) ? `${fmt(R.simplePayback,1)} yrs` : "—", color:"#64748B" },
                    { label:"Project IRR",          v: R.irr ? `${fmt(R.irr,2)}%` : "—", color: R.irr&&R.irr>p.discountRate?"#16a34a":"#f97316" },
                    { label:"Project NPV",          v: `${R.projectNpv>=0?"+":""}${currSym}${fmtK(cx(R.projectNpv))}`, color: R.projectNpv>=0?"#16a34a":"#f97316" },
                  ].map(({label,v,color})=>(
                    <div key={label} style={{ background:"#fffdf7", borderRadius:7, padding:"9px 12px", border:"1px solid #E2E8F0" }}>
                      <div style={{ fontSize:9, color:"#94a3b8", fontWeight:700, letterSpacing:".07em", textTransform:"uppercase", marginBottom:4, display:"flex", alignItems:"center", gap:4 }}>
                        {label}
                        {label === "Disc. Payback (TRI)" && (
                          <button
                            type="button"
                            onClick={() => setShowDiscPaybackHelpPopup(true)}
                            title="What is Disc. Payback (TRI)?"
                            style={{
                              display:"inline-flex", alignItems:"center", justifyContent:"center",
                              width:16, height:16, padding:0, border:"none", borderRadius:"50%",
                              background:"#E2E8F0", color:"#64748B", cursor:"pointer",
                              flexShrink:0,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#CBD5E1"; e.currentTarget.style.color = "#475569"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#E2E8F0"; e.currentTarget.style.color = "#64748B"; }}
                          >
                            <HelpOutlineIcon sx={{ fontSize: 12 }} />
                          </button>
                        )}
                        {label === "Simple Payback" && (
                          <button
                            type="button"
                            onClick={() => setShowSimplePaybackHelpPopup(true)}
                            title="What is Simple Payback?"
                            style={{
                              display:"inline-flex", alignItems:"center", justifyContent:"center",
                              width:16, height:16, padding:0, border:"none", borderRadius:"50%",
                              background:"#E2E8F0", color:"#64748B", cursor:"pointer",
                              flexShrink:0,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#CBD5E1"; e.currentTarget.style.color = "#475569"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#E2E8F0"; e.currentTarget.style.color = "#64748B"; }}
                          >
                            <HelpOutlineIcon sx={{ fontSize: 12 }} />
                          </button>
                        )}
                        {label === "Project IRR" && (
                          <button type="button" onClick={() => setShowIrrHelpPopup(true)} title="What is IRR?"
                            style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:16, height:16, padding:0, border:"none", borderRadius:"50%", background:"#E2E8F0", color:"#64748B", cursor:"pointer", flexShrink:0 }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#CBD5E1"; e.currentTarget.style.color = "#475569"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#E2E8F0"; e.currentTarget.style.color = "#64748B"; }}>
                            <HelpOutlineIcon sx={{ fontSize: 12 }} />
                          </button>
                        )}
                        {label === "Project NPV" && (
                          <button type="button" onClick={() => setShowProjectNpvHelpPopup(true)} title="What is Project NPV?"
                            style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:16, height:16, padding:0, border:"none", borderRadius:"50%", background:"#E2E8F0", color:"#64748B", cursor:"pointer", flexShrink:0 }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#CBD5E1"; e.currentTarget.style.color = "#475569"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#E2E8F0"; e.currentTarget.style.color = "#64748B"; }}>
                            <HelpOutlineIcon sx={{ fontSize: 12 }} />
                          </button>
                        )}
                      </div>
                      <div style={{ fontFamily:"'JetBrains Mono'", fontSize:14, fontWeight:600, color }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cost Breakdown */}
            {chart==="costs" && (
              <div>
                {/* Donut + side legend (PDF-style) */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:32, marginBottom:20 }}>
                  <div style={{ flexShrink:0 }}>
                    <Chart type="donut" width={220} height={220} series={R.catTotals.map(c => cx(c.localTotal))} options={{
                      chart: { ...APEX_BASE.chart, type: "donut" },
                      labels: R.catTotals.map(c => c.label),
                      colors: R.catTotals.map(c => c.color),
                      plotOptions: { pie: { donut: { size: "58%", labels: { show: true, name: { show: false }, value: { show: true, fontSize: "14px", fontFamily: "'JetBrains Mono'", color: "#0F172A", formatter: () => `${currSym}${fmtK(cx(R.capexTotal))}` }, total: { show: true, label: "Total", fontSize: "10px", color: "#94a3b8", formatter: () => `${currSym}${fmtK(cx(R.capexTotal))}` } } } } },
                      legend: { show: false },
                      dataLabels: { enabled: false },
                      tooltip: { ...APEX_BASE.tooltip, y: { formatter: v => `${currSym}${fmtK(v)}` } },
                    }} />
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    {R.catTotals.map(c=>(
                      <div key={c.id}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                          <div style={{ width:10, height:10, borderRadius:3, background:c.color, flexShrink:0 }}/>
                          <span style={{ fontSize:12, fontWeight:700, color:"#0F172A" }}>{c.label}</span>
                        </div>
                        <div style={{ paddingLeft:18, display:"flex", alignItems:"baseline", gap:8 }}>
                          <span style={{ fontFamily:"'JetBrains Mono'", fontSize:12, color:"#64748B" }}>{currSym}{fmtK(cx(c.localTotal))}</span>
                          <span style={{ fontFamily:"'JetBrains Mono'", fontSize:11, color:"#94a3b8" }}>({fmt(c.localTotal/R.capexTotal*100,1)}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CAPEX vs O&M NPV bar */}
                <div style={{ fontSize:11, color:"#64748B", marginBottom:10, fontWeight:600 }}>CAPEX vs discounted O&M NPV</div>
                <Chart type="bar" height={120} series={[
                  { name: "CAPEX", data: [cx(R.capexTotal)] },
                  { name: "O&M NPV", data: [cx(R.opexNpv)] },
                ]} options={{
                  ...APEX_BASE,
                  chart: { ...APEX_BASE.chart, type: "bar", stacked: true },
                  colors: [B, O],
                  plotOptions: { bar: { horizontal: true, borderRadius: 4, borderRadiusApplication: "end" } },
                  xaxis: { ...APEX_BASE.xaxis, categories: ["Total NPV"], labels: { ...APEX_BASE.xaxis.labels, formatter: v => fmtK(v) } },
                  tooltip: { ...APEX_BASE.tooltip, y: { formatter: v => `${currSym}${fmtK(v)}` } },
                  dataLabels: { enabled: false },
                }} />
                <div className="lcoe-cost-summary-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:8, marginTop:12 }}>
                  {[
                    { label:"CAPEX share", v:`${fmt(R.capexTotal/R.totalDiscC*100,1)}%`, color:B },
                    { label:"O&M share",   v:`${fmt(R.opexNpv/R.totalDiscC*100,1)}%`,   color:O },
                    { label:"NPV Costs",   v:`${currSym}${fmtK(cx(R.totalDiscC))}`,      color:G },
                    { label:"LCOE (MWh)",  v:`${currSym}${fmt(cx(R.lcoe*1000),2)}/MWh`,  color:G },
                  ].map(({label,v,color})=>(
                    <div key={label} style={{ background:"#fffdf7", borderRadius:6, padding:"8px 10px", border:`1px solid ${color}1e` }}>
                      <div style={{ fontSize:9, color:"#94a3b8", marginBottom:3, fontWeight:700, letterSpacing:".07em", textTransform:"uppercase" }}>{label}</div>
                      <div style={{ fontFamily:"'JetBrains Mono'", fontSize:13, color }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sensitivity Tornado */}
            {chart==="tornado" && (
              <div>
                <div style={{ fontSize:11, color:"#64748B", marginBottom:18 }}>
                  LCOE change when each parameter varies ±20% · ranked by impact ({currency}/kWh)
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {sens.map(({label,low,high,swing})=>{
                    const maxS = sens[0].swing;
                    const pct = swing/maxS;
                    return (
                      <div key={label}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:11, color:"#475569", fontWeight:600 }}>{label}</span>
                          <span style={{ fontFamily:"'JetBrains Mono'", fontSize:10, color:"#64748B" }}>
                            swing ±{fmt(cx(swing/2),4)}
                          </span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", height:24, gap:3 }}>
                          <div style={{ flex:1, display:"flex", justifyContent:"flex-end" }}>
                            <div style={{ width:`${pct*50}%`, height:17,
                              background:`linear-gradient(90deg,transparent,${G}85)`,
                              borderRadius:"3px 0 0 3px", display:"flex", alignItems:"center",
                              justifyContent:"flex-end", paddingRight:5,
                              fontSize:10, color:G, fontFamily:"'JetBrains Mono'" }}>
                              {cx(low)>0?`+${fmt(cx(low),4)}`:fmt(cx(low),4)}
                            </div>
                          </div>
                          <div style={{ width:2, height:24, background:"#E2E8F0", flexShrink:0 }}/>
                          <div style={{ flex:1 }}>
                            <div style={{ width:`${pct*50}%`, height:17,
                              background:`linear-gradient(90deg,${O}85,transparent)`,
                              borderRadius:"0 3px 3px 0", display:"flex", alignItems:"center",
                              paddingLeft:5, fontSize:10, color:O, fontFamily:"'JetBrains Mono'" }}>
                              {cx(high)>0?`+${fmt(cx(high),4)}`:fmt(cx(high),4)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display:"flex", justifyContent:"center", gap:28, marginTop:20,
                  fontSize:10, color:"#64748B", fontFamily:"'JetBrains Mono'" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{ width:14, height:3, background:G, borderRadius:2 }}/>Favorable (−20%)
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{ width:14, height:3, background:O, borderRadius:2 }}/>Unfavorable (+20%)
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* ── Methodology ── */}
          <Card className="fu fu3" style={{ background:"#FFFFFF", border:"1px solid #E2E8F0" }}>
            <div className="lcoe-methodology-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20 }}>
              {[
                { title:"LCOE Formula", body:[
                  `LCOE = Σ Cost_t/(1+r)^t / Σ E_t/(1+r)^t`,
                  `E₀ = E_grid (yr 0, no degradation)`,
                  `E_t = E₀ × (f₁ − d×t), t ≥ 1  [linear]`,
                  `Cost₀ = CAPEX · Cost_t = O&M (constant)`,
                ]},
                { title:"Model Parameters", body:[
                  `WACC = ${fmt(p.discountRate,2)}% · Lifetime = ${p.projectLifetime} yrs`,
                  `f₁ = ${fmt(p.firstYearFactor,3)} · d = ${fmt(p.linearDeg*1000,2)}‰/yr`,
                  `Year-25 factor = ${fmt((p.firstYearFactor-p.linearDeg*25)*100,1)}%`,
                  `Exchange rate = ${fmt(exchangeRate,4)} ${currency}/USD`,
                ]},
                { title:"Key Results", body:[
                  `LCOE = ${fmt(cx(R.lcoe),4)} ${currency}/kWh = ${fmt(cx(R.lcoe*1000),2)} ${currSym}/MWh`,
                  `CAPEX = ${currSym}${fmtK(cx(R.capexTotal))} (${fmt(cx(R.capexTotal/p.systemCapacity),0)} ${currSym}/kWp)`,
                  `NPV Costs = ${currSym}${fmtK(cx(R.totalDiscC))}`,
                  `Disc. Energy = ${fmtK(R.totalDiscE)} kWh`,
                ]},
              ].map(({title,body})=>(
                <div key={title}>
                  <div style={{ fontSize:10, color:"#94a3b8", fontWeight:700,
                    letterSpacing:".1em", textTransform:"uppercase", marginBottom:7 }}>{title}</div>
                  {body.map((line,i)=>(
                    <div key={i} style={{ fontFamily:"'JetBrains Mono'", fontSize:11, color:"#64748B", marginBottom:3 }}>{line}</div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      {/* ── Currency popup (fixed overlay, outside Card to avoid overflow clipping) ── */}
      {showCurrencyPopup && (
        <div style={{
          position:"fixed", top:0, left:0, right:0, bottom:0,
          background:"rgba(0,0,0,.3)", zIndex:9999,
          display:"flex", alignItems:"center", justifyContent:"center",
        }} onClick={() => setShowCurrencyPopup(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background:"#fff", borderRadius:14, padding:"20px 22px 18px",
            boxShadow:"0 16px 48px rgba(0,0,0,.18)", width:280,
            fontFamily:"Inter, Arial, sans-serif",
          }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#0F172A", marginBottom:3 }}>Currency Settings</div>
            <div style={{ fontSize:10, color:"#64748B", marginBottom:14 }}>Convert all monetary values from USD</div>

            <label style={{ fontSize:9, fontWeight:700, color:"#94a3b8", letterSpacing:".08em", textTransform:"uppercase", display:"block", marginBottom:4 }}>Currency</label>
            <select
              value={tempCurrency}
              onChange={e => setTempCurrency(e.target.value)}
              style={{
                width:"100%", padding:"7px 10px", borderRadius:7,
                border:"1.5px solid #E2E8F0", fontSize:12,
                fontFamily:"'JetBrains Mono', monospace",
                color:"#0F172A", background:"#F8FAFC",
                marginBottom:12, outline:"none",
                cursor:"pointer", boxSizing:"border-box",
              }}
            >
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.code} — {c.symbol} — {c.name}</option>
              ))}
            </select>

            <label style={{ fontSize:9, fontWeight:700, color:"#94a3b8", letterSpacing:".08em", textTransform:"uppercase", display:"block", marginBottom:4 }}>Exchange Rate (1 USD = ?)</label>
            <input
              type="number" min={0.0001} step={0.01}
              value={tempRate}
              onChange={e => setTempRate(parseFloat(e.target.value) || 0)}
              style={{
                width:"100%", padding:"7px 10px", borderRadius:7,
                border:"1.5px solid #E2E8F0", fontSize:13,
                fontFamily:"'JetBrains Mono', monospace",
                color:"#0F172A", background:"#F8FAFC",
                marginBottom:16, outline:"none",
                boxSizing:"border-box",
              }}
            />

            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<RotateLeftOutlinedIcon />}
                onClick={() => {
                  setCurrency("USD"); setExchangeRate(1);
                  setTempCurrency("USD"); setTempRate(1);
                  setShowCurrencyPopup(false);
                }}
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
                onClick={() => {
                  setCurrency(tempCurrency);
                  setExchangeRate(tempCurrency === "USD" ? 1 : tempRate);
                  setShowCurrencyPopup(false);
                }}
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
        </div>
      )}
      {/* ── CAPEX input mode popup (same overlay pattern as currency) ── */}
      {showCapexInputModePopup && (
        <div style={{
          position:"fixed", top:0, left:0, right:0, bottom:0,
          background:"rgba(0,0,0,.3)", zIndex:10000,
          display:"flex", alignItems:"center", justifyContent:"center",
        }} onClick={() => setShowCapexInputModePopup(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background:"#fff", borderRadius:14, padding:"20px 22px 18px",
            boxShadow:"0 16px 48px rgba(0,0,0,.18)", width:280,
            fontFamily:"Inter, Arial, sans-serif",
          }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#0F172A", marginBottom:3 }}>CAPEX input mode</div>
            <div style={{ fontSize:10, color:"#64748B", marginBottom:14 }}>Choose how each line item is entered</div>

            <button
              type="button"
              onClick={() => { setCapexInputMode("per_kwp"); setShowCapexInputModePopup(false); }}
              style={{
                width:"100%", display:"flex", alignItems:"center", gap:12,
                padding:"11px 12px", marginBottom:8, borderRadius:8,
                border:capexInputMode === "per_kwp" ? `2px solid ${G}` : "1.5px solid #E2E8F0",
                background:capexInputMode === "per_kwp" ? "#FFFBEB" : "#F8FAFC",
                cursor:"pointer", boxSizing:"border-box",
                textAlign:"left", fontFamily:"Inter, Arial, sans-serif",
              }}
            >
              <ShowChartOutlined sx={{ fontSize:22, color: ICON_COLOR, flexShrink:0 }} />
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:"#0F172A" }}>{currency}/kWp</div>
                <div style={{ fontSize:10, color:"#64748B", marginTop:2 }}>One value per item (default)</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => { setCapexInputMode("quantity"); setShowCapexInputModePopup(false); }}
              style={{
                width:"100%", display:"flex", alignItems:"center", gap:12,
                padding:"11px 12px", marginBottom:14, borderRadius:8,
                border:capexInputMode === "quantity" ? `2px solid ${G}` : "1.5px solid #E2E8F0",
                background:capexInputMode === "quantity" ? "#FFFBEB" : "#F8FAFC",
                cursor:"pointer", boxSizing:"border-box",
                textAlign:"left", fontFamily:"Inter, Arial, sans-serif",
              }}
            >
              <CalculateOutlinedIcon sx={{ fontSize:22, color: ICON_COLOR, flexShrink:0 }} />
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:"#0F172A" }}>{currency} / Quantity</div>
                <div style={{ fontSize:10, color:"#64748B", marginTop:2 }}>Quantity × unit price per item</div>
              </div>
            </button>

            <Button
              size="small"
              variant="outlined"
              onClick={() => setShowCapexInputModePopup(false)}
              sx={{
                width:"100%",
                borderRadius: 2,
                textTransform: "none",
                border: "1px solid #E2E8F0",
                color: "#64748B",
                backgroundColor: "#F1F5F9",
                "&:hover": { border: "1px solid #CBD5E1", backgroundColor: "#E2E8F0" },
              }}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
