import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SearchOutlined,
  QueryStats,
  AutoFixHigh,
  ElectricBolt,
  FilterAltOutlined,
  AccountTree,
} from '@mui/icons-material';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';

const ACCENT = '#F4BB40';
const SOFT_ACCENT_BG = '#FEF9ED';
const BORDER = '#E2E8F0';
const INACTIVE_TEXT = '#64748B';
const HOVER_TEXT = '#475569';
const HOVER_BG = '#F8FAFC';

export type DocModuleId =
  | 'data-ingestion'
  | 'data-filtering'
  | 'kpi-analysis'
  | 'gap-filling'
  | 'power-prediction'
  | 'lcoe-tool'
  | 'workflow';

const DOC_MODULE_ITEMS: { id: DocModuleId; label: string; Icon: React.ComponentType<{ sx?: object }> }[] = [
  { id: 'data-ingestion', label: 'Data Ingestion & Synchronization', Icon: SearchOutlined },
  { id: 'data-filtering', label: 'Data Filtering', Icon: FilterAltOutlined },
  { id: 'kpi-analysis', label: 'KPI Analysis', Icon: QueryStats },
  { id: 'gap-filling', label: 'Gap Filling', Icon: AutoFixHigh },
  { id: 'power-prediction', label: 'Power Prediction', Icon: ElectricBolt },
  { id: 'lcoe-tool', label: 'LCOE Tool', Icon: CurrencyExchangeIcon },
  { id: 'workflow', label: 'Workflow', Icon: AccountTree },
];

export type DocumentationModulesBarProps = {
  activeTool: DocModuleId | null;
  setActiveTool: (tool: DocModuleId) => void;
};

export function DocumentationModulesBar({ activeTool, setActiveTool }: DocumentationModulesBarProps) {
  const [hoveredId, setHoveredId] = useState<DocModuleId | null>(null);

  return (
    <div
      className="mb-4 rounded-2xl border p-1 shadow-sm"
      style={{
        borderColor: BORDER,
        background: '#FFFFFF',
        fontFamily: 'Inter, Arial, sans-serif',
      }}
    >
      <div className="flex flex-wrap items-center justify-center gap-2">
        {DOC_MODULE_ITEMS.map((tool) => {
          const ToolIcon = tool.Icon;
          const active = activeTool === tool.id;
          const hovered = hoveredId === tool.id;
          const iconColor = active ? ACCENT : hovered ? HOVER_TEXT : INACTIVE_TEXT;
          const bgColor = active ? SOFT_ACCENT_BG : hovered ? HOVER_BG : 'transparent';

          return (
            <div key={tool.id} className="relative group">
              <button
                type="button"
                onClick={() => setActiveTool(tool.id)}
                onMouseEnter={() => setHoveredId(tool.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200"
                style={{
                  backgroundColor: bgColor,
                  color: iconColor,
                }}
              >
                <ToolIcon sx={{ fontSize: 18, color: iconColor }} />
                <AnimatePresence initial={false} mode="wait">
                  {active && (
                    <motion.span
                      initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                      animate={{ width: 'auto', opacity: 1, marginLeft: 8 }}
                      exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                      className="overflow-hidden whitespace-nowrap"
                    >
                      {tool.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>

              {!active && (
                <div className="pointer-events-none absolute left-1/2 top-[calc(100%+12px)] z-20 -translate-x-1/2 translate-y-1 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
                  <div
                    className="relative rounded-xl border bg-white/95 px-3 py-2 text-xs font-semibold tracking-tight text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.14)] backdrop-blur-sm"
                    style={{ borderColor: BORDER }}
                  >
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <ToolIcon sx={{ fontSize: 14, color: ACCENT }} />
                      {tool.label}
                    </span>
                    <div
                      className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t bg-white/95"
                      style={{ borderColor: BORDER }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { DOC_MODULE_ITEMS };
