import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  CloudDownloadOutlined,
  SyncOutlined,
  SearchOutlined,
  TrendingUpOutlined,
  AssessmentOutlined,
  BoltOutlined,
  AttachMoneyOutlined,
  SummarizeOutlined,
  LinkOutlined,
  QueryStats,
  AutoFixHigh,
  ElectricBolt,
  Savings,
  FilterAltOutlined,
  LinkedIn,
  GitHub,
  YouTube,
} from "@mui/icons-material";

const G = "#FFB800", B = "#1d9bf0", O = "#ff7a45", Y = "#16a34a", P = "#8b5cf6";
const ICON_COLOR = G;

const PIPE = [
  { id: "ingest",  label: "Data Ingestion",   sub: "PV .csv · Weather .csv · System .json", icon: <CloudDownloadOutlined sx={{ fontSize: 22 }} />, color: "#6366f1" },
  { id: "sync",    label: "Synchronization",   sub: "Timestamp alignment & resampling",      icon: <SyncOutlined sx={{ fontSize: 22 }} />, color: "#0ea5e9" },
  { id: "qc",      label: "Data Ingestion & Sync", sub: "Ingestion, synchronization & validation", icon: <SearchOutlined sx={{ fontSize: 22 }} />, color: P },
  { id: "gap",     label: "Gap Filling",       sub: "ML models · historical pattern matching",icon: <TrendingUpOutlined sx={{ fontSize: 22 }} />, color: "#10b981" },
  { id: "kpi",     label: "KPI Calculation",   sub: "IEC 61724 · PR · degradation Rd",       icon: <AssessmentOutlined sx={{ fontSize: 22 }} />, color: Y },
  { id: "predict", label: "Power Prediction",  sub: "Physical + ML forecast models",         icon: <BoltOutlined sx={{ fontSize: 22 }} />, color: O },
  { id: "lcoe",    label: "LCOE & Financials", sub: "Levelized cost · IRR · NPV · payback",  icon: <AttachMoneyOutlined sx={{ fontSize: 22 }} />, color: G },
  { id: "report",  label: "System Report",     sub: "PDF / dashboard export",                icon: <SummarizeOutlined sx={{ fontSize: 22 }} />, color: "#94a3b8" },
];

const TOOL_ICONS = {
  quality: <SearchOutlined sx={{ fontSize: 22, color: ICON_COLOR }} />,
  kpi: <QueryStats sx={{ fontSize: 22, color: ICON_COLOR }} />,
  gap: <AutoFixHigh sx={{ fontSize: 22, color: ICON_COLOR }} />,
  predict: <ElectricBolt sx={{ fontSize: 22, color: ICON_COLOR }} />,
  lcoe: <Savings sx={{ fontSize: 22, color: ICON_COLOR }} />,
  filter: <FilterAltOutlined sx={{ fontSize: 22, color: ICON_COLOR }} />,
};

const SOCIAL_LINKS = [
  { id: "LinkedIn", icon: <LinkedIn sx={{ fontSize: 18, color: ICON_COLOR }} /> },
  { id: "GitHub", icon: <GitHub sx={{ fontSize: 18, color: ICON_COLOR }} /> },
  { id: "YouTube", icon: <YouTube sx={{ fontSize: 18, color: ICON_COLOR }} /> },
];

function HeroParticles() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animId;
    let mouse = { x: null, y: null };

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouseMove = e => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onMouseLeave = () => { mouse.x = null; mouse.y = null; };
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);

    const N = 70;
    const particles = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      r: Math.random() * 2 + 1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      });

      // Draw links
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255,184,0,${0.25 * (1 - dist / 130)})`;
            ctx.lineWidth = 0.8;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }

        // Link to mouse
        if (mouse.x !== null) {
          const dx = particles[i].x - mouse.x;
          const dy = particles[i].y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 160) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255,184,0,${0.55 * (1 - dist / 160)})`;
            ctx.lineWidth = 1;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }

      // Draw dots
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,184,0,0.55)";
        ctx.fill();
      });

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        zIndex: 0, pointerEvents: "auto",
        display: "block",
      }}
    />
  );
}

