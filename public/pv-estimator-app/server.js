const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);
const WORKSPACE_ROOT = path.resolve(__dirname, "..");


const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(text);
}

function pvgisTimeToIso(value) {
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  const hour = value.slice(9, 11);
  const minute = value.slice(11, 13);
  return `${year}-${month}-${day}T${hour}:${minute}:00.000Z`;
}

function normalizePvgisPayload(payload) {
  const rows = payload?.outputs?.tmy_hourly || [];
  const records = rows.map((row) => ({
    time: pvgisTimeToIso(row["time(UTC)"]),
    ghi: row["G(h)"],
    dni: row["Gb(n)"],
    dhi: row["Gd(h)"],
    temp: row.T2m,
    wind: row.WS10m,
    rh: row.RH,
    pressure: row.SP ? row.SP / 100 : null,
  }));

  return {
    records,
    meta: {
      ready: records.length > 0,
      rowCount: records.length,
      timestepHours: 1,
      start: records[0]?.time || null,
      end: records[records.length - 1]?.time || null,
      annualizationFactor: 1,
      coverageDays: 365,
      usesImportedPoa: false,
      timestampsUtc: true,
      issues: [
        "Typical meteorological year from PVGIS. Loaded through the local proxy because the official PVGIS API blocks direct browser AJAX requests.",
      ],
    },
    source: {
      provider: "pvgis",
      label: "PVGIS TMY",
      note: "PVGIS TMY loaded through the local proxy.",
    },
  };
}

