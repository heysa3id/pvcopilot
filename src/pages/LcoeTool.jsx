import { useState, useMemo, useCallback } from "react";
import Chart from "react-apexcharts";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ConstructionOutlinedIcon from "@mui/icons-material/ConstructionOutlined";
import WbSunnyOutlinedIcon from "@mui/icons-material/WbSunnyOutlined";
import SolarPowerOutlinedIcon from "@mui/icons-material/SolarPowerOutlined";
import ElectricBoltOutlinedIcon from "@mui/icons-material/ElectricBoltOutlined";
import BatteryChargingFullOutlinedIcon from "@mui/icons-material/BatteryChargingFullOutlined";
import AttachMoneyOutlinedIcon from "@mui/icons-material/AttachMoneyOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";

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
const DEFAULTS = {
  systemCapacity:    998,
  ratedPowerAC:      875.4,
  dcAcRatio:         1.14,
  modulePower:       605,
  specificYield:     1883,
  annualEnergy:      1879234,
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
function calcAll(p) {
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

  const catTotals = CAPEX_CATS.map(cat => ({
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

function sensitivity(base, R) {
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
    const low  = calcAll(fn(base, 0.8)).lcoe;
    const high = calcAll(fn(base, 1.2)).lcoe;
    return { label, low:low-R.lcoe, high:high-R.lcoe, swing:high-low };
  }).sort((a,b)=>b.swing-a.swing);
}

// ── PVsyst PDF Parser (Python backend; set VITE_PARSER_URL for production) ──
const PARSER_URL = import.meta.env.VITE_PARSER_URL || "http://localhost:5001/api/parse-pvsyst";

const PARSER_UNAVAILABLE_MSG =
  "Load PVsyst Report is not available in the online demo (parser backend is not running). Run the app locally (see README) or enter values manually.";

async function parsePVsystPDF(file) {
  const formData = new FormData();
  formData.append("file", file);
  let response;
  try {
    response = await fetch(PARSER_URL, { method: "POST", body: formData });
  } catch (e) {
    const msg = e?.message || "";
    const isNetwork = /failed to fetch|network|load failed|cors/i.test(msg) || msg === "Load failed";
    throw new Error(isNetwork ? PARSER_UNAVAILABLE_MSG : msg || PARSER_UNAVAILABLE_MSG);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Parser error ${response.status}`);
  return data;
}

// ── UI Helpers ────────────────────────────────────────────────────────────────
function Lbl({ children, sub }) {
  return (
    <div style={{ marginBottom: 5 }}>
      <span style={{
        fontSize:11,
        fontFamily:"'Inter', system-ui, sans-serif",
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
      {label && <span style={{ fontSize:10, color:"#64748B", fontFamily:"'Inter'",
        fontWeight:700, letterSpacing:".1em", textTransform:"uppercase" }}>{label}</span>}
      <div style={{ flex:1, height:1, background:"#CBD5E1" }} />
    </div>
  );
}

// ── Shared ApexCharts base config ─────────────────────────────────────────────
const APEX_BASE = {
  chart: { fontFamily: "'Inter', system-ui, sans-serif", toolbar: { show: false }, zoom: { enabled: false }, background: "transparent" },
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
  const [panel, setPanel] = useState("system");
  const [chart, setChart] = useState("energy");
  const [hiddenCfSeries, setHiddenCfSeries] = useState({});
  const [openCat, setOpenCat] = useState({});
  const [pdfState, setPdfState] = useState({ status: "idle", filename: "", extracted: null, error: null });
  const [dragOver, setDragOver] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);

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

  const handlePDF = useCallback(async (file) => {
    if (!file || file.type !== "application/pdf") {
      setPdfState({ status: "error", filename: file?.name || "", extracted: null, error: "Please upload a PDF file." });
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
      setPdfState({ status: "error", filename: file.name, extracted: null, error: e.message });
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    handlePDF(e.dataTransfer.files[0]);
  }, [handlePDF]);

  const R   = useMemo(() => calcAll(p), [p]);
  const sens = useMemo(() => sensitivity(p, R), [p, R]);
  // LCOE thresholds based on $/MWh (R.lcoe is $/kWh)
  const lcoeMwh = R.lcoe * 1000;
  const lcoeColor  = lcoeMwh > 45 ? "#dc2626" : lcoeMwh < 34 ? Y : G;
  const lcoeRating = lcoeMwh > 45 ? "Low" : lcoeMwh < 34 ? "Excellent" : "Rentable";

  return (
    <div style={{ minHeight:"100vh", background:"#FFFFFF", fontFamily:"'Inter',system-ui,sans-serif",
      color:"#0F172A", padding:"28px 20px" }}>

      {/* ──────────── TOOL OVERVIEW (COLLAPSIBLE) ──────────── */}
      <div style={{ maxWidth:1380, margin:"0 auto 24px", padding:"0 20px" }}>
        <Card>
          <div
            style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", cursor:"pointer", gap:16 }}
            onClick={() => setOverviewOpen(o => !o)}
          >
            <div>
              <div style={{ fontSize:9, color:"#94a3b8", fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", marginBottom:4 }}>
                Tool Overview
              </div>
              <div style={{ fontSize:18, fontWeight:800, color:"#0F172A" }}>
                PV LCOE and payback calculator
              </div>
            </div>
            <div style={{ marginLeft:"auto", borderRadius:"999px", background:"#F8FAFC", border:"1px solid #E2E8F0", padding:4, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {overviewOpen ? (
                <ExpandLessIcon sx={{ fontSize:18, color:"#94a3b8" }} />
              ) : (
                <ExpandMoreIcon sx={{ fontSize:18, color:"#94a3b8" }} />
              )}
            </div>
          </div>
          {overviewOpen && (
            <div style={{ marginTop:20, display:"grid", gridTemplateColumns:"2fr 2fr 1.6fr", gap:16 }}>
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
                  <div>LCOE = {fmt(R.lcoe,4)} USD/kWh</div>
                  <div>CAPEX = ${fmtK(R.capexTotal)}</div>
                  <div>NPV Costs = ${fmtK(R.totalDiscC)}</div>
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

      <div style={{ maxWidth:1380, margin:"0 auto 40px", padding:"0 20px", display:"grid", gridTemplateColumns:"360px 1fr", gap:"20px", alignItems:"start" }}>
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
                  <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>Drop PDF here or click to browse · auto-fills system parameters</div>
                  {typeof window !== "undefined" && window.location?.hostname !== "localhost" && PARSER_URL.includes("localhost") && (
                    <div style={{ fontSize:10, color: O, marginTop:6 }}>Not available in online demo — run locally to use</div>
                  )}
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
                      color:"#64748B", fontSize:10, cursor:"pointer", fontFamily:"'Inter'" }}>Clear</button>
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
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5 }}>
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
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <NI label="Specific Yield" sub="From PVsyst simulation"
                  value={p.specificYield} unit="kWh/kWp" min={100} max={3000} step={10} onChange={set("specificYield")} />
                <NI label="Performance Ratio" sub="PR from PVsyst"
                  value={p.performanceRatio} unit="%" min={50} max={100} step={0.01} onChange={set("performanceRatio")} />
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
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
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
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18, paddingBottom:14, borderBottom:"1px solid #E2E8F0" }}>
                <ConstructionOutlinedIcon sx={{ fontSize:20, color: ICON_COLOR }} />
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:"#0F172A" }}>CAPEX Breakdown</div>
                  <div style={{ fontSize:10, color:"#94a3b8" }}>USD/kWp per item · total converts to USD</div>
                </div>
              </div>
              {CAPEX_CATS.map(cat => {
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
                        <span style={{ fontFamily:"'Inter'", fontWeight:700, fontSize:11,
                          color:cat.color, letterSpacing:".05em", textTransform:"uppercase" }}>{cat.label}</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontFamily:"'JetBrains Mono'", fontSize:11, color:"#475569" }}>{fmt(catSum,1)} USD/kWp</span>
                        <span style={{ color:"#64748B", fontSize:11 }}>{isOpen?"▲":"▼"}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ paddingTop:8 }}>
                        {cat.items.map(item=>(
                          <div key={item.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
                            <div style={{ fontSize:11, color:"#64748B", flex:1 }}>{item.label}</div>
                            <div style={{ width:110, position:"relative" }}>
                              <input type="number" value={p.capex[item.id]} min={0} step={0.1}
                                onChange={e=>setCapex(item.id, parseFloat(e.target.value)||0)}
                                style={{ paddingRight:42 }} />
                              <span style={{ position:"absolute", right:7, top:"50%", transform:"translateY(-50%)",
                                fontSize:9, color:"#64748B", fontFamily:"'JetBrains Mono'", pointerEvents:"none" }}>$/kWp</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ background:"#fffdf7", borderRadius:7, padding:"12px 14px", border:"1.5px solid #FFE082", marginTop:10 }}>
                {[
                  { label:"Total (USD/kWp)",      v:`${fmt(R.capexUsdKwp,1)} USD/kWp` },
                  { label:"Total (USD)", v:`$${fmtK(R.capexTotal)}`, hi:true },
                  { label:`Per kWp ($/kWp)`, v:`${fmt(R.capexTotal/p.systemCapacity,0)} $/kWp` },
                ].map(({label,v,hi})=>(
                  <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #E2E8F0" }}>
                    <span style={{ fontSize:11, color:"#64748B" }}>{label}</span>
                    <span style={{ fontFamily:"'JetBrains Mono'", fontSize:12, color:hi?G:"#0F172A" }}>{v}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── Finance ── */}
          {panel==="finance" && (
            <Card className="fu">
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18, paddingBottom:14, borderBottom:"1px solid #E2E8F0" }}>
                <AttachMoneyOutlinedIcon sx={{ fontSize:20, color: ICON_COLOR }} />
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:"#0F172A" }}>Financial Parameters</div>
                  <div style={{ fontSize:10, color:"#94a3b8" }}>WACC · O&M · tariff · project life</div>
                </div>
              </div>
              <NI label="O&M Cost" sub="$/kWp/yr · constant (no escalation)"
                value={p.omPerKwp} unit="$/kWp" min={0} max={500} step={0.5} onChange={set("omPerKwp")} />
              <Sl label="Discount Rate (WACC)" value={p.discountRate}
                min={1} max={20} step={0.25} unit="%" onChange={set("discountRate")} />
              <Sl label="Project Lifetime" value={p.projectLifetime}
                min={10} max={40} step={1} unit=" yrs" onChange={set("projectLifetime")} dp={0} />
              <Div label="Revenue (for IRR & Payback)" />
              <NI label="PPA / Feed-in Tariff" sub="used for IRR and payback only — not for LCOE"
                value={p.tariffPrice} unit="$/kWh" min={0} max={0.5} step={0.001} onChange={set("tariffPrice")} />
              <Div label="Financial Summary" />
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[
                  { label:"Annual O&M",     v:`$${fmtK(R.omAnnual)}` },
                  { label:"O&M NPV",        v:`$${fmtK(R.opexNpv)}` },
                  { label:"Annual Revenue (yr 1)", v:`$${fmtK(p.annualEnergy*p.firstYearFactor*p.tariffPrice)}` },
                  { label:"Net yr-1 Cashflow", v:`$${fmtK(p.annualEnergy*p.firstYearFactor*p.tariffPrice-R.omAnnual)}` },
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
              <div style={{ fontSize:9, color:"#94a3b8", fontWeight:700, letterSpacing:".08em",
                textTransform:"uppercase", marginBottom:8, whiteSpace:"nowrap" }}>Levelized Cost of Energy</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:8 }}>
                <span style={{ fontFamily:"'JetBrains Mono'", fontSize:"clamp(28px,4vw,42px)", fontWeight:700,
                  color:lcoeColor, lineHeight:1 }}>{fmt(R.lcoe,4)}</span>
                <span style={{ fontSize:12, color:"#64748B" }}>USD/kWh</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{
                  fontSize:10,
                  fontWeight:700,
                  letterSpacing:".08em",
                  textTransform:"uppercase",
                  padding:"3px 10px",
                  borderRadius:9999,
                  background:lcoeColor+"15",
                  border:`1px solid ${lcoeColor}33`,
                  color:lcoeColor,
                  fontFamily:"'Inter', system-ui, sans-serif"
                }}>
                  {lcoeRating}
                </span>
                <span style={{ fontSize:10, color:"#94a3b8", fontFamily:"'JetBrains Mono'" }}>
                  {fmt(R.lcoe*1000,2)} $/MWh
                </span>
              </div>
            </Card>
          </div>
          {/* ── Row 2: 4 metric cards ── */}
          <div className="fu fu1" style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginBottom:4 }}>
            {[
              { label:"Total CAPEX", value:`$${fmtK(R.capexTotal)}`,
                sub:`${fmt(R.capexTotal/p.systemCapacity,0)} $/kWp`, color:B },
              { label:"Capacity Factor", value:`${fmt(R.capacityFactor,2)}%`,
                sub:`${fmt(R.lifeEnMWh,0)} MWh lifetime`, color:P },
              { label:"Payback (TRI)",
                value:isFinite(R.simplePayback)?`${fmt(R.simplePayback,2)} yrs`:"—",
                sub:`at ${fmt(p.tariffPrice,3)} $/kWh`, color:Y },
              { label:"IRR", value:R.irr?`${fmt(R.irr,2)}%`:"—",
                sub:R.projectNpv>=0?`NPV +$${fmtK(R.projectNpv)}`:`NPV -$${fmtK(Math.abs(R.projectNpv))}`,
                color:R.irr&&R.irr>p.discountRate?G:O },
            ].map(({label,value,sub,color})=>(
              <Card key={label} style={{ border:`1px solid ${color}1e` }}>
                <div style={{ fontSize:9, color:"#94a3b8", fontWeight:700, letterSpacing:".1em",
                  textTransform:"uppercase", marginBottom:8 }}>{label}</div>
                <div style={{ fontFamily:"'JetBrains Mono'", fontSize:"clamp(16px,2vw,22px)", color, marginBottom:4, fontWeight:600 }}>{value}</div>
                <div style={{ fontSize:10, color:"#94a3b8" }}>{sub}</div>
              </Card>
            ))}
          </div>

          {/* ── Chart area ── */}
          <Card className="fu fu2">
            <div style={{ display:"flex", gap:4, marginBottom:20,
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
                    { name: "Disc. O&M ($)", data: R.rows.map(r => r.discCost) },
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
                      ...visVals("Discounted revenue",  R.cashFlowRows.map(r => r.discountedRevenue)),
                      ...visVals("Discounted OPEX (−)", R.cashFlowRows.map(r => r.discountedOpex)),
                    ];
                    const rightVals = [
                      ...visVals("Discounted CAPEX (−)",       R.cashFlowRows.map(r => r.discountedCapex)),
                      ...visVals("Discounted net cash flow",   R.cashFlowRows.map(r => r.discountedNetCashFlow)),
                      ...visVals("Cumulative disc. cash flow", R.cashFlowRows.map(r => r.cumulativeDiscountedCashFlow)),
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
                          { name: "Discounted revenue",        type: "column", data: vis("Discounted revenue",        R.cashFlowRows.map(r => r.discountedRevenue)) },
                          { name: "Discounted OPEX (−)",       type: "column", data: vis("Discounted OPEX (−)",        R.cashFlowRows.map(r => r.discountedOpex)) },
                          { name: "Discounted CAPEX (−)",      type: "column", data: vis("Discounted CAPEX (−)",       R.cashFlowRows.map(r => r.discountedCapex)) },
                          { name: "Discounted net cash flow",  type: "line",   data: vis("Discounted net cash flow",   R.cashFlowRows.map(r => r.discountedNetCashFlow)) },
                          { name: "Cumulative disc. cash flow",type: "line",   data: vis("Cumulative disc. cash flow", R.cashFlowRows.map(r => r.cumulativeDiscountedCashFlow)) },
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
                            { ...APEX_BASE.yaxis, min: minL, max: maxL, seriesName: "Discounted revenue",   labels: { ...APEX_BASE.yaxis.labels, formatter: v => fmtK(v) }, title: { text: "Revenue & OPEX ($)", style: { color: "#94a3b8", fontSize: "10px" } } },
                            { ...APEX_BASE.yaxis, min: minL, max: maxL, seriesName: "Discounted revenue",   show: false },
                            { ...APEX_BASE.yaxis, min: minR, max: maxR, seriesName: "Discounted CAPEX (−)", opposite: true, labels: { ...APEX_BASE.yaxis.labels, formatter: v => fmtK(v) }, title: { text: "CAPEX · Net CF · Cumulative ($)", style: { color: "#1f2937", fontSize: "10px" } } },
                            { ...APEX_BASE.yaxis, min: minR, max: maxR, seriesName: "Discounted CAPEX (−)", show: false },
                            { ...APEX_BASE.yaxis, min: minR, max: maxR, seriesName: "Discounted CAPEX (−)", show: false },
                          ],
                          annotations: { yaxis: [{ y: 0, borderColor: "#CBD5E1", strokeDashArray: 4 }] },
                          tooltip: { ...APEX_BASE.tooltip, y: { formatter: v => `$${fmtK(Math.abs(v))} ${v < 0 ? "(−)" : ""}` } },
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
                    { label:"Project NPV",          v: `${R.projectNpv>=0?"+":""}$${fmtK(R.projectNpv)}`, color: R.projectNpv>=0?"#16a34a":"#f97316" },
                  ].map(({label,v,color})=>(
                    <div key={label} style={{ background:"#fffdf7", borderRadius:7, padding:"9px 12px", border:"1px solid #E2E8F0" }}>
                      <div style={{ fontSize:9, color:"#94a3b8", fontWeight:700, letterSpacing:".07em", textTransform:"uppercase", marginBottom:4 }}>{label}</div>
                      <div style={{ fontFamily:"'JetBrains Mono'", fontSize:14, fontWeight:600, color }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cost Breakdown */}
            {chart==="costs" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
                <div>
                  <div style={{ fontSize:11, color:"#64748B", marginBottom:12 }}>CAPEX by category</div>
                  <Chart type="donut" height={240} series={R.catTotals.map(c => c.localTotal)} options={{
                    chart: { ...APEX_BASE.chart, type: "donut" },
                    labels: R.catTotals.map(c => c.label),
                    colors: R.catTotals.map(c => c.color),
                    plotOptions: { pie: { donut: { size: "62%" } } },
                    legend: { show: false },
                    dataLabels: { enabled: false },
                    tooltip: { ...APEX_BASE.tooltip, y: { formatter: v => `$${fmtK(v)}` } },
                  }} />
                  <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:8 }}>
                    {R.catTotals.map(c=>(
                      <div key={c.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:7, height:7, borderRadius:"50%", background:c.color, flexShrink:0 }}/>
                        <span style={{ fontSize:10, color:"#64748B", flex:1 }}>{c.label}</span>
                        <span style={{ fontFamily:"'JetBrains Mono'", fontSize:10, color:c.color }}>{fmt(c.usdKwp,1)} USD/kWp</span>
                        <span style={{ fontFamily:"'JetBrains Mono'", fontSize:10, color:"#475569" }}>{fmt(c.localTotal/R.capexTotal*100,1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:"#64748B", marginBottom:12 }}>CAPEX vs discounted O&M NPV</div>
                  <Chart type="bar" height={140} series={[
                    { name: "CAPEX", data: [R.capexTotal] },
                    { name: "O&M NPV", data: [R.opexNpv] },
                  ]} options={{
                    ...APEX_BASE,
                    chart: { ...APEX_BASE.chart, type: "bar", stacked: true },
                    colors: [B, O],
                    plotOptions: { bar: { horizontal: true, borderRadius: 4, borderRadiusApplication: "end" } },
                    xaxis: { ...APEX_BASE.xaxis, categories: ["Total NPV"], labels: { ...APEX_BASE.xaxis.labels, formatter: v => fmtK(v) } },
                    tooltip: { ...APEX_BASE.tooltip, y: { formatter: v => `$${fmtK(v)}` } },
                    dataLabels: { enabled: false },
                  }} />
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:14 }}>
                    {[
                      { label:"CAPEX share", v:`${fmt(R.capexTotal/R.totalDiscC*100,1)}%`, color:B },
                      { label:"O&M share",   v:`${fmt(R.opexNpv/R.totalDiscC*100,1)}%`,   color:O },
                      { label:"NPV Costs",   v:`$${fmtK(R.totalDiscC)}`,            color:G },
                      { label:"LCOE (MWh)", v:`$${fmt(R.lcoe*1000,2)}/MWh`,        color:G },
                    ].map(({label,v,color})=>(
                      <div key={label} style={{ background:"#fffdf7", borderRadius:6, padding:"8px 10px", border:`1px solid ${color}1e` }}>
                        <div style={{ fontSize:9, color:"#94a3b8", marginBottom:3, fontWeight:700, letterSpacing:".07em", textTransform:"uppercase" }}>{label}</div>
                        <div style={{ fontFamily:"'JetBrains Mono'", fontSize:13, color }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Sensitivity Tornado */}
            {chart==="tornado" && (
              <div>
                <div style={{ fontSize:11, color:"#64748B", marginBottom:18 }}>
                  LCOE change when each parameter varies ±20% · ranked by impact (USD/kWh)
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
                            swing ±{fmt(swing/2,4)}
                          </span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", height:24, gap:3 }}>
                          <div style={{ flex:1, display:"flex", justifyContent:"flex-end" }}>
                            <div style={{ width:`${pct*50}%`, height:17,
                              background:`linear-gradient(90deg,transparent,${G}85)`,
                              borderRadius:"3px 0 0 3px", display:"flex", alignItems:"center",
                              justifyContent:"flex-end", paddingRight:5,
                              fontSize:10, color:G, fontFamily:"'JetBrains Mono'" }}>
                              {low>0?`+${fmt(low,4)}`:fmt(low,4)}
                            </div>
                          </div>
                          <div style={{ width:2, height:24, background:"#E2E8F0", flexShrink:0 }}/>
                          <div style={{ flex:1 }}>
                            <div style={{ width:`${pct*50}%`, height:17,
                              background:`linear-gradient(90deg,${O}85,transparent)`,
                              borderRadius:"0 3px 3px 0", display:"flex", alignItems:"center",
                              paddingLeft:5, fontSize:10, color:O, fontFamily:"'JetBrains Mono'" }}>
                              {high>0?`+${fmt(high,4)}`:fmt(high,4)}
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
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20 }}>
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
                  `Exchange rate = ${fmt(1,2)} $/USD`,
                ]},
                { title:"Key Results", body:[
                  `LCOE = ${fmt(R.lcoe,4)} USD/kWh = ${fmt(R.lcoe*1000,2)} mills/kWh`,
                  `CAPEX = $${fmtK(R.capexTotal)} (${fmt(R.capexTotal/p.systemCapacity,0)} $/kWp)`,
                  `NPV Costs = $${fmtK(R.totalDiscC)}`,
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
    </div>
  );
}
