import { motion } from 'framer-motion';
import type { DocModuleId } from './DocumentationModulesBar';
import { DOC_MODULE_CONTENT } from '../../data/docModules';

const BORDER = '#E2E8F0';

export type DocumentationModuleContentProps = {
  activeTool: DocModuleId | null;
};

export const DocumentationModuleContent = motion(function DocumentationModuleContent({
  activeTool,
}: DocumentationModuleContentProps) {
  const content = activeTool ? DOC_MODULE_CONTENT[activeTool] : null;
  if (!content) {
    return (
      <div
        className="mt-4 rounded-2xl border bg-white p-6 shadow-sm"
        style={{ borderColor: BORDER }}
      >
        <p className="text-sm text-slate-600">Select a module to view its documentation.</p>
      </div>
    );
  }

  return (
    <div
      className="mt-4 rounded-2xl border bg-white p-6 shadow-sm"
      style={{ borderColor: BORDER }}
    >
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">{content.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{content.description}</p>
    </div>
  );
});
