import {
  buildLifetimeSeries,
  computeLayout,
  rectangleMetrics,
  simulateRepresentativeYear,
  winterSolsticeSpacing,
} from "./pv-model.js";
import { renderBarChart, renderLineChart, renderGroupedBarChart, renderDualAxisChart, renderPseudo3dLayout, renderLossDiagram, renderMonthlyTable, renderNormalizedProductionChart, renderMonthlyPrChart } from "./charts.js";
import { buildAndSaveSimulationReport, captureElementAsPng } from "./simulation-report-pdf.js";

const DEFAULT_WEATHER_SUMMARY =
  "Fetch a typical meteorological year directly from PVGIS or historical weather from Open-Meteo ERA5 using the current site coordinates.";

const state = {
  weather: { records: [], meta: { ready: false, issues: [] } },
  layout: null,
  layoutPreview: { imageUrl: "", key: "", error: "" },
  simulation: null,
  lifetime: null,
  map: null,
  drawnLayer: null,
  drawnItems: null,
  marker: null,
  moduleRowsGroup: null,
  polygonAreaM2: null,
};

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "short" });
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});
function byId(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const element = byId(id);
  if (element) {
    element.textContent = text;
  }
}

function round(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatArea(m2) {
  return `${Math.round(m2 || 0).toLocaleString()} m²`;
}

function formatPower(kw, suffix) {
  if (!Number.isFinite(kw)) {
    return `0 ${suffix}`;
  }

  if (kw >= 1000) {
    return `${(kw / 1000).toFixed(2)} MW${suffix}`;
  }

  return `${Math.round(kw).toLocaleString()} kW${suffix}`;
}

function formatEnergy(kwh) {
  if (!Number.isFinite(kwh)) {
    return "0 MWh";
  }

  if (kwh >= 1_000_000) {
    return `${(kwh / 1_000_000).toFixed(2)} GWh`;
  }

  return `${(kwh / 1000).toFixed(1)} MWh`;
}

function formatEnergyMwh(kwh) {
  return Number.isFinite(kwh) ? kwh / 1000 : 0;
}

function emptyWeatherState() {
  return { records: [], meta: { ready: false, issues: [] } };
}

function geodesicPolygonAreaM2(latlngs) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 0; i < latlngs.length; i++) {
    const j = (i + 1) % latlngs.length;
    const [lat1, lng1] = latlngs[i];
    const [lat2, lng2] = latlngs[j];
    total += toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return Math.abs((total * R * R) / 2);
}

function readNumber(id) {
  const value = Number.parseFloat(byId(id).value);
  return Number.isFinite(value) ? value : 0;
}

function readOptionalNumber(id) {
  const raw = byId(id).value.trim();
  if (!raw) {
    return "";
  }

  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : "";
}

function getConfig() {
  return {
    siteName: byId("siteName").value.trim(),
    moduleManufacturer: byId("moduleManufacturer").value.trim(),
    moduleModel: byId("moduleModel").value.trim(),
    inverterManufacturer: byId("inverterManufacturer").value.trim(),
    inverterModel: byId("inverterModel").value.trim(),
    inverterCount: readOptionalNumber("inverterCount"),
    stringsPerInverter: readOptionalNumber("stringsPerInverter"),
    modulesPerString: readOptionalNumber("modulesPerString"),
    siteLat: readNumber("siteLat"),
    siteLng: readNumber("siteLng"),
    azimuthDegSite: readNumber("azimuthDegSite"),
    timezoneOffset: readNumber("timezoneOffset"),
    surfaceAlbedo: readNumber("surfaceAlbedo"),
    manualWidthM: readNumber("manualWidthM"),
    manualHeightM: readNumber("manualHeightM"),
    edgeSetbackM: readNumber("edgeSetbackM"),
    edgeSetbackDepthM: readNumber("edgeSetbackDepthM"),
    modulePowerWp: readNumber("modulePowerWp"),
    manualModuleCount: readOptionalNumber("manualModuleCount"),
    moduleLengthM: readNumber("moduleLengthM"),
    moduleWidthM: readNumber("moduleWidthM"),
    moduleOrientation: byId("moduleOrientation").value,
    tiltDeg: readNumber("tiltDeg"),
    azimuthDeg: readNumber("azimuthDeg"),
    frontClearanceM: readNumber("frontClearanceM"),
    rowSpacingM: readNumber("rowSpacingM"),
    moduleGapM: readNumber("moduleGapM"),
    maxRowWidthM: readNumber("maxRowWidthM"),
    rowWidthGapM: readNumber("rowWidthGapM"),
    targetDcAcRatio: readNumber("targetDcAcRatio"),
    manualAcCapacityKw: readOptionalNumber("manualAcCapacityKw"),
    inverterEfficiencyPct: readNumber("inverterEfficiencyPct"),
    tempCoeffPctPerC: readNumber("tempCoeffPctPerC"),
    ucValue: readNumber("ucValue"),
    uvValue: readNumber("uvValue"),
    soilingLossPct: readNumber("soilingLossPct"),
    iamLossPct: readNumber("iamLossPct"),
    dcWiringLossPct: readNumber("dcWiringLossPct"),
    mismatchLossPct: readNumber("mismatchLossPct"),
    qualityLossPct: readNumber("qualityLossPct"),
    acLossPct: readNumber("acLossPct"),
    availabilityPct: readNumber("availabilityPct"),
    firstYearLidPct: readNumber("firstYearLidPct"),
    annualDegradationPct: readNumber("annualDegradationPct"),
    degradationModel: byId("degradationModel").value,
    weatherProvider: byId("weatherProvider").value,
  };
}

function hydrateWeatherPayload(payload) {
  return {
    ...payload,
    records: (payload.records || []).map((record) => ({
      ...record,
      time: new Date(record.time),
    })),
    meta: {
      ...payload.meta,
      start: payload.meta?.start ? new Date(payload.meta.start) : null,
      end: payload.meta?.end ? new Date(payload.meta.end) : null,
    },
  };
}

function updateWeatherProviderNote() {
  const provider = byId("weatherProvider").value;
  const note = byId("weatherProviderNote");

  if (provider === "openmeteo") {
    note.innerHTML = `
      <span>Open-Meteo ERA5</span>
      <p>
        Free global weather data from ERA5 reanalysis. Returns a historical year
        (not a synthesized TMY). Good alternative when PVGIS does not cover your region.
      </p>
    `;
    return;
  }

  note.innerHTML = `
    <span>PVGIS TMY</span>
    <p>
      Recommended no-key source. The app loads it through the local preview server
      because the official PVGIS API blocks direct browser AJAX requests.
    </p>
  `;
}

function updateSiteSummary(config, layout) {
  const coordinateText = `${config.siteLat.toFixed(4)}, ${config.siteLng.toFixed(4)}`;
  const siteReady = state.drawnLayer || (config.manualWidthM > 0 && config.manualHeightM > 0);

  const displayGrossArea = state.polygonAreaM2 || layout.grossAreaM2;
  setText("grossAreaText", formatArea(displayGrossArea));
  setText("netAreaText", formatArea(state.polygonAreaM2 ? displayGrossArea * (layout.netAreaM2 / layout.grossAreaM2) : layout.netAreaM2));
  setText("siteCoordinateText", coordinateText);
  setText("mapCoordinateText", coordinateText);
  setText("mapSiteName", config.siteName || "Untitled project");
  setText("mapBuildableAreaText", formatArea(state.polygonAreaM2 ? displayGrossArea * (layout.netAreaM2 / layout.grossAreaM2) : layout.netAreaM2));
  setText(
    "mapLayoutText",
    layout.moduleCount > 0
      ? `${layout.moduleCount.toLocaleString()} modules / ${layout.rowCount.toLocaleString()} rows`
      : "Waiting for sizing"
  );

  byId("siteStatus").textContent = siteReady ? "Site geometry ready" : "Waiting for shape";
  byId("siteStatus").className = siteReady ? "status-pill neutral" : "status-pill";
}

