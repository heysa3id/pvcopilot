import { Link, useLocation, useNavigate } from "react-router-dom";
import { cloneElement, useEffect, useRef, useState } from "react";
import {
  CloudDownloadOutlined,
  SyncOutlined,
  SearchOutlined,
  TrendingUpOutlined,
  AssessmentOutlined,
  BoltOutlined,
  SummarizeOutlined,
  LinkOutlined,
  QueryStats,
  AutoFixHigh,
  ElectricBolt,
  FilterAltOutlined,
  AccountTree,
  LinkedIn,
  GitHub,
  YouTube,
} from "@mui/icons-material";
import CurrencyExchangeIcon from "@mui/icons-material/CurrencyExchange";

const G = "#FFB800", B = "#1d9bf0", O = "#ff7a45", Y = "#16a34a", P = "#8b5cf6";
const ICON_COLOR = G;

const PIPE = [
  { id: "ingest",  label: "Import Data",       sub: "PV .csv · Weather .csv · System .json", icon: <CloudDownloadOutlined sx={{ fontSize: 22 }} />, color: "#6366f1" },
  { id: "sync",    label: "Data Ingestion & Sync", sub: "PV data & weather ingestion, sync & validation", icon: <SearchOutlined sx={{ fontSize: 22, color: ICON_COLOR }} />, color: "#0ea5e9" },
  { id: "qc",      label: "Data Filtering",       sub: "Custom filters · outlier removal · preprocessing", icon: <FilterAltOutlined sx={{ fontSize: 22, color: ICON_COLOR }} />, color: P },
  { id: "gap",     label: "Gap Filling",       sub: "ML models · historical pattern matching",icon: <TrendingUpOutlined sx={{ fontSize: 22 }} />, color: "#10b981" },
  { id: "kpi",     label: "KPI Calculation",   sub: "IEC 61724 · PR · degradation Rd",       icon: <AssessmentOutlined sx={{ fontSize: 22 }} />, color: Y },
  { id: "predict", label: "Power Prediction",  sub: "Physical + ML forecast models",         icon: <BoltOutlined sx={{ fontSize: 22 }} />, color: O },
  { id: "lcoe",    label: "LCOE & Financials", sub: "Levelized cost · IRR · NPV · payback",  icon: <CurrencyExchangeIcon sx={{ fontSize: 22, color: G }} />, color: G },
  { id: "report",  label: "System Report",     sub: "PDF / dashboard export",                icon: <SummarizeOutlined sx={{ fontSize: 22 }} />, color: "#94a3b8" },
];

const TOOL_ICONS = {
  quality: <SearchOutlined sx={{ fontSize: 22, color: ICON_COLOR }} />,
  kpi: <QueryStats sx={{ fontSize: 22, color: ICON_COLOR }} />,
  gap: <AutoFixHigh sx={{ fontSize: 22, color: ICON_COLOR }} />,
  workflow: <AccountTree sx={{ fontSize: 22, color: ICON_COLOR }} />,
  predict: <ElectricBolt sx={{ fontSize: 22, color: ICON_COLOR }} />,
  lcoe: <CurrencyExchangeIcon sx={{ fontSize: 22, color: ICON_COLOR }} />,
  filter: <FilterAltOutlined sx={{ fontSize: 22, color: ICON_COLOR }} />,
};

const SOCIAL_LINK = "https://www.linkedin.com/in/saïd-elhamaoui/";
const SOCIAL_LINKS = [
  { id: "LinkedIn", icon: <LinkedIn sx={{ fontSize: 18, color: ICON_COLOR }} />, href: SOCIAL_LINK },
  { id: "GitHub", icon: <GitHub sx={{ fontSize: 18, color: ICON_COLOR }} />, href: SOCIAL_LINK },
  { id: "YouTube", icon: <YouTube sx={{ fontSize: 18, color: ICON_COLOR }} />, href: SOCIAL_LINK },
];

