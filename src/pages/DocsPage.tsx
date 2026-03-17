import {
  Database,
  GitBranch,
  Settings2,
  ShieldCheck,
  PlayCircle,
  LineChart,
  RefreshCw,
  FileOutput,
} from 'lucide-react';
import type { TimelineStep } from '../components/types/docs';
import { Timeline } from '../components/docs/Timeline';

const DOCS_STEPS: TimelineStep[] = [
  {
    stepLabel: 'Step 1',
    eyebrowLabel: 'Processing workflow',
    icon: Database,
    title: 'Prepare the input',
    description:
      'Start by uploading or connecting the data required by the tool. Use clean input files, verify the expected format, and make sure the key fields needed for calculation are available before moving to the next step.',
    bullets: [
      'Source dataset or manually entered values',
      'Required fields completed with consistent units',
      'Time series cleaned from obvious formatting issues',
      'Tool assumptions reviewed before execution',
    ],
    imagePlaceholderLabel: 'Upload or data source preview',
  },
  {
    stepLabel: 'Step 2',
    eyebrowLabel: 'Processing workflow',
    icon: GitBranch,
    title: 'Choose the workflow',
    description:
      'Select the workflow or calculation mode that matches your use case. This helps align the tool with the right methodology before changing detailed settings.',
    bullets: [
      'Standard workflow',
      'Advanced analysis mode',
      'Site-specific configuration',
      'Default or saved templates',
    ],
    imagePlaceholderLabel: 'Workflow mode selection preview',
  },
  {
    stepLabel: 'Step 3',
    eyebrowLabel: 'Processing workflow',
    icon: Settings2,
    title: 'Configure parameters',
    description:
      'Configure the analysis parameters. Select the relevant filters, choose the variables to include, and adjust the calculation settings so the workflow matches your case study or PV system configuration.',
    bullets: [
      'KPI or model selection',
      'Date range and temporal resolution',
      'Data quality or IEC filters',
      'Economic or technical assumptions',
    ],
    imagePlaceholderLabel: 'Parameter configuration preview',
  },
  {
    stepLabel: 'Step 4',
    eyebrowLabel: 'Processing workflow',
    icon: ShieldCheck,
    title: 'Validate inputs',
    description:
      'Validate the inputs before execution. Check that the selected variables, time ranges, and units are coherent so the calculation is not affected by inconsistent data.',
    bullets: [
      'Missing values identified',
      'Units verified across all inputs',
      'Duplicate or invalid timestamps reviewed',
      'Filters applied as intended',
    ],
    imagePlaceholderLabel: 'Input validation preview',
  },
  {
    stepLabel: 'Step 5',
    eyebrowLabel: 'Processing workflow',
    icon: PlayCircle,
    title: 'Run calculation',
    description:
      'Run the calculation and review the generated outputs. The tool processes the selected inputs, applies the configured workflow, and returns results in charts, tables, and summary indicators.',
    bullets: [
      'Processed KPI values',
      'Visual charts for interpretation',
      'Intermediate values and assumptions',
      'Summary block for fast review',
    ],
    imagePlaceholderLabel: 'Calculation results preview',
  },
  {
    stepLabel: 'Step 6',
    eyebrowLabel: 'Processing workflow',
    icon: LineChart,
    title: 'Interpret results',
    description:
      'Interpret the results using the visual summaries and detailed tables. Compare the output against expected system behavior and identify trends, deviations, or anomalies.',
    bullets: [
      'Main KPI trends',
      'Unexpected peaks or losses',
      'Performance differences across periods',
      'Use summary indicators before deep analysis',
    ],
    imagePlaceholderLabel: 'Charts and interpretation preview',
  },
  {
    stepLabel: 'Step 7',
    eyebrowLabel: 'Processing workflow',
    icon: RefreshCw,
    title: 'Refine and rerun',
    description:
      'Refine the configuration if needed. Adjust thresholds, filters, or assumptions and rerun the workflow until the output matches the intended analysis scope.',
    bullets: [
      'Results show unexpected outliers',
      'Too much data was excluded by filters',
      'Assumptions need better alignment with the site',
      'A different resolution or KPI is needed',
    ],
    imagePlaceholderLabel: 'Refinement and rerun preview',
  },
  {
    stepLabel: 'Step 8',
    eyebrowLabel: 'Processing workflow',
    icon: FileOutput,
    title: 'Export and document',
    description:
      'Export and document the final results. Save the processed outputs, charts, and selected settings so the workflow can be reused later or included in reports and technical reviews.',
    bullets: [
      'Download processed tables',
      'Save charts for reports',
      'Archive selected assumptions',
      'Keep a record of the final settings used',
    ],
    imagePlaceholderLabel: 'Export and documentation preview',
  },
];

export default function DocsPage() {
  return (
    <div className="w-full bg-white text-slate-900 dark:bg-neutral-950 dark:text-white md:px-10">
      <header className="mx-auto max-w-7xl px-4 py-16 md:px-8 lg:px-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white md:text-4xl lg:text-5xl">
          How the tool works
        </h1>
        <p className="mt-3 max-w-3xl text-base text-neutral-600 dark:text-neutral-300 md:text-lg">
          Follow the workflow from data preparation to export. Each step includes a placeholder area
          for a future screenshot, chart, or UI example.
        </p>
      </header>

      <section className="w-full">
        <Timeline steps={DOCS_STEPS} />
      </section>
    </div>
  );
}
