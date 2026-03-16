import { useState } from "react";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import Tooltip from "@mui/material/Tooltip";
import PlaylistAddIcon from "@mui/icons-material/PlaylistAdd";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import Box from "@mui/material/Box";

const FONT = "Inter, Arial, sans-serif";
const ACCENT = "#e11d48"; // matches chart list checked state (PVCopilot accent)
const ROW_HOVER = "#EEF2FF"; // light lavender

/**
 * Reusable column visibility control for data tables.
 * Styled to match the chart column selector (rounded panel, checkbox + label + index, hover state).
 * @param {Object} props
 * @param {Array<{ id: string|number, label: string }>} props.columns - All columns (id + human-readable label)
 * @param {Array<string|number>} props.visibleIds - Currently visible column ids
 * @param { (ids: Array<string|number>) => void } props.onVisibleChange - Called when visibility changes
 * @param {Array<string|number>} [props.defaultVisibleIds] - Ids to use for "Reset defaults" (default: all)
 */
export default function TableColumnSelector({
  columns,
  visibleIds,
  onVisibleChange,
  defaultVisibleIds,
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const open = Boolean(anchorEl);
  const defaultIds = defaultVisibleIds ?? columns.map((c) => c.id);

  const handleOpen = (e) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };

  const handleClose = (e) => {
    e?.stopPropagation?.();
    setAnchorEl(null);
    setHoverId(null);
  };

  const toggle = (id) => {
    const set = new Set(visibleIds);
    if (set.has(id)) {
      set.delete(id);
      if (set.size === 0) return; // keep at least one visible
    } else {
      set.add(id);
    }
    onVisibleChange(Array.from(set));
  };

  const selectAll = () => {
    onVisibleChange(columns.map((c) => c.id));
  };

  const resetDefaults = () => {
    onVisibleChange(defaultIds.length ? [...defaultIds] : columns.map((c) => c.id));
  };

  const allSelected = columns.length > 0 && visibleIds.length >= columns.length;

  const indexLabel = (col) => {
    if (col.id === "_rowNum" || col.id === "rowNum") return "—";
    if (typeof col.id === "number") return `#${col.id}`;
    return `#${col.id}`;
  };

  return (
    <>
      <Tooltip title="Show / hide columns">
        <IconButton
          size="small"
          onClick={handleOpen}
          onMouseDown={(e) => e.stopPropagation()}
          sx={{ color: "#94a3b8", "&:hover": { color: "#64748B", backgroundColor: "rgba(0,0,0,0.04)" } }}
          aria-label="Show / hide columns"
          aria-controls={open ? "column-visibility-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={open ? "true" : undefined}
        >
          <PlaylistAddIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
      <Menu
        id="column-visibility-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1.5,
              minWidth: 280,
              maxHeight: 380,
              borderRadius: 3,
              boxShadow: "0 10px 30px rgba(2, 6, 23, 0.14)",
              border: "1px solid #E2E8F0",
              overflow: "hidden",
            },
          },
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Box sx={{ padding: "10px 10px 4px" }}>
          <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: "#64748B", padding: "2px 6px 4px" }}>
            Columns
          </div>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", marginBottom: 2 }}>
            <button
              type="button"
              onClick={selectAll}
              disabled={allSelected}
              style={{
                padding: "4px 10px",
                border: "none",
                borderRadius: 8,
                background: "transparent",
                color: "#64748B",
                fontFamily: FONT,
                fontSize: 12,
                fontWeight: 600,
                cursor: allSelected ? "default" : "pointer",
                opacity: allSelected ? 0.6 : 1,
              }}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={resetDefaults}
              style={{
                padding: "4px 10px",
                border: "none",
                borderRadius: 8,
                background: "transparent",
                color: "#64748B",
                fontFamily: FONT,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reset defaults
            </button>
          </Box>
          <Box sx={{ maxHeight: 320, overflowY: "auto", padding: "2px 0" }}>
            {columns.map((col) => {
              const checked = visibleIds.includes(col.id);
              const disabled = checked && visibleIds.length <= 1;
              const isHover = hoverId === col.id;
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => !disabled && toggle(col.id)}
                  onMouseEnter={() => setHoverId(col.id)}
                  onMouseLeave={() => setHoverId(null)}
                  disabled={disabled}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "9px 10px",
                    border: "none",
                    background: checked || isHover ? ROW_HOVER : "transparent",
                    borderRadius: 10,
                    cursor: disabled ? "default" : "pointer",
                    textAlign: "left",
                    fontFamily: FONT,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#0F172A",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        border: checked ? "none" : "1.5px solid #CBD5E1",
                        background: checked ? ACCENT : "#fff",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {checked && <CheckCircleOutline sx={{ fontSize: 14, color: "#fff" }} />}
                    </span>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col.label}
                    </span>
                  </span>
                  <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: "#94a3b8", flexShrink: 0 }}>
                    {indexLabel(col)}
                  </span>
                </button>
              );
            })}
          </Box>
        </Box>
      </Menu>
    </>
  );
}
