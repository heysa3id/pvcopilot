import {
  canvasLogicalToRotatedRowMeters,
  dropShortSlotRuns,
  minRowUsableWidthM,
  pointInAnyExclusion,
  pointInPolygon,
  polygonXRangeAtY,
  rotateFieldRingToRowSpace,
  rowSpaceToFieldMeters,
  trimRowModuleCountForMinSegmentWidthM,
  walkRowSlotCenters,
} from "./layout-exclusions.js";
import {
  areaBlockSlotsRowM,
  blockAnyRingRowM,
  blockFootprintM,
  equipmentFootprintM,
  equipmentRingRowM,
  EQUIPMENT_TYPES,
  footprintRingRowM,
  isPlacementValid,
  snapBlockOriginRowM,
  validateBlockSpec,
} from "./layout-blocks.js";

function formatCompactValue(value, unit) {
  if (!Number.isFinite(value)) {
    return `0 ${unit}`;
  }

  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k ${unit}`;
  }

  return `${Math.round(value).toLocaleString()} ${unit}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatKwh(value) {
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)} GWh`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)} MWh`;
  return `${Math.round(value).toLocaleString()} kWh`;
}

export function renderLossDiagram(container, losses) {
  if (!container) return;
  if (!losses || !losses.nominalEnergy) {
    container.innerHTML = `<p class="muted">Run a simulation to generate the loss diagram.</p>`;
    return;
  }

  const steps = [
    { label: "Array nominal energy (STC)", value: losses.nominalEnergy, type: "level" },
    { label: "Soiling loss", value: -losses.soiling, type: "loss" },
    { label: "IAM factor on global", value: -losses.iam, type: "loss" },
    { label: "PV loss due to temperature", value: -losses.temperature, type: "loss" },
    { label: "Module quality loss", value: -losses.quality, type: "loss" },
    { label: "Module mismatch loss", value: -losses.mismatch, type: "loss" },
    { label: "DC wiring loss", value: -losses.dcWiring, type: "loss" },
    { label: "Array virtual energy at MPP", value: losses.nominalEnergy - losses.soiling - losses.iam - losses.temperature - losses.quality - losses.mismatch - losses.dcWiring, type: "level" },
    { label: "Inverter loss (efficiency)", value: -losses.inverter, type: "loss" },
    { label: "Inverter clipping loss", value: -losses.clipping, type: "loss" },
    { label: "AC wiring loss", value: -losses.acWiring, type: "loss" },
    { label: "Availability loss", value: -losses.availability, type: "loss" },
    { label: "Net energy output", value: losses.netEnergy, type: "level" },
  ];

  const rows = steps.map((step) => {
    if (step.type === "level") {
      return `
        <div class="loss-step loss-level">
          <div class="loss-bar-wrap">
            <div class="loss-bar level-bar" style="width:${clamp((step.value / losses.nominalEnergy) * 100, 5, 100).toFixed(1)}%"></div>
          </div>
          <div class="loss-label">
            <strong>${formatKwh(step.value)}</strong>
            <span>${escapeHtml(step.label)}</span>
          </div>
        </div>`;
    }

    const pct = losses.nominalEnergy > 0 ? (step.value / losses.nominalEnergy) * 100 : 0;
    const absPct = Math.abs(pct);
    return `
      <div class="loss-step loss-deduction">
        <div class="loss-arrow">${step.value <= 0 ? "↘" : "↗"}</div>
        <div class="loss-label">
          <strong>${pct.toFixed(2)}%</strong>
          <span>${escapeHtml(step.label)}</span>
        </div>
      </div>`;
  }).join("");

  container.innerHTML = `<div class="loss-diagram">${rows}</div>`;
}