function SolarTrajectory() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animId;
    let startTime = null;
    const DURATION = 12000; // 12 s per day cycle

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Parabolic arc: t=0 → bottom-left, t=0.5 → top-center, t=1 → bottom-right
    const sunPos = t => {
      const px = 0.08 + t * 0.84;
      const py = 0.82 - (1 - 4 * Math.pow(t - 0.5, 2)) * 0.72;
      return { x: px * canvas.width, y: py * canvas.height };
    };

    // Color: sunrise (orange) → noon (golden-white) → sunset (red-amber)
    const sunColor = t => {
      const h = 1 - 4 * Math.pow(t - 0.5, 2); // 0 at edges, 1 at noon
      const r = 255;
      const g = Math.round(80  + h * 155);  // 80 → 235
      const b = Math.round(h * 60);          // 0 → 60
      return { r, g, b };
    };

    const draw = ts => {
      if (!startTime) startTime = ts;
      const t = ((ts - startTime) % DURATION) / DURATION;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const { x, y } = sunPos(t);
      const { r, g, b } = sunColor(t);
      const h = 1 - 4 * Math.pow(t - 0.5, 2);
      const glowR  = 50 + h * 110;
      const coreR  = 6  + h * 5;

      // ── Dashed arc path (already-traveled portion) ──────────────────
      ctx.beginPath();
      ctx.setLineDash([4, 10]);
      ctx.lineWidth = 0.8;
      for (let i = 0; i <= t; i += 0.003) {
        const p = sunPos(i);
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.08 + h * 0.1})`;
      ctx.stroke();
      ctx.setLineDash([]);

      // ── Light rays ───────────────────────────────────────────────────
      const numRays = 12;
      for (let i = 0; i < numRays; i++) {
        const angle   = (i / numRays) * Math.PI * 2 + ts * 0.00008;
        const rayLen  = glowR * 2.2;
        const opacity = 0.04 + h * 0.07;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        const rg = ctx.createLinearGradient(coreR, 0, rayLen, 0);
        rg.addColorStop(0,   `rgba(${r},${g},${b},${opacity})`);
        rg.addColorStop(0.5, `rgba(${r},${g},${b},${opacity * 0.4})`);
        rg.addColorStop(1,   `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.moveTo(coreR, -2.5);
        ctx.lineTo(rayLen, -0.5);
        ctx.lineTo(rayLen,  0.5);
        ctx.lineTo(coreR,  2.5);
        ctx.fillStyle = rg;
        ctx.fill();
        ctx.restore();
      }

      // ── Outer atmospheric glow ───────────────────────────────────────
      const og = ctx.createRadialGradient(x, y, coreR, x, y, glowR * 2.5);
      og.addColorStop(0,   `rgba(${r},${g},${b},${0.12 + h * 0.1})`);
      og.addColorStop(0.4, `rgba(${r},${g},${b},${0.05 + h * 0.05})`);
      og.addColorStop(1,   `rgba(${r},${g},${b},0)`);
      ctx.beginPath();
      ctx.arc(x, y, glowR * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = og;
      ctx.fill();

      // ── Inner corona glow ────────────────────────────────────────────
      const ig = ctx.createRadialGradient(x, y, 0, x, y, glowR);
      ig.addColorStop(0,   `rgba(${r},${g},${b},${0.4 + h * 0.2})`);
      ig.addColorStop(0.3, `rgba(${r},${g},${b},${0.15 + h * 0.1})`);
      ig.addColorStop(1,   `rgba(${r},${g},${b},0)`);
      ctx.beginPath();
      ctx.arc(x, y, glowR, 0, Math.PI * 2);
      ctx.fillStyle = ig;
      ctx.fill();

      // ── Sun core ─────────────────────────────────────────────────────
      const sg = ctx.createRadialGradient(x, y, 0, x, y, coreR);
      sg.addColorStop(0,   "rgba(255,255,255,0.95)");
      sg.addColorStop(0.5, `rgba(${r},${g},${b},0.9)`);
      sg.addColorStop(1,   `rgba(${r},${g},${b},0.6)`);
      ctx.beginPath();
      ctx.arc(x, y, coreR, 0, Math.PI * 2);
      ctx.fillStyle = sg;
      ctx.fill();

      // ── Horizon warm tint at sunrise / sunset ────────────────────────
      if (h < 0.35) {
        const horizOpacity = (0.35 - h) * 0.22;
        const hg = ctx.createLinearGradient(0, canvas.height * 0.6, 0, canvas.height);
        hg.addColorStop(0, `rgba(${r},${Math.round(g * 0.5)},0,0)`);
        hg.addColorStop(1, `rgba(${r},${Math.round(g * 0.5)},0,${horizOpacity})`);
        ctx.fillStyle = hg;
        ctx.fillRect(0, canvas.height * 0.6, canvas.width, canvas.height * 0.4);
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        zIndex: 0, pointerEvents: "none", display: "block",
      }}
    />
  );
}

