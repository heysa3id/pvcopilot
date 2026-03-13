/**
 * Client-side PVSyst PDF parser for use when the backend is unavailable (e.g. GitHub Pages).
 * Extracts text via PDF.js and parses the same fields as the Python pvsyst_parser.
 * Same JSON shape as /api/parse-pvsyst for LCOE tool.
 */

// Safari/WebKit compatibility:
// - pdfjs-dist v5 may rely on Promise.withResolvers (missing in some Safari versions)
// - use the legacy build + tiny polyfill fallback to avoid "undefined is not a function"
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function withResolversPolyfill() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

if (typeof window !== "undefined" && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

function _num(text, defaultVal = null) {
  if (text == null) return defaultVal;
  const m = String(text).replace(/,/g, ".").match(/[-+]?\d+\.?\d*/);
  return m ? parseFloat(m[0]) : defaultVal;
}

function _find(text, pattern, group = 1, defaultVal = null, flags = "") {
  if (!text) return defaultVal;
  const re = new RegExp(pattern, flags);
  const m = text.match(re);
  if (!m) return defaultVal;
  const g = m[group];
  return g != null ? String(g).trim() : defaultVal;
}

/**
 * Extract text from a PDF File in the browser. Returns { pagesText, fullText }.
 */
async function extractPdfText(file) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("Invalid file object for PDF parsing.");
  }

  const arrayBuffer = await file.arrayBuffer();

  let pdf;
  try {
    pdf = await getDocument({ data: arrayBuffer, useSystemFonts: true }).promise;
  } catch (e) {
    // Surface a clear error instead of a low-level "undefined is not a function"
    throw new Error(
      "Client-side PDF engine failed to load. Please refresh the page or use a standard PVsyst PDF report."
    );
  }

  const numPages = pdf.numPages;
  const pagesText = [];
  let fullText = "";

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = (content.items || []).map((item) => item.str || "").join(" ");
    pagesText.push(text);
    fullText += text + "\n";
  }
  return { pagesText, fullText };
}

/**
 * Parse PVSyst PDF (File) in the browser. Returns the same object shape as backend /api/parse-pvsyst.
 */