function normalizeOpenMeteoPayload(payload) {
  const hourly = payload?.hourly || {};
  const times = hourly.time || [];
  const records = times.map((time, index) => ({
    time: new Date(time).toISOString(),
    ghi: hourly.shortwave_radiation?.[index] ?? null,
    dni: hourly.direct_normal_irradiance?.[index] ?? null,
    dhi: hourly.diffuse_radiation?.[index] ?? null,
    temp: hourly.temperature_2m?.[index] ?? null,
    wind: hourly.wind_speed_10m?.[index] ?? null,
    rh: hourly.relative_humidity_2m?.[index] ?? null,
    pressure: hourly.surface_pressure?.[index] ?? null,
  }));

  return {
    records,
    meta: {
      ready: records.length > 0,
      rowCount: records.length,
      timestepHours: 1,
      start: records[0]?.time || null,
      end: records[records.length - 1]?.time || null,
      annualizationFactor: 1,
      coverageDays: 365,
      usesImportedPoa: false,
      timestampsUtc: true,
      issues: [
        "Historical weather year from Open-Meteo ERA5 reanalysis. This is a single calendar year, not a statistically synthesized TMY.",
      ],
    },
    source: {
      provider: "openmeteo",
      label: "Open-Meteo ERA5",
      note: "Open-Meteo ERA5 historical year loaded through the local proxy.",
    },
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Upstream request failed with HTTP ${response.status}`);
  }
  return response.json();
}

// --- CEC/SAM PV Module Database ---
const CEC_CSV_URL = "https://raw.githubusercontent.com/NREL/SAM/develop/deploy/libraries/CEC%20Modules.csv";
let cachedModules = null;

function parseCecCsv(csvText) {
  const lines = csvText.split("\n");
  // Row 0 = headers, Row 1 = units, Row 2 = internal names, Row 3+ = data
  const headers = lines[0].split(",").map(h => h.trim());
  const col = (name) => headers.indexOf(name);

  const modules = [];
  for (let i = 3; i < lines.length; i++) {
    const row = lines[i];
    if (!row.trim()) continue;
    // Handle quoted fields
    const fields = [];
    let current = "";
    let inQuotes = false;
    for (const ch of row) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    fields.push(current.trim());

    const name = fields[col("Name")] || "";
    const manufacturer = fields[col("Manufacturer")] || "";
    if (!name) continue;

    const model = manufacturer && name.startsWith(manufacturer)
      ? name.slice(manufacturer.length).trim()
      : name;

    const stc = parseFloat(fields[col("STC")]);
    const lengthM = parseFloat(fields[col("Length")]);
    const widthM = parseFloat(fields[col("Width")]);
    const gammaPmp = parseFloat(fields[col("gamma_pmp")]);
    const technology = fields[col("Technology")] || "";
    const bifacial = fields[col("Bifacial")] === "1";
    const tNoct = parseFloat(fields[col("T_NOCT")]);

    if (!Number.isFinite(stc) || stc <= 0) continue;

    modules.push({
      name,
      manufacturer,
      model,
      powerWp: Math.round(stc * 10) / 10,
      lengthM: Number.isFinite(lengthM) ? Math.round(lengthM * 1000) / 1000 : null,
      widthM: Number.isFinite(widthM) ? Math.round(widthM * 1000) / 1000 : null,
      tempCoeffPctPerC: Number.isFinite(gammaPmp) ? Math.round(gammaPmp * 1000) / 1000 : null,
      technology,
      bifacial,
      tNoct: Number.isFinite(tNoct) ? tNoct : null,
    });
  }
  return modules;
}

async function loadModuleDatabase() {
  if (cachedModules) return cachedModules;
  const response = await fetch(CEC_CSV_URL);
  if (!response.ok) throw new Error(`Failed to fetch CEC module database: HTTP ${response.status}`);
  const csvText = await response.text();
  cachedModules = parseCecCsv(csvText);
  console.log(`Loaded ${cachedModules.length} PV modules from CEC database.`);
  return cachedModules;
}

async function getModuleManufacturers() {
  const modules = await loadModuleDatabase();
  const set = new Set(modules.map(m => m.manufacturer).filter(Boolean));
  return [...set].sort();
}

async function searchModules({ q, manufacturer, powerMin, powerMax } = {}) {
  const modules = await loadModuleDatabase();
  let results = modules;
  if (manufacturer) {
    results = results.filter(m => m.manufacturer === manufacturer);
  }
  if (Number.isFinite(powerMin)) {
    results = results.filter(m => m.powerWp >= powerMin);
  }
  if (Number.isFinite(powerMax)) {
    results = results.filter(m => m.powerWp <= powerMax);
  }
  if (q) {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    results = results.filter(m => {
      const haystack = m.name.toLowerCase();
      return terms.every(t => haystack.includes(t));
    });
  }
  return results.slice(0, 50);
}

// --- CEC/SAM Inverter Database ---
const CEC_INVERTERS_URL = "https://raw.githubusercontent.com/NREL/SAM/develop/deploy/libraries/CEC%20Inverters.csv";
let cachedInverters = null;

function parseCecInvertersCsv(csvText) {
  const lines = csvText.split("\n");
  const headers = lines[0].split(",").map(h => h.trim());
  const col = (name) => headers.indexOf(name);

  const inverters = [];
  for (let i = 3; i < lines.length; i++) {
    const row = lines[i];
    if (!row.trim()) continue;
    const fields = [];
    let current = "";
    let inQuotes = false;
    for (const ch of row) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    fields.push(current.trim());

    const name = fields[col("Name")] || "";
    if (!name) continue;

    // Name format: "Manufacturer: Model [Voltage]" or "Manufacturer Model"
    let manufacturer = "";
    let model = name;
    const colonIdx = name.indexOf(":");
    if (colonIdx > 0) {
      manufacturer = name.slice(0, colonIdx).trim();
      model = name.slice(colonIdx + 1).trim();
    }

    const paco = parseFloat(fields[col("Paco")]);
    const pdco = parseFloat(fields[col("Pdco")]);
    const vac = parseFloat(fields[col("Vac")]);
    const vdcmax = parseFloat(fields[col("Vdcmax")]);
    const mpptLow = parseFloat(fields[col("Mppt_low")]);
    const mpptHigh = parseFloat(fields[col("Mppt_high")]);

    if (!Number.isFinite(paco) || paco <= 0) continue;

    const efficiencyPct = Number.isFinite(pdco) && pdco > 0
      ? Math.round((paco / pdco) * 10000) / 100
      : null;

    inverters.push({
      name,
      manufacturer,
      model,
      pacoKw: Math.round(paco / 10) / 100,
      pdcoKw: Number.isFinite(pdco) ? Math.round(pdco / 10) / 100 : null,
      efficiencyPct,
      vacV: Number.isFinite(vac) ? vac : null,
      vdcmaxV: Number.isFinite(vdcmax) ? vdcmax : null,
      mpptLowV: Number.isFinite(mpptLow) ? mpptLow : null,
      mpptHighV: Number.isFinite(mpptHigh) ? mpptHigh : null,
    });
  }
  return inverters;
}

async function loadInverterDatabase() {
  if (cachedInverters) return cachedInverters;
  const response = await fetch(CEC_INVERTERS_URL);
  if (!response.ok) throw new Error(`Failed to fetch CEC inverter database: HTTP ${response.status}`);
  const csvText = await response.text();
  cachedInverters = parseCecInvertersCsv(csvText);
  console.log(`Loaded ${cachedInverters.length} inverters from CEC database.`);
  return cachedInverters;
}

async function getInverterManufacturers() {
  const inverters = await loadInverterDatabase();
  const set = new Set(inverters.map(inv => inv.manufacturer).filter(Boolean));
  return [...set].sort();
}

async function searchInverters({ q, manufacturer, capacityMin, capacityMax } = {}) {
  const inverters = await loadInverterDatabase();
  let results = inverters;
  if (manufacturer) {
    results = results.filter(inv => inv.manufacturer === manufacturer);
  }
  if (Number.isFinite(capacityMin)) {
    results = results.filter(inv => inv.pacoKw >= capacityMin);
  }
  if (Number.isFinite(capacityMax)) {
    results = results.filter(inv => inv.pacoKw <= capacityMax);
  }
  if (q) {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    results = results.filter(inv => {
      const haystack = inv.name.toLowerCase();
      return terms.every(t => haystack.includes(t));
    });
  }
  return results.slice(0, 50);
}

async function loadWeather(provider, latitude, longitude) {
  if (provider === "openmeteo") {
    const lastYear = new Date().getFullYear() - 1;
    const url = new URL("https://archive-api.open-meteo.com/v1/archive");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("start_date", `${lastYear}-01-01`);
    url.searchParams.set("end_date", `${lastYear}-12-31`);
    url.searchParams.set("hourly", "shortwave_radiation,direct_normal_irradiance,diffuse_radiation,temperature_2m,wind_speed_10m,relative_humidity_2m,surface_pressure");
    url.searchParams.set("wind_speed_unit", "ms");
    url.searchParams.set("timezone", "UTC");
    const payload = await fetchJson(url);
    return normalizeOpenMeteoPayload(payload);
  }

  const url = new URL("https://re.jrc.ec.europa.eu/api/v5_3/tmy");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("outputformat", "json");
  const payload = await fetchJson(url);
  return normalizePvgisPayload(payload);
}

async function serveStatic(requestPath, response) {
  let pathname = requestPath;
  if (pathname === "/") {
    response.writeHead(302, { Location: "/pv-estimator-app/" });
    response.end();
    return;
  }

  if (pathname.endsWith("/")) {
    pathname += "index.html";
  }

  const filePath = path.resolve(WORKSPACE_ROOT, `.${pathname}`);
  if (!filePath.startsWith(WORKSPACE_ROOT)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=60",
    });
    response.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(response, 404, "Not found");
      return;
    }
    sendText(response, 500, "Internal server error");
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (requestUrl.pathname === "/api/inverters/manufacturers") {
    try {
      const manufacturers = await getInverterManufacturers();
      sendJson(response, 200, { manufacturers });
    } catch (error) {
      sendJson(response, 502, { error: `Inverter database error: ${error.message}` });
    }
    return;
  }

  if (requestUrl.pathname === "/api/inverters") {
    const q = (requestUrl.searchParams.get("q") || "").trim();
    const manufacturer = (requestUrl.searchParams.get("manufacturer") || "").trim();
    const capacityMin = Number(requestUrl.searchParams.get("capacityMin"));
    const capacityMax = Number(requestUrl.searchParams.get("capacityMax"));
    const hasCapacityFilter = Number.isFinite(capacityMin) || Number.isFinite(capacityMax);
    if (!manufacturer && !hasCapacityFilter && q.length < 2) {
      sendJson(response, 400, { error: "Provide a manufacturer, capacity range, or a query of at least 2 characters." });
      return;
    }
    try {
      const inverters = await searchInverters({
        q: q || undefined,
        manufacturer: manufacturer || undefined,
        capacityMin: Number.isFinite(capacityMin) ? capacityMin : undefined,
        capacityMax: Number.isFinite(capacityMax) ? capacityMax : undefined,
      });
      sendJson(response, 200, { inverters });
    } catch (error) {
      sendJson(response, 502, { error: `Inverter database error: ${error.message}` });
    }
    return;
  }

  if (requestUrl.pathname === "/api/modules/manufacturers") {
    try {
      const manufacturers = await getModuleManufacturers();
      sendJson(response, 200, { manufacturers });
    } catch (error) {
      sendJson(response, 502, { error: `Module database error: ${error.message}` });
    }
    return;
  }

  if (requestUrl.pathname === "/api/modules") {
    const q = (requestUrl.searchParams.get("q") || "").trim();
    const manufacturer = (requestUrl.searchParams.get("manufacturer") || "").trim();
    const powerMin = Number(requestUrl.searchParams.get("powerMin"));
    const powerMax = Number(requestUrl.searchParams.get("powerMax"));
    const hasPowerFilter = Number.isFinite(powerMin) || Number.isFinite(powerMax);
    if (!manufacturer && !hasPowerFilter && q.length < 2) {
      sendJson(response, 400, { error: "Provide a manufacturer, power range, or a query of at least 2 characters." });
      return;
    }
    try {
      const modules = await searchModules({
        q: q || undefined,
        manufacturer: manufacturer || undefined,
        powerMin: Number.isFinite(powerMin) ? powerMin : undefined,
        powerMax: Number.isFinite(powerMax) ? powerMax : undefined,
      });
      sendJson(response, 200, { modules });
    } catch (error) {
      sendJson(response, 502, { error: `Module database error: ${error.message}` });
    }
    return;
  }

  if (requestUrl.pathname === "/api/weather") {
    const provider = requestUrl.searchParams.get("provider") || "pvgis";
    const latitude = Number(requestUrl.searchParams.get("lat"));
    const longitude = Number(requestUrl.searchParams.get("lon"));

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      sendJson(response, 400, { error: "Latitude and longitude are required numeric values." });
      return;
    }

    if (!["pvgis", "openmeteo"].includes(provider)) {
      sendJson(response, 400, { error: "Unsupported weather provider." });
      return;
    }

    try {
      const payload = await loadWeather(provider, latitude, longitude);
      sendJson(response, 200, payload);
    } catch (error) {
      sendJson(response, 502, {
        error:
          provider === "openmeteo"
            ? `Open-Meteo request failed. ${error.message}`
            : `PVGIS request failed. ${error.message}`,
      });
    }
    return;
  }

  await serveStatic(requestUrl.pathname, response);
});

server.listen(PORT, HOST, () => {
  console.log(`PV estimator server running at http://${HOST}:${PORT}/pv-estimator-app/`);
});