function updateLayoutSummary(layout) {
  const summary = byId("layoutSummary");
  summary.innerHTML = `
    <span>${layout.rowCount.toLocaleString()} rows x ${layout.modulesPerRow.toLocaleString()} modules/row</span>
    <strong>${layout.autoModuleCount.toLocaleString()} auto-fit modules</strong>
    <p class="muted">
      Row pitch ${round(layout.rowPitchM, 2)} m. Recommended winter clear spacing
      ${round(layout.winterSpacing.clearSpacingM, 2)} m at solar-noon altitude
      ${round(layout.winterSpacing.noonAltitudeDeg, 1)}°.
      ${layout.usesManualModuleCount ? "Manual module count override is active." : ""}
    </p>
    <p class="muted">
      Ground coverage ratio ${(layout.groundCoverageRatio * 100).toFixed(1)}%.
      Net buildable area ${formatArea(layout.netAreaM2)}.
    </p>
  `;

  // Manual count: empty = auto (placeholder shows auto-fit); non-empty = show capped effective total
  const manualInput = byId("manualModuleCount");
  if (!manualInput.matches(":focus")) {
    manualInput.placeholder = layout.autoModuleCount.toLocaleString();
    if (manualInput.value.trim() === "") {
      manualInput.value = "";
    } else {
      manualInput.value = String(layout.moduleCount);
    }
  }
  manualInput.max = layout.autoModuleCount;
}

function updateLayoutMetrics(layout) {
  setText("installedDcText", formatPower(layout.dcCapacityKw, "dc"));
  setText("installedModuleText", `${layout.moduleCount.toLocaleString()} modules`);
  setText("installedAcText", formatPower(layout.acCapacityKw, "ac"));
  setText("dcAcRatioText", `DC/AC ${layout.dcAcRatio.toFixed(2)}`);
}

function clearLayoutSnapshot() {
  state.layoutPreview = { imageUrl: "", key: "", error: "" };
  if (state.moduleRowsGroup) {
    state.moduleRowsGroup.clearLayers();
  }
}

function normalizeSiteNameField() {
  const el = byId("siteName");
  if (el && el.value.trim() === "Selected PV site") {
    el.value = "";
  }
}

function selectedAreaSnapshotKey() {
  if (!state.map || !state.drawnLayer) {
    return "";
  }

  const bounds = state.drawnLayer.getBounds();
  return [
    bounds.getSouth().toFixed(5),
    bounds.getWest().toFixed(5),
    bounds.getNorth().toFixed(5),
    bounds.getEast().toFixed(5),
    state.map.getZoom(),
  ].join("|");
}