export function renderMonthlyTable(container, simulation, layout) {
  if (!container) return;
  if (!simulation) {
    container.innerHTML = `<p class="muted">Run a simulation to see monthly results.</p>`;
    return;
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let totalEnergy = 0;
  let totalPoa = 0;

  const rows = simulation.monthlyEnergyKwh.map((energy, i) => {
    const poa = simulation.monthlyPoaKwhm2?.[i] || 0;
    const pr = poa > 0 && layout.dcCapacityKw > 0
      ? ((energy / layout.dcCapacityKw) / poa) * 100
      : 0;
    totalEnergy += energy;
    totalPoa += poa;
    return `<tr>
      <td>${months[i]}</td>
      <td>${poa.toFixed(1)}</td>
      <td>${(energy / 1000).toFixed(1)}</td>
      <td>${pr.toFixed(1)}</td>
    </tr>`;
  }).join("");

  const totalPr = totalPoa > 0 && layout.dcCapacityKw > 0
    ? ((totalEnergy / layout.dcCapacityKw) / totalPoa) * 100
    : 0;

  container.innerHTML = `
    <table class="results-table">
      <thead>
        <tr>
          <th>Month</th>
          <th>POA (kWh/m²)</th>
          <th>Energy (MWh)</th>
          <th>PR (%)</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr>
          <td><strong>Year</strong></td>
          <td><strong>${totalPoa.toFixed(1)}</strong></td>
          <td><strong>${(totalEnergy / 1000).toFixed(1)}</strong></td>
          <td><strong>${totalPr.toFixed(1)}</strong></td>
        </tr>
      </tfoot>
    </table>
  `;
}

// ---------- ApexCharts helpers ----------

const apexInstances = new WeakMap();

function destroyApex(container) {
  const prev = apexInstances.get(container);
  if (prev) {
    try { prev.destroy(); } catch (_) { /* ignore */ }
    apexInstances.delete(container);
  }
}

function mountApex(container, options) {
  destroyApex(container);
  container.innerHTML = "";
  const chart = new ApexCharts(container, options);
  chart.render();
  apexInstances.set(container, chart);
}

const APEX_FONT = "Inter, system-ui, sans-serif";
const APEX_COLORS = {
  navy: "#1e3a5f",
  amber: "#f5a400",
  red: "#ef4444",
  green: "#10b981",
  slate: "#334155",
  muted: "#94a3b8",
};

// ---------- Exported chart functions ----------

export function renderNormalizedProductionChart(container, simulation, layout) {
  if (!container) return;
  if (!simulation || !layout || layout.dcCapacityKw <= 0) {
    destroyApex(container);
    container.innerHTML = `<p class="muted">Run a simulation to see normalized production.</p>`;
    return;
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dcKw = layout.dcCapacityKw;
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const useful = [], collLoss = [], sysLoss = [];
  simulation.monthlyEnergyKwh.forEach((energy, i) => {
    const poa = simulation.monthlyPoaKwhm2?.[i] || 0;
    const days = daysInMonth[i];
    const u = dcKw > 0 ? (energy / dcKw) / days : 0;
    const refYield = poa / days;
    const pr = poa > 0 && dcKw > 0 ? (energy / dcKw) / poa : 0;
    const cl = refYield > 0 ? refYield * (1 - pr) * 0.6 : 0;
    const sl = refYield > 0 ? refYield * (1 - pr) * 0.4 : 0;
    useful.push(+u.toFixed(3));
    collLoss.push(+cl.toFixed(3));
    sysLoss.push(+sl.toFixed(3));
  });

  mountApex(container, {
    chart: { type: "bar", stacked: true, height: 300, fontFamily: APEX_FONT,
      toolbar: { show: false }, animations: { enabled: true, speed: 400 } },
    series: [
      { name: "Useful energy", data: useful },
      { name: "Collection loss", data: collLoss },
      { name: "System loss", data: sysLoss },
    ],
    colors: [APEX_COLORS.navy, APEX_COLORS.amber, APEX_COLORS.red],
    plotOptions: { bar: { columnWidth: "60%", borderRadius: 3 } },
    xaxis: { categories: months, labels: { style: { fontSize: "11px", colors: APEX_COLORS.muted } } },
    yaxis: { title: { text: "kWh/kWp/day", style: { fontSize: "11px", color: APEX_COLORS.muted } },
      labels: { formatter: v => v.toFixed(1), style: { fontSize: "11px" } } },
    legend: { position: "top", horizontalAlign: "left", fontSize: "12px",
      markers: { size: 6, shape: "square", radius: 2 } },
    tooltip: { y: { formatter: v => v.toFixed(2) + " kWh/kWp/day" } },
    grid: { borderColor: "#e2e8f0", strokeDashArray: 3 },
    dataLabels: { enabled: false },
  });
}

export function renderMonthlyPrChart(container, simulation, layout) {
  if (!container) return;
  if (!simulation || !layout || layout.dcCapacityKw <= 0) {
    destroyApex(container);
    container.innerHTML = `<p class="muted">Run a simulation to see monthly PR.</p>`;
    return;
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const prValues = simulation.monthlyEnergyKwh.map((energy, i) => {
    const poa = simulation.monthlyPoaKwhm2?.[i] || 0;
    if (poa <= 0 || layout.dcCapacityKw <= 0) return null;
    return +((energy / layout.dcCapacityKw) / poa * 100).toFixed(1);
  });

  const activeVals = prValues.filter(v => v !== null);
  const minPr = activeVals.length ? Math.max(Math.min(...activeVals) - 3, 0) : 0;
  const maxPr = activeVals.length ? Math.min(Math.max(...activeVals) + 3, 100) : 100;

  mountApex(container, {
    chart: { type: "line", height: 280, fontFamily: APEX_FONT,
      toolbar: { show: false }, animations: { enabled: true, speed: 400 } },
    series: [{ name: "PR", data: prValues }],
    colors: [APEX_COLORS.green],
    stroke: { width: 3, curve: "smooth" },
    markers: { size: 5, strokeWidth: 0, hover: { size: 7 } },
    xaxis: { categories: months, labels: { style: { fontSize: "11px", colors: APEX_COLORS.muted } } },
    yaxis: { min: Math.floor(minPr), max: Math.ceil(maxPr),
      title: { text: "PR (%)", style: { fontSize: "11px", color: APEX_COLORS.muted } },
      labels: { formatter: v => v.toFixed(1) + "%", style: { fontSize: "11px" } } },
    tooltip: { y: { formatter: v => (v !== null ? v.toFixed(1) + "%" : "—") } },
    dataLabels: { enabled: true, formatter: v => (v !== null ? v.toFixed(1) : ""),
      style: { fontSize: "10px", fontWeight: 600, colors: [APEX_COLORS.green] },
      background: { enabled: true, borderRadius: 3, borderWidth: 0, foreColor: APEX_COLORS.green,
        dropShadow: { enabled: false } } },
    grid: { borderColor: "#e2e8f0", strokeDashArray: 3 },
  });
}

export function renderBarChart(container, data, options = {}) {
  if (!container) return;
  if (!data?.length) {
    destroyApex(container);
    container.innerHTML = `<p class="muted">No chart data yet.</p>`;
    return;
  }

  const warm = Boolean(options.warm);
  const unit = options.unit || "";
  const labels = data.map(d => d.label);
  const values = data.map(d => +(d.value || 0).toFixed(1));

  mountApex(container, {
    chart: { type: "bar", height: 280, fontFamily: APEX_FONT,
      toolbar: { show: false }, animations: { enabled: true, speed: 400 } },
    series: [{ name: unit || "Value", data: values }],
    colors: [warm ? APEX_COLORS.amber : APEX_COLORS.navy],
    plotOptions: { bar: { columnWidth: data.length > 13 ? "85%" : "55%", borderRadius: 3,
      distributed: false } },
    xaxis: { categories: labels,
      labels: { rotate: data.length > 13 ? -45 : 0, rotateAlways: data.length > 13,
        style: { fontSize: data.length > 13 ? "9px" : "11px", colors: APEX_COLORS.muted } } },
    yaxis: { labels: { formatter: v => v >= 1000 ? (v/1000).toFixed(1)+"k" : v.toFixed(0),
      style: { fontSize: "11px" } } },
    tooltip: { y: { formatter: v => v.toFixed(1) + " " + unit } },
    dataLabels: { enabled: data.length <= 12,
      formatter: v => v >= 1000 ? (v/1000).toFixed(1)+"k" : Math.round(v),
      style: { fontSize: "10px", fontWeight: 600 },
      offsetY: -4 },
    grid: { borderColor: "#e2e8f0", strokeDashArray: 3 },
    legend: { show: false },
  });
}

export function renderLineChart(container, config) {
  if (!container) return;

  const labels = config?.labels || [];
  const series = config?.series || [];

  if (!labels.length || !series.length || !series.some(s => s.values?.length)) {
    destroyApex(container);
    container.innerHTML = `<p class="muted">No chart data yet.</p>`;
    return;
  }

  const apexSeries = series.map(s => ({
    name: s.label,
    data: s.values.map(v => +(v || 0).toFixed(1)),
  }));
  const colors = series.map(s => s.color);

  mountApex(container, {
    chart: { type: "line", height: 280, fontFamily: APEX_FONT,
      toolbar: { show: false }, animations: { enabled: true, speed: 400 } },
    series: apexSeries,
    colors,
    stroke: { width: 2.5, curve: "smooth" },
    markers: { size: 4, strokeWidth: 0, hover: { size: 6 } },
    xaxis: { categories: labels, labels: { style: { fontSize: "11px", colors: APEX_COLORS.muted } } },
    yaxis: { labels: { formatter: v => v >= 100 ? Math.round(v) : v.toFixed(1),
      style: { fontSize: "11px" } } },
    tooltip: { shared: true, intersect: false },
    legend: { position: "top", horizontalAlign: "left", fontSize: "12px",
      markers: { size: 6, shape: "circle" } },
    grid: { borderColor: "#e2e8f0", strokeDashArray: 3 },
    dataLabels: { enabled: false },
  });
}

export function renderGroupedBarChart(container, config) {
  if (!container) return;
  const labels = config?.labels || [];
  const series = config?.series || [];
  if (!labels.length || !series.length || !series.some(s => s.values?.length)) {
    destroyApex(container);
    container.innerHTML = `<p class="muted">No chart data yet.</p>`;
    return;
  }
  const apexSeries = series.map(s => ({
    name: s.label,
    data: s.values.map(v => +(v || 0).toFixed(1)),
  }));
  const colors = series.map(s => s.color);
  mountApex(container, {
    chart: { type: "bar", height: 280, fontFamily: APEX_FONT,
      toolbar: { show: false }, animations: { enabled: true, speed: 400 } },
    series: apexSeries,
    colors,
    plotOptions: { bar: { columnWidth: "65%", borderRadius: 2 } },
    xaxis: { categories: labels, labels: { style: { fontSize: "11px", colors: APEX_COLORS.muted } } },
    yaxis: { labels: { formatter: v => v >= 100 ? Math.round(v) : v.toFixed(1),
      style: { fontSize: "11px" } } },
    tooltip: { shared: true, intersect: false,
      y: { formatter: v => v.toFixed(1) + " kWh/m²" } },
    legend: { position: "top", horizontalAlign: "left", fontSize: "12px",
      markers: { size: 6, shape: "circle" } },
    grid: { borderColor: "#e2e8f0", strokeDashArray: 3 },
    dataLabels: { enabled: false },
  });
}

export function renderDualAxisChart(container, config) {
  if (!container) return;
  const labels = config?.labels || [];
  const left = config?.left;
  const right = config?.right;
  if (!labels.length || !left || !right) {
    destroyApex(container);
    container.innerHTML = `<p class="muted">No chart data yet.</p>`;
    return;
  }
  mountApex(container, {
    chart: { type: "line", height: 280, fontFamily: APEX_FONT,
      toolbar: { show: false }, animations: { enabled: true, speed: 400 } },
    series: [
      { name: left.label, data: left.values.map(v => +(v || 0).toFixed(1)) },
      { name: right.label, data: right.values.map(v => +(v || 0).toFixed(1)) },
    ],
    colors: [left.color, right.color],
    stroke: { width: 2.5, curve: "smooth" },
    markers: { size: 4, strokeWidth: 0, hover: { size: 6 } },
    xaxis: { categories: labels, labels: { style: { fontSize: "11px", colors: APEX_COLORS.muted } } },
    yaxis: [
      { title: { text: left.unit || "", style: { fontSize: "11px" } },
        labels: { formatter: v => v.toFixed(1), style: { fontSize: "11px" } } },
      { opposite: true, title: { text: right.unit || "", style: { fontSize: "11px" } },
        labels: { formatter: v => v.toFixed(0), style: { fontSize: "11px" } } },
    ],
    tooltip: { shared: true, intersect: false },
    legend: { position: "top", horizontalAlign: "left", fontSize: "12px",
      markers: { size: 6, shape: "circle" } },
    grid: { borderColor: "#e2e8f0", strokeDashArray: 3 },
    dataLabels: { enabled: false },
  });
}

function buildLayoutModalHtml(blockModal, layoutCtx, modulePowerWp, modulesPerStringDefault) {
  if (!blockModal) return "";

  if (blockModal.kind === "block") {
    const draft = blockModal.draft || {};
    const name = draft.name || "Block 1";
    const mps = Math.max(1, Math.floor(Number(draft.modulesPerString) || modulesPerStringDefault || 20));
    const strings = Math.max(1, Math.floor(Number(draft.strings) || 1));
    const validation = layoutCtx
      ? validateBlockSpec({ modulesPerString: mps, strings }, layoutCtx)
      : { valid: false, reasons: ["Layout not ready"], footprint: { widthM: 0, depthM: 0 }, moduleCount: 0, maxFit: {} };
    const { footprint, moduleCount, maxFit, reasons, valid } = validation;
    const dcKw = (moduleCount * modulePowerWp) / 1000;
    const limitsHtml = layoutCtx
      ? `<p class="layout-modal-limits muted">Limits: max ${maxFit.maxModulesPerString || "—"} modules/string, max ${maxFit.maxStrings || "—"} strings, ${maxFit.remainingModuleBudget ?? "—"} modules remaining.</p>`
      : "";
    const errorHtml = reasons.length
      ? `<p class="layout-modal-error">${reasons.map(escapeHtml).join(" · ")}</p>`
      : "";
    return `
      <div class="layout-modal-backdrop" data-layout-action="closeModal">
        <div class="layout-modal" role="dialog" aria-label="Create block" onclick="event.stopPropagation()">
          <h3 class="layout-modal-title">Create block</h3>
          <label class="layout-modal-field">Name<input type="text" data-modal-field="name" value="${escapeHtml(name)}" /></label>
          <label class="layout-modal-field">Modules per string<input type="number" min="1" data-modal-field="modulesPerString" value="${mps}" /></label>
          <label class="layout-modal-field">Number of strings<input type="number" min="1" data-modal-field="strings" value="${strings}" /></label>
          <div class="layout-modal-readout">
            <span>Footprint: ${footprint.widthM.toFixed(2)} × ${footprint.depthM.toFixed(2)} m</span>
            <span>${moduleCount} modules · ${dcKw.toFixed(1)} kWp DC</span>
          </div>
          ${limitsHtml}
          ${errorHtml}
          <div class="layout-modal-actions">
            <button type="button" class="layout-adv-btn" data-layout-action="closeModal">Cancel</button>
            <button type="button" class="layout-adv-btn layout-adv-btn--primary" data-layout-action="confirmBlock" ${valid ? "" : "disabled"}>Create and place</button>
          </div>
        </div>
      </div>`;
  }

  if (blockModal.kind === "equipment") {
    const draft = blockModal.draft || {};
    const type = draft.type || "combiner";
    const typeDef = EQUIPMENT_TYPES[type] || EQUIPMENT_TYPES.combiner;
    const widthM = Number(draft.widthM) || typeDef.widthM;
    const depthM = Number(draft.depthM) || typeDef.depthM;
    const label = draft.label || typeDef.label;
    const typeOptions = Object.entries(EQUIPMENT_TYPES)
      .map(
        ([key, def]) =>
          `<option value="${key}" ${key === type ? "selected" : ""}>${escapeHtml(def.label)}</option>`
      )
      .join("");
    return `
      <div class="layout-modal-backdrop" data-layout-action="closeModal">
        <div class="layout-modal" role="dialog" aria-label="Add equipment" onclick="event.stopPropagation()">
          <h3 class="layout-modal-title">Add equipment</h3>
          <label class="layout-modal-field">Type<select data-modal-field="type">${typeOptions}</select></label>
          <label class="layout-modal-field">Label<input type="text" data-modal-field="label" value="${escapeHtml(label)}" /></label>
          <label class="layout-modal-field">Width (m)<input type="number" min="0.5" step="0.1" data-modal-field="widthM" value="${widthM}" /></label>
          <label class="layout-modal-field">Depth (m)<input type="number" min="0.5" step="0.1" data-modal-field="depthM" value="${depthM}" /></label>
          <div class="layout-modal-readout">
            <span>Footprint: ${widthM.toFixed(1)} × ${depthM.toFixed(1)} m — removes modules underneath</span>
          </div>
          <div class="layout-modal-actions">
            <button type="button" class="layout-adv-btn" data-layout-action="closeModal">Cancel</button>
            <button type="button" class="layout-adv-btn layout-adv-btn--primary" data-layout-action="confirmEquipment">Create and place</button>
          </div>
        </div>
      </div>`;
  }

  return "";
}

export function renderPseudo3dLayout(container, layout, config, preview = {}, layoutUi = {}) {
  if (!container) {
    return;
  }

  if (!layout || layout.moduleCount <= 0) {
    container.innerHTML = `<p class="muted">Define the field geometry to preview the layout.</p>`;
    return;
  }

  const li = layoutUi || {};
  const advancedMode = Boolean(li.advancedMode);
  const drawObstacleMode = Boolean(li.drawObstacleMode);
  const obstacleDrawKind = li.obstacleDrawKind === "rectangle" ? "rectangle" : "polygon";
  const rectFirstCornerM = Array.isArray(li.rectFirstCornerM) && li.rectFirstCornerM.length >= 2
    ? li.rectFirstCornerM
    : null;
  const hasRectCorner = rectFirstCornerM != null;
  const exclusionPolygonsM = li.exclusionPolygonsM || [];
  const draftRingM = li.draftRingM || [];
  const selectedExclusionIndex = Number.isFinite(li.selectedExclusionIndex)
    ? li.selectedExclusionIndex
    : -1;
  const exclusionRowsHtml = exclusionPolygonsM
    .map(
      (_, i) =>
        `<div class="layout-excl-row${i === selectedExclusionIndex ? " layout-excl-row--selected" : ""}"><span>Exclusion ${i + 1}${i === selectedExclusionIndex ? " — selected" : ""}</span><button type="button" class="layout-adv-btn layout-adv-btn--icon" data-layout-action="deleteExclusion" data-exclusion-index="${i}" title="Remove">×</button></div>`
    )
    .join("");

  const blocks = li.blocks || [];
  const equipment = li.equipment || [];
  const placing = li.placing || null;
  const blockModal = li.blockModal || null;
  const layoutCtx = li.layoutCtx || null;
  const modulePowerWp = Number(li.modulePowerWp) || 0;
  const drawTarget = li.drawTarget === "block" ? "block" : "exclusion";
  const drawingBlock = drawObstacleMode && drawTarget === "block";
  const drawingExclusion = drawObstacleMode && drawTarget === "exclusion";
  const panelSections = li.panelSections || { exclusions: true, design: true };
  const sectionExclusionsOpen = panelSections.exclusions !== false;
  const sectionDesignOpen = panelSections.design !== false;
  const usedBlockModules = blocks.reduce((s, b) => s + (b.moduleCount || 0), 0);
  const remainingBudget = Math.max(
    0,
    (layout.autoModuleCount || layout.moduleCount || 0) - usedBlockModules
  );

  const blockRowsHtml = blocks
    .map(
      (b, i) =>
        `<div class="layout-excl-row layout-design-row"><span class="layout-design-dot${b.kind === "area" ? "" : " layout-design-dot--block"}"${b.kind === "area" ? ' style="background:#16a34a"' : ""}></span><span>${escapeHtml(b.name)} — ${b.moduleCount} mod${b.truncated ? " (capped)" : ""}</span><button type="button" class="layout-adv-btn layout-adv-btn--icon" data-layout-action="deleteBlock" data-block-index="${i}" title="Remove">×</button></div>`
    )
    .join("");
  const equipmentRowsHtml = equipment
    .map((eq, i) => {
      const typeDef = EQUIPMENT_TYPES[eq.type] || EQUIPMENT_TYPES.combiner;
      return `<div class="layout-excl-row layout-design-row"><span class="layout-design-dot" style="background:${typeDef.color}"></span><span>${escapeHtml(eq.label || typeDef.label)}</span><button type="button" class="layout-adv-btn layout-adv-btn--icon" data-layout-action="deleteEquipment" data-equipment-index="${i}" title="Remove">×</button></div>`;
    })
    .join("");

  const designHint = drawingBlock
    ? `Auto block: draw the area to fill with modules (${remainingBudget.toLocaleString()} modules remaining). ${obstacleDrawKind === "polygon" ? "Add corners, then <strong>Finish</strong> or click the <strong>first point</strong>." : "Click one corner, then the opposite corner."}`
    : placing
      ? `Click on the field to place <strong>${placing.kind === "block" ? escapeHtml(placing.spec?.name || "block") : escapeHtml(placing.spec?.label || "equipment")}</strong>. Red outline = invalid position.`
      : "Use <strong>Add block</strong>, <strong>Auto block</strong> (draw-to-fill), or <strong>Add equipment</strong>. Blocks replace auto rows.";

  const modalHtml = buildLayoutModalHtml(blockModal, layoutCtx, modulePowerWp, li.modulesPerStringDefault || 20);

  const grossWidthM = Math.max(Number(config.manualWidthM) || layout.netWidthM || 1, 1);
  const grossDepthM = Math.max(Number(config.manualHeightM) || layout.netDepthM || 1, 1);
  const sw = Math.max(Number(config.edgeSetbackM) || 0, 0);
  const sd = Math.max(Number(config.edgeSetbackDepthM) || 0, 0);
  const netWidthM = layout.netWidthM || grossWidthM;
  const netDepthM = layout.netDepthM || grossDepthM;
  const polyVerts = layout.polygonVerticesM || null;
  const rotatedPolyVerts = layout.rotatedPolygonVerticesM || null;
  const rotatedBoundsM = layout.rotatedBoundsM || null;
  const azRotRad = ((Number(config.azimuthDeg) || 180) - 180) * Math.PI / 180;
  const modulesPerRow = Math.max(layout.modulesPerRow || 1, 1);
  const visibleModuleCount = Math.min(layout.moduleCount, layout.autoModuleCount || layout.moduleCount);
  const activeRows = Math.max(Math.ceil(visibleModuleCount / modulesPerRow), 1);
  const overflowModules = Math.max(layout.moduleCount - (layout.autoModuleCount || layout.moduleCount), 0);
  const rowPitchM = layout.rowPitchM || 1;
  const collectorProjectionM = layout.winterSpacing?.collectorProjectionM || rowPitchM * 0.5;
  const moduleSpanInRowM = layout.moduleSpanInRowM || 1;
  const moduleGapM = Number(config.moduleGapM) || 0.03;
  const maxRowWidthM = Number(config.maxRowWidthM) || 0;
  const minRowWidthM = Number(config.minRowWidthM) || 0;
  const rowWidthGapM = Number(config.rowWidthGapM) || 0;
  const baseLabel = preview.imageUrl ? "Map crop loaded" : "Generated ground plane";

  // Pre-compute polygon-aware totals for chips
  // Use rotated polygon for accurate chip counts (consistent with refreshLayout)
  let polyActiveRows = 0;
  if (rotatedPolyVerts && rotatedBoundsM) {
    const innerMinY = rotatedBoundsM.minY + sd;
    const innerMaxY = rotatedBoundsM.maxY - sd;
    const maxR =
      innerMaxY <= innerMinY
        ? 0
        : Math.max(
            Math.floor(
              (innerMaxY - innerMinY + (Number(config.rowSpacingM) || 0)) / Math.max(rowPitchM, 0.001)
            ),
            0
          );
    const mStep = Math.max(moduleSpanInRowM + moduleGapM, 0.001);
    const mPerSeg = maxRowWidthM > 0
      ? Math.max(Math.floor((maxRowWidthM + moduleGapM) / mStep), 1)
      : 0;
    for (let i = 0; i < maxR; i++) {
      const yM = innerMinY + i * rowPitchM;
      const bandAvail = minRowUsableWidthM(rotatedPolyVerts, yM, collectorProjectionM, sw);
      if (bandAvail <= 0) continue;
      if (minRowWidthM > 0 && bandAvail < minRowWidthM) continue;
      let rm;
      if (mPerSeg > 0) {
        const segW = mPerSeg * mStep - moduleGapM;
        const segStep = segW + moduleGapM + rowWidthGapM;
        const nFullSegs = bandAvail >= segW
          ? 1 + Math.max(Math.floor((bandAvail - segW) / segStep), 0)
          : 0;
        const usedW = nFullSegs > 0 ? segW + (nFullSegs - 1) * segStep : 0;
        const remW = bandAvail - usedW;
        const tailMods = nFullSegs > 0 && remW >= rowWidthGapM + moduleSpanInRowM
          ? Math.min(Math.floor((remW - rowWidthGapM + moduleGapM) / mStep), mPerSeg)
          : 0;
        rm = trimRowModuleCountForMinSegmentWidthM(
          nFullSegs * mPerSeg + tailMods,
          mPerSeg,
          mStep,
          moduleGapM,
          minRowWidthM
        );
      } else {
        rm = trimRowModuleCountForMinSegmentWidthM(
          Math.floor((bandAvail + moduleGapM) / mStep),
          0,
          mStep,
          moduleGapM,
          minRowWidthM
        );
      }
      if (rm > 0) polyActiveRows++;
    }
  }

  const displayRows = (rotatedPolyVerts && rotatedBoundsM) ? polyActiveRows : activeRows;
  const displayModules = layout.moduleCount;

  const totalStrings = blocks.reduce((s, b) => s + (b.strings || 0), 0);
  const stageChips = blocks.length > 0
    ? [
        baseLabel,
        `${blocks.length} block${blocks.length === 1 ? "" : "s"}`,
        ...(totalStrings > 0 ? [`${totalStrings} string${totalStrings === 1 ? "" : "s"}`] : []),
        `${displayModules.toLocaleString()} modules`,
      ]
    : [
        baseLabel,
        `${displayRows.toLocaleString()} active rows`,
        polyVerts ? `Variable modules/row` : `${modulesPerRow.toLocaleString()} modules/row`,
        `${displayModules.toLocaleString()} modules`,
      ];
  if (overflowModules > 0 && !polyVerts) {
    stageChips.push(`Overflow ${overflowModules.toLocaleString()} modules`);
  }
  const stageChipMarkup = stageChips
    .map((chip) => `<span class="layout-stage-chip">${escapeHtml(chip)}</span>`)
    .join("");

  const note = preview.imageUrl
    ? "Background uses a cropped screenshot of the selected map rectangle. The overlay rows follow the current layout inputs."
    : preview.error
      ? `${escapeHtml(preview.error)} The array geometry still updates from the current sizing inputs.`
      : "Draw a rectangle in the Site tab to use the selected map area as the layout background.";

  container.innerHTML = `
    <div class="layout-scene">
      <div class="layout-scene-stage" style="position:relative;">
        <canvas></canvas>
        <div class="layout-stage-badges">${stageChipMarkup}</div>
        <div class="layout-zoom-controls">
          <button type="button" class="layout-zoom-btn" data-zoom="in" title="Zoom in">+</button>
          <button type="button" class="layout-zoom-btn" data-zoom="out" title="Zoom out">&minus;</button>
          <button type="button" class="layout-zoom-btn" data-zoom="reset" title="Reset view (double-click)">&#8634;</button>
        </div>
        <div class="layout-advanced-toolbar">
          ${advancedMode ? `
          <div class="layout-adv-panel">
            <div class="layout-adv-panel-header">
              <span class="layout-adv-panel-title">Advanced design</span>
              <button type="button" class="layout-adv-panel-close" data-layout-action="toggleAdvanced" title="Exit advanced">&times;</button>
            </div>
            <div class="layout-adv-section">
              <button type="button" class="layout-adv-section-head" data-layout-action="toggleSection" data-section="exclusions">
                <span class="layout-adv-chevron${sectionExclusionsOpen ? " is-open" : ""}">&rsaquo;</span>
                Exclusions
                ${exclusionPolygonsM.length ? `<span class="layout-adv-badge">${exclusionPolygonsM.length}</span>` : ""}
              </button>
              <div class="layout-adv-section-body" style="display: ${sectionExclusionsOpen ? "grid" : "none"}">
                <div class="layout-adv-btn-row" style="display: ${drawObstacleMode ? "none" : "flex"}">
                  <button type="button" class="layout-adv-btn" data-layout-action="drawPolygon">Polygon</button>
                  <button type="button" class="layout-adv-btn" data-layout-action="drawRectangle">Rectangle</button>
                  <button type="button" class="layout-adv-btn layout-adv-btn--ghost" data-layout-action="clearExclusions" ${exclusionPolygonsM.length ? "" : "disabled"}>Clear</button>
                </div>
                <div class="layout-adv-btn-row" style="display: ${drawObstacleMode && obstacleDrawKind === "polygon" ? "flex" : "none"}">
                  <button type="button" class="layout-adv-btn layout-adv-btn--primary" data-layout-action="finishDraw" title="${drawTarget === "block" ? "Fill the drawn area with modules" : "Apply exclusion and recalculate modules"}" ${draftRingM.length < 3 ? "disabled" : ""}>Finish</button>
                  <button type="button" class="layout-adv-btn" data-layout-action="deleteLastPoint" ${draftRingM.length < 1 ? "disabled" : ""}>Undo point</button>
                  <button type="button" class="layout-adv-btn layout-adv-btn--ghost" data-layout-action="cancelDraw">Cancel</button>
                </div>
                <div class="layout-adv-btn-row" style="display: ${drawObstacleMode && obstacleDrawKind === "rectangle" ? "flex" : "none"}">
                  <button type="button" class="layout-adv-btn" data-layout-action="deleteLastPoint" ${!hasRectCorner ? "disabled" : ""}>Undo point</button>
                  <button type="button" class="layout-adv-btn layout-adv-btn--ghost" data-layout-action="cancelDraw">Cancel</button>
                </div>
                <p class="layout-adv-hint">${drawingExclusion && obstacleDrawKind === "polygon" ? "Polygon: add corners on the field, then <strong>Finish</strong> or click the <strong>first point</strong> (blue). Double-click also applies." : drawingExclusion && obstacleDrawKind === "rectangle" ? "Rectangle: click one corner, then the opposite corner (axis-aligned in field meters). The exclusion applies after the second click." : exclusionPolygonsM.length ? "Click an exclusion to select it: <strong>drag</strong> to move, drag a <strong>corner</strong> to reshape, drag the <strong>round handle</strong> to rotate." : "Choose <strong>Polygon</strong> or <strong>Rectangle</strong> to carve out roads, MV zones, or pads."}</p>
                <div class="layout-excl-list">${exclusionRowsHtml}</div>
              </div>
            </div>
            <div class="layout-adv-section">
              <button type="button" class="layout-adv-section-head" data-layout-action="toggleSection" data-section="design">
                <span class="layout-adv-chevron${sectionDesignOpen ? " is-open" : ""}">&rsaquo;</span>
                Block design
                ${blocks.length + equipment.length ? `<span class="layout-adv-badge">${blocks.length + equipment.length}</span>` : ""}
              </button>
              <div class="layout-adv-section-body" style="display: ${sectionDesignOpen ? "grid" : "none"}">
                <div class="layout-adv-btn-row" style="display: ${drawObstacleMode ? "none" : "flex"}">
                  <button type="button" class="layout-adv-btn" data-layout-action="openBlockModal" ${placing ? "disabled" : ""}>Add block</button>
                  <button type="button" class="layout-adv-btn" data-layout-action="openEquipmentModal" ${placing ? "disabled" : ""}>Add equipment</button>
                </div>
                <div class="layout-adv-btn-row" style="display: ${drawObstacleMode ? "none" : "flex"}">
                  <button type="button" class="layout-adv-btn" data-layout-action="drawBlockRectangle" ${placing || remainingBudget <= 0 ? "disabled" : ""} title="Draw a rectangle that auto-fills with modules">Auto block &middot; rect</button>
                  <button type="button" class="layout-adv-btn" data-layout-action="drawBlockPolygon" ${placing || remainingBudget <= 0 ? "disabled" : ""} title="Draw a polygon that auto-fills with modules">Auto block &middot; poly</button>
                </div>
                <div class="layout-adv-btn-row">
                  <button type="button" class="layout-adv-btn layout-adv-btn--ghost" data-layout-action="cancelPlacement" style="display:${placing ? "inline-block" : "none"}">Cancel placement</button>
                  <button type="button" class="layout-adv-btn layout-adv-btn--ghost" data-layout-action="clearDesign" ${blocks.length || equipment.length ? "" : "disabled"}>Clear design</button>
                </div>
                <p class="layout-adv-hint">${designHint}</p>
                <div class="layout-excl-list">${blockRowsHtml}${equipmentRowsHtml}</div>
              </div>
            </div>
          </div>` : `
          <button type="button" class="layout-adv-btn" data-layout-action="toggleAdvanced">Advanced</button>`}
        </div>
        ${modalHtml}
        <div class="layout-stage-caption">Top-down layout — right-drag to rotate</div>
      </div>
      <p class="muted">${note}</p>
    </div>
  `;

  const canvas = container.querySelector("canvas");
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const logicalW = canvas.clientWidth || 900;
  const logicalH = 500;
  canvas.width = Math.round(logicalW * dpr);
  canvas.height = Math.round(logicalH * dpr);
  canvas.style.width = logicalW + "px";
  canvas.style.height = logicalH + "px";
  canvas.style.cursor = drawObstacleMode || placing ? "crosshair" : "grab";

  const margin = { top: 44, right: 56, bottom: 44, left: 56 };
  const drawW = logicalW - margin.left - margin.right;
  const drawH = logicalH - margin.top - margin.bottom;
  const baseScale = Math.min(drawW / grossWidthM, drawH / grossDepthM);

  // zoom/pan / 2D preview rotation (preview only; not persisted)
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  /** Radians — right-mouse drag on canvas */
  let previewRotationRad = 0;
  let previewRotating = false;
  let lastRotClientX = 0;
  let cachedBgImage = null;
  /** Field meters [x,y] — second corner preview while drawing a rectangle */
  let rectHoverFieldM = null;
  /** Field meters [x,y] — cursor while drawing a polygon (rubber-band line) */
  let polyHoverFieldM = null;
  /** Row meters [x,y] — ghost center while placing block/equipment */
  let ghostRowM = li.ghostRowM || null;
  let ghostValid = false;

  // -- exclusion selection / editing (move, reshape, rotate)
  const ROTATE_HANDLE_PX = 30;
  let selectedExclIdx = Number.isFinite(li.selectedExclusionIndex) ? li.selectedExclusionIndex : -1;
  if (selectedExclIdx >= (li.exclusionPolygonsM || []).length) selectedExclIdx = -1;
  /** @type {null | 'move' | 'vertex' | 'rotate'} */
  let editMode = null;
  /** Working clone of the selected ring (field meters) during a drag */
  let editRing = null;
  /** Snapshot of the ring at drag start */
  let baseRing = null;
  let editVertexIdx = -1;
  let editMoved = false;
  let moveStartF = null;
  let rotateCenterF = null;
  let rotateStartAngle = 0;

  function ringCentroidF(ring) {
    let sx = 0;
    let sy = 0;
    for (const p of ring) {
      sx += p[0];
      sy += p[1];
    }
    return [sx / ring.length, sy / ring.length];
  }

  /** Client event -> logical canvas px (preview rotation undone) + field meters. */
  function eventToFieldM(e) {
    const r = canvas.getBoundingClientRect();
    let lx = e.clientX - r.left;
    let ly = e.clientY - r.top;
    ({ lx, ly } = undoPreviewLogicalRotation(lx, ly));
    const { scale, toX, toY } = getTransform();
    return {
      lx,
      ly,
      scale,
      toX,
      toY,
      xf: (lx - toX(0)) / scale,
      yf: (ly - toY(0)) / scale,
    };
  }

  function placementCtx(exRingsRow) {
    return {
      rotatedPolyVerts: rotatedPolyVerts,
      rotatedBoundsM: rotatedBoundsM,
      setbackM: sw,
      setbackDepthM: sd,
      netWidthM,
      netDepthM,
      exclusionRingsRow: exRingsRow,
      placedBlocks: blocks,
      placedEquipment: equipment,
      layoutCtx: layoutCtx || {
        moduleSpanInRowM,
        moduleGapM,
        rowPitchM,
        collectorProjectionM,
      },
    };
  }

  function drawBlockModules(ctx, block, toX, toY, drawStyle) {
    if (!block.originRowM || block.originRowM.length < 2 || !layoutCtx) return;
    const { widthM, depthM } = blockFootprintM(block, layoutCtx);
    const topLeftX = block.originRowM[0] - widthM / 2;
    const topLeftY = block.originRowM[1] - depthM / 2;
    const moduleStep = drawStyle.moduleStep;
    for (let s = 0; s < block.strings; s++) {
      const yM = topLeftY + s * rowPitchM;
      for (let m = 0; m < block.modulesPerString; m++) {
        const xM = topLeftX + m * moduleStep;
        ctx.fillStyle = drawStyle.moduleColor;
        ctx.fillRect(
          toX(xM),
          toY(yM),
          Math.max(drawStyle.modulePixelW - 0.5, 1),
          Math.max(drawStyle.rowPixelH - 0.5, 1)
        );
      }
    }
    ctx.strokeStyle = "rgba(37, 99, 235, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(toX(topLeftX), toY(topLeftY), widthM * drawStyle.scale, depthM * drawStyle.scale);
    ctx.setLineDash([]);
    ctx.font = "700 9px Inter, sans-serif";
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(
      `${block.name} · ${block.strings} str · ${block.moduleCount} mod`,
      toX(topLeftX) + 4,
      toY(topLeftY) + 3
    );
  }

  function drawAreaBlock(ctx, block, blockIndex, toX, toY, drawStyle, exRingsRow) {
    if (!layoutCtx || !block.ringRowM || block.ringRowM.length < 3) return;
    const ring = block.ringRowM;
    const otherRings = blocks
      .map((b, i) => (i === blockIndex ? null : blockAnyRingRowM(b, layoutCtx)))
      .filter((r) => r && r.length >= 3);
    const equipmentRings = equipment
      .filter((eq) => eq.originRowM && eq.originRowM.length >= 2)
      .map((eq) => equipmentRingRowM(eq));
    const { slots } = areaBlockSlotsRowM(
      ring,
      layoutCtx,
      [...exRingsRow, ...equipmentRings],
      otherRings,
      block.moduleCount ?? Infinity
    );
    for (const p of slots) {
      const xLeft = p.x - moduleSpanInRowM / 2;
      const yTop = p.y - collectorProjectionM / 2;
      ctx.fillStyle = drawStyle.moduleColor;
      ctx.fillRect(
        toX(xLeft),
        toY(yTop),
        Math.max(drawStyle.modulePixelW - 0.5, 1),
        Math.max(drawStyle.rowPixelH - 0.5, 1)
      );
    }
    ctx.strokeStyle = "rgba(22, 163, 74, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(toX(ring[0][0]), toY(ring[0][1]));
    for (let i = 1; i < ring.length; i++) {
      ctx.lineTo(toX(ring[i][0]), toY(ring[i][1]));
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    const minX = Math.min(...ring.map((p) => p[0]));
    const minY = Math.min(...ring.map((p) => p[1]));
    ctx.font = "700 9px Inter, sans-serif";
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(
      `${block.name} · ${block.moduleCount} mod${block.truncated ? " (capped)" : ""}`,
      toX(minX) + 4,
      toY(minY) + 3
    );
  }

  function drawEquipmentItem(ctx, item, toX, toY, drawStyle) {
    if (!item.originRowM || item.originRowM.length < 2) return;
    const typeDef = EQUIPMENT_TYPES[item.type] || EQUIPMENT_TYPES.combiner;
    const { widthM, depthM } = equipmentFootprintM(item);
    const ring = equipmentRingRowM(item);
    const minX = Math.min(...ring.map((p) => p[0]));
    const minY = Math.min(...ring.map((p) => p[1]));
    ctx.fillStyle = typeDef.color + "66";
    ctx.strokeStyle = typeDef.color;
    ctx.lineWidth = 1.5;
    ctx.fillRect(toX(minX), toY(minY), widthM * drawStyle.scale, depthM * drawStyle.scale);
    ctx.strokeRect(toX(minX), toY(minY), widthM * drawStyle.scale, depthM * drawStyle.scale);
    ctx.font = "800 11px Inter, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      typeDef.glyph,
      toX(item.originRowM[0]),
      toY(item.originRowM[1])
    );
    ctx.font = "700 8px Inter, sans-serif";
    ctx.fillStyle = typeDef.color;
    ctx.textBaseline = "top";
    ctx.fillText(item.label || typeDef.label, toX(minX) + 3, toY(minY + depthM) + 2);
  }

  function drawPlacementGhost(ctx, toX, toY, exRingsRow, drawStyle) {
    if (!placing || !ghostRowM) return;
    let widthM;
    let depthM;
    let ghostCenter = ghostRowM;
    const ghostLayoutCtx = layoutCtx || {
      moduleSpanInRowM,
      moduleGapM,
      rowPitchM,
      collectorProjectionM,
      rotatedBoundsM,
      setbackM: sw,
      setbackDepthM: sd,
    };
    if (placing.kind === "block") {
      const fp = blockFootprintM(placing.spec, ghostLayoutCtx);
      widthM = fp.widthM;
      depthM = fp.depthM;
      // Snap to the row grid so the placed block obeys tilt pitch + orientation.
      ghostCenter = snapBlockOriginRowM(ghostRowM, widthM, depthM, ghostLayoutCtx);
    } else {
      const fp = equipmentFootprintM(placing.spec);
      widthM = fp.widthM;
      depthM = fp.depthM;
    }
    const ring = footprintRingRowM(ghostCenter, widthM, depthM);
    ghostValid = isPlacementValid(ring, placementCtx(exRingsRow));
    const minX = Math.min(...ring.map((p) => p[0]));
    const minY = Math.min(...ring.map((p) => p[1]));
    ctx.fillStyle = ghostValid ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.25)";
    ctx.strokeStyle = ghostValid ? "rgba(22, 163, 74, 0.95)" : "rgba(220, 38, 38, 0.95)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.fillRect(toX(minX), toY(minY), widthM * drawStyle.scale, depthM * drawStyle.scale);
    ctx.strokeRect(toX(minX), toY(minY), widthM * drawStyle.scale, depthM * drawStyle.scale);
    ctx.setLineDash([]);
  }

  function getTransform() {
    const s = baseScale * zoom;
    const ox = margin.left + (drawW - grossWidthM * baseScale) / 2 + panX;
    const oy = margin.top + (drawH - grossDepthM * baseScale) / 2 + panY;
    return {
      scale: s,
      toX: (m) => ox + m * s,
      toY: (m) => oy + m * s,
    };
  }

  /** Undo 2D preview-only rotation so pointer hits match unrotated field geometry. */
  function undoPreviewLogicalRotation(lx, ly) {
    const previewRotRad = previewRotationRad;
    if (Math.abs(previewRotRad) < 1e-9) return { lx, ly };
    const { scale, toX, toY } = getTransform();
    const gxi = toX(0);
    const gyi = toY(0);
    const gwi = grossWidthM * scale;
    const ghi = grossDepthM * scale;
    const vcx = gxi + gwi / 2;
    const vcy = gyi + ghi / 2;
    const dx = lx - vcx;
    const dy = ly - vcy;
    const c = Math.cos(-previewRotRad);
    const s = Math.sin(-previewRotRad);
    return { lx: vcx + dx * c - dy * s, ly: vcy + dx * s + dy * c };
  }

  function draw(ctx, bgImage) {
    if (bgImage) cachedBgImage = bgImage;
    const bg = bgImage || cachedBgImage;
    const { scale, toX, toY } = getTransform();
    const azDegDraw = Number(config.azimuthDeg) || 180;
    const exRings = (li.exclusionPolygonsM || [])
      .filter((r) => r && r.length >= 3)
      .map((r) => rotateFieldRingToRowSpace(r, grossWidthM, grossDepthM, azDegDraw));
    const useExclusionSlots = exRings.length > 0;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, logicalW, logicalH);

    // -- background fill
    ctx.fillStyle = "#f1f0eb";
    ctx.fillRect(0, 0, logicalW, logicalH);

    // -- ground plane
    const gx = toX(0);
    const gy = toY(0);
    const gw = grossWidthM * scale;
    const gh = grossDepthM * scale;

    const previewRotRad = previewRotationRad;
    const viewCx = gx + gw / 2;
    const viewCy = gy + gh / 2;
    ctx.save();
    ctx.translate(viewCx, viewCy);
    ctx.rotate(previewRotRad);
    ctx.translate(-viewCx, -viewCy);

    function tracePolyPath(ctx, verts) {
      ctx.beginPath();
      ctx.moveTo(toX(verts[0][0]), toY(verts[0][1]));
      for (let i = 1; i < verts.length; i++) {
        ctx.lineTo(toX(verts[i][0]), toY(verts[i][1]));
      }
      ctx.closePath();
    }

    if (bgImage) {
      ctx.save();
      ctx.beginPath();
      if (polyVerts) { tracePolyPath(ctx, polyVerts); } else { roundRect(ctx, gx, gy, gw, gh, 6); }
      ctx.clip();
      ctx.drawImage(bgImage, gx, gy, gw, gh);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(gx, gy, gw, gh);
      ctx.restore();
    } else {
      ctx.fillStyle = "#e8e4d4";
      ctx.beginPath();
      if (polyVerts) { tracePolyPath(ctx, polyVerts); } else { roundRect(ctx, gx, gy, gw, gh, 6); }
      ctx.fill();
    }

    // -- subtle grid
    const gridStep = niceGridStep(Math.max(grossWidthM, grossDepthM));
    ctx.save();
    ctx.beginPath();
    if (polyVerts) { tracePolyPath(ctx, polyVerts); } else { roundRect(ctx, gx, gy, gw, gh, 6); }
    ctx.clip();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
    ctx.lineWidth = 0.5;
    for (let m = gridStep; m < grossWidthM; m += gridStep) {
      ctx.beginPath();
      ctx.moveTo(toX(m), gy);
      ctx.lineTo(toX(m), gy + gh);
      ctx.stroke();
    }
    for (let m = gridStep; m < grossDepthM; m += gridStep) {
      ctx.beginPath();
      ctx.moveTo(gx, toY(m));
      ctx.lineTo(gx + gw, toY(m));
      ctx.stroke();
    }
    ctx.restore();

    // -- shape border
    ctx.strokeStyle = "rgba(15, 23, 42, 0.18)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (polyVerts) { tracePolyPath(ctx, polyVerts); } else { roundRect(ctx, gx, gy, gw, gh, 6); }
    ctx.stroke();

    // -- polygon fill highlight
    if (polyVerts) {
      ctx.fillStyle = "rgba(59, 130, 246, 0.06)";
      tracePolyPath(ctx, polyVerts);
      ctx.fill();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
      ctx.lineWidth = 1.5;
      tracePolyPath(ctx, polyVerts);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // -- setback zone tint (only for rectangles)
    if (!polyVerts && (sw > 0 || sd > 0)) {
      const nx = toX(sw);
      const ny = toY(sd);
      const nw = netWidthM * scale;
      const nh = netDepthM * scale;
      ctx.fillStyle = "rgba(255, 184, 0, 0.07)";
      ctx.beginPath();
      roundRect(ctx, gx, gy, gw, gh, 6);
      ctx.rect(nx + nw, ny, -(nw), nh);
      ctx.fill("evenodd");

      // net area dashed border
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(255, 184, 0, 0.7)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(nx, ny, nw, nh);
      ctx.setLineDash([]);
    }

    // -- module rows (drawn in row-aligned space, clipped to site boundary)
    const modulePixelW = moduleSpanInRowM * scale;
    const gapPixelW = moduleGapM * scale;
    const rowPixelH = collectorProjectionM * scale;

    const moduleColor = bgImage ? "rgba(30, 58, 95, 0.82)" : "#1e3a5f";
    const partialColor = bgImage ? "rgba(30, 58, 95, 0.45)" : "rgba(30, 58, 95, 0.5)";
    const drawStyle = {
      moduleColor,
      modulePixelW,
      rowPixelH,
      scale,
      moduleStep: Math.max(moduleSpanInRowM + moduleGapM, 0.001),
    };
    let totalPlacedModules = 0;

    // Clip to site boundary and rotate canvas for azimuth
    ctx.save();
    ctx.beginPath();
    if (polyVerts) { tracePolyPath(ctx, polyVerts); } else { roundRect(ctx, gx, gy, gw, gh, 6); }
    ctx.clip();
    if (Math.abs(azRotRad) > 1e-6) {
      ctx.translate(gx + gw / 2, gy + gh / 2);
      ctx.rotate(azRotRad);
      ctx.translate(-gx - gw / 2, -gy - gh / 2);
    }

    // Row iteration uses rotated polygon
    const rowMinY = rotatedBoundsM ? rotatedBoundsM.minY + sd : sd;
    const rowMaxY = rotatedBoundsM ? rotatedBoundsM.maxY - sd : sd + netDepthM;
    const maxRows =
      rowMaxY <= rowMinY
        ? 0
        : Math.max(
            Math.floor(
              (rowMaxY - rowMinY + (Number(config.rowSpacingM) || 0)) / Math.max(rowPitchM, 0.001)
            ),
            0
          );

    let modulesRemaining = visibleModuleCount;
    const hasBlockDesign = blocks.length > 0;

    if (hasBlockDesign) {
      for (let bi = 0; bi < blocks.length; bi++) {
        const block = blocks[bi];
        if (block.kind === "area") {
          drawAreaBlock(ctx, block, bi, toX, toY, drawStyle, exRings);
        } else {
          drawBlockModules(ctx, block, toX, toY, drawStyle);
        }
      }
      for (const eq of equipment) {
        drawEquipmentItem(ctx, eq, toX, toY, drawStyle);
      }
      drawPlacementGhost(ctx, toX, toY, exRings, drawStyle);
    } else if (useExclusionSlots) {
      rows: for (let i = 0; i < maxRows; i++) {
        const yM = rowMinY + i * rowPitchM;
        const rowCenterY = yM + collectorProjectionM / 2;

        let rowStartX, rowEndX;
        let bandAvailEx = Infinity;
        if (rotatedPolyVerts) {
          bandAvailEx = minRowUsableWidthM(rotatedPolyVerts, yM, collectorProjectionM, sw);
          if (bandAvailEx <= 0) continue;
          if (minRowWidthM > 0 && bandAvailEx < minRowWidthM) continue;
          const range = polygonXRangeAtY(rotatedPolyVerts, rowCenterY);
          if (!range) continue;
          rowStartX = range.minX + sw;
          rowEndX = range.maxX - sw;
        } else {
          rowStartX = sw;
          rowEndX = sw + netWidthM;
        }

        if (rowEndX <= rowStartX) continue;
        if (!rotatedPolyVerts && minRowWidthM > 0 && rowEndX - rowStartX < minRowWidthM) continue;
        if (rotatedPolyVerts) {
          const cw = rowEndX - rowStartX;
          if (cw > bandAvailEx + 1e-6) {
            const mid = (rowStartX + rowEndX) / 2;
            rowStartX = mid - bandAvailEx / 2;
            rowEndX = mid + bandAvailEx / 2;
          }
        }

        const slots = walkRowSlotCenters(
          rowStartX,
          rowEndX,
          rowCenterY,
          moduleSpanInRowM,
          moduleGapM,
          maxRowWidthM,
          rowWidthGapM
        );
        const keptSlots = slots.filter((p) => !pointInAnyExclusion(p.x, p.y, exRings));
        const placedSlots = dropShortSlotRuns(keptSlots, moduleSpanInRowM, moduleGapM, minRowWidthM);
        for (const p of placedSlots) {
          if (modulesRemaining <= 0) break rows;
          const xLeft = p.x - moduleSpanInRowM / 2;
          ctx.fillStyle = moduleColor;
          ctx.fillRect(
            toX(xLeft),
            toY(yM),
            Math.max(modulePixelW - 0.5, 1),
            Math.max(rowPixelH - 0.5, 1)
          );
          totalPlacedModules++;
          modulesRemaining--;
        }
      }
    } else {
      for (let i = 0; i < maxRows; i++) {
        const yM = rowMinY + i * rowPitchM;
        const rowCenterY = yM + collectorProjectionM / 2;

        let rowStartX, rowEndX;
        let packWidthM;
        if (rotatedPolyVerts) {
          const bandAvail = minRowUsableWidthM(rotatedPolyVerts, yM, collectorProjectionM, sw);
          if (bandAvail <= 0) continue;
          if (minRowWidthM > 0 && bandAvail < minRowWidthM) continue;
          const range = polygonXRangeAtY(rotatedPolyVerts, rowCenterY);
          if (!range) continue;
          rowStartX = range.minX + sw;
          rowEndX = range.maxX - sw;
          packWidthM = bandAvail;
        } else {
          rowStartX = sw;
          rowEndX = sw + netWidthM;
          packWidthM = rowEndX - rowStartX;
        }

        if (rowEndX <= rowStartX) continue;
        if (!rotatedPolyVerts && minRowWidthM > 0 && packWidthM < minRowWidthM) continue;
        if (rotatedPolyVerts) {
          const cw = rowEndX - rowStartX;
          if (cw > packWidthM + 1e-6) {
            const mid = (rowStartX + rowEndX) / 2;
            rowStartX = mid - packWidthM / 2;
            rowEndX = mid + packWidthM / 2;
          }
        }
        const moduleStep = Math.max(moduleSpanInRowM + moduleGapM, 0.001);

        const modulesPerSegment = maxRowWidthM > 0
          ? Math.max(Math.floor((maxRowWidthM + moduleGapM) / moduleStep), 1)
          : 0;

        let rowModules;
        if (modulesPerSegment > 0) {
          const segWidthM = modulesPerSegment * moduleStep - moduleGapM;
          const segStepM = segWidthM + moduleGapM + rowWidthGapM;
          const numFullSegs = packWidthM >= segWidthM
            ? 1 + Math.max(Math.floor((packWidthM - segWidthM) / segStepM), 0)
            : 0;
          const usedW = numFullSegs > 0 ? segWidthM + (numFullSegs - 1) * segStepM : 0;
          const remW = packWidthM - usedW;
          const tailMods = numFullSegs > 0 && remW >= rowWidthGapM + moduleSpanInRowM
            ? Math.min(Math.floor((remW - rowWidthGapM + moduleGapM) / moduleStep), modulesPerSegment)
            : 0;
          rowModules = trimRowModuleCountForMinSegmentWidthM(
            numFullSegs * modulesPerSegment + tailMods,
            modulesPerSegment,
            moduleStep,
            moduleGapM,
            minRowWidthM
          );
        } else {
          rowModules = trimRowModuleCountForMinSegmentWidthM(
            Math.max(Math.floor((packWidthM + moduleGapM) / moduleStep), 0),
            0,
            moduleStep,
            moduleGapM,
            minRowWidthM
          );
        }
        if (rowModules <= 0) continue;

        const drawRow = Math.min(rowModules, modulesRemaining);
        if (drawRow <= 0) break;

        let remaining = drawRow;
        let segX = rowStartX;
        while (remaining > 0) {
          const segModules = modulesPerSegment > 0 ? Math.min(remaining, modulesPerSegment) : remaining;
          const segWidthM = segModules * moduleStep - moduleGapM;
          const showIndividual = modulePixelW >= 3 && segModules <= 200;

          if (showIndividual) {
            ctx.fillStyle = moduleColor;
            for (let j = 0; j < segModules; j++) {
              const xM = segX + j * moduleStep;
              ctx.fillRect(
                toX(xM),
                toY(yM),
                Math.max(modulePixelW - 0.5, 1),
                Math.max(rowPixelH - 0.5, 1)
              );
            }
          } else {
            ctx.fillStyle = moduleColor;
            ctx.fillRect(
              toX(segX),
              toY(yM),
              segWidthM * scale,
              Math.max(rowPixelH, 1)
            );
          }
          remaining -= segModules;
          segX += segWidthM + moduleGapM + rowWidthGapM;
        }
        totalPlacedModules += drawRow;
        modulesRemaining -= drawRow;
        if (modulesRemaining <= 0) break;
      }
      for (const eq of equipment) {
        drawEquipmentItem(ctx, eq, toX, toY, drawStyle);
      }
      drawPlacementGhost(ctx, toX, toY, exRings, drawStyle);
    }
    ctx.restore(); // remove azimuth rotation and clip

    // -- exclusion overlays (field meters, on top of modules)
    const overlayRings = li.exclusionPolygonsM || [];
    for (let ri = 0; ri < overlayRings.length; ri++) {
      const isSelected = ri === selectedExclIdx;
      const ring = isSelected && editRing ? editRing : overlayRings[ri];
      if (!ring || ring.length < 3) continue;
      ctx.fillStyle = isSelected ? "rgba(239, 68, 68, 0.28)" : "rgba(239, 68, 68, 0.2)";
      tracePolyPath(ctx, ring);
      ctx.fill();
      ctx.strokeStyle = isSelected ? "rgba(37, 99, 235, 0.95)" : "rgba(185, 28, 28, 0.88)";
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      tracePolyPath(ctx, ring);
      ctx.stroke();

      if (isSelected) {
        // vertex handles (drag to reshape)
        for (const pt of ring) {
          ctx.beginPath();
          ctx.arc(toX(pt[0]), toY(pt[1]), 5, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
          ctx.fill();
          ctx.strokeStyle = "rgba(37, 99, 235, 0.95)";
          ctx.lineWidth = 1.75;
          ctx.stroke();
        }
        // rotate handle above centroid (drag to rotate)
        const [cxF, cyF] = ringCentroidF(ring);
        const hx = toX(cxF);
        const hy = toY(cyF) - ROTATE_HANDLE_PX;
        ctx.beginPath();
        ctx.moveTo(toX(cxF), toY(cyF));
        ctx.lineTo(hx, hy);
        ctx.strokeStyle = "rgba(37, 99, 235, 0.7)";
        ctx.lineWidth = 1.25;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(toX(cxF), toY(cyF), 3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(37, 99, 235, 0.95)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hx, hy, 7, 0, Math.PI * 2);
        ctx.fillStyle = editMode === "rotate" ? "rgba(37, 99, 235, 0.95)" : "rgba(255, 255, 255, 0.95)";
        ctx.fill();
        ctx.strokeStyle = "rgba(37, 99, 235, 0.95)";
        ctx.lineWidth = 2;
        ctx.stroke();
        // small rotation glyph inside the handle
        ctx.beginPath();
        ctx.arc(hx, hy, 3.2, -Math.PI * 0.25, Math.PI, false);
        ctx.strokeStyle = editMode === "rotate" ? "#fff" : "rgba(37, 99, 235, 0.95)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
    // draft colors: blue for exclusions, green for auto blocks
    const isBlockDraft = drawTarget === "block";
    const draftFillSoft = isBlockDraft ? "rgba(34, 197, 94, 0.18)" : "rgba(59, 130, 246, 0.18)";
    const draftFillSofter = isBlockDraft ? "rgba(34, 197, 94, 0.12)" : "rgba(59, 130, 246, 0.12)";
    const draftStroke = isBlockDraft ? "rgba(22, 163, 74, 0.95)" : "rgba(37, 99, 235, 0.95)";
    const draftStrokeMid = isBlockDraft ? "rgba(22, 163, 74, 0.85)" : "rgba(37, 99, 235, 0.85)";
    const draftStrokeFaint = isBlockDraft ? "rgba(22, 163, 74, 0.35)" : "rgba(37, 99, 235, 0.35)";
    const draftStrokeDark = isBlockDraft ? "#15803d" : "#1d4ed8";

    if (obstacleDrawKind === "polygon" && draftRingM.length >= 1) {
      ctx.beginPath();
      ctx.moveTo(toX(draftRingM[0][0]), toY(draftRingM[0][1]));
      for (let di = 1; di < draftRingM.length; di++) {
        ctx.lineTo(toX(draftRingM[di][0]), toY(draftRingM[di][1]));
      }
      if (draftRingM.length >= 3) {
        ctx.closePath();
        ctx.fillStyle = draftFillSoft;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(toX(draftRingM[0][0]), toY(draftRingM[0][1]));
        for (let di = 1; di < draftRingM.length; di++) {
          ctx.lineTo(toX(draftRingM[di][0]), toY(draftRingM[di][1]));
        }
      }
      ctx.strokeStyle = draftStroke;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let di = 0; di < draftRingM.length; di++) {
        const pt = draftRingM[di];
        const isFirst = di === 0;
        ctx.beginPath();
        ctx.arc(toX(pt[0]), toY(pt[1]), isFirst ? 6.5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isFirst ? draftStroke : "rgba(255, 255, 255, 0.95)";
        ctx.fill();
        ctx.strokeStyle = isFirst ? draftStrokeDark : draftStrokeMid;
        ctx.lineWidth = isFirst ? 2 : 1.25;
        ctx.stroke();
      }
      // rubber-band: live line from last point to cursor (+ faint closing line)
      if (drawObstacleMode && polyHoverFieldM) {
        const last = draftRingM[draftRingM.length - 1];
        ctx.beginPath();
        ctx.moveTo(toX(last[0]), toY(last[1]));
        ctx.lineTo(toX(polyHoverFieldM[0]), toY(polyHoverFieldM[1]));
        ctx.strokeStyle = draftStrokeMid;
        ctx.lineWidth = 1.75;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        if (draftRingM.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(toX(polyHoverFieldM[0]), toY(polyHoverFieldM[1]));
          ctx.lineTo(toX(draftRingM[0][0]), toY(draftRingM[0][1]));
          ctx.strokeStyle = draftStrokeFaint;
          ctx.lineWidth = 1.25;
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
    if (obstacleDrawKind === "rectangle" && rectFirstCornerM) {
      const x0 = rectFirstCornerM[0];
      const y0 = rectFirstCornerM[1];
      if (rectHoverFieldM && rectHoverFieldM.length >= 2) {
        const xh = rectHoverFieldM[0];
        const yh = rectHoverFieldM[1];
        const minX = Math.min(x0, xh);
        const maxX = Math.max(x0, xh);
        const minY = Math.min(y0, yh);
        const maxY = Math.max(y0, yh);
        ctx.beginPath();
        ctx.moveTo(toX(minX), toY(minY));
        ctx.lineTo(toX(maxX), toY(minY));
        ctx.lineTo(toX(maxX), toY(maxY));
        ctx.lineTo(toX(minX), toY(maxY));
        ctx.closePath();
        ctx.fillStyle = draftFillSofter;
        ctx.fill();
        ctx.strokeStyle = draftStroke;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.arc(toX(x0), toY(y0), 6.5, 0, Math.PI * 2);
      ctx.fillStyle = draftStroke;
      ctx.fill();
      ctx.strokeStyle = draftStrokeDark;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore(); // end 2D preview-only rotation (labels / legend stay upright)

    // -- dimension annotations
    ctx.font = "600 11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // width label (below)
    const widthLabel = `${grossWidthM.toLocaleString()} m`;
    const widthY = gy + gh + 10;
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx, widthY);
    ctx.lineTo(gx + gw, widthY);
    ctx.stroke();
    // end ticks
    ctx.beginPath();
    ctx.moveTo(gx, widthY - 4);
    ctx.lineTo(gx, widthY + 4);
    ctx.moveTo(gx + gw, widthY - 4);
    ctx.lineTo(gx + gw, widthY + 4);
    ctx.stroke();
    drawTextWithBg(ctx, widthLabel, gx + gw / 2, widthY + 6, "#334155", "#f1f0eb");

    // depth label (right)
    const depthLabel = `${grossDepthM.toLocaleString()} m`;
    const depthX = gx + gw + 10;
    ctx.beginPath();
    ctx.moveTo(depthX, gy);
    ctx.lineTo(depthX, gy + gh);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(depthX - 4, gy);
    ctx.lineTo(depthX + 4, gy);
    ctx.moveTo(depthX - 4, gy + gh);
    ctx.lineTo(depthX + 4, gy + gh);
    ctx.stroke();
    ctx.save();
    ctx.translate(depthX + 16, gy + gh / 2);
    ctx.rotate(-Math.PI / 2);
    drawTextWithBg(ctx, depthLabel, 0, 0, "#334155", "#f1f0eb");
    ctx.restore();

    // -- row/module count annotations (left side)
    if (maxRows > 1) {
      const bracketX = gx - 10;
      const firstRowY = toY(rowMinY);
      const lastRowY = toY(rowMinY + (maxRows - 1) * rowPitchM + collectorProjectionM);
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bracketX, firstRowY);
      ctx.lineTo(bracketX - 6, firstRowY);
      ctx.lineTo(bracketX - 6, lastRowY);
      ctx.lineTo(bracketX, lastRowY);
      ctx.stroke();
      ctx.save();
      ctx.translate(bracketX - 18, (firstRowY + lastRowY) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.font = "700 10px Inter, sans-serif";
      drawTextWithBg(ctx, `${maxRows} rows`, 0, 0, "#64748b", "#f1f0eb");
      ctx.restore();
    }

    // -- legend items (horizontal row below ground plane)
    const previewRotDeg = (previewRotationRad * 180) / Math.PI;
    const legendItems = [
      `Tilt ${Number(config.tiltDeg).toFixed(1)}°`,
      `Az ${Number(config.azimuthDeg).toFixed(0)}°`,
      ...(Math.abs(previewRotDeg) > 0.05 ? [`2D view ${previewRotDeg.toFixed(0)}°`] : []),
      `Pitch ${Number(rowPitchM).toFixed(2)} m`,
      `GCR ${((layout.groundCoverageRatio || 0) * 100).toFixed(1)}%`,
    ];
    ctx.font = "700 10px Inter, sans-serif";
    const itemPadX = 10;
    const itemPadY = 6;
    const itemGap = 6;
    const itemH = 16 + itemPadY * 2;
    const legendY = gy + gh + 6;
    let curX = gx;
    for (const item of legendItems) {
      const tw = ctx.measureText(item).width;
      const itemW = tw + itemPadX * 2;
      ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
      ctx.beginPath();
      roundRect(ctx, curX, legendY, itemW, itemH, 6);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(item, curX + itemPadX, legendY + itemPadY);
      curX += itemW + itemGap;
    }

    // -- north arrow (top-right corner inside ground plane)
    const compassX = gx + gw - 26;
    const compassY = gy + 26;
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.strokeStyle = "rgba(15, 23, 42, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(compassX, compassY, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // arrow
    ctx.fillStyle = "#334155";
    ctx.beginPath();
    ctx.moveTo(compassX, compassY - 10);
    ctx.lineTo(compassX - 5, compassY + 2);
    ctx.lineTo(compassX + 5, compassY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.font = "800 9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("N", compassX, compassY + 4);

    ctx.restore();
  }

  const ctx = canvas.getContext("2d");

  if (preview.imageUrl) {
    const img = new Image();
    img.onload = () => {
      if (canvas.isConnected) draw(ctx, img);
    };
    img.onerror = () => {
      if (canvas.isConnected) draw(ctx, null);
    };
    img.src = preview.imageUrl;
  }
  draw(ctx, null);

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // -- wheel zoom (pointer-anchored; same clamp as +/- buttons)
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= logicalH;
      if (dy === 0) return;
      const rect = canvas.getBoundingClientRect();
      const fx = e.clientX - rect.left;
      const fy = e.clientY - rect.top;
      const prevZoom = zoom;
      const zoomSensitivity = 0.0015;
      zoom = clamp(zoom * Math.exp(-dy * zoomSensitivity), 0.5, 20);
      if (zoom === prevZoom) return;
      const ratio = zoom / prevZoom;
      panX = fx - ratio * (fx - panX);
      panY = fy - ratio * (fy - panY);
      draw(ctx, null);
    },
    { passive: false }
  );

  // -- pan with mouse drag
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("mousemove", (e) => {
    if (dragging || editMode) return;
    if (placing) {
      const r = canvas.getBoundingClientRect();
      let lx = e.clientX - r.left;
      let ly = e.clientY - r.top;
      ({ lx, ly } = undoPreviewLogicalRotation(lx, ly));
      const { scale, toX, toY } = getTransform();
      const ox0 = toX(0);
      const oy0 = toY(0);
      const { xr, yr } = canvasLogicalToRotatedRowMeters(
        lx,
        ly,
        ox0,
        oy0,
        scale,
        grossWidthM,
        grossDepthM,
        azRotRad
      );
      ghostRowM = [xr, yr];
      draw(ctx, null);
      return;
    }
    if (!drawObstacleMode) {
      // hover cursor feedback over selected exclusion handles / any exclusion body
      if (advancedMode && !blockModal) {
        const { lx, ly, xf, yf, toX, toY } = eventToFieldM(e);
        const rings = li.exclusionPolygonsM || [];
        let cursor = "grab";
        if (selectedExclIdx >= 0 && rings[selectedExclIdx]) {
          const selRing = rings[selectedExclIdx];
          const [cxF, cyF] = ringCentroidF(selRing);
          if (Math.hypot(lx - toX(cxF), ly - (toY(cyF) - ROTATE_HANDLE_PX)) <= 10) {
            cursor = "grabbing";
          } else if (
            selRing.some((pt) => Math.hypot(lx - toX(pt[0]), ly - toY(pt[1])) <= 8)
          ) {
            cursor = "crosshair";
          }
        }
        if (cursor === "grab") {
          for (let i = rings.length - 1; i >= 0; i--) {
            if (rings[i] && rings[i].length >= 3 && pointInPolygon(xf, yf, rings[i])) {
              cursor = "move";
              break;
            }
          }
        }
        canvas.style.cursor = cursor;
      }
      return;
    }
    if (obstacleDrawKind === "polygon") {
      if ((li.draftRingM || []).length >= 1) {
        const { xf, yf } = eventToFieldM(e);
        polyHoverFieldM = [xf, yf];
        draw(ctx, null);
      } else if (polyHoverFieldM !== null) {
        polyHoverFieldM = null;
        draw(ctx, null);
      }
      return;
    }
    if (obstacleDrawKind !== "rectangle" || !rectFirstCornerM) {
      if (rectHoverFieldM !== null) {
        rectHoverFieldM = null;
        draw(ctx, null);
      }
      return;
    }
    const r = canvas.getBoundingClientRect();
    let lx = e.clientX - r.left;
    let ly = e.clientY - r.top;
    ({ lx, ly } = undoPreviewLogicalRotation(lx, ly));
    const { scale, toX, toY } = getTransform();
    const ox0 = toX(0);
    const oy0 = toY(0);
    const { xr, yr } = canvasLogicalToRotatedRowMeters(
      lx,
      ly,
      ox0,
      oy0,
      scale,
      grossWidthM,
      grossDepthM,
      azRotRad
    );
    const azDegMv = Number(config.azimuthDeg) || 180;
    const [xf, yf] = rowSpaceToFieldMeters(xr, yr, grossWidthM, grossDepthM, azDegMv);
    rectHoverFieldM = [xf, yf];
    draw(ctx, null);
  });

  canvas.addEventListener("mouseleave", () => {
    let needsRedraw = false;
    if (rectHoverFieldM !== null) {
      rectHoverFieldM = null;
      needsRedraw = true;
    }
    if (polyHoverFieldM !== null) {
      polyHoverFieldM = null;
      needsRedraw = true;
    }
    if (needsRedraw) draw(ctx, null);
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2) {
      e.preventDefault();
      previewRotating = true;
      lastRotClientX = e.clientX;
      canvas.style.cursor = "grabbing";
      return;
    }
    if (e.button !== 0) return;
    if (placing && li.onPlaceAt) {
      const rect = canvas.getBoundingClientRect();
      let lx = e.clientX - rect.left;
      let ly = e.clientY - rect.top;
      ({ lx, ly } = undoPreviewLogicalRotation(lx, ly));
      const { scale, toX, toY } = getTransform();
      const ox0 = toX(0);
      const oy0 = toY(0);
      const { xr, yr } = canvasLogicalToRotatedRowMeters(
        lx,
        ly,
        ox0,
        oy0,
        scale,
        grossWidthM,
        grossDepthM,
        azRotRad
      );
      li.onPlaceAt([xr, yr]);
      e.preventDefault();
      return;
    }
    if (drawObstacleMode && (li.onAddDraftPoint || li.onRectangleFieldClick)) {
      const rect = canvas.getBoundingClientRect();
      let lx = e.clientX - rect.left;
      let ly = e.clientY - rect.top;
      ({ lx, ly } = undoPreviewLogicalRotation(lx, ly));
      const { scale, toX, toY } = getTransform();
      const ox0 = toX(0);
      const oy0 = toY(0);
      const { xr, yr } = canvasLogicalToRotatedRowMeters(
        lx,
        ly,
        ox0,
        oy0,
        scale,
        grossWidthM,
        grossDepthM,
        azRotRad
      );
      const azDeg = Number(config.azimuthDeg) || 180;
      const [xf, yf] = rowSpaceToFieldMeters(xr, yr, grossWidthM, grossDepthM, azDeg);

      if (obstacleDrawKind === "rectangle" && li.onRectangleFieldClick) {
        rectHoverFieldM = null;
        li.onRectangleFieldClick([xf, yf]);
        e.preventDefault();
        return;
      }
      if (obstacleDrawKind === "polygon" && li.onAddDraftPoint) {
        const draft = li.draftRingM || [];
        if (draft.length >= 3 && li.onCommitDraftRing) {
          const px0 = toX(draft[0][0]);
          const py0 = toY(draft[0][1]);
          if (Math.hypot(lx - px0, ly - py0) < 18) {
            li.onCommitDraftRing();
            e.preventDefault();
            return;
          }
        }
        li.onAddDraftPoint([xf, yf]);
        e.preventDefault();
        return;
      }
    }
    // -- exclusion select / move / reshape / rotate (advanced mode, idle)
    if (advancedMode && !drawObstacleMode && !placing && !blockModal) {
      const { lx, ly, xf, yf, toX, toY } = eventToFieldM(e);
      const rings = li.exclusionPolygonsM || [];

      if (selectedExclIdx >= 0 && rings[selectedExclIdx]) {
        const selRing = rings[selectedExclIdx];
        // rotate handle
        const [cxF, cyF] = ringCentroidF(selRing);
        const hx = toX(cxF);
        const hy = toY(cyF) - ROTATE_HANDLE_PX;
        if (Math.hypot(lx - hx, ly - hy) <= 10) {
          editMode = "rotate";
          baseRing = selRing.map((p) => [p[0], p[1]]);
          editRing = selRing.map((p) => [p[0], p[1]]);
          rotateCenterF = [cxF, cyF];
          rotateStartAngle = Math.atan2(ly - toY(cyF), lx - toX(cxF));
          editMoved = false;
          canvas.style.cursor = "grabbing";
          e.preventDefault();
          return;
        }
        // vertex handle (reshape)
        for (let vi = 0; vi < selRing.length; vi++) {
          if (Math.hypot(lx - toX(selRing[vi][0]), ly - toY(selRing[vi][1])) <= 8) {
            editMode = "vertex";
            editVertexIdx = vi;
            baseRing = selRing.map((p) => [p[0], p[1]]);
            editRing = selRing.map((p) => [p[0], p[1]]);
            editMoved = false;
            canvas.style.cursor = "crosshair";
            e.preventDefault();
            return;
          }
        }
      }

      // body hit on any exclusion (topmost first): select + start move
      for (let i = rings.length - 1; i >= 0; i--) {
        if (rings[i] && rings[i].length >= 3 && pointInPolygon(xf, yf, rings[i])) {
          selectedExclIdx = i;
          li.onSelectExclusion?.(i);
          editMode = "move";
          moveStartF = [xf, yf];
          baseRing = rings[i].map((p) => [p[0], p[1]]);
          editRing = rings[i].map((p) => [p[0], p[1]]);
          editMoved = false;
          canvas.style.cursor = "move";
          draw(ctx, null);
          e.preventDefault();
          return;
        }
      }

      // clicked empty ground: deselect
      if (selectedExclIdx !== -1) {
        selectedExclIdx = -1;
        li.onSelectExclusion?.(-1);
        draw(ctx, null);
      }
    }
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = "grabbing";
  });

  window.addEventListener("mousemove", (e) => {
    if (previewRotating) {
      previewRotationRad += (e.clientX - lastRotClientX) * 0.008;
      lastRotClientX = e.clientX;
      draw(ctx, null);
      return;
    }
    if (editMode && baseRing) {
      const { lx, ly, xf, yf, toX, toY } = eventToFieldM(e);
      if (editMode === "move" && moveStartF) {
        const dx = xf - moveStartF[0];
        const dy = yf - moveStartF[1];
        if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) editMoved = true;
        editRing = baseRing.map(([px, py]) => [px + dx, py + dy]);
      } else if (editMode === "vertex" && editVertexIdx >= 0) {
        editRing = baseRing.map((p) => [p[0], p[1]]);
        editRing[editVertexIdx] = [xf, yf];
        editMoved = true;
      } else if (editMode === "rotate" && rotateCenterF) {
        const angle = Math.atan2(ly - toY(rotateCenterF[1]), lx - toX(rotateCenterF[0]));
        const delta = angle - rotateStartAngle;
        if (Math.abs(delta) > 1e-4) editMoved = true;
        const cosD = Math.cos(delta);
        const sinD = Math.sin(delta);
        const [cxF, cyF] = rotateCenterF;
        editRing = baseRing.map(([px, py]) => {
          const dx = px - cxF;
          const dy = py - cyF;
          return [cxF + dx * cosD - dy * sinD, cyF + dx * sinD + dy * cosD];
        });
      }
      draw(ctx, null);
      return;
    }
    if (!dragging) return;
    panX += e.clientX - lastX;
    panY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    draw(ctx, null);
  });

  window.addEventListener("mouseup", () => {
    if (previewRotating) {
      previewRotating = false;
      canvas.style.cursor = drawObstacleMode || placing ? "crosshair" : "grab";
      return;
    }
    if (editMode) {
      const idx = selectedExclIdx;
      const ringOut = editRing;
      const moved = editMoved;
      editMode = null;
      editRing = null;
      baseRing = null;
      editVertexIdx = -1;
      editMoved = false;
      moveStartF = null;
      rotateCenterF = null;
      canvas.style.cursor = "grab";
      if (moved && idx >= 0 && ringOut && li.onUpdateExclusion) {
        li.onUpdateExclusion(idx, ringOut);
      } else {
        draw(ctx, null);
      }
      return;
    }
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = drawObstacleMode || placing ? "crosshair" : "grab";
  });

  // -- double-click: finish exclusion polygon (same as Site map double-close) or reset zoom
  canvas.addEventListener("dblclick", (e) => {
    if (drawObstacleMode && obstacleDrawKind === "polygon") {
      e.preventDefault();
      if ((li.draftRingM || []).length >= 3) li.onCommitDraftRing?.();
      return;
    }
    if (advancedMode && !placing) {
      const { xf, yf } = eventToFieldM(e);
      const rings = li.exclusionPolygonsM || [];
      if (rings.some((r) => r && r.length >= 3 && pointInPolygon(xf, yf, r))) {
        return; // double-click on an exclusion: keep view, selection handled by mousedown
      }
    }
    zoom = 1;
    panX = 0;
    panY = 0;
    previewRotationRad = 0;
    draw(ctx, null);
  });

  // -- zoom button controls
  container.querySelectorAll(".layout-zoom-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.zoom;
      const cx = logicalW / 2;
      const cy = logicalH / 2;
      if (action === "reset") {
        zoom = 1;
        panX = 0;
        panY = 0;
        previewRotationRad = 0;
      } else {
        const prevZoom = zoom;
        const delta = action === "in" ? 1.4 : 0.7;
        zoom = clamp(zoom * delta, 0.5, 20);
        const ratio = zoom / prevZoom;
        panX = cx - ratio * (cx - panX);
        panY = cy - ratio * (cy - panY);
      }
      draw(ctx, null);
    });
  });

  function readModalDraft(kind) {
    const getVal = (field) => {
      const el = container.querySelector(`[data-modal-field="${field}"]`);
      return el ? el.value : "";
    };
    if (kind === "block") {
      return {
        name: getVal("name").trim() || "Block",
        modulesPerString: Math.max(1, Math.floor(Number(getVal("modulesPerString")) || 1)),
        strings: Math.max(1, Math.floor(Number(getVal("strings")) || 1)),
      };
    }
    const type = getVal("type") || "combiner";
    const typeDef = EQUIPMENT_TYPES[type] || EQUIPMENT_TYPES.combiner;
    return {
      type,
      label: getVal("label").trim() || typeDef.label,
      widthM: Math.max(0.5, Number(getVal("widthM")) || typeDef.widthM),
      depthM: Math.max(0.5, Number(getVal("depthM")) || typeDef.depthM),
    };
  }

  container.querySelectorAll("[data-modal-field]").forEach((input) => {
    const handler = () => {
      if (!blockModal) return;
      let draft = readModalDraft(blockModal.kind);
      if (blockModal.kind === "equipment" && input.dataset.modalField === "type") {
        const typeDef = EQUIPMENT_TYPES[draft.type] || EQUIPMENT_TYPES.combiner;
        draft = {
          ...draft,
          label: typeDef.label,
          widthM: typeDef.widthM,
          depthM: typeDef.depthM,
        };
      }
      li.onModalDraftChange?.(draft);
    };
    input.addEventListener("input", handler);
    input.addEventListener("change", handler);
  });

  container.querySelectorAll("[data-layout-action]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const act = btn.dataset.layoutAction;
      if (act === "toggleAdvanced") li.onToggleAdvanced?.();
      else if (act === "toggleSection") {
        li.onToggleSection?.(ev.currentTarget.dataset.section);
      }
      else if (act === "drawPolygon") li.onStartDrawPolygon?.();
      else if (act === "drawRectangle") li.onStartDrawRectangle?.();
      else if (act === "drawBlockPolygon") li.onStartDrawBlockPolygon?.();
      else if (act === "drawBlockRectangle") li.onStartDrawBlockRectangle?.();
      else if (act === "cancelDraw") li.onCancelDraw?.();
      else if (act === "finishDraw") li.onCommitDraftRing?.();
      else if (act === "deleteLastPoint") li.onUndoDraftPoint?.();
      else if (act === "clearExclusions") li.onClearPolygons?.();
      else if (act === "deleteExclusion") {
        const idx = Number(ev.currentTarget.dataset.exclusionIndex);
        if (Number.isFinite(idx)) li.onDeletePolygon?.(idx);
      } else if (act === "openBlockModal") li.onOpenBlockModal?.();
      else if (act === "openEquipmentModal") li.onOpenEquipmentModal?.();
      else if (act === "closeModal") li.onCloseModal?.();
      else if (act === "confirmBlock") {
        const spec = readModalDraft("block");
        li.onCreateAndPlace?.({ kind: "block", spec });
      } else if (act === "confirmEquipment") {
        const spec = readModalDraft("equipment");
        li.onCreateAndPlace?.({ kind: "equipment", spec });
      } else if (act === "cancelPlacement") li.onCancelPlacement?.();
      else if (act === "clearDesign") li.onClearDesign?.();
      else if (act === "deleteBlock") {
        const idx = Number(ev.currentTarget.dataset.blockIndex);
        if (Number.isFinite(idx)) li.onDeleteBlock?.(idx);
      } else if (act === "deleteEquipment") {
        const idx = Number(ev.currentTarget.dataset.equipmentIndex);
        if (Number.isFinite(idx)) li.onDeleteEquipment?.(idx);
      }
    });
  });

  const onPlacementKeyDown = (e) => {
    if (e.key === "Escape" && placing) {
      li.onCancelPlacement?.();
    }
  };
  window.addEventListener("keydown", onPlacementKeyDown);
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function niceGridStep(maxDim) {
  const steps = [5, 10, 20, 25, 50, 100, 200, 500, 1000];
  const target = maxDim / 6;
  for (const s of steps) {
    if (s >= target) return s;
  }
  return steps[steps.length - 1];
}

function drawTextWithBg(ctx, text, x, y, color, bgColor) {
  const metrics = ctx.measureText(text);
  const tw = metrics.width;
  const th = 13;
  ctx.fillStyle = bgColor;
  ctx.fillRect(x - tw / 2 - 3, y - 2, tw + 6, th + 2);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
}
