import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  SearchOutlined,
  QueryStats,
  AutoFixHigh,
  ElectricBolt,
  FilterAltOutlined,
  AccountTree,
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
  { path: "/workflow",        label: "Workflow",            icon: <AccountTree sx={{ fontSize: 18, color: ICON_COLOR }} />, color: "#0ea5e9" },
];

const LANDING_SECTIONS = [
  { id: "foundation", label: "Overview" },
  { id: "workflow", label: "Workflow" },
  { id: "modules", label: "Modules" },
  { id: "team", label: "Team" },
  { id: "partners", label: "Partners" },
  { id: "contact", label: "Contact" },
];

const linkBase = {
  padding: "8px 14px",
  borderRadius: 10,
  textDecoration: "none",
  fontSize: 13,
  fontFamily: "Inter, Arial, sans-serif",
  transition: "all .15s",
};
const activeLink = { ...linkBase, background: "#FDF8E7", color: "#E8AA34", fontWeight: 600 };
const inactiveLink = { ...linkBase, background: "transparent", color: "#64748B", fontWeight: 500 };

export default function Navbar() {
  const { pathname, hash } = useLocation();
  const [toolsOpen, setToolsOpen] = useState(false);
  const isToolPage = TOOLS.some(t => pathname === t.path);
  const isLanding = pathname === "/";
  const activeSectionId = isLanding && hash ? hash.slice(1) : null;

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: "#FFFFFF",
        borderBottom: "1px solid #E2E8F0",
        height: 56,
      }}
    >
      <div
        style={{
          maxWidth: 1380,
          margin: "0 auto",
          padding: "0 24px",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Left: logo + brand name */}
        <Link to="/#hero" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <img src="/logoBlack.svg" alt="PVCopilot" style={{ height: 32, objectFit: "contain" }} />
        </Link>

        {/* Center/Right: flat section links + Tools dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {LANDING_SECTIONS.map(({ id, label }) => {
            const isActive = isLanding && (activeSectionId ? activeSectionId === id : id === "foundation");
            return (
              <Link
                key={id}
                to={`/#${id}`}
                style={isActive ? activeLink : inactiveLink}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = "#F8FAFC";
                    e.currentTarget.style.color = "#475569";
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#64748B";
                  }
                }}
              >
                {label}
              </Link>
            );
          })}

          {/* Tools dropdown */}
          <div
            style={{ position: "relative", marginLeft: 4 }}
            onMouseEnter={() => setToolsOpen(true)}
            onMouseLeave={() => setToolsOpen(false)}
          >
            <button
              style={{
                ...(isToolPage ? activeLink : inactiveLink),
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              Tools
              <span style={{ fontSize: 8, opacity: 0.6, marginTop: 1 }}>▼</span>
            </button>

            {toolsOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  background: "#FFFFFF",
                  border: "1px solid #E2E8F0",
                  borderRadius: 10,
                  padding: 6,
                  minWidth: 230,
                  boxShadow: "0 8px 30px rgba(0,0,0,.12)",
                  zIndex: 200,
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
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 12px",
                        borderRadius: 7,
                        textDecoration: "none",
                        color: active ? "#E8AA34" : "#475569",
                        background: active ? "#FDF8E7" : "transparent",
                        fontWeight: active ? 600 : 500,
                        fontSize: 13,
                        transition: "background .1s",
                      }}
                      onMouseEnter={e => {
                        if (!active) e.currentTarget.style.background = "#F8FAFC";
                      }}
                      onMouseLeave={e => {
                        if (!active) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{t.icon}</span>
                      <span style={{ flex: 1 }}>{t.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: CTA */}
        <Link
          to="/lcoe-tool"
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            textDecoration: "none",
            color: "#FFFFFF",
            background: "#FFB800",
            fontWeight: 600,
            fontSize: 13,
            fontFamily: "Inter, Arial, sans-serif",
            transition: "all .15s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "#e6a600";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "#FFB800";
          }}
        >
          Launch LCOE →
        </Link>
      </div>
    </nav>
  );
}