function captureLayoutSnapshot(force = false) {
  if (!state.map || !state.drawnLayer) {
    clearLayoutSnapshot();
    renderLayoutPreview(getConfig());
    return;
  }

  const mapCanvas = byId("mapCanvas");
  const mapRect = mapCanvas.getBoundingClientRect();
  if (mapRect.width < 20 || mapRect.height < 20) {
    state.layoutPreview = {
      ...state.layoutPreview,
      error: "Open the Site tab to refresh the selected-area screenshot.",
    };
    renderLayoutPreview(getConfig());
    return;
  }

  const snapshotKey = selectedAreaSnapshotKey();
  if (!force && state.layoutPreview.key === snapshotKey && state.layoutPreview.imageUrl) {
    return;
  }

  const tileImages = [...mapCanvas.querySelectorAll(".leaflet-tile-loaded")].filter(
    (image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
  );

  if (!tileImages.length) {
    state.layoutPreview = {
      imageUrl: "",
      key: snapshotKey,
      error: "Map tiles are still loading for the selected area.",
    };
    renderLayoutPreview(getConfig());
    return;
  }

  try {
    const renderWidth = Math.max(Math.round(mapRect.width), 1);
    const renderHeight = Math.max(Math.round(mapRect.height), 1);
    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = renderWidth;
    baseCanvas.height = renderHeight;
    const context = baseCanvas.getContext("2d");
    context.fillStyle = "#e5e7eb";
    context.fillRect(0, 0, renderWidth, renderHeight);

    for (const tileImage of tileImages) {
      const tileRect = tileImage.getBoundingClientRect();
      const x = tileRect.left - mapRect.left;
      const y = tileRect.top - mapRect.top;
      context.drawImage(tileImage, x, y, tileRect.width, tileRect.height);
    }

    const bounds = state.drawnLayer.getBounds();
    const northWest = state.map.latLngToContainerPoint(bounds.getNorthWest());
    const southEast = state.map.latLngToContainerPoint(bounds.getSouthEast());
    const paddingPx = 24;
    const cropX = clamp(
      Math.floor(Math.min(northWest.x, southEast.x) - paddingPx),
      0,
      renderWidth - 1
    );
    const cropY = clamp(
      Math.floor(Math.min(northWest.y, southEast.y) - paddingPx),
      0,
      renderHeight - 1
    );
    const cropWidth = Math.max(
      1,
      Math.min(
        Math.ceil(Math.abs(southEast.x - northWest.x) + paddingPx * 2),
        renderWidth - cropX
      )
    );
    const cropHeight = Math.max(
      1,
      Math.min(
        Math.ceil(Math.abs(southEast.y - northWest.y) + paddingPx * 2),
        renderHeight - cropY
      )
    );

    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = cropWidth;
    croppedCanvas.height = cropHeight;
    const croppedContext = croppedCanvas.getContext("2d");
    croppedContext.drawImage(
      baseCanvas,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );

    state.layoutPreview = {
      imageUrl: croppedCanvas.toDataURL("image/jpeg", 0.88),
      key: snapshotKey,
      error: "",
    };
  } catch (error) {
    state.layoutPreview = {
      imageUrl: "",
      key: snapshotKey,
      error: "Selected-area screenshot could not be captured in this browser.",
    };
  }

  renderLayoutPreview(getConfig());
}

function updateWeatherStatus() {
  const status = byId("weatherStatus");
  const meta = state.weather.meta;

  if (!meta.ready) {
    status.textContent = "No weather loaded";
    status.className = "status-pill warn";
    setText("weatherModeText", "Awaiting API fetch");
    byId("weatherMeta").innerHTML = `
      <span>Weather API ready</span>
      <p>Select a provider and fetch a typical meteorological year for the current site.</p>
    `;
    return;
  }

  const label = state.weather.source?.label || "Weather loaded";
  status.textContent = label;
  status.className = "status-pill neutral";
  setText("weatherModeText", label);
  byId("weatherMeta").innerHTML = `
    <span>${label}</span>
    <strong>${meta.start ? dateFormatter.format(meta.start) : "?"} to ${
      meta.end ? dateFormatter.format(meta.end) : "?"
    }</strong>
    <p class="muted">
      ${meta.rowCount.toLocaleString()} hourly rows. Coverage ${round(meta.coverageDays, 1)} days.
      Annualization factor ${round(meta.annualizationFactor, 2)}x.
    </p>
    <p class="muted">${(meta.issues || []).join(" ")}</p>
  `;
}

function monthIndexFor(date, meta = {}) {
  return meta.timestampsUtc ? date.getUTCMonth() : date.getMonth();
}

function renderWeatherPreview() {
  const irradianceChart = byId("weatherIrradianceChart");
  const climateChart = byId("weatherClimateChart");
  const windChart = byId("weatherWindChart");
  const pressureChart = byId("weatherPressureChart");
  const summary = byId("weatherPreviewSummary");

  if (!state.weather.meta.ready) {
    renderGroupedBarChart(irradianceChart, {});
    renderDualAxisChart(climateChart, {});
    renderLineChart(windChart, {});
    renderLineChart(pressureChart, {});
    summary.innerHTML = `
      <article>
        <h3>Weather source</h3>
        <p>Choose PVGIS or Open-Meteo and fetch weather data to preview monthly irradiance and climate trends.</p>
      </article>
      <article>
        <h3>Irradiance preview</h3>
        <p>Monthly GHI, DNI, and DHI will appear here once the dataset is loaded.</p>
      </article>
      <article>
        <h3>Climate preview</h3>
        <p>Monthly average ambient temperature and wind speed will be summarized here when available.</p>
      </article>
    `;
    return;
  }

  const labels = Array.from({ length: 12 }, (_, monthIndex) =>
    monthFormatter.format(new Date(2024, monthIndex, 1))
  );
  const monthly = Array.from({ length: 12 }, () => ({
    ghi: 0,
    dni: 0,
    dhi: 0,
    tempSum: 0,
    tempCount: 0,
    windSum: 0,
    windCount: 0,
    rhSum: 0,
    rhCount: 0,
    pressureSum: 0,
    pressureCount: 0,
  }));
  const timestepHours = state.weather.meta.timestepHours || 1;

  for (const record of state.weather.records) {
    const monthIndex = monthIndexFor(record.time, state.weather.meta);
    monthly[monthIndex].ghi += (record.ghi || 0) * timestepHours / 1000;
    monthly[monthIndex].dni += (record.dni || 0) * timestepHours / 1000;
    monthly[monthIndex].dhi += (record.dhi || 0) * timestepHours / 1000;
    if (Number.isFinite(record.temp)) {
      monthly[monthIndex].tempSum += record.temp;
      monthly[monthIndex].tempCount += 1;
    }
    if (Number.isFinite(record.wind)) {
      monthly[monthIndex].windSum += record.wind;
      monthly[monthIndex].windCount += 1;
    }
    if (Number.isFinite(record.rh)) {
      monthly[monthIndex].rhSum += record.rh;
      monthly[monthIndex].rhCount += 1;
    }
    if (Number.isFinite(record.pressure)) {
      monthly[monthIndex].pressureSum += record.pressure;
      monthly[monthIndex].pressureCount += 1;
    }
  }

  renderGroupedBarChart(irradianceChart, {
    labels,
    series: [
      {
        label: "GHI",
        color: "#f5a400",
        values: monthly.map((item) => item.ghi),
      },
      {
        label: "DNI",
        color: "#0f172a",
        values: monthly.map((item) => item.dni),
      },
      {
        label: "DHI",
        color: "#64748b",
        values: monthly.map((item) => item.dhi),
      },
    ],
  });

  renderDualAxisChart(climateChart, {
    labels,
    left: {
      label: "Temp (°C)",
      color: "#ef4444",
      unit: "°C",
      values: monthly.map((item) =>
        item.tempCount ? item.tempSum / item.tempCount : 0
      ),
    },
    right: {
      label: "RH (%)",
      color: "#3b82f6",
      unit: "%",
      values: monthly.map((item) =>
        item.rhCount ? item.rhSum / item.rhCount : 0
      ),
    },
  });

  renderLineChart(windChart, {
    labels,
    series: [
      {
        label: "Wind (m/s)",
        color: "#3b82f6",
        values: monthly.map((item) =>
          item.windCount ? item.windSum / item.windCount : 0
        ),
      },
    ],
  });

  renderLineChart(pressureChart, {
    labels,
    series: [
      {
        label: "Pressure (hPa)",
        color: "#8b5cf6",
        values: monthly.map((item) =>
          item.pressureCount ? item.pressureSum / item.pressureCount : 0
        ),
      },
    ],
  });

  const annualGhi = monthly.reduce((sum, item) => sum + item.ghi, 0);
  const annualDni = monthly.reduce((sum, item) => sum + item.dni, 0);
  const annualDhi = monthly.reduce((sum, item) => sum + item.dhi, 0);

  summary.innerHTML = `
    <article>
      <h3>Dataset</h3>
      <p>${state.weather.source?.label || "Weather source"} with ${state.weather.meta.rowCount.toLocaleString()} hourly points from ${
        state.weather.meta.start ? dateFormatter.format(state.weather.meta.start) : "?"
      } to ${state.weather.meta.end ? dateFormatter.format(state.weather.meta.end) : "?"}.</p>
    </article>
    <article>
      <h3>Irradiance totals</h3>
      <p>Annual GHI ${Math.round(annualGhi).toLocaleString()} kWh/m², DNI ${Math.round(
        annualDni
      ).toLocaleString()} kWh/m², DHI ${Math.round(annualDhi).toLocaleString()} kWh/m².</p>
    </article>
    <article>
      <h3>Climate note</h3>
      <p>${(state.weather.meta.issues || []).join(" ")}</p>
    </article>
  `;
}

function renderLayoutPreview(config) {
  const view = byId("layoutPerspectiveView");
  const summary = byId("layoutPerspectiveSummary");

  renderPseudo3dLayout(view, state.layout, config, state.layoutPreview);

  if (!state.layout || state.layout.moduleCount <= 0) {
    summary.innerHTML = `
      <article>
        <h3>Geometry</h3>
        <p>Set the field dimensions and module assumptions to generate the pseudo-isometric layout preview.</p>
      </article>
      <article>
        <h3>Spacing</h3>
        <p>Row pitch, tilt, and azimuth will be summarized here after sizing.</p>
      </article>
      <article>
        <h3>Capacity</h3>
        <p>Installed module count and DC/AC sizing will appear here once the field fits are computed.</p>
      </article>
    `;
    return;
  }

  const filledRows =
    state.layout.modulesPerRow > 0
      ? Math.ceil(
          Math.min(
            state.layout.moduleCount,
            state.layout.autoModuleCount || state.layout.moduleCount
          ) / state.layout.modulesPerRow
        )
      : 0;
  const overflowModules = Math.max(
    state.layout.moduleCount - (state.layout.autoModuleCount || state.layout.moduleCount),
    0
  );
  const mapBaseText = state.layoutPreview.imageUrl
    ? "Using a cropped screenshot of the selected map rectangle as the layout scene."
    : state.drawnLayer
      ? state.layoutPreview.error ||
        "Using a generated plane until the selected-area screenshot refreshes."
      : "Draw a rectangle in the Site tab to use the selected map area as the preview base.";

  summary.innerHTML = `
    <article>
      <h3>Map base</h3>
      <p>${mapBaseText}</p>
    </article>
    <article>
      <h3>Field geometry</h3>
      <p>${filledRows.toLocaleString()} active rows with up to ${state.layout.modulesPerRow.toLocaleString()} modules per row. Ground coverage ratio ${(state.layout.groundCoverageRatio * 100).toFixed(1)}% and row pitch ${state.layout.rowPitchM.toFixed(2)} m.</p>
    </article>
    <article>
      <h3>Installed capacity</h3>
      <p>${state.layout.moduleCount.toLocaleString()} modules for ${formatPower(
        state.layout.dcCapacityKw,
        "dc"
      )} and ${formatPower(state.layout.acCapacityKw, "ac")}.${overflowModules > 0 ? ` Manual module count exceeds the auto-fit by ${overflowModules.toLocaleString()} modules.` : ""}</p>
    </article>
  `;
}

function setSimulationPlaceholders() {
  setText("yearOneEnergyText", "Waiting for weather");
  setText("specificYieldText", "Fetch data to compute yield");
  setText("lifetimeEnergyText", "Run 25-year model");
  setText("lastYearText", "Year 25 unavailable");
  setText("stripSpecificYield", "—");
  setText("stripSpecificYieldSub", "Run simulation");
  setText("stripAvgPr", "—");
  setText("stripAvgPrSub", "Annual (net yield / POA)");
  setText("stripLosses", "—");
  setText("stripLossesSub", "vs array nominal");
  setText("stripYoyDegradation", "—");
  setText("stripYoyDegradationSub", "Model inputs");
  byId("simulationStatus").textContent = "Load weather and run the model";
  byId("simulationStatus").className = "status-pill warn";
  setText("degradationSummary", "Waiting for simulation");
  renderBarChart(byId("monthlyChart"), []);
  renderBarChart(byId("lifetimeChart"), []);
  byId("simulationNotes").innerHTML = `
    <article>
      <h3>Weather readiness</h3>
      <p>Fetch weather data from PVGIS or Open-Meteo to unlock the performance model.</p>
    </article>
    <article>
      <h3>Layout basis</h3>
      <p>The selected rectangle drives buildable area, row count, and installed capacity based on your manual geometry assumptions.</p>
    </article>
    <article>
      <h3>Lifetime basis</h3>
      <p>The 25-year forecast replays the fetched typical year and then applies the selected degradation curve.</p>
    </article>
  `;
}

function updateSimulationOutputs(layout, simulation, lifetime, config) {
  const yearOne = lifetime[0];
  const finalYear = lifetime[lifetime.length - 1];
  const totalLifetimeKwh = lifetime.reduce((total, item) => total + item.energyKwh, 0);
  const yearOneSpecificYield = layout.dcCapacityKw > 0 ? yearOne.energyKwh / layout.dcCapacityKw : 0;

  setText("yearOneEnergyText", formatEnergy(yearOne.energyKwh));
  setText("specificYieldText", `${Math.round(yearOneSpecificYield).toLocaleString()} kWh/kWp`);
  setText("lifetimeEnergyText", formatEnergy(totalLifetimeKwh));
  setText("lastYearText", `Year 25: ${formatEnergy(finalYear.energyKwh)}`);

  setText("introYearOneEnergy", `Year-1 = ${formatEnergy(yearOne.energyKwh)}`);
  setText("introCapacity", `Capacity = ${formatPower(layout.dcCapacityKw, "dc")}`);
  setText("introSpecificYield", `Specific yield = ${Math.round(yearOneSpecificYield).toLocaleString()} kWh/kWp`);
  setText("introLifetime", `25-year = ${formatEnergy(totalLifetimeKwh)}`);

  byId("simulationStatus").textContent = "Simulation complete";
  byId("simulationStatus").className = "status-pill neutral";
  setText(
    "degradationSummary",
    `${config.degradationModel} degradation with ${round(
      config.annualDegradationPct,
      2
    )}%/yr after ${round(config.firstYearLidPct, 2)}% LID`
  );

  setText(
    "stripSpecificYield",
    `${Math.round(yearOneSpecificYield).toLocaleString()} kWh/kWp`
  );
  setText("stripSpecificYieldSub", "Year-1 net / DC kWp");
  setText("stripAvgPr", `${round(simulation.performanceRatio, 1)}%`);
  setText("stripAvgPrSub", "Annual (net yield / POA)");
  const lossNominal = simulation.losses?.nominalEnergy ?? 0;
  const lossNet = simulation.losses?.netEnergy ?? 0;
  const lossPct = lossNominal > 0 ? (1 - lossNet / lossNominal) * 100 : 0;
  setText("stripLosses", `${round(lossPct, 1)}%`);
  setText("stripLossesSub", `Net ${formatEnergy(lossNet)} vs nominal`);
  setText("stripYoyDegradation", `${round(config.annualDegradationPct, 2)}%/yr`);
  setText(
    "stripYoyDegradationSub",
    `${config.degradationModel} after ${round(config.firstYearLidPct, 2)}% LID`
  );

  const monthlyChartData = simulation.monthlyEnergyKwh
    .map((value, monthIndex) => ({
      label: monthFormatter.format(new Date(2024, monthIndex, 1)),
      value: formatEnergyMwh(value),
    }))
    .filter((item) => item.value > 0);

  const lifetimeChartData = lifetime.map((item) => ({
    label: `Y${item.year}`,
    value: formatEnergyMwh(item.energyKwh),
  }));

  renderBarChart(byId("monthlyChart"), monthlyChartData, { unit: "MWh" });
  renderBarChart(byId("lifetimeChart"), lifetimeChartData, { unit: "MWh", warm: true });
  renderNormalizedProductionChart(byId("normalizedProductionChart"), simulation, layout);
  renderMonthlyPrChart(byId("monthlyPrChart"), simulation, layout);
  renderLossDiagram(byId("lossDiagram"), simulation.losses);
  renderMonthlyTable(byId("monthlyResultsTable"), simulation, layout);

  const sourceMix =
    simulation.transposedCount > 0
      ? `${simulation.transposedCount.toLocaleString()} transposed points`
      : `${simulation.importedPoaCount.toLocaleString()} imported POA points`;

  const zeroMonths = simulation.monthlyEnergyKwh.filter(v => v === 0).length;
  const coverageWarning = zeroMonths > 4
    ? `<article><h3>⚠ Partial coverage</h3><p>${zeroMonths} months show zero energy. This usually means the cached weather data has stale timestamps. Go to the Weather tab and re-fetch weather data to fix this.</p></article>`
    : "";

  const moduleSpec = config.moduleManufacturer || config.moduleModel
    ? `${config.moduleManufacturer || "—"} ${config.moduleModel || "—"} (${config.modulePowerWp} Wp)`
    : `${config.modulePowerWp} Wp module`;
  const inverterSpec = config.inverterManufacturer || config.inverterModel
    ? `${config.inverterManufacturer || "—"} ${config.inverterModel || "—"}`
    : "Inverter";
  const stringInfo = config.modulesPerString && config.stringsPerInverter
    ? ` String config: ${config.modulesPerString} modules/string × ${config.stringsPerInverter} strings/inverter.`
    : "";

  byId("simulationNotes").innerHTML = `${coverageWarning}
    <article>
      <h3>Equipment</h3>
      <p>${moduleSpec}. ${inverterSpec} at ${round(config.inverterEfficiencyPct, 1)}% efficiency.${stringInfo}</p>
    </article>
    <article>
      <h3>Weather and POA</h3>
      <p>${state.weather.source?.label || "Weather source"} loaded through the local proxy. ${sourceMix}. ${(simulation.meta.issues || []).join(" ")}</p>
    </article>
    <article>
      <h3>Performance KPIs</h3>
      <p>Specific yield ${Math.round(simulation.specificYield).toLocaleString()} kWh/kWp, performance ratio ${round(
        simulation.performanceRatio,
        1
      )}%, capacity factor ${round(simulation.capacityFactor, 1)}%, clipping loss ${formatEnergy(
        simulation.clippingLossKwh
      )}.</p>
    </article>
    <article>
      <h3>Thermal and degradation</h3>
      <p>Peak modeled cell temperature ${round(simulation.maxCellTemp, 1)}°C using Uc=${round(
        config.ucValue,
        1
      )} and Uv=${round(config.uvValue, 1)}. Year 25 reaches ${formatEnergy(finalYear.energyKwh)}.</p>
    </article>
  `;
}

function refreshLayout() {
  const config = getConfig();
  state.layout = computeLayout(config, config);

  // Attach polygon vertices in meters (relative to bounding box origin) if a polygon is drawn
  if (state.drawnLayer && typeof state.drawnLayer.getLatLngs === "function") {
    const ring = state.drawnLayer.getLatLngs()[0];
    if (ring && ring.length > 2) {
      const bounds = state.drawnLayer.getBounds();
      const sw = bounds.getSouthWest();
      const grossW = Number(config.manualWidthM) || 1;
      const grossD = Number(config.manualHeightM) || 1;
      const bboxW = haversineDistanceMeters({ lat: sw.lat, lng: bounds.getWest() }, { lat: sw.lat, lng: bounds.getEast() });
      const bboxD = haversineDistanceMeters({ lat: bounds.getSouth(), lng: sw.lng }, { lat: bounds.getNorth(), lng: sw.lng });
      state.layout.polygonVerticesM = ring.map((ll) => {
        const xFrac = bboxW > 0 ? haversineDistanceMeters({ lat: sw.lat, lng: sw.lng }, { lat: sw.lat, lng: ll.lng }) / bboxW : 0;
        const yFrac = bboxD > 0 ? haversineDistanceMeters({ lat: sw.lat, lng: sw.lng }, { lat: ll.lat, lng: sw.lng }) / bboxD : 0;
        return [xFrac * grossW, (1 - yFrac) * grossD];
      });
    }
  }

  // Compute rotated polygon in row-aligned space and correct module count for azimuth
  {
    const azimuthDeg = Number(config.azimuthDeg) || 180;
    const grossW = Number(config.manualWidthM) || 1;
    const grossD = Number(config.manualHeightM) || 1;
    const cx = grossW / 2, cy = grossD / 2;
    const rRad = -(azimuthDeg - 180) * Math.PI / 180;
    const cosR = Math.cos(rRad), sinR = Math.sin(rRad);

    // Base polygon: drawn shape or rectangle corners
    const baseVerts = state.layout.polygonVerticesM ||
      [[0, 0], [grossW, 0], [grossW, grossD], [0, grossD]];

    // Rotate into row-aligned space (rows always run along X)
    const rotVerts = baseVerts.map(([x, y]) => {
      const dx = x - cx, dy = y - cy;
      return [cx + dx * cosR - dy * sinR, cy + dx * sinR + dy * cosR];
    });
    state.layout.rotatedPolygonVerticesM = rotVerts;

    const xs = rotVerts.map(([x]) => x);
    const ys = rotVerts.map(([, y]) => y);
    state.layout.rotatedBoundsM = {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys),
    };

    // Recompute module count from rotated polygon so modules never exceed site boundary
    const sw = Number(config.edgeSetbackM) || 0;
    const sd = Number(config.edgeSetbackDepthM) || 0;
    const rowPitchM = state.layout.rowPitchM;
    const collectorProjectionM = state.layout.winterSpacing?.collectorProjectionM || rowPitchM * 0.5;
    const moduleSpanInRowM = state.layout.moduleSpanInRowM || 1;
    const moduleGapM = Number(config.moduleGapM) || 0.03;
    const maxRowWidthM = Number(config.maxRowWidthM) || 0;
    const rowWidthGapM = Number(config.rowWidthGapM) || 0;
    const moduleStep = Math.max(moduleSpanInRowM + moduleGapM, 0.001);
    const mPerSeg = maxRowWidthM > 0
      ? Math.max(Math.floor((maxRowWidthM + moduleGapM) / moduleStep), 1) : 0;
    const { minY, maxY } = state.layout.rotatedBoundsM;
    const innerMinY = minY + sd;
    const innerMaxY = maxY - sd;
    const maxRows =
      innerMaxY <= innerMinY
        ? 0
        : Math.max(
            Math.floor(
              (innerMaxY - innerMinY + (Number(config.rowSpacingM) || 0)) / Math.max(rowPitchM, 0.001)
            ),
            0
          );

    let autoCount = 0;
    for (let i = 0; i < maxRows; i++) {
      const yM = innerMinY + i * rowPitchM;
      const yCtr = yM + collectorProjectionM / 2;
      const range = polyXRangeAtY(rotVerts, yCtr);
      if (!range) continue;
      const avail = Math.max((range.maxX - sw) - (range.minX + sw), 0);
      if (avail <= 0) continue;
      let rm;
      if (mPerSeg > 0) {
        const segW = mPerSeg * moduleStep - moduleGapM;
        const segStep = segW + moduleGapM + rowWidthGapM;
        const nFull = avail >= segW ? 1 + Math.max(Math.floor((avail - segW) / segStep), 0) : 0;
        const usedW = nFull > 0 ? segW + (nFull - 1) * segStep : 0;
        const remW = avail - usedW;
        const tail = nFull > 0 && remW >= rowWidthGapM + moduleSpanInRowM
          ? Math.min(Math.floor((remW - rowWidthGapM + moduleGapM) / moduleStep), mPerSeg) : 0;
        rm = nFull * mPerSeg + tail;
      } else {
        rm = Math.max(Math.floor((avail + moduleGapM) / moduleStep), 0);
      }
      autoCount += rm;
    }

    const manualCount = Number(config.manualModuleCount);
    const moduleCount = Number.isFinite(manualCount) && manualCount > 0
      ? Math.min(Math.floor(manualCount), autoCount) : autoCount;
    state.layout.autoModuleCount = autoCount;
    state.layout.moduleCount = moduleCount;
    state.layout.dcCapacityKw = (moduleCount * Number(config.modulePowerWp)) / 1000;
    const targetRatio = Math.max(Number(config.targetDcAcRatio) || 1.2, 0.1);
    const manualAcKw = Number(config.manualAcCapacityKw);
    state.layout.acCapacityKw = Number.isFinite(manualAcKw) && manualAcKw > 0
      ? manualAcKw : state.layout.dcCapacityKw / targetRatio;
    state.layout.dcAcRatio = state.layout.acCapacityKw > 0
      ? state.layout.dcCapacityKw / state.layout.acCapacityKw : 0;
  }

  updateSiteSummary(config, state.layout);
  updateLayoutSummary(state.layout);
  updateLayoutMetrics(state.layout);
  renderLayoutPreview(config);
  renderModuleRowsOnMap();
}

