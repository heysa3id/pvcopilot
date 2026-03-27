import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Workflow,
  Boxes,
  FileText,
  Wand2,
  Mail,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import ContactFormPopover from "./ContactFormPopover";
import {
  SearchOutlined,
  QueryStats,
  AutoFixHigh,
  ElectricBolt,
  FilterAltOutlined,
  AccountTree,
  Calculate,
  ShowChartOutlined,
} from "@mui/icons-material";
import CurrencyExchangeIcon from "@mui/icons-material/CurrencyExchange";

const MOBILE_BREAKPOINT = 768;
const ACCENT = "#F4BB40";
const SOFT_ACCENT_BG = "#FEF9ED";
const BORDER = "#E2E8F0";
const INACTIVE_TEXT = "#64748B";
const HOVER_TEXT = "#475569";
const DARK_TEXT = "#0F172A";
const HOVER_BG = "#F8FAFC";
const DROPDOWN_SHADOW = "rgba(0,0,0,0.12)";

const TOOLS = [
  { path: "/data-ingestion", label: "Data Ingestion & Synchronization", icon: <SearchOutlined sx={{ fontSize: 18, color: ACCENT }} /> },
  { path: "/data-quality", label: "Data Quality Check", icon: <ShowChartOutlined sx={{ fontSize: 18, color: ACCENT }} /> },
  { path: "/data-filtering", label: "Data Filtering", icon: <FilterAltOutlined sx={{ fontSize: 18, color: ACCENT }} /> },
  { path: "/kpi-analysis", label: "KPI Analysis", icon: <QueryStats sx={{ fontSize: 18, color: ACCENT }} /> },
  { path: "/gap-filling", label: "Gap Filling", icon: <AutoFixHigh sx={{ fontSize: 18, color: ACCENT }} /> },
  { path: "/power-prediction", label: "Power Prediction", icon: <ElectricBolt sx={{ fontSize: 18, color: ACCENT }} /> },
  { path: "/lcoe-tool", label: "LCOE Tool", icon: <CurrencyExchangeIcon sx={{ fontSize: 18, color: ACCENT }} /> },
  { path: "/workflow", label: "Workflow", icon: <AccountTree sx={{ fontSize: 18, color: ACCENT }} /> },
];

const LANDING_SECTION_IDS = ["hero", "foundation", "workflow", "modules"];

const PAGE_NAV_ITEMS = [
  { key: "overview", label: "Overview", to: "/#hero", hash: "hero", Icon: LayoutDashboard },
  { key: "workflow", label: "Workflow", to: "/#workflow", hash: "workflow", Icon: Workflow },
  { key: "modules", label: "Modules", to: "/#modules", hash: "modules", Icon: Boxes },
  { key: "documentation", label: "Documentation", to: "/docs", hash: null, Icon: FileText },
];

function NavTooltip({ children, icon: Icon, label }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-[calc(100%+12px)] z-20 -translate-x-1/2 translate-y-1 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
      <div
        className="relative flex items-center gap-1.5 whitespace-nowrap rounded-xl border bg-white px-3 py-2 text-xs font-semibold tracking-tight shadow-[0_10px_30px_rgba(15,23,42,0.14)]"
        style={{ color: DARK_TEXT, borderColor: BORDER }}
      >
        {Icon && <Icon className="h-3.5 w-3.5" style={{ color: ACCENT }} />}
        {label}
        <div
          className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t bg-white"
          style={{ borderColor: BORDER }}
        />
      </div>
    </div>
  );
}