function ToolCard({ icon, title, subtitle, color, desc, tags, path }) {
  return (
    <div
      style={{
        background: "#FFFFFF", border: "1px solid #E2E8F0",
        borderTop: `3px solid ${color}`,
        borderRadius: 12, padding: "22px 24px",
        boxShadow: "0 1px 3px rgba(0,0,0,.04)",
        transition: "box-shadow .25s, transform .25s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "0 8px 30px rgba(0,0,0,.08)";
        e.currentTarget.style.transform = "translateY(-3px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,.04)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 11,
          background: `${color}10`, border: `1.5px solid ${color}35`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>{title}</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{subtitle}</div>
        </div>
      </div>
      <p style={{ fontSize: 13, color: "#64748B", lineHeight: 1.7, marginBottom: 16 }}>{desc}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {tags.map(t => (
          <span key={t} style={{
            padding: "3px 10px", background: `${color}0a`, color,
            borderRadius: 20, fontSize: 10, fontWeight: 600,
          }}>
            {t}
          </span>
        ))}
      </div>
      <Link to={path} style={{
        fontSize: 13, fontWeight: 700, color, textDecoration: "none",
        display: "inline-flex", alignItems: "center", gap: 4,
      }}>
        Open tool <span style={{ fontSize: 15, transition: "transform .15s" }}>→</span>
      </Link>
    </div>
  );
}

export default function LandingPage() {
  const [teamImgError, setTeamImgError] = useState(false);
  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", color: "#0F172A" }}>

      {/* ━━━ HERO — dark, dramatic, geometric ━━━ */}
      <section style={{
        position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)",
        padding: "100px 24px 100px", minHeight: 540,
      }}>
        {/* Sun trajectory: sunrise → noon → sunset */}
        <SolarTrajectory />

        {/* Canvas particle network */}
        <HeroParticles />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
          {/* Hero logo */}
          <div style={{ marginBottom: 28 }}>
            <img src="/logoWhite.svg" alt="PVCopilot" style={{ height: 141, objectFit: "contain" }} />
          </div>

          <h1 style={{
            fontSize: "clamp(36px, 5.5vw, 60px)", fontWeight: 800,
            letterSpacing: "-.03em", lineHeight: 1.1, marginBottom: 20, color: "#FFFFFF",
          }}>
            Automate your SolarPV
            <br />
            <span style={{
              background: `linear-gradient(90deg, ${G}, #ff9500)`,
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              Data Processing
            </span>
          </h1>

          <p style={{
            fontSize: "clamp(15px, 1.6vw, 18px)", color: "#94a3b8",
            lineHeight: 1.75, maxWidth: 600, margin: "0 auto 40px",
          }}>
            From raw sensor data to bankable reports — PVCopilot chains data ingestion,
            gap filling, KPI analysis, performance prediction, and LCOE evaluation
            into one integrated pipeline.
          </p>

          {/* CTAs — pill buttons */}
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <Link to="/lcoe-tool" style={{
              padding: "13px 34px", background: G, color: "#0F172A",
              textDecoration: "none", borderRadius: 9999, fontWeight: 700,
              fontSize: 15, boxShadow: `0 4px 20px rgba(255,184,0,.35)`,
              transition: "transform .15s, box-shadow .15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 30px rgba(255,184,0,.45)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(255,184,0,.35)"; }}
            >
              Launch LCOE Tool
            </Link>
            <a href="#pipeline" style={{
              padding: "13px 34px", background: "transparent",
              color: "#CBD5E1", textDecoration: "none", borderRadius: 9999,
              fontWeight: 600, fontSize: 15,
              border: "1.5px solid rgba(255,255,255,.15)",
              transition: "border-color .15s, color .15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,.3)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,.15)"; e.currentTarget.style.color = "#CBD5E1"; }}
            >
              View Pipeline ↓
            </a>
          </div>

          {/* Stat badges */}
          <div style={{
            display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap",
            marginTop: 56, paddingTop: 32,
            borderTop: "1px solid rgba(255,255,255,.06)",
          }}>
            {[
              { value: "5", label: "Analysis Modules" },
              { value: "IEC 61724", label: "Compliant KPIs" },
              { value: "20+", label: "CAPEX Line Items" },
              { value: "40 yr", label: "Project Horizon" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#FFFFFF", fontFamily: "'JetBrains Mono', monospace" }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ PIPELINE ━━━ */}
      <section id="pipeline" style={{ padding: "64px 24px 72px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, textAlign: "center", marginBottom: 6 }}>
          End-to-End Processing Pipeline
        </h2>
        <p style={{ fontSize: 14, color: "#94a3b8", textAlign: "center", marginBottom: 40 }}>
          Each stage outputs corrected data that feeds the next — run the full chain or any subset
        </p>

        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          gap: 0, overflowX: "auto", padding: "8px 0 16px",
        }}>
          {PIPE.map((step, i) => (
            <div key={step.id} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              {/* Card */}
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 8, padding: "14px 10px 12px", width: 100,
                cursor: "default",
              }}>
                {/* Icon container — per-step color highlight */}
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: `${step.color}12`,
                  border: `1.5px solid ${step.color}40`,
                  boxShadow: `0 1px 4px ${step.color}15`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative",
                  transition: "box-shadow .15s, background .15s",
                  color: step.color,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = `0 4px 14px ${step.color}40`;
                  e.currentTarget.style.background = `${step.color}22`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = `0 1px 4px ${step.color}15`;
                  e.currentTarget.style.background = `${step.color}12`;
                }}
                >
                  {/* Clone icon with step color */}
                  <span style={{ color: step.color, display:"flex" }}>{step.icon}</span>
                  {/* Step number dot */}
                  <span style={{
                    position: "absolute", top: -5, right: -5,
                    width: 16, height: 16, borderRadius: "50%",
                    background: step.color, color: "#fff",
                    fontSize: 8, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "'JetBrains Mono', monospace",
                    border: "2px solid #fff",
                  }}>{i + 1}</span>
                </div>
                {/* Label */}
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "#0F172A",
                  textAlign: "center", lineHeight: 1.3,
                }}>{step.label}</span>
              </div>

              {/* Arrow connector */}
              {i < PIPE.length - 1 && (
                <div style={{
                  fontSize: 14, color: "#CBD5E1", fontWeight: 700,
                  marginBottom: 22, flexShrink: 0, userSelect: "none",
                }}>›</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ━━━ TOOL CARDS ━━━ */}
      <section style={{ padding: "48px 24px 72px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, textAlign: "center", marginBottom: 6 }}>
          Platform Modules
        </h2>
        <p style={{ fontSize: 14, color: "#94a3b8", textAlign: "center", marginBottom: 44 }}>
          Each module runs standalone or chains into a series workflow for the same dataset
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
          <ToolCard icon={TOOL_ICONS.quality} title="Data Ingestion & Synchronization" subtitle="PV data & weather data ingestion, sync & validation" color={G} path="/data-ingestion"
            desc="Scans raw time-series for missing timestamps, stuck sensors, out-of-range values, nighttime noise, and statistical outliers. Outputs a gap map and quality score per channel."
            tags={["Gap detection", "Outlier flags", "Timestamp QA", "Statistics", "Visual map"]} />
          <ToolCard icon={TOOL_ICONS.filter} title="Data Filtering" subtitle="Module under development" color={G} path="/data-filtering"
            desc="Advanced data filtering and cleansing tools for PV time-series. Remove outliers, apply custom filters, and prepare clean datasets for downstream analysis."
            tags={["Custom filters", "Outlier removal", "Data cleansing", "Time-series", "Coming soon"]} />
          <ToolCard icon={TOOL_ICONS.kpi} title="KPI Analysis" subtitle="IEC 61724 performance metrics" color={G} path="/kpi-analysis"
            desc={<>Calculate Performance Ratio, temperature-corrected PR, Capacity Factor, specific yield, Reference Yield Y<sub>r</sub>, Final Yield Y<sub>f</sub>, and degradation rate R<sub>d</sub> via YoY regression.</>}
            tags={["PR & PR_STC", "Capacity factor", "Degradation Rd", "Yield ratios", "Trend charts"]} />
          <ToolCard icon={TOOL_ICONS.gap} title="Gap Filling" subtitle="ML-based missing data recovery" color={G} path="/gap-filling"
            desc="Detects gaps in the corrected dataset, selects contextually similar historical windows, trains a lightweight regression model, and generates synthetic values with uncertainty bounds."
            tags={["Auto-detect gaps", "Historical matching", "ML imputation", "Uncertainty bands", "Validation"]} />
          <ToolCard icon={TOOL_ICONS.predict} title="Power Prediction" subtitle="Energy forecast & performance model" color={G} path="/power-prediction"
            desc={<>Combines a single-diode physical model with weather inputs (GHI, T<sub>amb</sub>, wind) to predict expected power. Flags under-performance and estimates energy losses.</>}
            tags={["Physical model", "Weather correlation", "Loss analysis", "Performance index", "Scenarios"]} />
          <ToolCard icon={TOOL_ICONS.lcoe} title="LCOE Calculator" subtitle="Financial analysis & PVsyst integration" color={G} path="/lcoe-tool"
            desc="Industry-standard Levelized Cost of Energy with 20+ itemized CAPEX line items, linear degradation, DCF analysis, IRR, NPV, payback, and tornado sensitivity charts."
            tags={["LCOE $/kWh", "CAPEX breakdown", "Cash flow", "IRR / NPV", "Sensitivity"]} />

          {/* Workflow card */}
          <div style={{
            background: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderTop: `3px solid ${G}`,
            borderRadius: 12,
            padding: "22px 24px",
            boxShadow: "0 1px 3px rgba(0,0,0,.04)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 11,
                background: `${G}10`,
                border: `1.5px solid ${G}35`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <LinkOutlined sx={{ fontSize: 20, color: ICON_COLOR }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Series Workflows</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>Chain tools on the same dataset</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: "#64748B", lineHeight: 1.7, marginBottom: 16 }}>
              Execute multiple modules in sequence: <strong>QC → Gap Fill → KPI → Prediction → Report</strong>.
              Each stage consumes corrected output from the previous one, ensuring full data consistency.
            </p>
            <div style={{
              background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8,
              padding: "12px 16px", fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, color: "#64748B", lineHeight: 2,
            }}>
              <span style={{ color: G }}>QC</span>
              <span style={{ color: "#CBD5E1" }}> → </span>
              <span style={{ color: G }}>Gap Fill</span>
              <span style={{ color: "#CBD5E1" }}> → </span>
              <span style={{ color: G }}>KPI</span>
              <span style={{ color: "#CBD5E1" }}> → </span>
              <span style={{ color: G }}>Predict</span>
              <span style={{ color: "#CBD5E1" }}> → </span>
              <span style={{ color: G }}>LCOE</span>
              <span style={{ color: "#CBD5E1" }}> → </span>
              <span style={{ color: G }}>Report</span>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ TECHNICAL SPECS ━━━ */}
      <section style={{ padding: "56px 24px 64px", background: "#FFFFFF", borderTop: "1px solid #E2E8F0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, textAlign: "center", marginBottom: 36 }}>
            Technical Specifications
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {[
              { cat: "Data Inputs", items: ["PV power & energy CSV", "Weather station CSV (GHI, Tamb, Wspd)", "System info JSON (kWp, tilt, azimuth)", "PVsyst PDF report auto-parse"] },
              { cat: "Standards", items: ["IEC 61724-1 KPI definitions", "IEC 61724-3 capacity testing", "LCOE per NREL / IEA methodology", "Linear degradation model (Rd)"] },
              { cat: "Models", items: ["Single-diode PV model", "Temperature-corrected PR", "ML gap-filling (XGBoost / kNN)", "Discounted cash flow (DCF)"] },
              { cat: "Outputs", items: ["Interactive dashboards", "LCOE with sensitivity tornado", "Cash flow & payback charts", "Exportable PDF reports"] },
            ].map(({ cat, items }) => (
              <div key={cat} style={{ padding: 22, background: "#FAFBFC", borderRadius: 10, border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: G, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 14 }}>
                  {cat}
                </div>
                {items.map((item, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                    <span style={{ color: "#CBD5E1", fontSize: 8, marginTop: 5 }}>●</span>
                    <span style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ TEAM — profile card (image left, content right) ━━━ */}
      <section id="team" style={{
        padding: "72px 24px 80px",
        background: "linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)",
        borderTop: "1px solid #E2E8F0",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{
            fontSize: 22, fontWeight: 800, color: "#0F172A",
            letterSpacing: "-.02em", marginBottom: 8, textAlign: "center",
          }}>
            The team behind PVCopilot
          </h2>
          <p style={{ fontSize: 14, color: "#64748B", marginBottom: 40, maxWidth: 520, margin: "0 auto 40px", textAlign: "center" }}>
            Engineers and analysts focused on solar O&M and levelized cost modeling.
          </p>

          <div
            className="team-card"
            style={{
              background: "#FFFFFF", borderRadius: 16, overflow: "hidden",
              boxShadow: "0 4px 24px rgba(15,23,42,.08)", border: "1px solid #E2E8F0",
            }}
          >
            {/* Left: image */}
            <div className="team-card-image" style={{ position: "relative", flexShrink: 0 }}>
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(135deg, #FFB800 0%, #ff9500 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#0F172A", fontSize: 48, fontWeight: 800, fontFamily: "'Inter', system-ui, sans-serif",
                visibility: teamImgError ? "visible" : "hidden",
              }}>
                PV
              </div>
              <img
                src="/team.png"
                alt="PVCopilot team"
                style={{
                  width: "100%", height: "100%", objectFit: "cover", display: teamImgError ? "none" : "block",
                }}
                onError={() => setTeamImgError(true)}
              />
            </div>
            {/* Right: name, title, description, social, CTA */}
            <div style={{
              flex: 1, minWidth: 260, padding: "24px 36px 24px",
              display: "flex", flexDirection: "column", justifyContent: "space-between",
            }}>
              <div>
                <h3 style={{ fontSize: 26, fontWeight: 800, color: "#0F172A", marginBottom: 6, letterSpacing: "-.02em" }}>
                  Said ELHAMAOUI
                </h3>
                <p style={{ fontSize: 14, color: "#64748B", marginBottom: 12, fontWeight: 400 }}>
                  R&D Engineer, Founder @PVCopilot
                </p>
                <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.55, marginBottom: 14 }}>
                  We lead the platform with a focus on bankable LCOE, IEC-aligned KPIs, and real-world O&M workflows—so every stakeholder can trust the numbers.
                </p>
                <blockquote style={{
                  margin: "0 0 16px 0", padding: "12px 16px 12px 20px",
                  borderLeft: "4px solid #FFB800", background: "#FFFBEB",
                  borderRadius: "0 10px 10px 0", border: "1px solid #FDE68A",
                }}>
                  <p style={{
                    fontSize: 14, fontStyle: "italic", color: "#475569",
                    lineHeight: 1.6, margin: "0 0 8px 0",
                  }}>
                    "Our goal is to make solar fleet analytics as reliable and transparent as the technology itself—so every stakeholder can trust the numbers."
                  </p>
                  <cite style={{ fontSize: 12, color: "#64748B", fontStyle: "normal", fontWeight: 600 }}>
                    — PVCopilot
                  </cite>
                </blockquote>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  {SOCIAL_LINKS.map(({ id, icon }) => (
                    <a
                      key={id}
                      href={id === "LinkedIn" ? "https://linkedin.com" : id === "GitHub" ? "https://github.com" : "https://youtube.com"}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: "#F1F5F9", border: "1px solid #E2E8F0",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#64748B", transition: "background .2s, color .2s, border-color .2s",
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = "#FFFBEB";
                        e.currentTarget.style.borderColor = G;
                        e.currentTarget.style.color = G;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = "#F1F5F9";
                        e.currentTarget.style.borderColor = "#E2E8F0";
                        e.currentTarget.style.color = "#64748B";
                      }}
                    >
                      {icon}
                    </a>
                  ))}
                </div>
                <a
                  href="mailto:contact@pvcopilot.com"
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    padding: "12px 24px", background: G, color: "#0F172A",
                    textDecoration: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
                    boxShadow: "0 2px 12px rgba(255,184,0,.35)",
                    transition: "transform .15s, box-shadow .15s",
                    alignSelf: "flex-start",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 4px 20px rgba(255,184,0,.45)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 2px 12px rgba(255,184,0,.35)";
                  }}
                >
                  Get in touch
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ FOOTER — particle background only (no sun trajectory) ━━━ */}
      <footer style={{
        position: "relative", overflow: "hidden",
        background: "#0F172A", color: "#94a3b8",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        <HeroParticles />
        <div style={{ position: "relative", zIndex: 1 }}>
        {/* CTA banner */}
        <div style={{
          padding: "56px 24px", textAlign: "center",
          borderBottom: "1px solid rgba(255,255,255,.06)",
        }}>
          <h3 style={{ fontSize: 28, fontWeight: 800, color: "#FFFFFF", marginBottom: 12, letterSpacing: "-.02em" }}>
            Ready to optimize your solar fleet?
          </h3>
          <p style={{ fontSize: 15, color: "#64748B", marginBottom: 28, maxWidth: 500, margin: "0 auto 28px" }}>
            Start with the LCOE calculator today. More tools launching soon.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link to="/lcoe-tool" style={{
              padding: "12px 32px", background: G, color: "#0F172A",
              textDecoration: "none", borderRadius: 9999, fontWeight: 700, fontSize: 14,
              boxShadow: `0 4px 16px rgba(255,184,0,.3)`,
              transition: "transform .15s",
            }}
            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
            onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              Launch LCOE Tool →
            </Link>
            <a href="mailto:contact@pvcopilot.com" style={{
              padding: "12px 32px", background: "transparent", color: "#CBD5E1",
              textDecoration: "none", borderRadius: 9999, fontWeight: 600, fontSize: 14,
              border: "1.5px solid rgba(255,255,255,.12)",
            }}>
              Contact Us
            </a>
          </div>
        </div>

        {/* Footer columns */}
        <div style={{
          maxWidth: 1100, margin: "0 auto", padding: "48px 24px 40px",
          display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr",
          gap: 40,
        }}>
          {/* Brand column */}
          <div>
            <img src="/logoWhite.svg" alt="PVCopilot" style={{ height: 45, objectFit: "contain", marginBottom: 16 }} />
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "#64748B", maxWidth: 280 }}>
              Your Solar PV O&M Digital Assistant. Automated data processing platform
              for solar fleet operations and maintenance.
            </p>
            {/* Social icons */}
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              {SOCIAL_LINKS.map(({ id, icon }) => (
                <div key={id} style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, color: "#64748B", cursor: "pointer",
                  transition: "background .15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,.1)"; e.currentTarget.style.color = "#FFFFFF"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,.05)"; e.currentTarget.style.color = "#64748B"; }}
                >
                  {icon}
                </div>
              ))}
            </div>
          </div>

          {/* Tools column */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 16 }}>
              Tools
            </div>
            {[
              { label: "Data Ingestion & Synchronization", path: "/data-ingestion" },
              { label: "Data Filtering", path: "/data-filtering" },
              { label: "KPI Analysis", path: "/kpi-analysis" },
              { label: "Gap Filling", path: "/gap-filling" },
              { label: "Power Prediction", path: "/power-prediction" },
              { label: "LCOE Calculator", path: "/lcoe-tool" },
            ].map(l => (
              <Link key={l.path} to={l.path} style={{
                display: "block", fontSize: 13, color: "#64748B",
                textDecoration: "none", marginBottom: 10, transition: "color .15s",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#FFFFFF"}
              onMouseLeave={e => e.currentTarget.style.color = "#64748B"}
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* Standards column */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 16 }}>
              Standards
            </div>
            {["IEC 61724-1", "IEC 61724-3", "NREL LCOE", "PVsyst Integration"].map(s => (
              <div key={s} style={{ fontSize: 13, color: "#64748B", marginBottom: 10 }}>{s}</div>
            ))}
          </div>

          {/* Company column */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 16 }}>
              Company
            </div>
            {["About", "Documentation", "Contact", "Privacy Policy"].map(s => (
              <div key={s} style={{
                fontSize: 13, color: "#64748B", marginBottom: 10,
                cursor: "pointer", transition: "color .15s",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#FFFFFF"}
              onMouseLeave={e => e.currentTarget.style.color = "#64748B"}
              >
                {s}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop: "1px solid rgba(255,255,255,.06)",
          padding: "20px 24px",
          maxWidth: 1100, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 12,
        }}>
          <div style={{ fontSize: 12, color: "#475569" }}>
            © {new Date().getFullYear()} PVCopilot. All rights reserved.
          </div>
          <div style={{ fontSize: 12, color: "#475569", display: "flex", gap: 20 }}>
            <span>Terms</span>
            <span>Privacy</span>
            <span>Cookies</span>
          </div>
        </div>
        </div>
      </footer>
    </div>
  );
}