function polyXRangeAtY(vertices, y) {
  let minX = Infinity, maxX = -Infinity, hits = 0;
  for (let i = 0; i < vertices.length; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % vertices.length];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
      const x = x1 + (y - y1) / (y2 - y1) * (x2 - x1);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      hits++;
    }
  }
  return hits >= 2 ? { minX, maxX } : null;
}

function renderModuleRowsOnMap() {
  if (!state.map || !state.drawnLayer || !state.layout) return;

  if (state.moduleRowsGroup) {
    state.moduleRowsGroup.clearLayers();
  } else {
    state.moduleRowsGroup = new L.FeatureGroup().addTo(state.map);
  }

  const layout = state.layout;
  if (layout.moduleCount <= 0) return;

  const bounds = state.drawnLayer.getBounds();
  const north = bounds.getNorth();
  const south = bounds.getSouth();
  const west = bounds.getWest();
  const east = bounds.getEast();

  const config = getConfig();
  const grossWidthM = Number(config.manualWidthM) || 1;
  const grossDepthM = Number(config.manualHeightM) || 1;
  const sw = Number(config.edgeSetbackM) || 0;
  const sd = Number(config.edgeSetbackDepthM) || 0;
  const rowPitchM = layout.rowPitchM || 1;
  const collectorProjectionM = layout.winterSpacing?.collectorProjectionM || rowPitchM * 0.5;
  const moduleSpanInRowM = layout.moduleSpanInRowM || 1;
  const moduleGapM = Number(config.moduleGapM) || 0.03;
  const maxRowWidthM = Number(config.maxRowWidthM) || 0;
  const rowWidthGapM = Number(config.rowWidthGapM) || 0;
  const polyVerts = layout.rotatedPolygonVerticesM || null;
  const rotatedBounds = layout.rotatedBoundsM || null;

  // Convert meters to lat/lng offsets
  const latPerM = (north - south) / grossDepthM;
  const lngPerM = (east - west) / grossWidthM;

  // Rotation based on azimuth (azimuth=180 → no rotation, rows run E-W)
  const azimuthRad = ((Number(config.azimuthDeg) || 180) - 180) * Math.PI / 180;
  const cosA = Math.cos(azimuthRad);
  const sinA = Math.sin(azimuthRad);
  const fieldCX = grossWidthM / 2;
  const fieldCY = grossDepthM / 2;
  function rotLatLng(xM, yM) {
    const dx = xM - fieldCX, dy = yM - fieldCY;
    return [
      north - (fieldCY + dx * sinA + dy * cosA) * latPerM,
      west  + (fieldCX + dx * cosA - dy * sinA) * lngPerM
    ];
  }

  const rowMinY = rotatedBounds ? rotatedBounds.minY + sd : sd;
  const rowMaxY = rotatedBounds ? rotatedBounds.maxY - sd : sd + layout.netDepthM;
  const maxRows =
    rowMaxY <= rowMinY
      ? 0
      : Math.max(
          Math.floor(
            (rowMaxY - rowMinY + (Number(config.rowSpacingM) || 0)) / Math.max(rowPitchM, 0.001)
          ),
          0
        );

  const rowStyle = {
    color: "rgba(30, 58, 95, 0.9)",
    weight: 0.5,
    fillColor: "#1e3a5f",
    fillOpacity: 0.55,
  };

  let modulesRemaining = layout.moduleCount;

  for (let i = 0; i < maxRows; i++) {
    const yM = rowMinY + i * rowPitchM;
    const rowCenterY = yM + collectorProjectionM / 2;

    let rowStartX, rowEndX;
    if (polyVerts) {
      const range = polyXRangeAtY(polyVerts, rowCenterY);
      if (!range) continue;
      rowStartX = range.minX + sw;
      rowEndX = range.maxX - sw;
    } else {
      rowStartX = sw;
      rowEndX = sw + layout.netWidthM;
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

    // Draw segments (capped to manual / effective module budget)
    let remaining = drawRow;
    let segX = rowStartX;
    while (remaining > 0) {
      const segModules = modulesPerSegment > 0 ? Math.min(remaining, modulesPerSegment) : remaining;
      const segWidthM = segModules * moduleStep - moduleGapM;
      const segRect = L.polygon([
        rotLatLng(segX,             yM),
        rotLatLng(segX + segWidthM, yM),
        rotLatLng(segX + segWidthM, yM + collectorProjectionM),
        rotLatLng(segX,             yM + collectorProjectionM),
      ], rowStyle);
      state.moduleRowsGroup.addLayer(segRect);
      remaining -= segModules;
      segX += segWidthM + moduleGapM + rowWidthGapM;
    }
    modulesRemaining -= drawRow;
    if (modulesRemaining <= 0) break;
  }
}

function setActivePanel(targetId) {
  for (const panel of document.querySelectorAll(".control-section")) {
    panel.classList.toggle("is-active", panel.id === targetId);
  }

  for (const trigger of document.querySelectorAll("[data-panel-target]")) {
    trigger.classList.toggle("is-active", trigger.dataset.panelTarget === targetId);
  }

  for (const stage of document.querySelectorAll(".stage-view")) {
    stage.classList.toggle("is-active", stage.dataset.stageFor === targetId);
  }

  if (targetId === "sitePanel" && state.map) {
    window.setTimeout(() => {
      state.map.invalidateSize();
      if (state.drawnLayer) {
        captureLayoutSnapshot(true);
      }
    }, 30);
  }
}

async function fetchWeatherFromApi() {
  const config = getConfig();
  const button = byId("fetchWeather");
  button.disabled = true;
  byId("weatherSummary").textContent = `Fetching ${
    config.weatherProvider === "openmeteo" ? "Open-Meteo" : "PVGIS"
  } weather for ${config.siteLat.toFixed(4)}, ${config.siteLng.toFixed(4)}...`;

  try {
    const response = await fetch(
      `/api/weather?provider=${encodeURIComponent(config.weatherProvider)}&lat=${encodeURIComponent(
        config.siteLat
      )}&lon=${encodeURIComponent(config.siteLng)}`
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const msg =
        payload && typeof payload === "object" && payload.error
          ? payload.error
          : `Weather request failed with HTTP ${response.status}`;
      throw new Error(msg);
    }
    if (!payload || typeof payload !== "object") {
      throw new Error(
        "Invalid weather response from server. If you use the main Vite dev server, run `npm run dev` so the PV estimator API runs on port 4173, or start it with: node public/pv-estimator-app/server.js"
      );
    }
    if (!payload.meta || typeof payload.meta.ready !== "boolean") {
      throw new Error(
        "Weather API returned an unexpected payload (missing meta). Check that /api requests are proxied to the PV estimator Node server."
      );
    }
    if (!payload.meta.ready) {
      throw new Error(
        payload.error ||
          (Array.isArray(payload.meta.issues) ? payload.meta.issues.join(" ") : "") ||
          "Weather fetch returned no hourly data for this site."
      );
    }

    state.weather = hydrateWeatherPayload(payload);
    byId("weatherSummary").textContent =
      payload.source?.note || "Weather source loaded successfully.";
    updateWeatherStatus();
    renderWeatherPreview();
    runSimulation();
  } catch (error) {
    state.weather = emptyWeatherState();
    updateWeatherStatus();
    byId("weatherSummary").textContent = error.message;
    renderWeatherPreview();
    setSimulationPlaceholders();
  } finally {
    button.disabled = false;
  }
}

function haversineDistanceMeters(pointA, pointB) {
  const earthRadiusM = 6371000;
  const lat1 = (pointA.lat * Math.PI) / 180;
  const lat2 = (pointB.lat * Math.PI) / 180;
  const deltaLat = lat2 - lat1;
  const deltaLng = ((pointB.lng - pointA.lng) * Math.PI) / 180;
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function applyDrawnShape(layer) {
  const bounds = layer.getBounds();
  const north = bounds.getNorth();
  const south = bounds.getSouth();
  const east = bounds.getEast();
  const west = bounds.getWest();
  const center = bounds.getCenter();
  const widthM = haversineDistanceMeters(
    { lat: center.lat, lng: west },
    { lat: center.lat, lng: east }
  );
  const depthM = haversineDistanceMeters(
    { lat: north, lng: center.lng },
    { lat: south, lng: center.lng }
  );

  byId("siteLat").value = center.lat.toFixed(4);
  byId("siteLng").value = center.lng.toFixed(4);
  byId("manualWidthM").value = widthM.toFixed(1);
  byId("manualHeightM").value = depthM.toFixed(1);

  if (typeof layer.getLatLngs === "function") {
    const ring = layer.getLatLngs()[0];
    if (ring && ring.length > 2) {
      const polyArea = geodesicPolygonAreaM2(ring.map((ll) => [ll.lat, ll.lng]));
      state.polygonAreaM2 = polyArea;
    } else {
      state.polygonAreaM2 = null;
    }
  } else {
    state.polygonAreaM2 = null;
  }

  refreshAll();
}

function initMap() {
  const mapCanvas = byId("mapCanvas");

  if (!window.L) {
    mapCanvas.innerHTML = `
      <div class="info-box">
        <span>Map library unavailable</span>
        <strong>Use the manual latitude, longitude, width, and depth fields instead.</strong>
      </div>
    `;
    return;
  }

  const initialLat = readNumber("siteLat");
  const initialLng = readNumber("siteLng");
  state.map = L.map(mapCanvas, { zoomControl: true }).setView([initialLat, initialLng], 17);
  const baseLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
    crossOrigin: "anonymous",
  }).addTo(state.map);

  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    pane: "overlayPane",
  }).addTo(state.map);

  const searchControl = L.control({ position: "topright" });
  searchControl.onAdd = function () {
    const container = L.DomUtil.create("div", "map-search-box");
    container.innerHTML = `<input type="text" class="map-search-input" placeholder="Search city or address..." />`;
    const input = container.querySelector("input");
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    let debounceTimer = null;
    const resultsDiv = L.DomUtil.create("div", "map-search-results", container);

    function clearResults() {
      resultsDiv.innerHTML = "";
      resultsDiv.style.display = "none";
    }

    async function doSearch(query) {
      if (query.length < 2) { clearResults(); return; }
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
        const response = await fetch(url, { headers: { "Accept": "application/json" } });
        const results = await response.json();
        if (!results.length) { clearResults(); return; }
        resultsDiv.style.display = "block";
        resultsDiv.innerHTML = results.map((r) =>
          `<div class="map-search-item" data-lat="${r.lat}" data-lon="${r.lon}">${r.display_name}</div>`
        ).join("");
        resultsDiv.querySelectorAll(".map-search-item").forEach((item) => {
          item.addEventListener("click", () => {
            const lat = Number(item.dataset.lat);
            const lon = Number(item.dataset.lon);
            state.map.setView([lat, lon], 15);
            state.marker.setLatLng([lat, lon]);
            byId("siteLat").value = lat.toFixed(4);
            byId("siteLng").value = lon.toFixed(4);
            input.value = item.textContent.split(",")[0];
            clearResults();
            refreshAll();
          });
        });
      } catch (_) { clearResults(); }
    }

    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => doSearch(input.value.trim()), 350);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { clearResults(); input.blur(); }
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(debounceTimer);
        doSearch(input.value.trim());
      }
    });

    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) clearResults();
    });

    return container;
  };
  searchControl.addTo(state.map);

  const drawnItems = new L.FeatureGroup();
  drawnItems.addTo(state.map);
  state.drawnItems = drawnItems;

  state.marker = L.marker([initialLat, initialLng]).addTo(state.map);

  const drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems, edit: false, remove: true },
    draw: {
      polygon: {
        allowIntersection: false,
        shapeOptions: {
          color: "#3b82f6",
          weight: 2,
        },
      },
      polyline: false,
      circle: false,
      circlemarker: false,
      marker: false,
      rectangle: {
        shapeOptions: {
          color: "#3b82f6",
          weight: 2,
        },
      },
    },
  });
  state.map.addControl(drawControl);

  state.map.on(L.Draw.Event.CREATED, (event) => {
    drawnItems.clearLayers();
    state.drawnLayer = event.layer;
    drawnItems.addLayer(event.layer);
    applyDrawnShape(event.layer);
    window.setTimeout(() => captureLayoutSnapshot(true), 80);
  });

  state.map.on(L.Draw.Event.DELETED, () => {
    state.drawnLayer = null;
    state.polygonAreaM2 = null;
    clearLayoutSnapshot();
    refreshAll();
  });

  state.map.on("click", (event) => {
    const { lat, lng } = event.latlng;
    byId("siteLat").value = lat.toFixed(4);
    byId("siteLng").value = lng.toFixed(4);
    state.marker.setLatLng([lat, lng]);
    refreshAll();
  });

  state.map.on("moveend", () => {
    if (state.drawnLayer) {
      captureLayoutSnapshot(true);
    }
  });

  baseLayer.on("load", () => {
    if (state.drawnLayer) {
      captureLayoutSnapshot(true);
    }
  });
}