const PARTNER_LOGOS = [
  { name: "PVCopilot", logo: "/logoBlack.svg", bg: "#F8FAFC" },
  { name: "Green Energy Park", logo: "/partners-green-energy-park.png", bg: "#FFFFFF" },
  { name: "Solar Twin by Green Energy Park", logo: "/partners-solar-twin.png", bg: "#FFFFFF" },
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

function PlatformModuleCard({ number, icon, title, subtitle, desc, tags, path, expanded, onMouseEnter, onMouseLeave, isWorkflow }) {
  const navigate = useNavigate();

  const handleCardClick = (e) => {
    if (path && !e.target.closest("a")) {
      e.stopPropagation();
      navigate(path);
    }
  };

  const cardContent = (
    <>
      {/* Collapsed: vertical label + number */}
      <div style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 16,
        opacity: expanded ? 0 : 1,
        pointerEvents: expanded ? "none" : "auto",
        transition: "opacity 0.2s ease",
      }}>
        <div style={{
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transform: "rotate(180deg)",
          color: "#f3f4f6",
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: "0.02em",
          marginBottom: 12,
          whiteSpace: "nowrap",
        }}>
          {title}
        </div>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.2)",
          background: "rgba(248,249,250,0.95)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 800,
          color: "#0b1220",
        }}>
          {number}
        </div>
      </div>

      {/* Expanded: badge top-left, icon top-right, label → title → desc → tags → link — whole area clickable to open module */}
      <div
        className="platform-module-card-inner"
        role={path ? "button" : undefined}
        tabIndex={path && expanded ? 0 : undefined}
        onClick={handleCardClick}
        onKeyDown={path && expanded ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(path); } } : undefined}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          padding: "28px 32px 28px 32px",
          display: "flex",
          flexDirection: "column",
          opacity: expanded ? 1 : 0,
          pointerEvents: expanded ? "auto" : "none",
          transition: "opacity 0.25s ease",
          overflow: "auto",
          cursor: path ? "pointer" : "default",
        }}
      >
        {/* Icon top-right (white) */}
        {icon && (
          <div className="platform-module-card-icon" style={{ position: "absolute", top: 28, right: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {cloneElement(icon, { sx: { ...icon.props?.sx, color: "#fff", fontSize: 26 } })}
          </div>
        )}
        {/* Badge */}
        <div className="platform-module-badge" style={{
          width: 48,
          height: 48,
          borderRadius: 999,
          background: "rgba(243, 244, 246, 0.95)",
          color: "#0b1220",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
          fontWeight: 800,
          marginBottom: 18,
          flexShrink: 0,
        }}>
          {number}
        </div>
        {/* Category label */}
        <div className="platform-module-subtitle" style={{ fontSize: 13, fontWeight: 600, color: G, marginBottom: 6, letterSpacing: "0.02em" }}>
          {subtitle || "Core workflow module"}
        </div>
        {/* Title */}
        <h2 className="platform-module-title" style={{ fontFamily: "Inter, Arial, sans-serif", margin: "0 0 10px", fontSize: "clamp(1.35rem, 2.8vw, 1.9rem)", lineHeight: 1.1, fontWeight: 800, letterSpacing: "-0.03em", color: "#f3f4f6" }}>{title}</h2>
        {/* Description */}
        {desc && <p className="platform-module-desc" style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.5, color: "rgba(243,244,246,0.7)", flex: 1 }}>{desc}</p>}
        {/* Tags as pill badges */}
        {tags && tags.length > 0 && (
          <div className="platform-module-tags" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {tags.slice(0, 4).map(t => (
              <span key={t} style={{
                padding: "6px 12px",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#f3f4f6",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
              }}>
                {t}
              </span>
            ))}
          </div>
        )}
        {/* Link - flexShrink: 0 so it stays visible */}
        {path ? (
          <Link to={path} onClick={e => e.stopPropagation()} className="platform-module-link"
            onMouseEnter={e => {
              e.currentTarget.style.color = G;
              e.currentTarget.style.transform = "translateX(2px)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = "#dec89a";
              e.currentTarget.style.transform = "translateX(0)";
            }}
            style={{
            fontFamily: "Inter, Arial, sans-serif",
            display: "inline-flex", alignItems: "center", gap: 10,
            color: "#dec89a", textDecoration: "none", fontSize: 15, fontWeight: 800,
            transition: "color 0.25s ease, transform 0.25s ease",
            flexShrink: 0,
          }}>
            Open Module <span style={{ fontSize: 16, lineHeight: 1 }}>→</span>
          </Link>
        ) : (
          <span className="platform-module-link" style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 800, color: "#dec89a", flexShrink: 0 }}>Open Module →</span>
        )}
      </div>
    </>
  );

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "relative",
        width: "100%",
        height: 320,
        borderRadius: 42,
        overflow: "hidden",
        background: [
          "radial-gradient(circle at 18% 12%, rgba(167, 243, 208, 0.12), transparent 28%)",
          "radial-gradient(circle at 82% 22%, rgba(147, 197, 253, 0.18), transparent 30%)",
          "radial-gradient(circle at 72% 78%, rgba(250, 204, 21, 0.12), transparent 30%)",
          "linear-gradient(140deg, rgba(15, 23, 42, 0.88) 0%, rgba(19, 33, 58, 0.8) 45%, rgba(27, 46, 80, 0.84) 100%)",
        ].join(", "),
        border: "1px solid rgba(226, 232, 240, 0.24)",
        backdropFilter: "blur(16px) saturate(115%)",
        WebkitBackdropFilter: "blur(16px) saturate(115%)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.26), inset 0 -30px 50px rgba(15, 23, 42, 0.18), 0 20px 46px rgba(2, 6, 23, 0.4)",
        transition: "box-shadow 0.3s ease, border-color 0.3s ease",
      }}
    >
      {/* Optional soft orange bloom (like ::before in example) */}
      <div
        style={{
          position: "absolute",
          width: 200,
          height: 200,
          right: "8%",
          top: -34,
          background: "radial-gradient(circle, rgba(148, 163, 184, 0.26) 0%, rgba(245, 158, 11, 0.14) 45%, rgba(15, 23, 42, 0) 72%)",
          borderRadius: "50%",
          filter: "blur(48px)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      {cardContent}
    </div>
  );
}

