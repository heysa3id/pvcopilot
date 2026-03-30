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

function polygonXRangeAtY(vertices, y) {
  if (!vertices || vertices.length < 3) return null;
  let minX = Infinity, maxX = -Infinity;
  let intersections = 0;
  for (let i = 0; i < vertices.length; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % vertices.length];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
      const x = x1 + (y - y1) / (y2 - y1) * (x2 - x1);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      intersections++;
    }
  }
  if (intersections < 2) return null;
  return { minX, maxX };
}

export function renderPseudo3dLayout(container, layout, config, preview = {}) {
  if (!container) {
    return;
  }

  if (!layout || layout.moduleCount <= 0) {
    container.innerHTML = `<p class="muted">Define the field geometry to preview the layout.</p>`;
    return;
  }

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
      const yCtr = yM + collectorProjectionM / 2;
      const range = polygonXRangeAtY(rotatedPolyVerts, yCtr);
      if (!range) continue;
      const avail = (range.maxX - sw) - (range.minX + sw);
      if (avail <= 0) continue;
      let rm;
      if (mPerSeg > 0) {
        const segW = mPerSeg * mStep - moduleGapM;
        const segStep = segW + moduleGapM + rowWidthGapM;
        const nFullSegs = avail >= segW
          ? 1 + Math.max(Math.floor((avail - segW) / segStep), 0)
          : 0;
        const usedW = nFullSegs > 0 ? segW + (nFullSegs - 1) * segStep : 0;
        const remW = avail - usedW;
        const tailMods = nFullSegs > 0 && remW >= rowWidthGapM + moduleSpanInRowM
          ? Math.min(Math.floor((remW - rowWidthGapM + moduleGapM) / mStep), mPerSeg)
          : 0;
        rm = nFullSegs * mPerSeg + tailMods;
      } else {
        rm = Math.floor((avail + moduleGapM) / mStep);
      }
      if (rm > 0) polyActiveRows++;
    }
  }

  const displayRows = (rotatedPolyVerts && rotatedBoundsM) ? polyActiveRows : activeRows;
  const displayModules = layout.moduleCount;

  const stageChips = [
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
        <div class="layout-stage-caption">Top-down layout</div>
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
  canvas.style.cursor = "grab";

  const margin = { top: 44, right: 56, bottom: 44, left: 56 };
  const drawW = logicalW - margin.left - margin.right;
  const drawH = logicalH - margin.top - margin.bottom;
  const baseScale = Math.min(drawW / grossWidthM, drawH / grossDepthM);

  // zoom/pan state
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let cachedBgImage = null;

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

  function draw(ctx, bgImage) {
    if (bgImage) cachedBgImage = bgImage;
    const bg = bgImage || cachedBgImage;
    const { scale, toX, toY } = getTransform();

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

    for (let i = 0; i < maxRows; i++) {
      const yM = rowMinY + i * rowPitchM;
      const rowCenterY = yM + collectorProjectionM / 2;

      // Determine available X range using rotated polygon
      let rowStartX, rowEndX;
      if (rotatedPolyVerts) {
        const range = polygonXRangeAtY(rotatedPolyVerts, rowCenterY);
        if (!range) continue;
        rowStartX = range.minX + sw;
        rowEndX = range.maxX - sw;
      } else {
        rowStartX = sw;
        rowEndX = sw + netWidthM;
      }

      if (rowEndX <= rowStartX) continue;
      const availableWidth = rowEndX - rowStartX;
      const moduleStep = Math.max(moduleSpanInRowM + moduleGapM, 0.001);

      // Compute modules per segment and total modules fitting in available width
      const modulesPerSegment = maxRowWidthM > 0
        ? Math.max(Math.floor((maxRowWidthM + moduleGapM) / moduleStep), 1)
        : 0;

      let rowModules;
      if (modulesPerSegment > 0) {
        const segWidthM = modulesPerSegment * moduleStep - moduleGapM;
        const segStepM = segWidthM + moduleGapM + rowWidthGapM;
        const numFullSegs = availableWidth >= segWidthM
          ? 1 + Math.max(Math.floor((availableWidth - segWidthM) / segStepM), 0)
          : 0;
        const usedW = numFullSegs > 0 ? segWidthM + (numFullSegs - 1) * segStepM : 0;
        const remW = availableWidth - usedW;
        const tailMods = numFullSegs > 0 && remW >= rowWidthGapM + moduleSpanInRowM
          ? Math.min(Math.floor((remW - rowWidthGapM + moduleGapM) / moduleStep), modulesPerSegment)
          : 0;
        rowModules = numFullSegs * modulesPerSegment + tailMods;
      } else {
        rowModules = Math.max(Math.floor((availableWidth + moduleGapM) / moduleStep), 0);
      }
      if (rowModules <= 0) continue;

      const drawRow = Math.min(rowModules, modulesRemaining);
      if (drawRow <= 0) break;

      // Draw segments (capped to layout.moduleCount budget)
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
    ctx.restore(); // remove azimuth rotation and clip

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
    const legendItems = [
      `Tilt ${Number(config.tiltDeg).toFixed(1)}°`,
      `Az ${Number(config.azimuthDeg).toFixed(0)}°`,
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

  // -- disable scroll zoom on layout canvas (use + / - buttons instead)
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
  }, { passive: false });

  // -- pan with mouse drag
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = "grabbing";
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    panX += e.clientX - lastX;
    panY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    draw(ctx, null);
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = "grab";
  });

  // -- double-click to reset zoom
  canvas.addEventListener("dblclick", () => {
    zoom = 1;
    panX = 0;
    panY = 0;
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
