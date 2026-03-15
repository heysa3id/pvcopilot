import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  SearchOutlined,
  QueryStats,
  AutoFixHigh,
  ElectricBolt,
  FilterAltOutlined,
} from "@mui/icons-material";
import CurrencyExchangeIcon from "@mui/icons-material/CurrencyExchange";

const ICON_COLOR = "#FFB800";

const TOOLS = [
  { path: "/data-ingestion",   label: "Data Ingestion & Synchronization", icon: <SearchOutlined sx={{ fontSize: 18, color: ICON_COLOR }} />, color: "#8b5cf6" },
  { path: "/data-filtering",   label: "Data Filtering",      icon: <FilterAltOutlined sx={{ fontSize: 18, color: ICON_COLOR }} />, color: "#e11d48" },
  { path: "/kpi-analysis",     label: "KPI Analysis",        icon: <QueryStats sx={{ fontSize: 18, color: ICON_COLOR }} />, color: "#16a34a" },
  { path: "/gap-filling",      label: "Gap Filling",         icon: <AutoFixHigh sx={{ fontSize: 18, color: ICON_COLOR }} />, color: "#059669" },
  { path: "/power-prediction", label: "Power Prediction",    icon: <ElectricBolt sx={{ fontSize: 18, color: ICON_COLOR }} />, color: "#ff7a45" },
  { path: "/lcoe-tool",        label: "LCOE Tool",           icon: <CurrencyExchangeIcon sx={{ fontSize: 18, color: ICON_COLOR }} />, color: "#1d9bf0" },
];

export default function Navbar() {
  const { pathname } = useLocation();
  const [toolsOpen, setToolsOpen] = useState(false);
  const isToolPage = TOOLS.some(t => pathname === t.path);

  return (
    <nav
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid #E2E8F0", height: 56,
      }}
    >
      <div
        style={{
          maxWidth: 1380, margin: "0 auto", padding: "0 24px",
          height: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Left: logo + links */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <Link to="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
            <img src="/logoBlack.svg" alt="PVCopilot" style={{ height: 36, objectFit: "contain" }} />
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Link
              to="/"
              style={{
                padding: "6px 14px", borderRadius: 6, textDecoration: "none",
                fontSize: 13, fontWeight: pathname === "/" ? 700 : 600,
                color: pathname === "/" ? "#0F172A" : "#64748B",
                background: pathname === "/" ? "#FFF8E1" : "transparent",
                transition: "all .15s",
              }}
            >
              Overview
            </Link>

            {/* Divider */}
            <div style={{ width: 1, height: 20, background: "#E2E8F0", margin: "0 6px" }} />

            {/* Tools dropdown */}
            <div
              style={{ position: "relative" }}
              onMouseEnter={() => setToolsOpen(true)}
              onMouseLeave={() => setToolsOpen(false)}
            >
              <button
                style={{
                  padding: "6px 14px", borderRadius: 6, border: "none",
                  cursor: "pointer", fontSize: 13,
                  fontWeight: isToolPage ? 700 : 600,
                  color: isToolPage ? "#0F172A" : "#64748B",
                  background: isToolPage ? "#FFF8E1" : "transparent",
                  fontFamily: "Inter, Arial, sans-serif",
                  display: "flex", alignItems: "center", gap: 5,
                  transition: "all .15s",
                }}
              >
                Tools
                <span style={{ fontSize: 8, opacity: 0.5, marginTop: 1 }}>▼</span>
              </button>

              {toolsOpen && (
                <div
                  style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0,
                    background: "#FFFFFF", border: "1px solid #E2E8F0",
                    borderRadius: 10, padding: 6, minWidth: 230,
                    boxShadow: "0 8px 30px rgba(0,0,0,.12)", zIndex: 200,
                  }}
                >
                  {TOOLS.map(t => {
                    const active = pathname === t.path;
                    return (
                      <Link
                        key={t.path}
                        to={t.path}
                        onClick={() => setToolsOpen(false)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "9px 12px", borderRadius: 7, textDecoration: "none",
                          color: active ? "#0F172A" : "#475569",
                          background: active ? "#FFF8E1" : "transparent",
                          fontWeight: active ? 700 : 500, fontSize: 13,
                          transition: "background .1s",
                        }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F8FAFC"; }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                      >
                        <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{t.icon}</span>
                        <span style={{ flex: 1 }}>{t.label}</span>
                        {active && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, color: "#FFB800",
                            background: "#FFF3CD", padding: "2px 7px", borderRadius: 4,
                          }}>
                            Active
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: CTA */}
        <Link
          to="/lcoe-tool"
          style={{
            padding: "7px 18px", borderRadius: 8, textDecoration: "none",
            color: "#FFFFFF", background: "#FFB800", fontWeight: 700,
            fontSize: 12, letterSpacing: ".04em",
            boxShadow: "0 2px 8px rgba(255,184,0,.25)",
            transition: "all .15s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "#e6a600";
            e.currentTarget.style.boxShadow = "0 4px 14px rgba(255,184,0,.35)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "#FFB800";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(255,184,0,.25)";
          }}
        >
          Launch LCOE →
        </Link>
      </div>
    </nav>
  );
}