const PLATFORM_MODULES = [
  { number: "01", icon: TOOL_ICONS.quality, title: "Data Ingestion & Sync", subtitle: "PV data & weather ingestion, sync & validation", path: "/data-ingestion", desc: "Scans raw time-series for missing timestamps, stuck sensors, out-of-range values, nighttime noise, and statistical outliers. Outputs a gap map and quality score per channel.", tags: ["Gap detection", "Outlier flags", "Timestamp QA", "Statistics"] },
  { number: "02", icon: TOOL_ICONS.filter, title: "Data Filtering", subtitle: "Advanced filtering & preprocessing for PV time-series", path: "/data-filtering", desc: "Advanced data filtering and preprocessing tools for PV time-series. Remove outliers, apply custom filters, and prepare clean datasets for downstream analysis.", tags: ["Custom filters", "Outlier removal", "Data preprocessing", "PV time-series"] },
  { number: "03", icon: TOOL_ICONS.kpi, title: "KPI Analysis", subtitle: "IEC 61724 performance metrics", path: "/kpi-analysis", desc: "Calculate Performance Ratio, temperature-corrected PR, Capacity Factor, specific yield, Reference Yield Yr, Final Yield Yf, and degradation rate Rd via YoY regression.", tags: ["PR & PR_STC", "Capacity factor", "Degradation Rd", "Yield ratios"] },
  { number: "04", icon: TOOL_ICONS.gap, title: "Gap Filling", subtitle: "ML-based missing data recovery", path: "/gap-filling", desc: "Detects gaps in the corrected dataset, selects contextually similar historical windows, trains a lightweight regression model, and generates synthetic values with uncertainty bounds.", tags: ["Auto-detect gaps", "Historical matching", "ML imputation", "Uncertainty bands"] },
  { number: "05", icon: TOOL_ICONS.predict, title: "Power Prediction", subtitle: "Energy forecast & performance model", path: "/power-prediction", desc: "Combines a single-diode physical model with weather inputs (GHI, Tamb, wind) to predict expected power. Flags under-performance and estimates energy losses.", tags: ["Physical model", "Weather correlation", "Loss analysis", "Scenarios"] },
  { number: "06", icon: TOOL_ICONS.lcoe, title: "LCOE Calculator", subtitle: "Financial analysis & PVsyst integration", path: "/lcoe-tool", desc: "Industry-standard Levelized Cost of Energy with 20+ itemized CAPEX line items, linear degradation, DCF analysis, IRR, NPV, payback, and tornado sensitivity charts.", tags: ["LCOE $/kWh", "CAPEX breakdown", "Cash flow", "IRR / NPV"] },
  { number: "07", icon: TOOL_ICONS.workflow, title: "Series Workflows", subtitle: "Chain tools on the same dataset", path: "/workflow", desc: "Execute multiple modules in sequence: QC → Gap Fill → KPI → Prediction → Report. Each stage consumes corrected output from the previous one, ensuring full data consistency.", tags: ["QC", "Gap Fill", "KPI", "Predict", "LCOE", "Report"], isWorkflow: true },
];