function NavItem({ item, isSelected, isLanding, activeSectionId, closeMobile }) {
  const { key, label, to, hash, Icon } = item;
  const selected = isSelected;

  return (
    <Link
      to={to}
      onClick={closeMobile}
      className="group relative flex items-center rounded-lg px-3 py-2 transition-colors duration-200"
      style={{
        background: selected ? SOFT_ACCENT_BG : "transparent",
        color: selected ? ACCENT : INACTIVE_TEXT,
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = HOVER_BG;
          e.currentTarget.style.color = HOVER_TEXT;
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = INACTIVE_TEXT;
        }
      }}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={2} />
      <AnimatePresence initial={false}>
        {selected && (
          <motion.span
            initial={{ width: 0, opacity: 0, marginLeft: 0 }}
            animate={{ width: "auto", opacity: 1, marginLeft: 8 }}
            exit={{ width: 0, opacity: 0, marginLeft: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="overflow-hidden whitespace-nowrap text-sm font-medium"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
      {!selected && (
        <NavTooltip icon={Icon} label={label} />
      )}
    </Link>
  );
}

function ToolsMenu({ pathname, toolsOpen, setToolsOpen, toolsRef, closeMobile }) {
  const isToolPage = TOOLS.some((t) => pathname === t.path);
  const isActive = toolsOpen || isToolPage;

  return (
    <div ref={toolsRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={toolsOpen}
        onClick={() => setToolsOpen((o) => !o)}
        className="group relative flex items-center rounded-lg px-3 py-2 transition-colors duration-200"
        style={{
          background: isActive ? SOFT_ACCENT_BG : "transparent",
          color: isActive ? ACCENT : INACTIVE_TEXT,
          border: "none",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = HOVER_BG;
            e.currentTarget.style.color = HOVER_TEXT;
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = INACTIVE_TEXT;
          }
        }}
      >
        <Wand2 className="h-5 w-5 shrink-0" strokeWidth={2} />
        <AnimatePresence initial={false}>
          {isActive && (
            <motion.span
              initial={{ width: 0, opacity: 0, marginLeft: 0 }}
              animate={{ width: "auto", opacity: 1, marginLeft: 8 }}
              exit={{ width: 0, opacity: 0, marginLeft: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className="flex items-center gap-1 overflow-hidden whitespace-nowrap text-sm font-medium"
            >
              Tools
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            </motion.span>
          )}
        </AnimatePresence>
        {!isActive && <NavTooltip icon={Wand2} label="Tools" />}
      </button>

      <AnimatePresence>
        {toolsOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 top-full z-[200] mt-1 min-w-[240px] rounded-xl border bg-white py-1.5"
            style={{ borderColor: BORDER, boxShadow: `0 10px 30px ${DROPDOWN_SHADOW}` }}
          >
            {TOOLS.map((t) => {
              const active = pathname === t.path;
              return (
                <Link
                  key={t.path}
                  to={t.path}
                  onClick={() => {
                    setToolsOpen(false);
                    closeMobile?.();
                  }}
                  className="flex items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium transition-colors"
                  style={{
                    color: active ? ACCENT : HOVER_TEXT,
                    background: active ? SOFT_ACCENT_BG : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = HOVER_BG;
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span className="flex h-6 w-6 items-center justify-center">{t.icon}</span>
                  <span className="flex-1">{t.label}</span>
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ContactTooltipButton({ closeMobile }) {
  const [contactOpen, setContactOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { closeMobile?.(); setContactOpen(true); }}
        className="group relative flex items-center justify-center rounded-lg p-2 transition-colors duration-200"
        style={{ background: SOFT_ACCENT_BG, color: ACCENT }}
      >
        <Mail className="h-5 w-5" strokeWidth={2} />
        <NavTooltip icon={Mail} label="Contact us" />
      </button>
      <div className="absolute right-0 top-full z-50 mt-2">
        <ContactFormPopover open={contactOpen} setOpen={setContactOpen} />
      </div>
    </div>
  );
}

function InteractiveLcoeButton({ closeMobile, fullWidth }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState(false);

  const handleClick = () => {
    if (location.pathname === "/lcoe-tool") return;
    setLoading(true);
    closeMobile?.();
    const t = setTimeout(() => {
      navigate("/lcoe-tool");
      setLoading(false);
      setReady(true);
      const t2 = setTimeout(() => setReady(false), 1500);
      return () => clearTimeout(t2);
    }, 600);
    return () => clearTimeout(t);
  };

  const showHoverContent = hover && !loading && !ready;
  const stateText = loading ? "Opening..." : ready ? "Ready" : "Open LCOE";

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`group/lcoe relative flex items-center overflow-hidden rounded-lg border px-3 py-2 text-sm font-semibold transition-all duration-300 ${fullWidth ? "w-full justify-center" : ""}`}
      style={{
        background: "#FFFFFF",
        borderColor: BORDER,
        color: DARK_TEXT,
      }}
    >
      {/* Expanding accent circle behind content */}
      <span
        className="absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full transition-transform duration-300 group-hover/lcoe:scale-[20]"
        style={{ background: ACCENT }}
      />
      <span className="relative z-10 flex items-center gap-2">
        {showHoverContent ? (
          <span className="flex items-center gap-1.5 transition-opacity duration-200">
            <Calculate sx={{ fontSize: 18 }} />
            Open LCOE
          </span>
        ) : (
          <>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: ACCENT }}
            />
            <span className="transition-opacity duration-200">{stateText}</span>
          </>
        )}
      </span>
    </button>
  );
}

export default function Navbar() {
  const { pathname, hash } = useLocation();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [scrollSectionId, setScrollSectionId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const toolsRef = useRef(null);

  const isLanding = pathname === "/";
  const isToolPage = TOOLS.some((t) => pathname === t.path);
  const activeSectionId = isLanding
    ? scrollSectionId ?? (hash ? hash.slice(1) : "foundation")
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
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen, isMobile]);

  useEffect(() => {
    if (isLanding && hash) setScrollSectionId(hash.slice(1));
  }, [isLanding, hash]);

  const visibleRef = useRef(new Set());
  const rafRef = useRef(null);
  useEffect(() => {
    if (!isLanding) return;
    const visible = visibleRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.id;
          if (LANDING_SECTION_IDS.includes(id)) {
            if (entry.isIntersecting) visible.add(id);
            else visible.delete(id);
          }
        });
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const active = LANDING_SECTION_IDS.find((id) => visible.has(id));
          if (active != null) setScrollSectionId(active);
        });
      },
      { rootMargin: "-80px 0px -55% 0px", threshold: [0, 0.1] }
    );
    LANDING_SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      visible.clear();
      observer.disconnect();
    };
  }, [isLanding]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target)) setToolsOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, []);

  // Close menus on every route change (handles browser back/forward + programmatic nav)
  useEffect(() => {
    setToolsOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const selectedNavKey = (() => {
    if (toolsOpen || isToolPage) return "tools";
    if (pathname === "/docs") return "documentation";
    if (isLanding) {
      const section = activeSectionId ?? "foundation";
      if (section === "hero" || section === "foundation") return "overview";
      if (section === "workflow") return "workflow";
      if (section === "modules") return "modules";
    }
    return null;
  })();

  const selectedPageKey = selectedNavKey && selectedNavKey !== "tools" ? selectedNavKey : null;

  return (
    <>
      <nav
        className="sticky top-0 left-0 right-0 z-[100]"
        style={{
          background: "#FFFFFF",
          borderBottom: `1px solid ${BORDER}`,
          height: 56,
          minHeight: 56,
          fontFamily: "Inter, Arial, sans-serif",
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
          <Link
            to="/#hero"
            onClick={closeMobileMenu}
            className="flex shrink-0 items-center text-inherit no-underline"
          >
            <img
              src="/logoBlack.svg"
              alt="PVCopilot"
              style={{ height: isMobile ? 28 : 32, objectFit: "contain" }}
            />
          </Link>

          {!isMobile ? (
            <>
              <div
                className="flex items-center gap-1 rounded-2xl border py-1 pl-1 pr-2"
                style={{
                  background: "transparent",
                  borderColor: BORDER,
                  boxShadow: `0 2px 12px ${DROPDOWN_SHADOW}`,
                }}
              >
                {PAGE_NAV_ITEMS.map((item) => (
                  <NavItem
                    key={item.key}
                    item={item}
                    isSelected={selectedPageKey === item.key}
                    isLanding={isLanding}
                    activeSectionId={activeSectionId}
                  />
                ))}
                <ToolsMenu
                  pathname={pathname}
                  toolsOpen={toolsOpen}
                  setToolsOpen={setToolsOpen}
                  toolsRef={toolsRef}
                />
              </div>

              <div className="flex items-center gap-2 rounded-2xl border py-1 pl-2 pr-2" style={{ borderColor: BORDER, boxShadow: `0 2px 12px ${DROPDOWN_SHADOW}` }}>
                <ContactTooltipButton />
                <InteractiveLcoeButton />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <ContactTooltipButton closeMobile={closeMobileMenu} />
              <InteractiveLcoeButton closeMobile={closeMobileMenu} />
              <button
                type="button"
                aria-label="Toggle menu"
                onClick={() => setMobileMenuOpen((o) => !o)}
                className="flex items-center justify-center rounded-lg p-2 transition-colors"
                style={{ border: "none", background: "transparent", color: DARK_TEXT, cursor: "pointer" }}
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          )}
        </div>
      </nav>

      {isMobile && mobileMenuOpen && (
        <div
          className="fixed left-0 right-0 bottom-0 z-[99] overflow-auto bg-white"
          style={{ top: 56, borderTop: `1px solid ${BORDER}`, padding: "16px 16px 32px" }}
        >
          <div className="flex flex-col gap-1">
            {PAGE_NAV_ITEMS.map((item) => {
              const isSelected = selectedPageKey === item.key;
              const isActive =
                item.key === "overview"
                  ? isLanding && (activeSectionId === "hero" || activeSectionId === "foundation")
                  : item.hash
                    ? isLanding && (activeSectionId ? activeSectionId === item.hash : item.hash === "foundation")
                    : pathname === "/docs";
              return (
                <Link
                  key={item.key}
                  to={item.key === "documentation" ? "/docs" : item.to}
                  onClick={closeMobileMenu}
                  className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
                  style={{
                    background: isActive ? SOFT_ACCENT_BG : "transparent",
                    color: isActive ? ACCENT : HOVER_TEXT,
                  }}
                >
                  <item.Icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                  {item.label}
                </Link>
              );
            })}
            <div className="border-t pt-3" style={{ borderColor: BORDER, marginTop: 8 }}>
              <div
                className="mb-2 pl-4 text-xs font-bold uppercase tracking-wider"
                style={{ color: INACTIVE_TEXT }}
              >
                Tools
              </div>
              {TOOLS.map((t) => {
                const active = pathname === t.path;
                return (
                  <Link
                    key={t.path}
                    to={t.path}
                    onClick={closeMobileMenu}
                    className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
                    style={{
                      background: active ? SOFT_ACCENT_BG : "transparent",
                      color: active ? ACCENT : HOVER_TEXT,
                    }}
                  >
                    <span className="flex">{t.icon}</span>
                    {t.label}
                  </Link>
                );
              })}
            </div>
            <div className="border-t pt-4" style={{ borderColor: BORDER, marginTop: 16 }}>
              <InteractiveLcoeButton closeMobile={closeMobileMenu} fullWidth />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
