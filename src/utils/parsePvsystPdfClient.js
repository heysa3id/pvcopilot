/**
 * Client-side PVSyst PDF parser for use when the backend is unavailable (e.g. GitHub Pages).
 * Extracts text via PDF.js and parses the same fields as the Python pvsyst_parser.
 * Same JSON shape as /api/parse-pvsyst for LCOE tool.
 */

// Must run before pdfjs: Safari/WebKit lack Promise.withResolvers; pdfjs uses it at load time.
import "./promiseWithResolversPolyfill.js";

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

// Worker runs in a separate context and doesn't get the main-thread polyfill.
// In Safari the worker throws "undefined is not a function" without this.
let workerBlobReady = null;
async function ensureWorkerSrc() {
  if (GlobalWorkerOptions.workerSrc) return;
  if (workerBlobReady) {
    await workerBlobReady;
    return;
  }
  workerBlobReady = (async () => {
    const polyfill = `if (typeof Promise !== "undefined" && typeof Promise.withResolvers !== "function") { Promise.withResolvers = function() { var resolve, reject; var promise = new Promise(function(res, rej) { resolve = res; reject = rej; }); return { promise: promise, resolve: resolve, reject: reject }; }; }\n`;
    const res = await fetch(pdfWorkerUrl);
    const workerCode = await res.text();
    const blob = new Blob([polyfill + workerCode], { type: "application/javascript" });
    GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
  })();
  await workerBlobReady;
}