export default function LandingPage() {
  const { hash } = useLocation();
  const [teamImgError, setTeamImgError] = useState(false);
  const [hoveredModuleIndex, setHoveredModuleIndex] = useState(0);

  useEffect(() => {
    if (hash) {
      const id = hash.slice(1);
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [hash]);

  return (
    <div style={{ minHeight: "100vh", fontFamily: "Inter, Arial, sans-serif", color: "#0F172A" }}>

      {/* ━━━ HERO — dark, dramatic, geometric ━━━ */}
      <section id="hero" style={{
        position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)",
        padding: "clamp(72px, 12vw, 100px) 16px clamp(72px, 12vw, 100px)",
        minHeight: "min(100vh, 540px)",
      }}>
        {/* Sun trajectory: sunrise → noon → sunset */}
        <SolarTrajectory />

        {/* Canvas particle network */}
        <HeroParticles />

        <div style={{ position: "relative", zIndex: 1, maxWidth: 860, margin: "0 auto", textAlign: "center", padding: "0 8px" }}>
          {/* Hero logo */}
          <div style={{ marginBottom: "clamp(16px, 3vw, 28px)" }}>
            <img src="/logoWhite.svg" alt="PVCopilot" style={{ height: "clamp(80px, 18vw, 141px)", objectFit: "contain" }} />
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
            into one integrated workflow.
          </p>

          {/* CTAs — pill buttons */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
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
            <a href="#workflow" style={{
              padding: "13px 34px", background: "transparent",
              color: "#CBD5E1", textDecoration: "none", borderRadius: 9999,
              fontWeight: 600, fontSize: 15,
              border: "1.5px solid rgba(255,255,255,.15)",
              transition: "border-color .15s, color .15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,.3)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,.15)"; e.currentTarget.style.color = "#CBD5E1"; }}
            >
              View Workflow ↓
            </a>
          </div>

          {/* Stat badges */}
          <div style={{
            display: "flex", gap: "clamp(20px, 4vw, 32px)", justifyContent: "center", flexWrap: "wrap",
            marginTop: "clamp(32px, 6vw, 56px)", paddingTop: "clamp(20px, 4vw, 32px)",
            borderTop: "1px solid rgba(255,255,255,.06)",
          }}>
            {[
              { value: "6", label: "Analysis Modules" },
              { value: "IEC 61724", label: "Compliant KPIs" },
              { value: "20+", label: "Algorithms Implemented" },
              { value: "10+", label: "PV Performance KPIs" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center", minWidth: 0 }}>
                <div style={{ fontSize: "clamp(18px, 3vw, 22px)", fontWeight: 800, color: "#FFFFFF", fontFamily: "Inter, Arial, sans-serif" }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ TECHNICAL FOUNDATION ━━━ */}
      <style>{`
        .tf-section { max-width: 1260px; margin: 0 auto; padding: 64px 24px 72px; }
        .tf-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 24px; margin-bottom: 48px; }
        .tf-grid { display: grid; grid-template-columns: 1fr 1.3fr 1fr; gap: 16px; align-items: stretch; }
        .tf-card { position: relative; background: #FFFFFF; border: 1px solid #E8ECF1; border-radius: 22px; box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08); backdrop-filter: blur(10px); overflow: hidden; }
        .tf-card.tf-light { padding: 20px; }
        .tf-card.tf-core {
          background: radial-gradient(circle at 18% 84%, rgba(255,149,0,0.12), transparent 24%), radial-gradient(circle at 50% 12%, rgba(255,180,0,0.10), transparent 24%), linear-gradient(135deg, rgba(255,255,255,0.94) 0%, rgba(255,251,245,0.98) 100%);
          padding: 0; display: grid; grid-template-rows: auto 1fr auto; min-height: 340px; height: 100%;
        }
        @media (max-width: 1180px) {
          .tf-section { padding: 56px 20px 72px; }
          .tf-card.tf-light { padding: 22px; }
        }
        @media (max-width: 900px) {
          .tf-header { grid-template-columns: 1fr; }
          .tf-grid { gap: 12px; }
          .tf-card.tf-light { padding: 18px; }
        }
        @media (max-width: 768px) {
          .tf-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .tf-section { padding: 28px 12px 44px; }
          .tf-grid { gap: 10px; }
          .tf-card.tf-light { padding: 16px 14px; }
        }
      `}</style>
      <section id="foundation" style={{ padding: 0, background: "#FFFFFF", borderTop: "1px solid #E2E8F0" }}>
        <div className="tf-section">
          <div className="tf-header">
            <div style={{ maxWidth: 480, textAlign: "left", paddingLeft: 0, marginLeft: 0 }}>
              <span style={{
                display: "inline-block", fontSize: 11, fontWeight: 700, color: G,
                letterSpacing: ".12em", textTransform: "uppercase",
                padding: "5px 12px", borderRadius: 6,
                background: "rgba(255,184,0,0.12)", marginBottom: 14,
              }}>
                Technical Foundation
              </span>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 800, color: "#0F172A", lineHeight: 1.2, letterSpacing: "-.02em", margin: 0, marginLeft: 0, paddingLeft: 0 }}>
                Trusted Inputs, Bankable Methods, and Decision-Ready Outputs
              </h2>
            </div>
            <p style={{ maxWidth: 340, fontSize: 14, color: "#64748B", lineHeight: 1.65, margin: 0, paddingTop: 28 }}>
              PVCopilot structures the LCOE and analytics engine as a clear logic flow: what comes in, how it is processed, and what the user gets out.
            </p>
          </div>

          <div className="tf-grid">
            {/* Inputs card */}
            <article className="tf-card tf-light tf-inputs">
              <div style={{
                width: 46, height: 46, borderRadius: 14, background: "rgba(255, 180, 0, 0.12)",
                display: "grid", placeItems: "center", marginBottom: 20, color: "#ff9500", fontSize: 20,
              }}>⤓</div>
              <h3 style={{ margin: "0 0 10px", fontSize: 26, lineHeight: 1, letterSpacing: "-0.035em", fontWeight: 800, color: "#0f1b36" }}>Inputs</h3>
              <p style={{ margin: "0 0 14px", color: "#5e6b80", fontSize: 14, lineHeight: 1.45 }}>
                Validated technical and operational data sources used to feed the analytics workflow.
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                {[
                  "PV power and energy CSV imports",
                  "Weather station CSV such as GHI, Tamb, and wind speed",
                  "System metadata in JSON including kWp, tilt, and azimuth",
                  "PVsyst report parsing for baseline design assumptions",
                ].map((item, i) => (
                  <li key={i} style={{ display: "grid", gridTemplateColumns: "8px 1fr", gap: 10, alignItems: "start", color: "#44536a", fontSize: 13, lineHeight: 1.35 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ffb400", marginTop: 7 }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 14, color: "#7a879a", fontSize: 12, lineHeight: 1.35 }}>
                Structured source data is normalized before KPI, forecast, and LCOE workflows begin.
              </div>
            </article>

            {/* Core engine card */}
            <article className="tf-card tf-core">
              <div style={{
                padding: "20px 18px 14px", borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
                display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
              }}>
                <div>
                  <h3 style={{ margin: "0 0 8px", fontSize: 24, lineHeight: 1.02, letterSpacing: "-0.04em", fontWeight: 800, color: "#0f1b36" }}>
                    Standards &amp; Models Engine
                  </h3>
                  <p style={{ margin: 0, color: "#5e6b80", fontSize: 13, lineHeight: 1.4 }}>
                    The technical core combines recognized PV performance standards with techno-economic and data-driven modeling blocks.
                  </p>
                </div>
                <div style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minWidth: 78, padding: "10px 12px", borderRadius: 999,
                  background: "#111827", color: "#fff8ef",
                  fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)", flexShrink: 0,
                }}>
                  Core logic
                </div>
              </div>

              <div style={{ padding: "14px 18px 16px", display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                <div style={{
                  border: "1px solid rgba(15, 23, 42, 0.06)", borderRadius: 16,
                  background: "rgba(255,255,255,0.72)", padding: "12px 12px 10px",
                }}>
                  <p style={{ margin: "0 0 8px", color: "#cc7b00", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>Standards</p>
                  <ul style={{ margin: 0, paddingLeft: 16, color: "#44536a", display: "grid", gap: 7, fontSize: 12, lineHeight: 1.35 }}>
                    <li>IEC 61724-1 KPI definitions</li>
                    <li>IEC 61724-3 capacity testing</li>
                    <li>NREL / IEA LCOE methodology</li>
                    <li>Linear degradation assumptions</li>
                  </ul>
                </div>
                <div style={{
                  border: "1px solid rgba(15, 23, 42, 0.06)", borderRadius: 16,
                  background: "rgba(255,255,255,0.72)", padding: "12px 12px 10px",
                }}>
                  <p style={{ margin: "0 0 8px", color: "#cc7b00", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>Models</p>
                  <ul style={{ margin: 0, paddingLeft: 16, color: "#44536a", display: "grid", gap: 7, fontSize: 12, lineHeight: 1.35 }}>
                    <li>Single-diode PV model</li>
                    <li>Temperature-corrected PR</li>
                    <li>ML-based gap filling</li>
                    <li>Discounted cash flow engine</li>
                  </ul>
                </div>
              </div>

              <div style={{
                padding: "12px 18px 18px", borderTop: "1px solid rgba(15, 23, 42, 0.06)",
                display: "flex", flexWrap: "wrap", gap: 8,
              }}>
                {["Bankable KPIs", "Performance analytics", "Economic evaluation", "Explainable workflow"].map(chip => (
                  <span key={chip} style={{
                    borderRadius: 999, padding: "7px 10px",
                    background: "rgba(17, 24, 39, 0.05)", color: "#24324b",
                    fontSize: 11, fontWeight: 700,
                  }}>{chip}</span>
                ))}
              </div>
            </article>

            {/* Outputs card */}
            <article className="tf-card tf-light tf-outputs">
              <div style={{
                width: 46, height: 46, borderRadius: 14, background: "rgba(255, 180, 0, 0.12)",
                display: "grid", placeItems: "center", marginBottom: 20, color: "#ff9500", fontSize: 20,
              }}>⤴</div>
              <h3 style={{ margin: "0 0 10px", fontSize: 26, lineHeight: 1, letterSpacing: "-0.035em", fontWeight: 800, color: "#0f1b36" }}>Outputs</h3>
              <p style={{ margin: "0 0 14px", color: "#5e6b80", fontSize: 14, lineHeight: 1.45 }}>
                Decision-ready technical and economic results produced from the combined analytics engine.
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                {[
                  "Interactive dashboards for KPIs, PR, and system losses",
                  "LCOE sensitivity and scenario analysis",
                  "Cash flow, payback, and long-term economic charts",
                  "Exportable reports for stakeholders and technical review",
                ].map((item, i) => (
                  <li key={i} style={{ display: "grid", gridTemplateColumns: "8px 1fr", gap: 10, alignItems: "start", color: "#44536a", fontSize: 13, lineHeight: 1.35 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ffb400", marginTop: 7 }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 14, color: "#7a879a", fontSize: 12, lineHeight: 1.35 }}>
                Outputs are designed for O&amp;M teams, analysts, and decision-makers working on PV assets.
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ━━━ PROCESSING WORKFLOW — horizontal flowchart (8 stages, chevrons) ━━━ */}
      <style>{`
        .workflow-pipe-wrap { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: thin; padding-bottom: 8px; }
        .workflow-pipe-wrap::-webkit-scrollbar { height: 6px; }
        .workflow-pipe-wrap::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 3px; }
        @media (max-width: 640px) {
          .workflow-step { width: 88px !important; min-width: 88px !important; }
          .workflow-blob { width: 72px !important; height: 72px !important; margin-bottom: 8px !important; }
          .workflow-label { font-size: 10px !important; }
        }
      `}</style>
      <section
        id="workflow"
        style={{
          padding: "clamp(40px, 8vw, 72px) 16px clamp(40px, 6vw, 56px)",
          background: "#FFFFFF",
          borderTop: "1px solid #E2E8F0",
        }}
      >
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 24, marginBottom: 48, padding: "0 8px" }}>
            <div style={{ maxWidth: 480, textAlign: "left", paddingLeft: 0, marginLeft: 0 }}>
              <span style={{
                display: "inline-block", fontSize: 11, fontWeight: 700, color: G,
                letterSpacing: ".12em", textTransform: "uppercase",
                padding: "5px 12px", borderRadius: 6,
                background: "rgba(255,184,0,0.12)", marginBottom: 14,
              }}>
                Processing Workflow
              </span>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 800, color: "#0F172A", lineHeight: 1.2, letterSpacing: "-.02em", margin: 0, marginLeft: 0, paddingLeft: 0 }}>
                End-to-End Processing Workflow
              </h2>
            </div>
            <p style={{ maxWidth: 340, fontSize: 14, color: "#64748B", lineHeight: 1.65, margin: 0, paddingTop: 28 }}>
              Each stage outputs corrected data that feeds the next — run the full chain or any subset.
            </p>
          </div>

          <div className="workflow-pipe-wrap" style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            flexWrap: "nowrap",
            gap: 6,
            paddingBottom: 8,
          }}>
            {PIPE.map((step, i) => {
              const gradientId = `badge-grad-${i}`;
              const t = PIPE.length > 1 ? i / (PIPE.length - 1) : 0;
              const badgeStart = "#FFB800";
              const badgeEnd = "#FF8C00";
              return (
                <span key={step.id} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                  <div className="workflow-step" style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: 120,
                    minWidth: 120,
                  }}>
                    {/* Blob background with icon */}
                    <div className="workflow-blob" style={{
                      position: "relative",
                      width: 100,
                      height: 100,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 12,
                    }}>
                      {/* Organic blob shape with warm tint */}
                      <svg viewBox="0 0 200 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                        <defs>
                          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor={badgeStart} />
                            <stop offset="100%" stopColor={badgeEnd} />
                          </linearGradient>
                        </defs>
                        <path
                          d="M 100, 20 C 140, 20  175, 45  180, 85 C 185, 125  155, 170  115, 178 C 75, 186  30, 160  22, 120 C 14, 80  60, 20  100, 20 Z"
                          fill="#FFF9EC"
                        />
                      </svg>
                      {/* Icon */}
                      <span style={{ position: "relative", zIndex: 1, display: "flex", fontSize: 28 }}>
                        {cloneElement(step.icon, { sx: { fontSize: 32, color: G } })}
                      </span>
                      {/* Number badge */}
                      <span style={{
                        position: "absolute",
                        top: 0,
                        right: 2,
                        zIndex: 2,
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: `linear-gradient(135deg, ${badgeStart}, ${badgeEnd})`,
                        color: "#FFFFFF",
                        fontSize: 11,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 2px 8px rgba(255,184,0,0.4)",
                      }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    {/* Label */}
                    <div className="workflow-label" style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#0F172A",
                      textAlign: "center",
                      lineHeight: 1.3,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}>
                      {step.label}
                    </div>
                  </div>
                  {/* Decorative dots between items */}
                  {i < PIPE.length - 1 && (
                    <span style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      alignItems: "center",
                      margin: "0 2px",
                      paddingBottom: 24,
                    }}>
                      {[4, 5, 4].map((size, di) => (
                        <span key={di} style={{
                          width: size,
                          height: size,
                          borderRadius: "50%",
                          background: di === 1 ? G : "rgba(255,184,0,0.25)",
                          opacity: di === 1 ? 0.7 : 0.5,
                        }} />
                      ))}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* ━━━ PLATFORM MODULES — hover-to-expand cards ━━━ */}
      <style>{`
        .platform-modules-outer { width: 100%; min-width: 0; overflow: hidden; }
        .platform-modules-cards-wrap {
          overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: thin;
          min-width: 0; max-width: 100%; padding: 0 4px 8px;
        }
        .platform-modules-cards-wrap::-webkit-scrollbar { height: 6px; }
        .platform-modules-cards-wrap::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); border-radius: 3px; }
        @media (max-width: 768px) {
          .platform-modules-cards-wrap { padding-left: 12px; padding-right: 12px; }
          .platform-module-card-wrap { min-width: 48px !important; max-width: 48px !important; flex: 0 0 48px !important; width: 48px !important; }
          .platform-module-card-wrap.platform-module-card-expanded { min-width: 260px !important; max-width: 280px !important; flex: 0 0 260px !important; width: 260px !important; }
          /* Slightly larger text in expanded card; all content visible (scroll if needed) */
          .platform-module-card-expanded .platform-module-card-inner { padding: 12px 14px 12px !important; overflow-y: auto !important; }
          .platform-module-card-expanded .platform-module-card-icon { top: 12px !important; right: 12px !important; }
          .platform-module-card-expanded .platform-module-badge { width: 38px !important; height: 38px !important; font-size: 12px !important; margin-bottom: 8px !important; }
          .platform-module-card-expanded .platform-module-subtitle { font-size: 11px !important; margin-bottom: 4px !important; }
          .platform-module-card-expanded .platform-module-title { font-size: 1.05rem !important; line-height: 1.15 !important; margin-bottom: 6px !important; }
          .platform-module-card-expanded .platform-module-desc { font-size: 12px !important; line-height: 1.45 !important; margin-bottom: 8px !important; flex: 0 0 auto !important; }
          .platform-module-card-expanded .platform-module-tags { gap: 6px !important; margin-bottom: 10px !important; }
          .platform-module-card-expanded .platform-module-tags span { font-size: 10px !important; padding: 4px 8px !important; }
          .platform-module-card-expanded .platform-module-link { font-size: 13px !important; }
        }
      `}</style>
      <section id="modules" style={{
        position: "relative",
        padding: "clamp(40px, 8vw, 72px) 16px clamp(48px, 8vw, 80px)",
        background: "linear-gradient(160deg, #0F172A 0%, #131c2e 30%, #1a1710 60%, #0F172A 100%)",
        overflow: "hidden",
      }}>
        {/* Particle network animation */}
        <HeroParticles />
        {/* Ambient warm glow behind the cards */}
        <div style={{
          position: "absolute", top: "10%", left: "20%", width: "50%", height: "80%",
          background: "radial-gradient(ellipse at center, rgba(255,149,0,0.08) 0%, transparent 65%)",
          filter: "blur(60px)", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: "0%", right: "10%", width: "40%", height: "60%",
          background: "radial-gradient(ellipse at center, rgba(255,180,0,0.05) 0%, transparent 60%)",
          filter: "blur(50px)", pointerEvents: "none",
        }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", minWidth: 0 }} className="platform-modules-outer">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 32, padding: "0 8px" }}>
            <div style={{ maxWidth: 520, textAlign: "left", paddingLeft: 0, marginLeft: 0, minWidth: 0 }}>
              <span style={{
                display: "inline-block", fontSize: 11, fontWeight: 700, color: G,
                letterSpacing: ".12em", textTransform: "uppercase",
                padding: "5px 12px", borderRadius: 6,
                background: "rgba(255,184,0,0.12)", marginBottom: 14,
              }}>
                Platform Modules
              </span>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 800, color: "#f3f4f6", lineHeight: 1.2, letterSpacing: "-.02em", margin: 0, marginLeft: 0, paddingLeft: 0 }}>
                Each module runs standalone or chains into a series workflow
              </h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                padding: "10px 20px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,196,35,0.25)",
                color: "#ffc423",
                borderRadius: 12, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
              }}>
                EXPLORE MODULES
              </span>
              <a href="#platform-modules-cards" style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,196,35,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center", color: "#ffc423",
                textDecoration: "none",
              }} aria-label="Scroll to modules">
                <span style={{ fontSize: 18, transform: "rotate(45deg)", display: "block" }}>↗</span>
              </a>
            </div>
          </div>

          <div id="platform-modules-cards" className="platform-modules-cards-wrap" style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            gap: 16,
            width: "100%",
            minHeight: 336,
            flexWrap: "nowrap",
          }}>
            {PLATFORM_MODULES.map((mod, index) => (
              <div
                key={mod.number}
                className={`platform-module-card-wrap${hoveredModuleIndex === index ? " platform-module-card-expanded" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => setHoveredModuleIndex(index)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setHoveredModuleIndex(index); } }}
                style={{
                  flex: hoveredModuleIndex === index ? 1 : 0,
                  minWidth: hoveredModuleIndex === index ? 320 : 64,
                  width: hoveredModuleIndex === index ? undefined : 64,
                  transition: "flex 0.35s ease, min-width 0.35s ease, width 0.35s ease",
                  cursor: "pointer",
                }}
              >
                <PlatformModuleCard
                  number={mod.number}
                  icon={mod.icon}
                  title={mod.title}
                  subtitle={mod.subtitle}
                  desc={mod.desc}
                  tags={mod.tags}
                  path={mod.path}
                  expanded={hoveredModuleIndex === index}
                  onMouseEnter={() => setHoveredModuleIndex(index)}
                  onMouseLeave={() => {}}
                  isWorkflow={mod.isWorkflow}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ TEAM — profile card (image left, content right) ━━━ */}
      <section id="team" style={{
        padding: "clamp(40px, 8vw, 72px) 16px clamp(48px, 8vw, 80px)",
        background: "#FFFFFF",
        borderTop: "1px solid #E2E8F0",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 8px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 24, marginBottom: 48 }}>
            <div style={{ maxWidth: 480 }}>
              <span style={{
                display: "inline-block", fontSize: 11, fontWeight: 700, color: G,
                letterSpacing: ".12em", textTransform: "uppercase",
                padding: "5px 12px", borderRadius: 6,
                background: "rgba(255,184,0,0.12)", marginBottom: 14,
              }}>
                Meet the Team
              </span>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 800, color: "#0F172A", lineHeight: 1.2, letterSpacing: "-.02em", margin: 0 }}>
                Get to Know Who’s Behind PVCopilot
              </h2>
            </div>
            <p style={{ maxWidth: 340, fontSize: 14, color: "#64748B", lineHeight: 1.65, margin: 0, paddingTop: 28 }}>
              Led by Said Elhamaoui, combining hands-on PV engineering, applied research, and digital innovation to support smarter solar asset management.
            </p>
          </div>

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
                color: "#0F172A", fontSize: 48, fontWeight: 800, fontFamily: "Inter, Arial, sans-serif",
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
              flex: 1, minWidth: 0, padding: "clamp(20px, 4vw, 24px) clamp(20px, 4vw, 36px) 24px",
              display: "flex", flexDirection: "column", justifyContent: "space-between",
            }}>
              <div>
                <h3 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 6, letterSpacing: "-.02em" }}>
                  Said ELHAMAOUI
                </h3>
                <p style={{ fontSize: 13, color: "#64748B", marginBottom: 12, fontWeight: 400 }}>
                  R&D Engineer, Founder <span style={{ color: "#FFB800", fontWeight: 600 }}>@PVCopilot</span>
                </p>
                <p style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.55, marginBottom: 8 }}>
                  R&D Engineer with 5 years of experience in PV systems testing, characterization, and performance analysis. I have led multiple R&D and applied research projects in solar energy.
                </p>
                <ul style={{
                  fontSize: 12.5, color: "#475569", lineHeight: 1.55, marginBottom: 14,
                  paddingLeft: 20, marginTop: 0,
                }}>
                  <li style={{ marginBottom: 4 }}>Served as Project Coordinator for SolarTwin, a digital twin platform for PV O&M at Green Energy Park.</li>
                  <li style={{ marginBottom: 4 }}>ExCo & Task 13 Expert at IEA PVPS.</li>
                  <li style={{ marginBottom: 4 }}>Director of Outreach & Communication at PV Camper (Sandia Labs).</li>
                </ul>
                <p style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.55, marginBottom: 14 }}>
                  Through PVCopilot, I combine field experience, research, and digital innovation to deliver reliable tools for PV performance monitoring and decision support.
                </p>
                <blockquote style={{
                  margin: "0 0 16px 0", padding: "12px 16px 12px 20px",
                  borderLeft: "4px solid #FFB800", background: "#FFFBEB",
                  borderRadius: "0 10px 10px 0", border: "1px solid #FDE68A",
                }}>
                  <p style={{
                    fontSize: 13, fontStyle: "italic", color: "#475569",
                    lineHeight: 1.6, margin: "0 0 8px 0",
                  }}>
                    " Our goal is to help you automate the O&M workflow of your solar PV system and integrate digital tools into data processing, so you can monitor performance more efficiently, reduce manual work, and make faster, more reliable decisions.                    "
                  </p>
                  <cite style={{ fontSize: 11, color: "#64748B", fontStyle: "normal", fontWeight: 600 }}>
                    — PVCopilot
                  </cite>
                </blockquote>
              </div>
              <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 10 }}>
                  {SOCIAL_LINKS.map(({ id, icon, href }) => (
                    <a
                      key={id}
                      href={href}
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

      {/* ━━━ OUR PARTNERS — logo marquee (endless loop, no empty space) ━━━ */}
      <style>{`
        @keyframes partners-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-25%); }
        }
        .partners-track:hover { animation-play-state: paused; }
      `}</style>
      <style>{`
        @media (max-width: 640px) {
          .footer-grid { grid-template-columns: 1fr !important; gap: 32px !important; text-align: center !important; }
          .footer-grid .footer-brand { text-align: center; }
          .footer-grid .footer-brand p { margin-left: auto; margin-right: auto; }
        }
      `}</style>
      <section id="partners" style={{
        padding: "clamp(32px, 6vw, 56px) 16px clamp(40px, 8vw, 64px)",
        background: "#FFFFFF",
        borderTop: "1px solid #E2E8F0",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center", marginBottom: 32, padding: "0 8px" }}>
          <h2 style={{
            fontSize: 22, fontWeight: 800, color: "#0F172A",
            letterSpacing: "-.02em", marginBottom: 8,
          }}>
            Our Partners
          </h2>
          <p style={{ fontSize: 14, color: "#64748B", maxWidth: 520, margin: "0 auto" }}>
            Collaborating with leading institutions in solar research and digital innovation.
          </p>
        </div>
        <div style={{ overflow: "hidden", width: "100%", marginLeft: -16, marginRight: -16 }}>
          <div
            className="partners-track"
            style={{
              display: "flex",
              width: "max-content",
              animation: "partners-marquee 30s linear infinite",
              gap: 48,
            }}
          >
            {[...PARTNER_LOGOS, ...PARTNER_LOGOS, ...PARTNER_LOGOS, ...PARTNER_LOGOS].map((partner, i) => (
              <div
                key={i}
                style={{
                  flexShrink: 0,
                  width: 140,
                  height: 72,
                  borderRadius: 12,
                  background: partner.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: "Inter, Arial, sans-serif",
                  boxShadow: "0 4px 14px rgba(0,0,0,.12)",
                  transition: "transform .2s ease, box-shadow .2s ease",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "scale(1.05)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,.18)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,.12)";
                }}
                title={partner.name}
              >
                {partner.logo ? (
                  <img src={partner.logo} alt={partner.name} style={{ height: 36, width: "auto", objectFit: "contain", maxWidth: 120 }} />
                ) : (
                  partner.short
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ FOOTER — particle background only (no sun trajectory) ━━━ */}
      <footer id="contact" style={{
        position: "relative", overflow: "hidden",
        background: "#0F172A", color: "#94a3b8",
        fontFamily: "Inter, Arial, sans-serif",
      }}>
        <HeroParticles />
        <div style={{ position: "relative", zIndex: 1 }}>
        {/* CTA banner */}
        <div style={{
          padding: "clamp(32px, 6vw, 56px) 16px", textAlign: "center",
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
        <div className="footer-grid" style={{
          maxWidth: 1100, margin: "0 auto", padding: "clamp(32px, 6vw, 48px) 16px 40px",
          display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr",
          gap: 40,
        }}>
          {/* Brand column */}
          <div className="footer-brand">
            <img src="/logoWhite.svg" alt="PVCopilot" style={{ height: 45, objectFit: "contain", marginBottom: 16 }} />
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "#64748B", maxWidth: 280 }}>
              Your Solar PV O&M Digital Assistant. Automated data processing platform
              for solar fleet operations and maintenance.
            </p>
            {/* Social icons */}
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              {SOCIAL_LINKS.map(({ id, icon, href }) => (
                <a
                  key={id}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, color: "#64748B", cursor: "pointer",
                    transition: "background .15s", textDecoration: "none",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,.1)"; e.currentTarget.style.color = "#FFFFFF"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,.05)"; e.currentTarget.style.color = "#64748B"; }}
                >
                  {icon}
                </a>
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
              { label: "Workflow", path: "/workflow" },
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
          padding: "16px",
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