export async function parsePvsystPdfClient(file) {
  const { pagesText, fullText } = await extractPdfText(file);
  const p1 = pagesText[0] || "";
  const p2 = pagesText[1] || "";
  const p3 = pagesText[2] || "";
  const p4 = pagesText[3] || "";
  const p6 = pagesText[5] || "";

  const result = {
    systemCapacity: null,
    ratedPowerAC: null,
    dcAcRatio: null,
    modulePower: null,
    numModules: null,
    specificYield: null,
    annualEnergy: null,
    performanceRatio: null,
    systemType: null,
    tilt: null,
    azimuth: null,
    location: null,
    country: null,
    latitude: null,
    longitude: null,
    systemConfig: null,
    moduleManufacturer: null,
    moduleModel: null,
    inverterManufacturer: null,
    inverterModel: null,
    ghi: null,
    gti: null,
    degradationRate: null,
    pvSystVersion: null,
    projectName: null,
    simulationYear: null,
  };

  let v = _find(fullText, /(?:Version|PVsyst\s+V?)(\d+\.\d+\.\d+)/, 1);
  if (!v) v = _find(fullText, /PVsyst\s+V(\d+\.\d+\.\d+)/, 1);
  result.pvSystVersion = v;

  result.projectName = _find(p1, /Project:\s*(.+)/, 1);

  const cover_power_wp = _num(_find(p1, /System\s+power:\s*([\d.,]+)\s*Wp/, 1));
  const cover_power_kwp = _num(_find(p1, /System\s+power:\s*([\d.,]+)\s*kWp/, 1));

  const locMatch = p1.match(/(?:Benguerir|[\w_]+)_?\w*\s*-\s*(\w+)/);
  if (!locMatch) {
    const lines = p1.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.includes(" - ") && !/simulation/i.test(line)) {
        const parts = line.split(" - ");
        if (parts.length === 2) {
          result.location = parts[0].trim();
          result.country = parts[1].trim();
          break;
        }
      }
    }
  }

  let geoLoc = _find(p2, /Geographical\s+Site[^\n]*\n([\w_]+)/, 1);
  const geoCountry = _find(p2, /Geographical\s+Site[^\n]*\n[\w_]+\n(\w+)/, 1);
  if (geoLoc && !result.location) result.location = geoLoc.replace(/_/g, " ");
  if (geoCountry && !result.country) result.country = geoCountry;

  if (!result.location) {
    const loc = _find(p2, /(?:Benguerir|Geographical\s+Site\s+Situation[^\n]*\n)(\S+)/, 1);
    if (loc) result.location = loc.replace(/_/g, " ");
  }
  if (!result.country) {
    const country = p2.match(/(?:Maroc|Morocco|France|Spain|Germany|Italy)/);
    if (country) result.country = country[0];
  }

  const latStr = _find(p2, /Latitude\s+([\d.]+)\s*°?\s*([NS])/, 0);
  if (latStr) {
    let latVal = _num(latStr);
    if (latVal != null && /S/i.test(latStr)) latVal = -latVal;
    result.latitude = latVal;
  }
  const lonStr = _find(p2, /Longitude\s+([-\d.]+)\s*°?\s*([EW]?)/, 0);
  if (lonStr) {
    let lonVal = _num(lonStr);
    if (lonVal != null) {
      if (/W/i.test(lonStr) && lonVal > 0) lonVal = -lonVal;
      result.longitude = lonVal;
    }
  }

  const tiltAz = _find(p2, /Tilt\/Azimuth\s+([\d.]+)\s*\/\s*([\d.]+)/, 0);
  if (tiltAz) {
    const t = tiltAz.match(/([\d.]+)\s*\//);
    const a = tiltAz.match(/\/\s*([\d.]+)/);
    if (t) result.tilt = _num(t[1]);
    if (a) result.azimuth = _num(a[1]);
  }

  if (p2.includes("Fixed plane") || fullText.includes("Fixed plane")) result.systemConfig = "Fixed plane";
  else if (fullText.includes("Single-axis")) result.systemConfig = "Single-axis tracking";
  else if (fullText.includes("Two-axis")) result.systemConfig = "Two-axis tracking";

  const pnom_kwp = _num(_find(p2, /Pnom\s+total\s+([\d.,]+)\s*kWp/, 1));
  const pnom_wp = _num(_find(p2, /Pnom\s+total\s+([\d.,]+)\s*Wp/, 1));
  if (pnom_kwp) result.systemCapacity = pnom_kwp;
  else if (pnom_wp) result.systemCapacity = pnom_wp / 1000;
  else if (cover_power_kwp) result.systemCapacity = cover_power_kwp;
  else if (cover_power_wp) result.systemCapacity = cover_power_wp / 1000;

  const nbModules = _num(_find(p2, /Nb\.\s*of\s+modules\s+([\d]+)/, 1));
  result.numModules = nbModules != null ? Math.floor(nbModules) : null;

  result.dcAcRatio = _num(_find(p2, /Pnom\s+ratio\s+([\d.,]+)/, 1));

  const produced = _num(_find(p2, /Produced\s+Energy\s+([\d.,]+)\s*kWh\/year/, 1));
  const specProd = _num(_find(p2, /Specific\s+production\s+([\d.,]+)\s*kWh\/kWp\/year/, 1));
  const pr = _num(_find(p2, /Perf\.\s*Ratio\s+PR\s+([\d.,]+)\s*%/, 1));
  result.specificYield = specProd;
  result.performanceRatio = pr;

  const hasBattery = /Battery\s+pack|Storage\s+strategy|Self.?consumption|Solar\s+Fraction\s+SF/i.test(p2);
  const hasGrid = /E_Grid|EFrGrid|Grid.Connected/i.test(fullText);
  if (hasBattery && hasGrid) result.systemType = "grid-connected-battery";
  else if (hasBattery) result.systemType = "battery";
  else result.systemType = "grid-connected";

  if (produced) result.annualEnergy = produced;

  const mfrLines = p3.split("\n").filter((l) => l.includes("Manufacturer") && !l.includes("Original"));
  for (const mline of mfrLines) {
    const parts = mline.trim().split(/\s{2,}/).map((p) => p.trim()).filter((p) => p && p !== "Manufacturer");
    if (parts.length >= 2) {
      result.moduleManufacturer = parts[0];
      result.inverterManufacturer = parts[1];
      break;
    }
    const raw = mline.trim();
    const mfrParts = raw.split(/\bManufacturer\b/).map((p) => p.trim()).filter(Boolean);
    if (mfrParts.length >= 2) {
      result.moduleManufacturer = mfrParts[0];
      result.inverterManufacturer = mfrParts[1];
      break;
    }
    if (mfrParts.length === 1 && !result.moduleManufacturer) result.moduleManufacturer = mfrParts[0];
  }
  if (!result.moduleManufacturer) {
    const m = p3.match(/PV\s+module[\s\S]*?Manufacturer\s+(\w+(?:\s+\w+)*?)(?:\s+Manufacturer|\n)/);
    if (m) result.moduleManufacturer = m[1].trim();
  }

  const modelLines = p3.split("\n").filter((l) => /^Model\s/.test(l.trim()) && !l.includes("Models used") && !l.includes("Model Generic"));
  for (const mline of modelLines) {
    const parts = mline.trim().split(/\s{2,}/).map((p) => p.trim()).filter((p) => p && p !== "Model");
    if (parts.length >= 2) {
      result.moduleModel = parts[0];
      result.inverterModel = parts[1];
      break;
    }
    const modelParts = mline.trim().split(/\bModel\b/).map((p) => p.trim()).filter(Boolean);
    if (modelParts.length >= 2) {
      result.moduleModel = modelParts[0];
      result.inverterModel = modelParts[1];
      break;
    }
  }

  result.modulePower = _num(_find(p3, /Unit\s+Nom\.\s+Power\s+([\d.,]+)\s*Wp/, 1));
  const invPower = _num(_find(p3, /Unit\s+Nom\.\s+Power\s+([\d.,]+)\s*kWac/, 1));
  if (invPower) result.ratedPowerAC = invPower;
  if (!result.numModules) {
    const nm = _num(_find(p3, /Number\s+of\s+PV\s+modules\s+([\d]+)/, 1));
    result.numModules = nm != null ? Math.floor(nm) : null;
  }
  const totalInv = _num(_find(p3, /Total\s+(?:inverter\s+)?power\s+([\d.,]+)\s*kWac/, 1));
  if (totalInv && !result.ratedPowerAC) result.ratedPowerAC = totalInv;
  if (!result.dcAcRatio) result.dcAcRatio = _num(_find(p3, /Pnom\s+ratio\s+(?:\(DC:AC\)\s+)?([\d.,]+)/, 1));
  const nominalStcKwp = _num(_find(p3, /Nominal\s+\(STC\)\s+([\d.,]+)\s*kWp/, 1));
  if (nominalStcKwp && !result.systemCapacity) result.systemCapacity = nominalStcKwp;

  const deg = _num(_find(p4, /Loss\s+factor\s+([\d.,]+)\s*%\/year/, 1));
  result.degradationRate = deg ?? _num(_find(fullText, /(?:degradation|Loss\s+factor)\s+([\d.,]+)\s*%\/year/, 1));

  const simYear = _num(_find(fullText, /(?:Simulation\s+for\s+year\s+no|Year\s+no)\s+(\d+)/, 1));
  result.simulationYear = simYear != null ? Math.floor(simYear) : null;

  const yearMatch = p6.match(/Year\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (yearMatch) {
    result.ghi = parseFloat(yearMatch[1]);
    result.gti = parseFloat(yearMatch[4]);
    result.annualEnergy = parseFloat(yearMatch[8]);
  }
  const prodP6 = _num(_find(p6, /Produced\s+Energy\s+([\d.,]+)\s*kWh\/year/, 1));
  const specP6 = _num(_find(p6, /Specific\s+production\s+([\d.,]+)\s*kWh\/kWp\/year/, 1));
  const prP6 = _num(_find(p6, /Perf\.\s*Ratio\s+PR\s+([\d.,]+)\s*%/, 1));
  if (prodP6) result.annualEnergy = prodP6;
  if (specP6) result.specificYield = specP6;
  if (prP6) result.performanceRatio = prP6;

  if (result.systemCapacity != null && result.systemCapacity > 1000) result.systemCapacity /= 1000;
  if (result.ratedPowerAC != null && result.ratedPowerAC > 100) result.ratedPowerAC /= 1000;
  if (!result.ratedPowerAC) {
    const invWVal = _num(_find(p2, /(?:Inverters.*?Pnom\s+total\s+)([\d.,]+)\s*W/, 1));
    if (invWVal != null) result.ratedPowerAC = invWVal > 100 ? invWVal / 1000 : invWVal;
  }
  if (result.location) result.location = result.location.replace(/_/g, " ").trim();

  return result;
}