// workerSrc is set in ensureWorkerSrc() before first getDocument (blob includes polyfill for Safari worker)

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

  await ensureWorkerSrc();

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

  // pdfplumber: "Project: APEE\n", pdfjs: "Project: Lydex Rabat  Variant:..."
  let projName = _find(p1, /Project:\s*(.+?)(?:\s{2,}|\s+Variant|\n)/, 1);
  if (!projName) projName = _find(p1, /Project:\s*(.+)/, 1);
  result.projectName = projName;

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

  // pdfjs text: "Geographical Site  Lydex Rabat  Maroc  Situation  Latitude..."
  // pdfplumber: "Geographical Site\nLydex Rabat\nMaroc"
  {
    const geoMatch = p2.match(/Geographical\s+Site\s+(?:Situation\s+)?(.+?)(?:\s+Situation|\s+Latitude)/);
    if (geoMatch && !result.location) {
      // Split by country name to separate location and country
      const raw = geoMatch[1].trim();
      const countryMatch = raw.match(/\s+(Maroc|Morocco|France|Spain|Germany|Italy|Algeria|Tunisia|Egypt|USA|India|China|UK)\b/i);
      if (countryMatch) {
        result.location = raw.substring(0, countryMatch.index).trim().replace(/_/g, " ");
        if (!result.country) result.country = countryMatch[1];
      } else {
        result.location = raw.replace(/_/g, " ");
      }
    }
  }

  if (!result.country) {
    const country = p2.match(/(?:Maroc|Morocco|France|Spain|Germany|Italy)/);
    if (country) result.country = country[0];
  }

  // pdfplumber: "Latitude 33.99°N" / "Longitude -6.71°W"
  // pdfjs: "Latitude Longitude Altitude Time zone 33.99 -6.71 138 UTC °N °W m"
  {
    let latStr = _find(p2, /Latitude\s+([\d.]+)\s*°?\s*([NS])/, 0);
    if (latStr) {
      let latVal = _num(latStr);
      if (latVal != null && /S/i.test(latStr)) latVal = -latVal;
      result.latitude = latVal;
    }
    let lonStr = _find(p2, /Longitude\s+([-\d.]+)\s*°?\s*([EW]?)/, 0);
    if (lonStr) {
      let lonVal = _num(lonStr);
      if (lonVal != null) {
        if (/W/i.test(lonStr) && lonVal > 0) lonVal = -lonVal;
        result.longitude = lonVal;
      }
    }
    // pdfjs fallback: "Latitude Longitude ... 33.99 -6.71 ... °N °W"
    if (result.latitude == null) {
      const m = p2.match(/Latitude\s+Longitude[\s\S]*?([\d.]+)\s+([-\d.]+)\s+[\s\S]*?(°[NS])\s+(°[EW])/);
      if (m) {
        let latVal = parseFloat(m[1]);
        if (m[3] === "°S") latVal = -latVal;
        result.latitude = latVal;
        let lonVal = parseFloat(m[2]);
        if (m[4] === "°W" && lonVal > 0) lonVal = -lonVal;
        result.longitude = lonVal;
      }
    }
  }

  const tiltAz = _find(p2, /Tilt\/Azimuth\s+(-?[\d.]+)\s*\/\s*(-?[\d.]+)/, 0);
  if (tiltAz) {
    const t = tiltAz.match(/(-?[\d.]+)\s*\//);
    const a = tiltAz.match(/\/\s*(-?[\d.]+)/);
    if (t) result.tilt = _num(t[1]);
    if (a) result.azimuth = _num(a[1]);
  }

  if (p2.includes("Fixed plane") || fullText.includes("Fixed plane")) result.systemConfig = "Fixed plane";
  else if (fullText.includes("Single-axis")) result.systemConfig = "Single-axis tracking";
  else if (fullText.includes("Two-axis")) result.systemConfig = "Two-axis tracking";

  const pnom_kwp = _num(_find(p2, /Pnom\s+total\s+([\d.,]+)\s*kWp/, 1));
  const pnom_wp = _num(_find(p2, /Pnom\s+total\s+([\d.,]+)\s*Wp/, 1));
  let _capSourceIsKwp = false;
  if (pnom_kwp) { result.systemCapacity = pnom_kwp; _capSourceIsKwp = true; }
  else if (pnom_wp) { result.systemCapacity = pnom_wp / 1000; _capSourceIsKwp = true; }
  else if (cover_power_kwp) { result.systemCapacity = cover_power_kwp; _capSourceIsKwp = true; }
  else if (cover_power_wp) { result.systemCapacity = cover_power_wp / 1000; _capSourceIsKwp = true; }

  // pdfjs: "Nb. of modules Pnom total 3128 1814 units kWp" — first number is modules
  let nbModules = _num(_find(p2, /Nb\.\s*of\s+modules\s+([\d]+)/, 1));
  if (nbModules == null) {
    const m = p2.match(/Nb\.\s*of\s+modules\s+(?:Pnom\s+total\s+)?([\d]+)/);
    if (m) nbModules = _num(m[1]);
  }
  result.numModules = nbModules != null ? Math.floor(nbModules) : null;

  // DC/AC ratio: look for a decimal number (contains ".") near "Pnom ratio"
  // pdfjs p2: "Pnom total Pnom ratio 9 1575 1.152 units kWac" — ratio is "1.152"
  // pdfplumber: "Pnom ratio 1.152"
  {
    let ratio = _num(_find(p2, /Pnom\s+ratio\s+([\d]+\.[\d]+)/, 1));
    if (!ratio) {
      // pdfjs: find first decimal number after "Pnom ratio"
      const m = p2.match(/Pnom\s+ratio[\s\S]*?([\d]+\.[\d]+)/);
      if (m) ratio = _num(m[1]);
    }
    result.dcAcRatio = ratio;
  }

  // pdfplumber: "Produced Energy 2947380kWh/year"
  // pdfjs: "Produced Energy Used Energy 2947380 3329109 kWh/year"
  let produced = _num(_find(p2, /Produced\s+Energy\s+([\d.,]+)\s*kWh\/year/, 1));
  if (!produced) {
    const m = p2.match(/Produced\s+Energy\s+(?:Used\s+Energy\s+)?([\d.,]+)/);
    if (m) produced = _num(m[1]);
  }
  // pdfjs: "Specific production Perf. Ratio PR 1625 79.62 kWh/kWp/year %"
  let specProd = _num(_find(p2, /Specific\s+production\s+([\d.,]+)\s*kWh\/kWp\/year/, 1));
  if (!specProd) {
    const m = p2.match(/Specific\s+production\s+(?:Perf\.\s*Ratio\s+PR\s+)?([\d.,]+)/);
    if (m) specProd = _num(m[1]);
  }
  // pdfjs: "Perf. Ratio PR Solar Fraction SF 79.62 36.92 % %" — first number is PR
  let pr = _num(_find(p2, /Perf\.\s*Ratio\s+PR\s+([\d.,]+)\s*%/, 1));
  if (!pr) {
    const m = p2.match(/Perf\.\s*Ratio\s+PR\s+(?:[A-Za-z\s.]+?)?([\d.,]+)\s*%?/);
    if (m) pr = _num(m[1]);
  }
  result.specificYield = specProd;
  result.performanceRatio = pr;

  // System type: first check cover page header for explicit declaration
  const coverType = _find(p1, /Simulation\s+report\s*[\n\r]*(.*?System)/i, 1);
  const hasBattery = /Battery\s+pack|Battery\s+Storage|Storage\s+strategy:\s*Self.?consumption/i.test(p2);
  const hasGrid = /E_Grid|EFrGrid|Grid.Connected/i.test(fullText);
  if (coverType && /grid.connected\s+system/i.test(coverType) && !hasBattery) {
    result.systemType = "grid-connected";
  } else if (hasBattery && hasGrid) {
    result.systemType = "grid-connected-battery";
  } else if (hasBattery) {
    result.systemType = "battery";
  } else {
    result.systemType = "grid-connected";
  }

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

  // pdfjs fallback: "Manufacturer Model <Name> <Model> (Original PVsyst database)"
  // First occurrence = PV module, second = inverter
  if (!result.moduleManufacturer || !result.inverterManufacturer) {
    const mfrMatches = [...p3.matchAll(/Manufacturer\s+Model\s+(.+?)\s+(\S+)\s+\(Original/g)];
    if (mfrMatches.length >= 1 && !result.moduleManufacturer) {
      result.moduleManufacturer = mfrMatches[0][1].trim();
      result.moduleModel = mfrMatches[0][2].trim();
    }
    if (mfrMatches.length >= 2 && !result.inverterManufacturer) {
      result.inverterManufacturer = mfrMatches[1][1].trim();
      result.inverterModel = mfrMatches[1][2].trim();
    }
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
  if (!result.numModules) {
    const nm = _num(_find(p3, /Number\s+of\s+PV\s+modules\s+([\d]+)/, 1));
    result.numModules = nm != null ? Math.floor(nm) : null;
  }
  // Inverter total power from p2/p3
  // pdfplumber: "Total power 1575kWac" or "Pnom total 1575kWac"
  // pdfjs: "Pnom total Pnom ratio 9 1575 1.152 units kWac" or "... 1 4000 1.110 unit W"
  {
    let invAC = null;
    // pdfplumber-style: "Total power NNNkWac"
    invAC = _num(_find(p3, /Total\s+(?:inverter\s+)?power\s+([\d.,]+)\s*kWac/, 1));

    // pdfjs-style: inverter section has "Pnom total Pnom ratio <units> <power> <ratio> unit(s) kWac|W"
    if (!invAC) {
      const m = p2.match(/Inverters.*?Pnom\s+total\s+Pnom\s+ratio\s+(\d+)\s+([\d.,]+)\s+[\d.,]+\s+units?\s+(kWac|W)\b/);
      if (m) {
        invAC = _num(m[2]);
        if (m[3] === "W" && invAC != null) invAC = invAC / 1000;
      }
    }

    // Fallback: unit nominal power from p3
    if (!invAC) invAC = _num(_find(p3, /Unit\s+Nom\.\s+Power\s+([\d.,]+)\s*kWac/, 1));
    if (invAC) result.ratedPowerAC = invAC;
  }
  if (!result.dcAcRatio) result.dcAcRatio = _num(_find(p3, /Pnom\s+ratio\s+(?:\(DC:AC\)\s+)?([\d.,]+)/, 1));
  const nominalStcKwp = _num(_find(p3, /Nominal\s+\(STC\)\s+([\d.,]+)\s*kWp/, 1));
  if (nominalStcKwp && !result.systemCapacity) { result.systemCapacity = nominalStcKwp; _capSourceIsKwp = true; }

  // pdfplumber: "Loss factor 0.4%/year"
  // pdfjs: "degradation  Year no Loss factor 10 0.4 %/year"
  let deg = _num(_find(p4, /Loss\s+factor\s+([\d.,]+)\s*%\/year/, 1));
  if (deg == null) {
    const m = fullText.match(/([\d.,]+)\s*%\/year/);
    if (m) deg = _num(m[1]);
  }
  result.degradationRate = deg;

  const simYear = _num(_find(fullText, /(?:Simulation\s+for\s+year\s+no|Year\s+no)\s+(\d+)/, 1));
  result.simulationYear = simYear != null ? Math.floor(simYear) : null;

  // Search pages with energy balance table (containing GlobHor legend) for Year summary row
  for (const pg of pagesText) {
    if (!/GlobHor/i.test(pg)) continue;
    const yearMatch = pg.match(/Year\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (yearMatch) {
      result.ghi = parseFloat(yearMatch[1]);
      result.gti = parseFloat(yearMatch[4]);
      break;
    }
  }
  for (const pg of pagesText) {
    // pdfplumber: "Produced Energy 2947380kWh/year"
    // pdfjs:      "Produced Energy Used Energy 2947380 3329109 kWh/year"
    let prodPg = _num(_find(pg, /Produced\s+Energy\s+([\d.,]+)\s*kWh\/year/, 1));
    if (!prodPg) {
      const m = pg.match(/Produced\s+Energy\s+(?:Used\s+Energy\s+)?([\d.,]+)/);
      if (m) prodPg = _num(m[1]);
    }
    let specPg = _num(_find(pg, /Specific\s+production\s+([\d.,]+)\s*kWh\/kWp\/year/, 1));
    if (!specPg) {
      const m = pg.match(/Specific\s+production\s+(?:Perf\.\s*Ratio\s+PR\s+)?([\d.,]+)/);
      if (m) specPg = _num(m[1]);
    }
    let prPg = _num(_find(pg, /Perf\.\s*Ratio\s+PR\s+([\d.,]+)\s*%/, 1));
    if (!prPg) {
      const m = pg.match(/Perf\.\s*Ratio\s+PR\s+([\d.,]+)/);
      if (m) prPg = _num(m[1]);
    }
    if (prodPg) result.annualEnergy = prodPg;
    if (specPg) result.specificYield = specPg;
    if (prPg) result.performanceRatio = prPg;
    if (prodPg || specPg || prPg) break;
  }

  // Only convert if capacity was NOT already parsed from a kWp source
  // (e.g. Nominal STC from page 3 might be in Wp if very large)
  if (result.systemCapacity != null && result.systemCapacity > 100000 && !_capSourceIsKwp) result.systemCapacity /= 1000;
  // ratedPowerAC is parsed from kWac fields, no unit conversion needed
  if (!result.ratedPowerAC) {
    const invWVal = _num(_find(p2, /(?:Inverters.*?Pnom\s+total\s+)([\d.,]+)\s*W/, 1));
    if (invWVal != null) result.ratedPowerAC = invWVal > 100 ? invWVal / 1000 : invWVal;
  }
  if (result.location) result.location = result.location.replace(/_/g, " ").trim();

  return result;
}