function runSimulation() {
  refreshLayout();

  if (!state.weather.meta.ready) {
    state.simulation = null;
    state.lifetime = null;
    setSimulationPlaceholders();
    return;
  }

  const config = getConfig();
  state.simulation = simulateRepresentativeYear(state.weather, config, config, state.layout);
  state.lifetime = buildLifetimeSeries(state.simulation.annualizedEnergyKwh, config);
  updateSimulationOutputs(state.layout, state.simulation, state.lifetime, config);
}

function refreshAll() {
  refreshLayout();
  renderWeatherPreview();
  if (state.map && state.marker) {
    state.marker.setLatLng([readNumber("siteLat"), readNumber("siteLng")]);
  }

  if (state.weather.meta.ready) {
    runSimulation();
  } else {
    setSimulationPlaceholders();
  }
}

function wireEvents() {
  for (const control of document.querySelectorAll("input, select")) {
    if (control.closest(".db-search")) continue;
    control.addEventListener("change", () => {
      if (control.id === "siteLat" || control.id === "siteLng") {
        if (state.map) {
          state.map.setView([readNumber("siteLat"), readNumber("siteLng")], state.map.getZoom());
        }
      }

      if (control.id === "weatherProvider") {
        updateWeatherProviderNote();
      }

      // Keep azimuth inputs in sync between site and layout panels
      if (control.id === "azimuthDegSite") {
        const el = byId("azimuthDeg");
        if (el) el.value = control.value;
      } else if (control.id === "azimuthDeg") {
        const el = byId("azimuthDegSite");
        if (el) el.value = control.value;
      }

      refreshAll();
    });
  }

  byId("fetchWeather").addEventListener("click", () => {
    fetchWeatherFromApi();
  });

  byId("resetWeather").addEventListener("click", () => {
    state.weather = emptyWeatherState();
    byId("weatherSummary").textContent = DEFAULT_WEATHER_SUMMARY;
    updateWeatherStatus();
    renderWeatherPreview();
    refreshAll();
  });

  // --- Reusable database search picker ---
  function createDbSearch({ triggerId, panelId, manufacturerSelectId, resultsId, applyBtnId, qInputId, rangeInputIds, manufacturersUrl, searchUrl, renderItem, onSelect }) {
    const trigger = byId(triggerId);
    const panel = byId(panelId);
    const mfSelect = byId(manufacturerSelectId);
    const results = byId(resultsId);
    const applyBtn = byId(applyBtnId);
    const qInput = byId(qInputId);
    let manufacturersLoaded = false;

    trigger.addEventListener("click", async () => {
      const isOpen = panel.classList.toggle("is-open");
      if (isOpen && !manufacturersLoaded) {
        try {
          const resp = await fetch(manufacturersUrl);
          const data = await resp.json();
          for (const mf of data.manufacturers) {
            const opt = document.createElement("option");
            opt.value = mf;
            opt.textContent = mf;
            mfSelect.appendChild(opt);
          }
          manufacturersLoaded = true;
        } catch { /* ignore */ }
      }
    });

    document.addEventListener("click", (e) => {
      if (!panel.classList.contains("is-open")) return;
      if (!trigger.contains(e.target) && !panel.contains(e.target)) {
        panel.classList.remove("is-open");
      }
    });

    async function doSearch() {
      const params = new URLSearchParams();
      const mf = mfSelect.value;
      const q = qInput.value.trim();
      if (mf) params.set("manufacturer", mf);
      if (q) params.set("q", q);
      if (rangeInputIds) {
        for (const [paramName, inputId] of rangeInputIds) {
          const v = Number(byId(inputId).value);
          if (Number.isFinite(v) && v > 0) params.set(paramName, String(v));
        }
      }

      let hasRange = false;
      if (rangeInputIds) {
        for (const [, inputId] of rangeInputIds) {
          const v = Number(byId(inputId).value);
          if (Number.isFinite(v) && v > 0) { hasRange = true; break; }
        }
      }
      if (!mf && !hasRange && q.length < 2) {
        results.innerHTML = '<div class="search-empty">Select a manufacturer, set a range, or enter at least 2 characters.</div>';
        return;
      }

      results.innerHTML = '<div class="search-loading">Searching...</div>';
      try {
        const resp = await fetch(`${searchUrl}?${params}`);
        const data = await resp.json();
        const items = data.modules || data.inverters || [];
        if (!items.length) {
          results.innerHTML = '<div class="search-empty">No results found.</div>';
          return;
        }
        results.innerHTML = items.map((item, i) =>
          `<div class="search-item" data-idx="${i}">${renderItem(item)}</div>`
        ).join("");
        results.querySelectorAll(".search-item").forEach((el) => {
          el.addEventListener("click", () => {
            onSelect(items[Number(el.dataset.idx)]);
            panel.classList.remove("is-open");
            refreshAll();
          });
        });
      } catch {
        results.innerHTML = '<div class="search-empty">Search failed.</div>';
      }
    }

    applyBtn.addEventListener("click", doSearch);
    qInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
  }

  // --- Module database search ---
  createDbSearch({
    triggerId: "moduleSearchTrigger",
    panelId: "moduleSearchPanel",
    manufacturerSelectId: "moduleFilterManufacturer",
    resultsId: "moduleFilterResults",
    applyBtnId: "moduleFilterApply",
    qInputId: "moduleFilterQ",
    rangeInputIds: [["powerMin", "moduleFilterPowerMin"], ["powerMax", "moduleFilterPowerMax"]],
    manufacturersUrl: "/api/modules/manufacturers",
    searchUrl: "/api/modules",
    renderItem: (mod) =>
      `<div class="item-name">${mod.name}</div>
       <div class="item-specs">${mod.powerWp} Wp · ${mod.lengthM || "?"}×${mod.widthM || "?"} m · ${mod.technology || ""}${mod.bifacial ? " · Bifacial" : ""}</div>`,
    onSelect: (mod) => {
      byId("moduleManufacturer").value = mod.manufacturer || "";
      byId("moduleModel").value = mod.model || "";
      byId("modulePowerWp").value = mod.powerWp || "";
      if (mod.lengthM) byId("moduleLengthM").value = mod.lengthM;
      if (mod.widthM) byId("moduleWidthM").value = mod.widthM;
      if (mod.tempCoeffPctPerC != null) byId("tempCoeffPctPerC").value = mod.tempCoeffPctPerC;
    },
  });

  // --- Inverter database search ---
  createDbSearch({
    triggerId: "inverterSearchTrigger",
    panelId: "inverterSearchPanel",
    manufacturerSelectId: "inverterFilterManufacturer",
    resultsId: "inverterFilterResults",
    applyBtnId: "inverterFilterApply",
    qInputId: "inverterFilterQ",
    rangeInputIds: [["capacityMin", "inverterFilterCapacityMin"], ["capacityMax", "inverterFilterCapacityMax"]],
    manufacturersUrl: "/api/inverters/manufacturers",
    searchUrl: "/api/inverters",
    renderItem: (inv) =>
      `<div class="item-name">${inv.name}</div>
       <div class="item-specs">${inv.pacoKw} kW AC · ${inv.efficiencyPct || "?"}% eff · ${inv.vdcmaxV || "?"}V max · MPPT ${inv.mpptLowV || "?"}–${inv.mpptHighV || "?"}V</div>`,
    onSelect: (inv) => {
      byId("inverterManufacturer").value = inv.manufacturer || "";
      byId("inverterModel").value = inv.model || "";
      byId("inverterEfficiencyPct").value = inv.efficiencyPct || "";
    },
  });

  byId("applyWinterSpacing").addEventListener("click", () => {
    const config = getConfig();
    const slopeLengthM =
      config.moduleOrientation === "portrait" ? config.moduleLengthM : config.moduleWidthM;
    const spacing = winterSolsticeSpacing(
      config.siteLat,
      config.tiltDeg,
      slopeLengthM,
      config.frontClearanceM
    );
    byId("rowSpacingM").value = spacing.clearSpacingM.toFixed(2);
    refreshAll();
  });

  byId("downloadReport").addEventListener("click", async () => {
    runSimulation();
    if (!state.simulation) {
      byId("simulationStatus").textContent = "Load weather and run the model before downloading a report";
      byId("simulationStatus").className = "status-pill warn";
      return;
    }

    const activeSection = document.querySelector(".control-section.is-active");
    const prevPanelId = activeSection?.id || "sitePanel";

    let mapSiteImageDataUrl = "";
    let mapSiteSnapshotError = "";
    let weatherPreviewImageDataUrl = "";
    let layoutPreviewImageDataUrl = "";
    let resultsGraphsImageDataUrl = "";

    try {
      setActivePanel("sitePanel");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 120));
      if (state.map) {
        state.map.invalidateSize();
      }
      await new Promise((r) => setTimeout(r, 200));
      if (state.map && state.drawnLayer) {
        captureLayoutSnapshot(true);
      }
      mapSiteImageDataUrl = state.layoutPreview.imageUrl || "";
      mapSiteSnapshotError = state.layoutPreview.error || "";

      setActivePanel("weatherPanel");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 250));
      const weatherStage = document.querySelector('.stage-view[data-stage-for="weatherPanel"]');
      weatherPreviewImageDataUrl = await captureElementAsPng(weatherStage);

      setActivePanel("layoutPanel");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 250));
      const layoutView = byId("layoutPerspectiveView");
      layoutPreviewImageDataUrl = await captureElementAsPng(layoutView);

      setActivePanel("performancePanel");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 280));
      const performanceStage = document.querySelector('.stage-view[data-stage-for="performancePanel"]');
      resultsGraphsImageDataUrl = await captureElementAsPng(performanceStage);
    } catch (captureErr) {
      console.warn(captureErr);
    } finally {
      setActivePanel(prevPanelId);
      if (state.map) {
        window.setTimeout(() => {
          state.map.invalidateSize();
          if (prevPanelId === "sitePanel" && state.drawnLayer) {
            captureLayoutSnapshot(true);
          }
        }, 40);
      }
    }

    const config = getConfig();
    try {
      await buildAndSaveSimulationReport({
        layout: state.layout,
        simulation: state.simulation,
        lifetime: state.lifetime,
        config,
        weather: state.weather,
        siteName: config.siteName || byId("siteName").value.trim() || "Project",
        mapSiteImageDataUrl,
        mapSiteSnapshotError,
        weatherPreviewImageDataUrl,
        layoutPreviewImageDataUrl,
        resultsGraphsImageDataUrl,
        mapStrip: {
          site: byId("mapSiteName")?.textContent?.trim() || "",
          coordinates: byId("mapCoordinateText")?.textContent?.trim() || "",
          buildable: byId("mapBuildableAreaText")?.textContent?.trim() || "",
          layoutStatus: byId("mapLayoutText")?.textContent?.trim() || "",
          grossArea: byId("grossAreaText")?.textContent?.trim() || "",
          netArea: byId("netAreaText")?.textContent?.trim() || "",
        },
      });
      byId("simulationStatus").textContent = "Simulation complete · report downloaded";
      byId("simulationStatus").className = "status-pill neutral";
    } catch (err) {
      console.error(err);
      byId("simulationStatus").textContent = "Report download failed — check the console";
      byId("simulationStatus").className = "status-pill warn";
    }
  });

  for (const trigger of document.querySelectorAll("[data-panel-target]")) {
    trigger.addEventListener("click", () => {
      setActivePanel(trigger.dataset.panelTarget);
    });
  }

  for (const trigger of document.querySelectorAll("[data-run-simulation]")) {
    trigger.addEventListener("click", () => {
      runSimulation();
    });
  }

  const introBody = byId("introBody");
  const introHeader = document.querySelector(".intro-banner .intro-header");
  const introExpand = document.querySelector(".intro-expand");
  const introReadDocs = document.getElementById("introReadDocs");

  if (introHeader && introBody) {
    introHeader.addEventListener("click", () => {
      const isOpen = !introBody.classList.contains("is-collapsed");
      const nextOpen = !isOpen;
      introBody.classList.toggle("is-collapsed", !nextOpen);
      if (introExpand) {
        introExpand.setAttribute("aria-expanded", String(nextOpen));
      }
    });
  }

  if (introReadDocs) {
    introReadDocs.addEventListener("click", (e) => {
      e.stopPropagation();
      window.open("/docs", "_blank", "noopener,noreferrer");
    });
  }
}

function initialize() {
  const baseArea = rectangleMetrics(
    readNumber("manualWidthM"),
    readNumber("manualHeightM"),
    readNumber("edgeSetbackM"),
    readNumber("edgeSetbackDepthM")
  );
  setText("grossAreaText", formatArea(baseArea.grossAreaM2));
  setText("netAreaText", formatArea(baseArea.netAreaM2));
  updateWeatherProviderNote();
  updateWeatherStatus();
  setSimulationPlaceholders();
  refreshLayout();
  renderWeatherPreview();
  initMap();
  wireEvents();
  byId("weatherSummary").textContent = DEFAULT_WEATHER_SUMMARY;
  normalizeSiteNameField();
}

initialize();
