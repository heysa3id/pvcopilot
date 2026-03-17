import {
  Database,
  GitBranch,
  Settings2,
  ShieldCheck,
  PlayCircle,
  LineChart,
  RefreshCw,
  FileOutput,
  Upload,
  Filter,
  BarChart3,
  Calculator,
  Workflow as WorkflowIcon,
} from 'lucide-react';
import type { TimelineStep } from '../components/types/docs';
import type { DocModuleId } from '../components/docs/DocumentationModulesBar';

export interface DocModuleContent {
  title: string;
  description: string;
}

const step = (
  stepLabel: string,
  eyebrow: string,
  icon: TimelineStep['icon'],
  title: string,
  description: string,
  bullets: string[],
  imageLabel: string
): TimelineStep => ({
  stepLabel,
  eyebrowLabel: eyebrow,
  icon,
  title,
  description,
  bullets,
  imagePlaceholderLabel: imageLabel,
});

// Data Ingestion & Synchronization
const DATA_INGESTION_STEPS: TimelineStep[] = [
  step('Step 1', 'Data ingestion', Database, 'Connect data sources', 'Link your PV monitoring systems, SCADA, or weather APIs. Configure authentication and sync intervals for continuous data flow.', ['API and database connectors', 'Sync frequency and schedules', 'Credential management'], 'Data source connection preview'),
  step('Step 2', 'Data ingestion', Upload, 'Map and validate schema', 'Define how incoming fields map to the tool’s expected schema. Validate units, timestamps, and required columns.', ['Field mapping', 'Unit and format checks', 'Missing value handling'], 'Schema mapping preview'),
  step('Step 3', 'Data ingestion', ShieldCheck, 'Run initial sync', 'Execute the first synchronization and verify that data is flowing correctly before enabling automated updates.', ['Initial sync run', 'Data quality checks', 'Error and retry handling'], 'Sync status preview'),
  step('Step 4', 'Data ingestion', RefreshCw, 'Enable ongoing sync', 'Turn on scheduled synchronization so new data is ingested automatically for up-to-date analysis.', ['Recurring sync jobs', 'Incremental vs full sync', 'Monitoring and alerts'], 'Ongoing sync preview'),
];

// Data Filtering
const DATA_FILTERING_STEPS: TimelineStep[] = [
  step('Step 1', 'Data filtering', Filter, 'Select date range and site', 'Narrow the dataset by time period and plant or inverter so only relevant data is used in the analysis.', ['Date range picker', 'Site and asset selection', 'Multi-site filters'], 'Filter selection preview'),
  step('Step 2', 'Data filtering', Settings2, 'Apply quality filters', 'Configure IEC or custom quality filters to exclude invalid or flagged intervals from the analysis.', ['IEC 61724 quality flags', 'Custom thresholds', 'Exclusion rules'], 'Quality filter preview'),
  step('Step 3', 'Data filtering', ShieldCheck, 'Review filtered dataset', 'Inspect the filtered dataset size and coverage to ensure enough valid data remains for reliable results.', ['Filtered data summary', 'Coverage and gaps', 'Export filtered subset'], 'Filtered data preview'),
];

// KPI Analysis
const KPI_ANALYSIS_STEPS: TimelineStep[] = [
  step('Step 1', 'KPI analysis', BarChart3, 'Choose KPIs and resolution', 'Select the performance indicators and temporal resolution (e.g. daily, monthly) for the analysis.', ['KPI list (PR, yield, etc.)', 'Time resolution', 'Aggregation method'], 'KPI selection preview'),
  step('Step 2', 'KPI analysis', Settings2, 'Set parameters and filters', 'Configure analysis parameters, date range, and any data filters that apply to the KPI calculation.', ['Parameter panel', 'Date and asset scope', 'Reference conditions'], 'Parameter config preview'),
  step('Step 3', 'KPI analysis', PlayCircle, 'Run analysis', 'Execute the KPI calculation. The tool processes the selected data and computes the chosen indicators.', ['Run button', 'Progress indicator', 'Result readiness'], 'Analysis run preview'),
  step('Step 4', 'KPI analysis', LineChart, 'Review results and export', 'Interpret the KPI results in tables and charts, then export for reporting or further use.', ['KPI tables and charts', 'Trends and comparisons', 'Export options'], 'KPI results preview'),
];

// Gap Filling
const GAP_FILLING_STEPS: TimelineStep[] = [
  step('Step 1', 'Gap filling', Database, 'Identify gaps', 'Review the time series to locate missing or invalid intervals that need to be filled for continuous analysis.', ['Gap detection report', 'Gap length and frequency', 'Affected variables'], 'Gap overview preview'),
  step('Step 2', 'Gap filling', Settings2, 'Select filling method', 'Choose the gap-filling method (e.g. interpolation, model-based) and configure its parameters.', ['Method selection', 'Interpolation options', 'Max gap length'], 'Method config preview'),
  step('Step 3', 'Gap filling', PlayCircle, 'Apply gap filling', 'Run the gap-filling process. The tool fills the identified gaps using the selected method.', ['Execute filling', 'Progress and logs', 'Validation checks'], 'Gap filling run preview'),
  step('Step 4', 'Gap filling', FileOutput, 'Validate and export', 'Check the filled series and export the completed dataset for use in downstream tools.', ['Filled series preview', 'Quality metrics', 'Export filled data'], 'Filled data preview'),
];

