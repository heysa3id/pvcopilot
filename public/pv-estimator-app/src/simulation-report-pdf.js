/**
 * PVsyst-inspired simulation PDF (PVCopilot branding).
 * jsPDF is loaded from CDN because this app is served as static ESM from public/.
 */
import jsPDF from "https://esm.sh/jspdf@4.0.0";
import autoTable from "https://esm.sh/jspdf-autotable@5.0.2?deps=jspdf@4.0.0";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HEADER_FILL = [30, 58, 95];
const HEADER_TEXT = [255, 255, 255];
const RULE = [148, 163, 184];

function round(value, digits = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function formatEnergyKwh(kwh) {
  if (!Number.isFinite(kwh)) return "—";
  if (kwh >= 1_000_000) return `${(kwh / 1_000_000).toFixed(2)} GWh`;
  return `${(kwh / 1000).toFixed(1)} MWh`;
}

function formatPowerKw(kw) {
  if (!Number.isFinite(kw)) return "—";
  if (kw >= 1000) return `${(kw / 1000).toFixed(2)} MW`;
  return `${Math.round(kw).toLocaleString()} kW`;
}

function sanitizeFilename(name) {
  const s = name.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
  return s || "Project";
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadLogoPngDataUrl() {
  return new Promise((resolve) => {
    const url = new URL("../../logoBlack.svg", import.meta.url).href;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = 400;
      const ratio = img.naturalHeight / img.naturalWidth || 0.25;
      const h = Math.max(1, Math.round(w * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawSectionTitle(doc, y, title) {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(title, 14, y);
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.3);
  doc.line(14, y + 2, 196, y + 2);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  return y + 8;
}

function drawReportHeader(doc, logoDataUrl, siteName, pageW, yStart = 12) {
  let y = yStart;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 14, y, 42, 10);
    } catch {
      /* ignore */
    }
  }

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("PVCopilot", logoDataUrl ? 58 : 14, y + 4);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Simulation report", logoDataUrl ? 58 : 14, y + 9);

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const projectLine = siteName?.trim() || "Untitled project";
  doc.text(`Project: ${projectLine}`, pageW - 14, y + 4, { align: "right" });
  doc.text(`Generated: ${todayYmd()}`, pageW - 14, y + 9, { align: "right" });
  doc.setTextColor(0, 0, 0);

  return y + 18;
}

function addPageFooter(doc, pageNumber, totalPages) {
  const h = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`PVCopilot · simulation report`, 14, h - 10);
  doc.text(`Page ${pageNumber} / ${totalPages}`, 196, h - 10, { align: "right" });
  doc.setTextColor(0, 0, 0);
}

function refreshFooters(doc) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i += 1) {
    doc.setPage(i);
    addPageFooter(doc, i, n);
  }
}

/** Rasterize a DOM node for the PDF (weather stage, layout preview, etc.). */
export async function captureElementAsPng(element) {
  if (!element) {
    return "";
  }
  try {
    const { default: html2canvas } = await import("https://esm.sh/html2canvas@1.4.1");
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#f8fafc",
      scrollX: 0,
      scrollY: -window.scrollY,
    });
    return canvas.toDataURL("image/png");
  } catch (e) {
    console.warn("captureElementAsPng", e);
    return "";
  }
}

function addImageFit(doc, dataUrl, format, x, y, maxW, maxH) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return { y, ok: false };
  }
  try {
    const dim = doc.getImageProperties(dataUrl);
    const ratio = dim.height / dim.width;
    let w = maxW;
    let h = w * ratio;
    if (h > maxH) {
      h = maxH;
      w = h / ratio;
    }
    doc.addImage(dataUrl, format, x, y, w, h);
    return { y: y + h + 4, ok: true };
  } catch {
    return { y, ok: false };
  }
}

function weatherProviderLabel(provider) {
  if (provider === "openmeteo") return "Open-Meteo ERA5";
  return "PVGIS TMY";
}

/**
 * @param {object} params
 * @param {object} params.layout
 * @param {object} params.simulation
 * @param {object[]} params.lifetime
 * @param {object} params.config
 * @param {object} params.weather
 * @param {string} params.siteName
 * @param {string} [params.mapSiteImageDataUrl] JPEG data URL (satellite map excerpt)
 * @param {string} [params.mapSiteSnapshotError]
 * @param {string} [params.weatherPreviewImageDataUrl]
 * @param {string} [params.layoutPreviewImageDataUrl]
 * @param {string} [params.resultsGraphsImageDataUrl] Model stage — monthly energy, lifetime, PR charts
 * @param {object} [params.mapStrip]
 */
