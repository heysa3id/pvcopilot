import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Timeline } from '../components/docs/Timeline';
import {
  DocumentationModulesBar,
  DOC_MODULE_ITEMS,
  type DocModuleId,
} from '../components/docs/DocumentationModulesBar';
import { DocumentationModuleContent } from '../components/docs/DocumentationModuleContent';
import { DOCS_STEPS_BY_MODULE } from '../data/docModules';

export default function DocsPage() {
  const [activeTool, setActiveTool] = useState<DocModuleId>(DOC_MODULE_ITEMS[0].id);

  return (
    <div className="w-full bg-white text-slate-900 dark:bg-neutral-950 dark:text-white">
      <div className="mx-auto max-w-6xl px-4 pt-4 pb-8 md:px-6 md:pt-5 md:pb-10">
        <header className="mb-6">
          <span
            className="inline-block rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
            style={{ color: '#F4BB40', background: '#FEF9ED' }}
          >
            Documentation
          </span>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white md:text-4xl lg:text-5xl">
            How the tool works
          </h1>
          <p className="mt-2 max-w-3xl text-base text-neutral-600 dark:text-neutral-300 md:text-lg">
            Follow the workflow from data preparation to export. Each step includes a placeholder area
            for a future screenshot, chart, or UI example.
          </p>
        </header>

        <DocumentationModulesBar activeTool={activeTool} setActiveTool={setActiveTool} />

        <AnimatePresence mode="wait">
          <DocumentationModuleContent
            key={activeTool}
            activeTool={activeTool}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          />
        </AnimatePresence>

        <section className="mt-6">
          <Timeline steps={DOCS_STEPS_BY_MODULE[activeTool]} />
        </section>
      </div>
    </div>
  );
}
