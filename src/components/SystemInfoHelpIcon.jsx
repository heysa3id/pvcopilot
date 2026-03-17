import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import HelpOutline from "@mui/icons-material/HelpOutline";

const FONT = "Inter, Arial, sans-serif";
const SYSTEM_INFO_HELP = {
  temp_coef: "Temperature coefficient of power (%/°C). Power scales with cell temperature as (1 + (temp_coef/100) × (Tcell − 25)). Typical values are negative (e.g. -0.4).",
  coef_a: "Sandia module temperature model parameter a. Module temperature: T_m = E_POA × exp(a + b×WS) + T_a. Parameter a depends on module construction and mounting (e.g. Polymer/thin-film/steel, open rack: a = -3.58).",
  coef_b: "Sandia module temperature model parameter b (wind-speed term). Same formula as coef_a; b captures cooling by wind (e.g. Polymer/thin-film/steel, open rack: b = -0.113).",
  delta: "Additive correction term (°C per 1000 W/m²) in the cell temperature model: Tcell = T_air + E_POA×exp(a+b×WS) + (E_POA×delta)/1000. Used for cell-to-module offset or empirical adjustment.",
};
const SANDIA_MODEL_URL = "https://pvpmc.sandia.gov/modeling-guide/2-dc-module-iv/module-temperature/sandia-module-temperature-model/";

/**
 * ? icon that opens a scrollable popup explaining System Info JSON fields (temp_coef, coef_a, coef_b, delta).
 * Use next to "System Info" on Data Filtering, KPI Analysis, and Quality Check pages.
 * @param {string} [linkColor] - Color for the Sandia link (e.g. "#e11d48", "#ff7a45")
 */
export default function SystemInfoHelpIcon({ linkColor = "#e11d48" }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpAnchor, setHelpAnchor] = useState({ top: 0, left: 0, bottom: 0 });
  const helpRef = useRef(null);
  const helpTriggerRef = useRef(null);

  const updateHelpAnchor = useCallback(() => {
    const el = helpTriggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setHelpAnchor({ top: r.top, left: r.left, bottom: r.bottom });
  }, []);

  useEffect(() => {
    if (!helpOpen) return;
    updateHelpAnchor();
    const onScrollOrResize = () => updateHelpAnchor();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [helpOpen, updateHelpAnchor]);

  useEffect(() => {
    if (!helpOpen) return;
    const onDocClick = (e) => {
      if (helpTriggerRef.current?.contains(e.target) || helpRef.current?.contains(e.target)) return;
      setHelpOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [helpOpen]);

  return (
    <>
      <span
        ref={helpTriggerRef}
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          const next = !helpOpen;
          if (next) {
            const r = helpTriggerRef.current?.getBoundingClientRect();
            if (r) setHelpAnchor({ top: r.top, left: r.left, bottom: r.bottom });
          }
          setHelpOpen(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            const next = !helpOpen;
            if (next) {
              const r = helpTriggerRef.current?.getBoundingClientRect();
              if (r) setHelpAnchor({ top: r.top, left: r.left, bottom: r.bottom });
            }
            setHelpOpen(next);
          }
        }}
        aria-label="Explain System Info JSON fields"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 20,
          height: 20,
          borderRadius: "50%",
          color: "#64748B",
          cursor: "pointer",
          outline: "none",
        }}
      >
        <HelpOutline sx={{ fontSize: 18 }} />
      </span>
      {helpOpen &&
        createPortal(
          <div
            ref={helpRef}
            style={{
              position: "fixed",
              top: helpAnchor.bottom + 8,
              left: helpAnchor.left,
              zIndex: 10001,
              width: 520,
              maxHeight: "min(70vh, 420px)",
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #E2E8F0",
              boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
              fontFamily: FONT,
              fontSize: 11,
              color: "#475569",
              lineHeight: 1.55,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 16px 10px", flexShrink: 0, borderBottom: "1px solid #E2E8F0" }}>
              <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>System Info JSON fields</div>
              <p style={{ margin: 0 }}>
                Thermal and electrical parameters used for module/cell temperature and power models (e.g. Sandia module temperature model, PVWatts).
              </p>
            </div>
            <div
              style={{
                padding: "12px 16px 14px",
                overflowY: "auto",
                flex: 1,
                minHeight: 0,
              }}
            >
              <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>
                <li style={{ marginBottom: 8 }}>
                  <strong style={{ color: "#0F172A" }}>temp_coef</strong> — {SYSTEM_INFO_HELP.temp_coef}
                </li>
                <li style={{ marginBottom: 8 }}>
                  <strong style={{ color: "#0F172A" }}>coef_a</strong> — {SYSTEM_INFO_HELP.coef_a}
                </li>
                <li style={{ marginBottom: 8 }}>
                  <strong style={{ color: "#0F172A" }}>coef_b</strong> — {SYSTEM_INFO_HELP.coef_b}
                </li>
                <li style={{ marginBottom: 8 }}>
                  <strong style={{ color: "#0F172A" }}>delta</strong> — {SYSTEM_INFO_HELP.delta}
                </li>
              </ul>
              <p style={{ margin: "8px 0 0 0" }}>
                <a href={SANDIA_MODEL_URL} target="_blank" rel="noopener noreferrer" style={{ color: linkColor, textDecoration: "underline" }}>
                  Sandia Module Temperature Model (PVPMC)
                </a>
              </p>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