export async function buildAndSaveSimulationReport(params) {
  const {
    layout,
    simulation,
    lifetime,
    config,
    weather,
    siteName,
    mapSiteImageDataUrl = "",
    mapSiteSnapshotError = "",
    weatherPreviewImageDataUrl = "",
    layoutPreviewImageDataUrl = "",
    resultsGraphsImageDataUrl = "",
    mapStrip = {},
  } = params;

  if (!simulation || !layout || !lifetime?.length) {
    throw new Error("Missing simulation data");
  }

  const logoDataUrl = await loadLogoPngDataUrl();
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const innerW = pageW - 28;
  const imgMaxH = pageH - 50;

  // ── Page 1: Site setup + map builder summary ──
  let y = drawReportHeader(doc, logoDataUrl, siteName, pageW);

  y = drawSectionTitle(doc, y, "Site — location and rectangle");
  const siteBody = [
    ["Latitude (°)", String(config.siteLat)],
    ["Longitude (°)", String(config.siteLng)],
    ["UTC offset (hours)", String(config.timezoneOffset)],
    ["Ground albedo", String(config.surfaceAlbedo)],
    ["Rectangle width (m)", String(config.manualWidthM)],
    ["Rectangle depth (m)", String(config.manualHeightM)],
    ["Edge setback — left / right (m)", String(config.edgeSetbackM)],
    ["Edge setback — top / bottom (m)", String(config.edgeSetbackDepthM)],
    ["Azimuth (deg N)", String(config.azimuthDegSite ?? config.azimuthDeg)],
    ["Weather provider (selected)", weatherProviderLabel(config.weatherProvider)],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Parameter", "Value"]],
    body: siteBody,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: HEADER_FILL, textColor: HEADER_TEXT, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 78 }, 1: { cellWidth: "auto" } },
    margin: { left: 14, right: 14 },
  });

  y = doc.lastAutoTable.finalY + 6;
  y = drawSectionTitle(doc, y, "Map builder summary");
  const strip = mapStrip || {};
  const mapBody = [
    ["Site", strip.site || "—"],
    ["Coordinates", strip.coordinates || "—"],
    ["Buildable area", strip.buildable || "—"],
    ["Layout status", strip.layoutStatus || "—"],
    ["Gross area", strip.grossArea || "—"],
    ["Net buildable", strip.netArea || "—"],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Field", "Value"]],
    body: mapBody,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: HEADER_FILL, textColor: HEADER_TEXT, fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });

  y = doc.lastAutoTable.finalY + 6;
  let mapMaxH = Math.min(88, pageH - y - 18);
  if (mapMaxH < 45) {
    doc.addPage();
    y = drawReportHeader(doc, logoDataUrl, siteName, pageW, 12);
    mapMaxH = imgMaxH;
  }
  y = drawSectionTitle(doc, y, "Installation area (satellite map)");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    doc.splitTextToSize(
      "Excerpt of the map with the drawn site rectangle (same view as the Site tab).",
      innerW
    ),
    14,
    y
  );
  y += 10;
  doc.setTextColor(0, 0, 0);

  const mapFit = addImageFit(doc, mapSiteImageDataUrl, "JPEG", 14, y, innerW, mapMaxH);
  if (!mapFit.ok) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const mapMsg =
      mapSiteSnapshotError ||
      "Draw a rectangle on the map under the Site tab and wait for tiles to load, then download again.";
    doc.text(doc.splitTextToSize(mapMsg, innerW), 14, y + 4);
    doc.setTextColor(0, 0, 0);
  }

  // ── Page 2: Weather preview (graphs) ──
  doc.addPage();
  y = drawReportHeader(doc, logoDataUrl, siteName, pageW, 12);
  y = drawSectionTitle(doc, y, "Weather preview");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const meta = weather?.meta || {};
  const fmtD = (d) =>
    d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
  const weatherNote = meta.ready
    ? `${weather?.source?.label || "Weather"} · ${fmtD(meta.start)} → ${fmtD(meta.end)} · ${(meta.rowCount ?? 0).toLocaleString()} rows`
    : "No weather dataset loaded; charts may be empty.";
  doc.text(doc.splitTextToSize(weatherNote, innerW), 14, y);
  y += 10;
  doc.setTextColor(0, 0, 0);

  const weatherFit = addImageFit(doc, weatherPreviewImageDataUrl, "PNG", 14, y, innerW, imgMaxH);
  if (!weatherFit.ok) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(
      doc.splitTextToSize(
        "Weather preview capture unavailable. Open the Weather tab and ensure charts are visible, then try again.",
        innerW
      ),
      14,
      y + 4
    );
    doc.setTextColor(0, 0, 0);
  }

  // ── Page 3: Layout preview (2D / pseudo-3D field) ──
  doc.addPage();
  y = drawReportHeader(doc, logoDataUrl, siteName, pageW, 12);
  y = drawSectionTitle(doc, y, "Layout preview");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    doc.splitTextToSize(
      "2D view of the module field (tilt, azimuth, row spacing, and GCR as configured in the Layout panel).",
      innerW
    ),
    14,
    y
  );
  y += 12;
  doc.setTextColor(0, 0, 0);

  const layoutFit = addImageFit(doc, layoutPreviewImageDataUrl, "PNG", 14, y, innerW, imgMaxH);
  if (!layoutFit.ok) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(
      doc.splitTextToSize(
        "Layout preview capture unavailable. Open the Layout tab so the preview renders, then download again.",
        innerW
      ),
      14,
      y + 4
    );
    doc.setTextColor(0, 0, 0);
  }

  // ── Page 4: Model / results charts (dashboard) ──
  doc.addPage();
  y = drawReportHeader(doc, logoDataUrl, siteName, pageW, 12);
  y = drawSectionTitle(doc, y, "Simulation results — charts");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    doc.splitTextToSize(
      "Monthly energy, 25-year lifetime profile, normalized production (kWh/kWp/day), and monthly performance ratio — as shown on the Model tab.",
      innerW
    ),
    14,
    y
  );
  y += 12;
  doc.setTextColor(0, 0, 0);

  const resultsFit = addImageFit(doc, resultsGraphsImageDataUrl, "PNG", 14, y, innerW, imgMaxH);
  if (!resultsFit.ok) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(
      doc.splitTextToSize(
        "Results charts capture unavailable. Open the Model tab after running the simulation, then download again.",
        innerW
      ),
      14,
      y + 4
    );
    doc.setTextColor(0, 0, 0);
  }

  // ── Page 5: Main simulation results ──
  doc.addPage();
  y = drawReportHeader(doc, logoDataUrl, siteName, pageW, 12);
  y = drawSectionTitle(doc, y, "Main results");
  const yearOne = lifetime[0];
  const totalLife = lifetime.reduce((s, row) => s + row.energyKwh, 0);
  const y1Sy = layout.dcCapacityKw > 0 ? yearOne.energyKwh / layout.dcCapacityKw : 0;
  const weatherLabel = weather?.source?.label || "—";
  const periodStr =
    meta.start && meta.end ? `${fmtD(meta.start)} → ${fmtD(meta.end)}` : "—";

  const mainBody = [
    ["Year-1 net energy (AC)", formatEnergyKwh(yearOne.energyKwh)],
    ["25-year cumulative energy", formatEnergyKwh(totalLife)],
    ["Installed DC capacity", formatPowerKw(layout.dcCapacityKw)],
    ["Installed AC capacity", formatPowerKw(layout.acCapacityKw)],
    ["DC/AC ratio", Number.isFinite(layout.dcAcRatio) ? layout.dcAcRatio.toFixed(2) : "—"],
    ["Specific yield (year-1)", `${Math.round(y1Sy).toLocaleString()} kWh/kWp`],
    ["Performance ratio (annual)", `${round(simulation.performanceRatio, 1)} %`],
    ["Capacity factor", `${round(simulation.capacityFactor, 1)} %`],
    ["Clipping loss (annualized)", formatEnergyKwh(simulation.clippingLossKwh)],
    ["Peak modeled cell temperature", `${round(simulation.maxCellTemp, 1)} °C`],
    ["Weather source", weatherLabel],
    ["Weather period", periodStr],
    ["Timestep / rows", meta.ready ? `${meta.timestepHours ?? "—"} h · ${(meta.rowCount ?? 0).toLocaleString()} rows` : "—"],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Quantity", "Value"]],
    body: mainBody,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: HEADER_FILL, textColor: HEADER_TEXT, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 72 }, 1: { cellWidth: "auto" } },
    margin: { left: 14, right: 14 },
  });

  // ── Page 6: Losses ──
  doc.addPage();
  y = drawReportHeader(doc, logoDataUrl, siteName, pageW, 12);
  y = drawSectionTitle(doc, y, "Energy losses (annualized)");
  const losses = simulation.losses;
  const nominal = losses.nominalEnergy || 0;
  const lossRows = [
    ["Soiling", losses.soiling, nominal > 0 ? (losses.soiling / nominal) * 100 : 0],
    ["IAM", losses.iam, nominal > 0 ? (losses.iam / nominal) * 100 : 0],
    ["Temperature", losses.temperature, nominal > 0 ? (losses.temperature / nominal) * 100 : 0],
    ["Module quality", losses.quality, nominal > 0 ? (losses.quality / nominal) * 100 : 0],
    ["Mismatch", losses.mismatch, nominal > 0 ? (losses.mismatch / nominal) * 100 : 0],
    ["DC wiring", losses.dcWiring, nominal > 0 ? (losses.dcWiring / nominal) * 100 : 0],
    ["Inverter", losses.inverter, nominal > 0 ? (losses.inverter / nominal) * 100 : 0],
    ["Clipping", losses.clipping, nominal > 0 ? (losses.clipping / nominal) * 100 : 0],
    ["AC wiring", losses.acWiring, nominal > 0 ? (losses.acWiring / nominal) * 100 : 0],
    ["Availability", losses.availability, nominal > 0 ? (losses.availability / nominal) * 100 : 0],
  ].map(([label, kwh, pct]) => [
    label,
    `${Math.round(kwh).toLocaleString()} kWh`,
    `${round(pct, 2)} %`,
  ]);

  lossRows.push([
    "Net energy (after losses)",
    `${Math.round(losses.netEnergy).toLocaleString()} kWh`,
    nominal > 0 ? `${round((losses.netEnergy / nominal) * 100, 2)} % of nominal` : "—",
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Loss component", "Energy", "Share of nominal"]],
    body: lossRows,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: HEADER_FILL, textColor: HEADER_TEXT, fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });

  y = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const nominalLine = `Array nominal reference: ${Math.round(nominal).toLocaleString()} kWh (POA × DC nameplate chain, before net export).`;
  doc.text(doc.splitTextToSize(nominalLine, innerW), 14, y);
  doc.setTextColor(0, 0, 0);

  // ── Page 7: Monthly + equipment ──
  doc.addPage();
  y = drawReportHeader(doc, logoDataUrl, siteName, pageW, 12);
  y = drawSectionTitle(doc, y, "Monthly balances");
  let totalE = 0;
  let totalPoa = 0;
  const monthlyBody = MONTHS.map((m, i) => {
    const energy = simulation.monthlyEnergyKwh[i] || 0;
    const poa = simulation.monthlyPoaKwhm2?.[i] || 0;
    totalE += energy;
    totalPoa += poa;
    const pr =
      poa > 0 && layout.dcCapacityKw > 0 ? ((energy / layout.dcCapacityKw) / poa) * 100 : 0;
    return [m, poa.toFixed(1), (energy / 1000).toFixed(1), round(pr, 1)];
  });
  const totalPr =
    totalPoa > 0 && layout.dcCapacityKw > 0
      ? ((totalE / layout.dcCapacityKw) / totalPoa) * 100
      : 0;

  autoTable(doc, {
    startY: y,
    head: [["Month", "POA (kWh/m²)", "E_net (MWh)", "PR (%)"]],
    body: monthlyBody,
    foot: [["Year", totalPoa.toFixed(1), (totalE / 1000).toFixed(1), round(totalPr, 1)]],
    showFoot: "lastPage",
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: HEADER_FILL, textColor: HEADER_TEXT, fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });

  y = doc.lastAutoTable.finalY + 8;
  y = drawSectionTitle(doc, y, "Equipment & model notes");
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  const moduleSpec =
    config.moduleManufacturer || config.moduleModel
      ? `${config.moduleManufacturer || "—"} ${config.moduleModel || "—"} (${config.modulePowerWp} Wp)`
      : `${config.modulePowerWp} Wp module`;
  const invSpec =
    config.inverterManufacturer || config.inverterModel
      ? `${config.inverterManufacturer || "—"} ${config.inverterModel || "—"}`
      : "Inverter";
  const noteLines = doc.splitTextToSize(
    [
      `Module: ${moduleSpec}`,
      `Inverter: ${invSpec} · efficiency ${round(config.inverterEfficiencyPct, 1)} %`,
      `Degradation: ${config.degradationModel}, ${round(config.annualDegradationPct, 2)} %/yr after ${round(config.firstYearLidPct, 2)} % LID`,
      `Thermal: Uc=${round(config.ucValue, 1)}, Uv=${round(config.uvValue, 1)} · temp coeff ${round(config.tempCoeffPctPerC, 3)} %/°C`,
    ].join(" · "),
    innerW
  );
  doc.text(noteLines, 14, y);
  doc.setTextColor(0, 0, 0);

  refreshFooters(doc);

  const fname = `PVCopilot_${sanitizeFilename(siteName || "Project")}_${todayYmd()}.pdf`;
  doc.save(fname);
}