// Power Prediction
const POWER_PREDICTION_STEPS: TimelineStep[] = [
  step('Step 1', 'Power prediction', Database, 'Prepare input data', 'Ensure irradiance, temperature, and plant metadata are available and aligned for the prediction model.', ['Input variables', 'Time alignment', 'Metadata and capacity'], 'Input data preview'),
  step('Step 2', 'Power prediction', Settings2, 'Configure model', 'Select the prediction model and set parameters such as horizon, resolution, and optional physical constraints.', ['Model type', 'Forecast horizon', 'Resolution and bounds'], 'Model config preview'),
  step('Step 3', 'Power prediction', PlayCircle, 'Generate forecast', 'Run the power prediction. The tool produces a forecast of expected power output over the chosen horizon.', ['Run forecast', 'Progress and status', 'Output availability'], 'Forecast run preview'),
  step('Step 4', 'Power prediction', LineChart, 'Analyze and export', 'Review the forecast in charts and tables, compare with actuals if available, and export for operations or planning.', ['Forecast charts', 'Actual vs predicted', 'Export forecast'], 'Forecast results preview'),
];

// LCOE Tool
const LCOE_TOOL_STEPS: TimelineStep[] = [
  step('Step 1', 'LCOE tool', Database, 'Enter project and cost inputs', 'Provide project parameters, CAPEX, OPEX, and financial assumptions required for the LCOE calculation.', ['Project parameters', 'Cost breakdown', 'Financial assumptions'], 'LCOE inputs preview'),
  step('Step 2', 'LCOE tool', Calculator, 'Set calculation options', 'Choose discount rate, lifetime, and any optional adjustments (e.g. degradation, incentives).', ['Discount rate', 'Lifetime and degradation', 'Incentives and taxes'], 'LCOE options preview'),
  step('Step 3', 'LCOE tool', PlayCircle, 'Calculate LCOE', 'Run the LCOE calculation. The tool computes levelized cost and related metrics from your inputs.', ['Calculate button', 'Results computation', 'Sensitivity options'], 'LCOE calculation preview'),
  step('Step 4', 'LCOE tool', FileOutput, 'Review and export', 'Inspect the LCOE results and export reports or tables for business planning and reporting.', ['LCOE results', 'Sensitivity and scenarios', 'Export report'], 'LCOE results preview'),
];

// Workflow
const WORKFLOW_STEPS: TimelineStep[] = [
  step('Step 1', 'Workflow', GitBranch, 'Choose the workflow', 'Select a predefined or custom workflow that defines the sequence of steps for your analysis.', ['Workflow templates', 'Custom workflow builder', 'Step order'], 'Workflow selection preview'),
  step('Step 2', 'Workflow', Settings2, 'Configure steps', 'Configure each step in the workflow: data sources, filters, KPIs, gap filling, or other modules as needed.', ['Step configuration', 'Data and parameters', 'Dependencies'], 'Workflow config preview'),
  step('Step 3', 'Workflow', PlayCircle, 'Run workflow', 'Execute the full workflow. The tool runs each step in order and passes outputs to the next.', ['Run workflow', 'Step progress', 'Intermediate results'], 'Workflow run preview'),
  step('Step 4', 'Workflow', LineChart, 'Review outputs', 'Review the final and intermediate outputs from the workflow and export or share as needed.', ['Output dashboard', 'Charts and tables', 'Export and share'], 'Workflow outputs preview'),
  step('Step 5', 'Workflow', RefreshCw, 'Refine and rerun', 'Adjust any step configuration and rerun the workflow until the results meet your requirements.', ['Edit and rerun', 'Version or save', 'Scheduling'], 'Workflow refinement preview'),
];

export const DOC_MODULE_CONTENT: Record<DocModuleId, DocModuleContent> = {
  'data-ingestion': {
    title: 'Data Ingestion & Synchronization',
    description:
      'Connect and synchronize data from your PV monitoring systems, SCADA, or weather APIs. Configure connectors, map schemas, and run initial and ongoing syncs so your data is always up to date for analysis.',
  },
  'data-filtering': {
    title: 'Data Filtering',
    description:
      'Filter your dataset by date range, site, and quality criteria. Apply IEC or custom quality filters and review the filtered dataset before running analyses to ensure reliable results.',
  },
  'kpi-analysis': {
    title: 'KPI Analysis',
    description:
      'Select performance indicators and temporal resolution, set parameters and filters, then run the analysis. Review KPI results in tables and charts and export for reporting.',
  },
  'gap-filling': {
    title: 'Gap Filling',
    description:
      'Identify gaps in your time series, choose a filling method, and run the process. Validate the filled data and export it for use in downstream tools and analyses.',
  },
  'power-prediction': {
    title: 'Power Prediction',
    description:
      'Prepare input data and configure the prediction model. Generate power forecasts, then analyze and compare with actuals and export for operations or planning.',
  },
  'lcoe-tool': {
    title: 'LCOE Tool',
    description:
      'Enter project and cost inputs, set calculation options such as discount rate and lifetime, then run the LCOE calculation. Review results and export reports for business planning.',
  },
  workflow: {
    title: 'Workflow',
    description:
      'Choose a workflow template or build a custom sequence of steps. Configure each step, run the workflow, and review outputs. Refine and rerun as needed and optionally schedule or save versions.',
  },
};

export const DOCS_STEPS_BY_MODULE: Record<DocModuleId, TimelineStep[]> = {
  'data-ingestion': DATA_INGESTION_STEPS,
  'data-filtering': DATA_FILTERING_STEPS,
  'kpi-analysis': KPI_ANALYSIS_STEPS,
  'gap-filling': GAP_FILLING_STEPS,
  'power-prediction': POWER_PREDICTION_STEPS,
  'lcoe-tool': LCOE_TOOL_STEPS,
  workflow: WORKFLOW_STEPS,
};
