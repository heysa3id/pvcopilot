import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  SearchOutlined,
  QueryStats,
  AutoFixHigh,
  ElectricBolt,
  FilterAltOutlined,
  AccountTree,
  Menu as MenuIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import CurrencyExchangeIcon from "@mui/icons-material/CurrencyExchange";

const MOBILE_BREAKPOINT = 768;

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
  { id: "contact", label: "Contact" },
];

const transitionEase = "cubic-bezier(0.4, 0, 0.2, 1)";
const linkBase = {
  padding: "8px 14px",
  borderRadius: 10,
  textDecoration: "none",
  fontSize: 13,
  fontFamily: "Inter, Arial, sans-serif",
  transition: `background 0.28s ${transitionEase}, color 0.28s ${transitionEase}, font-weight 0.2s ease`,
};
const activeLink = { ...linkBase, background: "#FDF8E7", color: "#E8AA34", fontWeight: 600 };
const inactiveLink = { ...linkBase, background: "transparent", color: "#64748B", fontWeight: 500 };

export default function Navbar() {
  const { pathname, hash } = useLocation();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [scrollSectionId, setScrollSectionId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const isToolPage = TOOLS.some(t => pathname === t.path);
  const isLanding = pathname === "/";
  const activeSectionId = isLanding
    ? (scrollSectionId ?? (hash ? hash.slice(1) : "foundation"))
    : null;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (mobileMenuOpen && isMobile) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen, isMobile]);

  // When user clicks a nav link, sync selection to hash immediately
  useEffect(() => {
    if (isLanding && hash) setScrollSectionId(hash.slice(1));
  }, [isLanding, hash]);

  // Update navbar selection based on scroll position (which section is in view)
  const visibleRef = useRef(new Set());
  const rafRef = useRef(null);
  useEffect(() => {
    if (!isLanding) return;
    const sectionIds = LANDING_SECTIONS.map((s) => s.id);
    const visible = visibleRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.id;
          if (sectionIds.includes(id)) {
            if (entry.isIntersecting) visible.add(id);
            else visible.delete(id);
          }
        });
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const active = sectionIds.find((id) => visible.has(id));
          if (active != null) setScrollSectionId(active);
        });
      },
      { rootMargin: "-80px 0px -55% 0px", threshold: [0, 0.1] }
    );
    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      visible.clear();
      observer.disconnect();
    };
  }, [isLanding]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const ctaButton = (
    <Link
      to="/lcoe-tool"
      onClick={closeMobileMenu}
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
      onMouseEnter={e => { e.currentTarget.style.background = "#e6a600"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "#FFB800"; }}
    >
      Launch LCOE →
    </Link>
  );

  return (
    <>
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
          minHeight: 56,
        }}
      >
        <div
          style={{
            maxWidth: 1380,
            margin: "0 auto",
            padding: "0 16px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link to="/#hero" onClick={closeMobileMenu} style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}>
            <img src="/logoBlack.svg" alt="PVCopilot" style={{ height: isMobile ? 28 : 32, objectFit: "contain" }} />
          </Link>

          {!isMobile ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                {LANDING_SECTIONS.map(({ id, label }) => {
                  const isActive = isLanding && (activeSectionId ? activeSectionId === id : id === "foundation");
                  return (
                    <Link
                      key={id}
                      to={`/#${id}`}
                      style={isActive ? activeLink : inactiveLink}
                      onMouseEnter={e => {
                        if (!isActive) { e.currentTarget.style.background = "#F8FAFC"; e.currentTarget.style.color = "#475569"; }
                      }}
                      onMouseLeave={e => {
                        if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#64748B"; }
                      }}
                    >
                      {label}
                    </Link>
                  );
                })}
                <div style={{ position: "relative", marginLeft: 4 }} onMouseEnter={() => setToolsOpen(true)} onMouseLeave={() => setToolsOpen(false)}>
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
                    <div style={{
                      position: "absolute", top: "calc(100% + 4px)", right: 0,
                      background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 10, padding: 6,
                      minWidth: 230, boxShadow: "0 8px 30px rgba(0,0,0,.12)", zIndex: 200,
                    }}>
                      {TOOLS.map(t => {
                        const active = pathname === t.path;
                        return (
                          <Link
                            key={t.path}
                            to={t.path}
                            onClick={() => setToolsOpen(false)}
                            style={{
                              display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 7,
                              textDecoration: "none", color: active ? "#E8AA34" : "#475569",
                              background: active ? "#FDF8E7" : "transparent", fontWeight: active ? 600 : 500, fontSize: 13, transition: "background .1s",
                            }}
                            onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F8FAFC"; }}
                            onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
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
              {ctaButton}
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {ctaButton}
              <button
                type="button"
                aria-label="Toggle menu"
                onClick={() => setMobileMenuOpen(o => !o)}
                style={{
                  padding: 8,
                  border: "none",
                  background: "transparent",
                  color: "#0F172A",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {mobileMenuOpen ? <CloseIcon sx={{ fontSize: 24 }} /> : <MenuIcon sx={{ fontSize: 24 }} />}
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {isMobile && mobileMenuOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            top: 56,
            zIndex: 99,
            background: "#FFFFFF",
            overflow: "auto",
            padding: "16px 16px 32px",
            borderTop: "1px solid #E2E8F0",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {LANDING_SECTIONS.map(({ id, label }) => {
              const isActive = isLanding && (activeSectionId ? activeSectionId === id : id === "foundation");
              return (
                <Link
                  key={id}
                  to={`/#${id}`}
                  onClick={closeMobileMenu}
                  style={{
                    ...(isActive ? activeLink : inactiveLink),
                    padding: "12px 14px",
                    fontSize: 15,
                  }}
                >
                  {label}
                </Link>
              );
            })}
            <div style={{ padding: "8px 0", borderTop: "1px solid #E2E8F0", marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8, paddingLeft: 14 }}>Tools</div>
              {TOOLS.map(t => {
                const active = pathname === t.path;
                return (
                  <Link
                    key={t.path}
                    to={t.path}
                    onClick={closeMobileMenu}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 8,
                      textDecoration: "none", color: active ? "#E8AA34" : "#475569",
                      background: active ? "#FDF8E7" : "transparent", fontWeight: active ? 600 : 500, fontSize: 14,
                    }}
                  >
                    <span style={{ display: "flex" }}>{t.icon}</span>
                    <span>{t.label}</span>
                  </Link>
                );
              })}
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #E2E8F0" }}>
              <Link
                to="/lcoe-tool"
                onClick={closeMobileMenu}
                style={{
                  display: "block", textAlign: "center", padding: "14px 18px", borderRadius: 10,
                  textDecoration: "none", color: "#FFFFFF", background: "#FFB800", fontWeight: 700, fontSize: 15,
                }}
              >
                Launch LCOE Tool →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
