import { trimRowModuleCountForMinSegmentWidthM } from "./layout-exclusions.js";

export const MAPPING_SPECS = [
  {
    key: "time",
    label: "Timestamp",
    required: true,
    aliases: ["time", "timestamp", "date", "datetime", "localtime"],
  },
  {
    key: "poa",
    label: "POA / GTI",
    required: false,
    aliases: ["poa", "gti", "poai", "globalpoa", "planeofarray"],
  },
  {
    key: "ghi",
    label: "GHI",
    required: false,
    aliases: ["ghi", "globalhorizontalirradiance", "globhor"],
  },
  {
    key: "dhi",
    label: "DHI",
    required: false,
    aliases: ["dhi", "diffusehorizontalirradiance", "diffhor"],
  },
  {
    key: "dni",
    label: "DNI",
    required: false,
    aliases: ["dni", "beamnormalirradiance", "directnormalirradiance", "bn"],
  },
  {
    key: "temp",
    label: "Ambient temperature",
    required: true,
    aliases: ["airtemp", "ambienttemp", "temp", "temperature", "drybulb"],
  },
  {
    key: "wind",
    label: "Wind speed",
    required: false,
    aliases: ["windspeed", "wind", "ws", "windvelocity"],
  },
];

const YEAR_COUNT = 25;
const SOLAR_CONSTANT = 1367;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function radians(value) {
  return (value * Math.PI) / 180;
}

function degrees(value) {
  return (value * 180) / Math.PI;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function splitCsvLine(line, delimiter) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const candidate = String(value).trim().replace(/\s+/g, "");
  if (!candidate) {
    return null;
  }

  const normalized =
    candidate.includes(",") && !candidate.includes(".")
      ? candidate.replace(",", ".")
      : candidate.replace(/,/g, "");

  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseTimestamp(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  const isoCandidate = raw.includes("T") ? raw : raw.replace(" ", "T");
  const direct = new Date(isoCandidate);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const parts = raw.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!parts) {
    return null;
  }

  const [, first, second, yearRaw, hour = "0", minute = "0", secondValue = "0"] = parts;
  const year = yearRaw.length === 2 ? Number(`20${yearRaw}`) : Number(yearRaw);
  const month = Number(first) > 12 ? Number(second) - 1 : Number(first) - 1;
  const day = Number(first) > 12 ? Number(first) : Number(second);
  const parsed = new Date(year, month, day, Number(hour), Number(minute), Number(secondValue));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getMedian(values) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function dayOfYear(date, useUtc = false) {
  const year = useUtc ? date.getUTCFullYear() : date.getFullYear();
  const start = useUtc ? new Date(Date.UTC(year, 0, 0)) : new Date(year, 0, 0);
  const diff = date - start;
  return Math.floor(diff / 86400000);
}

function inferredSolarTimezone(longitudeDeg) {
  return Math.round(longitudeDeg / 15);
}

function coverageDays(records) {
  if (records.length < 2) {
    return 0;
  }

  const first = records[0].time.getTime();
  const last = records[records.length - 1].time.getTime();
  return Math.max((last - first) / 86400000, 0);
}

function estimateDiffuseComponents(ghi, cosZenith, dayIndex) {
  const extraterrestrialHorizontal =
    SOLAR_CONSTANT * (1 + 0.033 * Math.cos((2 * Math.PI * dayIndex) / 365)) * cosZenith;

  if (ghi <= 0 || extraterrestrialHorizontal <= 0 || cosZenith <= 0) {
    return { dhi: 0, dni: 0 };
  }

  const clearnessIndex = clamp(ghi / extraterrestrialHorizontal, 0, 1.5);
  let diffuseFraction;

  if (clearnessIndex <= 0.22) {
    diffuseFraction = 1 - 0.09 * clearnessIndex;
  } else if (clearnessIndex <= 0.8) {
    diffuseFraction =
      0.9511 -
      0.1604 * clearnessIndex +
      4.388 * clearnessIndex ** 2 -
      16.638 * clearnessIndex ** 3 +
      12.336 * clearnessIndex ** 4;
  } else {
    diffuseFraction = 0.165;
  }

  const dhi = clamp(ghi * diffuseFraction, 0, ghi);
  const dni = Math.max((ghi - dhi) / cosZenith, 0);
  return { dhi, dni };
}

export function parseCsv(text) {
  const sanitized = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!sanitized) {
    return { delimiter: ",", headers: [], rows: [], headerIndex: new Map() };
  }

  const lines = sanitized.split(/\r?\n/).filter((line) => line.trim());
  const delimiter =
    (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const headers = splitCsvLine(lines[0], delimiter).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => splitCsvLine(line, delimiter));
  const headerIndex = new Map(headers.map((header, index) => [header, index]));

  return { delimiter, headers, rows, headerIndex };
}

export function detectColumns(headers) {
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  const mapping = {};

  for (const spec of MAPPING_SPECS) {
    const matchedIndex = normalizedHeaders.findIndex((header) =>
      spec.aliases.some((alias) => normalizeHeader(alias) === header)
    );

    mapping[spec.key] = matchedIndex >= 0 ? headers[matchedIndex] : "";
  }

  return mapping;
}

export function buildWeatherRecords(parsedCsv, mapping) {
  const requiredColumnsPresent =
    mapping.time &&
    mapping.temp &&
    (mapping.poa || mapping.ghi || (mapping.dhi && mapping.dni));

  if (!requiredColumnsPresent) {
    return {
      records: [],
      meta: {
        ready: false,
        issues: [
          "Need timestamp, ambient temperature, and either POA or horizontal irradiance columns.",
        ],
      },
    };
  }

  const indexFor = (column) => parsedCsv.headerIndex.get(column);
  const recordList = [];
  const issues = [];

  for (const row of parsedCsv.rows) {
    const time = parseTimestamp(row[indexFor(mapping.time)]);
    if (!time) {
      continue;
    }

    const poa = mapping.poa ? parseNumber(row[indexFor(mapping.poa)]) : null;
    const ghi = mapping.ghi ? parseNumber(row[indexFor(mapping.ghi)]) : null;
    const dhi = mapping.dhi ? parseNumber(row[indexFor(mapping.dhi)]) : null;
    const dni = mapping.dni ? parseNumber(row[indexFor(mapping.dni)]) : null;
    const temp = parseNumber(row[indexFor(mapping.temp)]);
    const wind = mapping.wind ? parseNumber(row[indexFor(mapping.wind)]) : null;

    if (temp === null) {
      continue;
    }

    if (poa === null && ghi === null && !(dhi !== null && dni !== null)) {
      continue;
    }

    recordList.push({
      time,
      poa,
      ghi,
      dhi,
      dni,
      temp,
      wind,
    });
  }

  recordList.sort((left, right) => left.time - right.time);

  const stepCandidates = [];
  for (let index = 1; index < Math.min(recordList.length, 150); index += 1) {
    const diffHours = (recordList[index].time - recordList[index - 1].time) / 3600000;
    if (diffHours > 0) {
      stepCandidates.push(diffHours);
    }
  }

  const timestepHours = getMedian(stepCandidates) || 1;
  const importedCoverageDays = coverageDays(recordList);
  const annualizationFactor =
    importedCoverageDays >= 300 ? 1 : importedCoverageDays > 0 ? 365 / importedCoverageDays : 1;

  if (importedCoverageDays > 0 && importedCoverageDays < 300) {
    issues.push(
      `Imported weather covers ${importedCoverageDays.toFixed(
        1
      )} days, so annual KPIs use a scaled representative-year replay.`
    );
  }

  if (!mapping.wind) {
    issues.push("Wind speed is missing, so the thermal model uses 0 m/s by default.");
  }

  return {
    records: recordList,
    meta: {
      ready: recordList.length > 0,
      rowCount: recordList.length,
      timestepHours,
      start: recordList[0]?.time || null,
      end: recordList[recordList.length - 1]?.time || null,
      annualizationFactor,
      coverageDays: importedCoverageDays,
      usesImportedPoa: Boolean(mapping.poa),
      timestampsUtc: false,
      issues,
    },
  };
}

export function rectangleMetrics(widthM, depthM, edgeSetbackWidthM, edgeSetbackDepthM = 0) {
  const width = Math.max(widthM || 0, 0);
  const depth = Math.max(depthM || 0, 0);
  const sw = Math.max(edgeSetbackWidthM || 0, 0);
  const sd = Math.max(edgeSetbackDepthM || 0, 0);
  const netWidth = Math.max(width - 2 * sw, 0);
  const netDepth = Math.max(depth - 2 * sd, 0);

  return {
    grossAreaM2: width * depth,
    netAreaM2: netWidth * netDepth,
    netWidthM: netWidth,
    netDepthM: netDepth,
  };
}

export function winterSolsticeSpacing(latitudeDeg, tiltDeg, slopeLengthM, frontClearanceM) {
  const declinationDeg = latitudeDeg >= 0 ? -23.44 : 23.44;
  const noonAltitudeDeg = clamp(90 - Math.abs(latitudeDeg - declinationDeg), 8, 82);
  const tiltRad = radians(tiltDeg);
  const collectorProjectionM = slopeLengthM * Math.cos(tiltRad);
  const collectorRiseM = slopeLengthM * Math.sin(tiltRad);
  const topHeightM = Math.max(frontClearanceM, 0) + collectorRiseM;
  const clearSpacingM = topHeightM / Math.tan(radians(noonAltitudeDeg));

  return {
    noonAltitudeDeg,
    collectorProjectionM,
    collectorRiseM,
    clearSpacingM,
    rowPitchM: collectorProjectionM + clearSpacingM,
  };
}

export function computeLayout(siteConfig, designConfig) {
  const widthM = Number(designConfig.manualWidthM);
  const depthM = Number(designConfig.manualHeightM);
  const edgeSetbackWidthM = Number(designConfig.edgeSetbackM);
  const edgeSetbackDepthM = Number(designConfig.edgeSetbackDepthM);
  const siteArea = rectangleMetrics(
    widthM,
    depthM,
    edgeSetbackWidthM,
    Number.isFinite(edgeSetbackDepthM) ? edgeSetbackDepthM : 0
  );

  const tiltDeg = Number(designConfig.tiltDeg);
  const moduleLengthM = Number(designConfig.moduleLengthM);
  const moduleWidthM = Number(designConfig.moduleWidthM);
  const moduleGapM = Number(designConfig.moduleGapM);
  const rowSpacingM = Number(designConfig.rowSpacingM);
  const modulePowerWp = Number(designConfig.modulePowerWp);
  const orientation = designConfig.moduleOrientation;
  const frontClearanceM = Number(designConfig.frontClearanceM);
  const slopeLengthM = orientation === "portrait" ? moduleLengthM : moduleWidthM;
  const moduleSpanInRowM = orientation === "portrait" ? moduleWidthM : moduleLengthM;

  const winterSpacing = winterSolsticeSpacing(
    Number(siteConfig.siteLat),
    tiltDeg,
    slopeLengthM,
    frontClearanceM
  );

  const maxRowWidthM = Number(designConfig.maxRowWidthM) || 0;
  const rowWidthGapM = Number(designConfig.rowWidthGapM) || 0;
  const minRowWidthM = Number(designConfig.minRowWidthM) || 0;

  const rowPitchM = winterSpacing.collectorProjectionM + rowSpacingM;
  const moduleStep = Math.max(moduleSpanInRowM + moduleGapM, 0.001);
  let modulesPerRow;
  let modulesPerSegmentForTrim = 0;
  if (maxRowWidthM > 0) {
    const modulesPerSegment = Math.max(Math.floor((maxRowWidthM + moduleGapM) / moduleStep), 1);
    modulesPerSegmentForTrim = modulesPerSegment;
    const segWidthM = modulesPerSegment * moduleStep - moduleGapM;
    const segStepM = segWidthM + moduleGapM + rowWidthGapM;
    const numFullSegments = siteArea.netWidthM >= segWidthM
      ? 1 + Math.max(Math.floor((siteArea.netWidthM - segWidthM) / segStepM), 0)
      : 0;
    const usedWidth = numFullSegments > 0 ? segWidthM + (numFullSegments - 1) * segStepM : 0;
    const remainingWidth = siteArea.netWidthM - usedWidth;
    const tailModules = numFullSegments > 0 && remainingWidth >= rowWidthGapM + moduleSpanInRowM
      ? Math.min(Math.floor((remainingWidth - rowWidthGapM + moduleGapM) / moduleStep), modulesPerSegment)
      : 0;
    modulesPerRow = numFullSegments * modulesPerSegment + tailModules;
  } else {
    modulesPerRow = Math.max(Math.floor((siteArea.netWidthM + moduleGapM) / moduleStep), 0);
  }
  modulesPerRow = trimRowModuleCountForMinSegmentWidthM(
    modulesPerRow,
    modulesPerSegmentForTrim,
    moduleStep,
    moduleGapM,
    minRowWidthM
  );
  if (minRowWidthM > 0 && siteArea.netWidthM < minRowWidthM) {
    modulesPerRow = 0;
  }
  const rowCount = Math.max(
    Math.floor((siteArea.netDepthM + rowSpacingM) / Math.max(rowPitchM, 0.001)),
    0
  );
  const autoModuleCount = modulesPerRow * rowCount;
  const manualModuleCount = Number(designConfig.manualModuleCount);
  const moduleCount =
    Number.isFinite(manualModuleCount) && manualModuleCount > 0
      ? Math.min(Math.floor(manualModuleCount), autoModuleCount)
      : autoModuleCount;
  const moduleAreaM2 = moduleLengthM * moduleWidthM;
  const totalModuleAreaM2 = moduleCount * moduleAreaM2;
  const groundCoverageRatio =
    siteArea.netAreaM2 > 0
      ? (moduleCount * winterSpacing.collectorProjectionM * moduleSpanInRowM) / siteArea.netAreaM2
      : 0;
  const dcCapacityKw = (moduleCount * modulePowerWp) / 1000;
  const autoAcCapacityKw = dcCapacityKw / Math.max(Number(designConfig.targetDcAcRatio) || 1.2, 0.1);
  const manualAcCapacityKw = Number(designConfig.manualAcCapacityKw);
  const acCapacityKw =
    Number.isFinite(manualAcCapacityKw) && manualAcCapacityKw > 0
      ? manualAcCapacityKw
      : autoAcCapacityKw;
  const dcAcRatio = acCapacityKw > 0 ? dcCapacityKw / acCapacityKw : 0;
  const moduleEfficiency = clamp(modulePowerWp / (1000 * Math.max(moduleAreaM2, 0.001)), 0, 1);

  return {
    ...siteArea,
    moduleSpanInRowM,
    moduleAreaM2,
    totalModuleAreaM2,
    rowCount,
    modulesPerRow,
    autoModuleCount,
    moduleCount,
    rowPitchM,
    dcCapacityKw,
    acCapacityKw,
    dcAcRatio,
    moduleEfficiency,
    winterSpacing,
    groundCoverageRatio,
    usesManualModuleCount: moduleCount !== autoModuleCount,
  };
}

export function solarPosition(date, latitudeDeg, longitudeDeg, timezoneOffsetHours, useUtc = false) {
  const latitudeRad = radians(latitudeDeg);
  const hours = useUtc ? date.getUTCHours() : date.getHours();
  const minutes = useUtc ? date.getUTCMinutes() : date.getMinutes();
  const seconds = useUtc ? date.getUTCSeconds() : date.getSeconds();
  const milliseconds = useUtc ? date.getUTCMilliseconds() : date.getMilliseconds();
  const totalMinutes =
    hours * 60 + minutes + seconds / 60 + milliseconds / 60000;
  const dayIndex = dayOfYear(date, useUtc);
  const fractionalYear =
    ((2 * Math.PI) / 365) * (dayIndex - 1 + (totalMinutes / 60 - 12) / 24);
  const declinationRad =
    0.006918 -
    0.399912 * Math.cos(fractionalYear) +
    0.070257 * Math.sin(fractionalYear) -
    0.006758 * Math.cos(2 * fractionalYear) +
    0.000907 * Math.sin(2 * fractionalYear) -
    0.002697 * Math.cos(3 * fractionalYear) +
    0.00148 * Math.sin(3 * fractionalYear);
  const equationOfTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(fractionalYear) -
      0.032077 * Math.sin(fractionalYear) -
      0.014615 * Math.cos(2 * fractionalYear) -
      0.040849 * Math.sin(2 * fractionalYear));
  const tzHours =
    Number.isFinite(timezoneOffsetHours) && timezoneOffsetHours !== null
      ? timezoneOffsetHours
      : inferredSolarTimezone(longitudeDeg);
  const trueSolarMinutes = totalMinutes + equationOfTime + 4 * longitudeDeg - 60 * tzHours;
  const hourAngleDeg = ((trueSolarMinutes / 4 + 360) % 360) - 180;
  const hourAngleRad = radians(hourAngleDeg);
  const cosZenith = clamp(
    Math.sin(latitudeRad) * Math.sin(declinationRad) +
      Math.cos(latitudeRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad),
    -1,
    1
  );
  const zenithRad = Math.acos(cosZenith);
  const elevationDeg = 90 - degrees(zenithRad);
  const azimuthRad = Math.atan2(
    Math.sin(hourAngleRad),
    Math.cos(hourAngleRad) * Math.sin(latitudeRad) - Math.tan(declinationRad) * Math.cos(latitudeRad)
  );
  const azimuthDeg = (degrees(azimuthRad) + 180 + 360) % 360;

  return {
    elevationDeg,
    azimuthDeg,
    zenithDeg: degrees(zenithRad),
    cosZenith: Math.max(cosZenith, 0),
    dayIndex,
  };
}

export function calculatePlaneOfArray(record, siteConfig, designConfig, weatherMeta = {}) {
  const latitudeDeg = Number(siteConfig.siteLat);
  const longitudeDeg = Number(siteConfig.siteLng);
  const timestampsUtc = Boolean(weatherMeta.timestampsUtc);
  const timezoneOffsetHours = timestampsUtc ? 0 : Number(siteConfig.timezoneOffset);
  const albedo = Number(siteConfig.surfaceAlbedo);
  const tiltRad = radians(Number(designConfig.tiltDeg));
  const surfaceAzimuthRad = radians(Number(designConfig.azimuthDeg));
  const solar = solarPosition(
    record.time,
    latitudeDeg,
    longitudeDeg,
    timezoneOffsetHours,
    timestampsUtc
  );

  if (record.poa !== null && record.poa !== undefined) {
    return {
      solar,
      poaWm2: Math.max(record.poa, 0),
      source: "imported-poa",
    };
  }

  if (solar.elevationDeg <= 0) {
    return {
      solar,
      poaWm2: 0,
      source: "transposed",
    };
  }

  const ghi = record.ghi ?? 0;
  const cosZenith = Math.max(solar.cosZenith, 0.0001);
  const estimatedComponents = estimateDiffuseComponents(ghi, cosZenith, solar.dayIndex);
  const dhi =
    record.dhi ??
    (record.dni !== null && record.dni !== undefined
      ? Math.max(ghi - record.dni * cosZenith, 0)
      : estimatedComponents.dhi);
  const dni =
    record.dni ??
    (record.dhi !== null && record.dhi !== undefined
      ? Math.max((ghi - record.dhi) / cosZenith, 0)
      : estimatedComponents.dni);
  const zenithRad = radians(solar.zenithDeg);
  const incidenceCos =
    Math.cos(zenithRad) * Math.cos(tiltRad) +
    Math.sin(zenithRad) * Math.sin(tiltRad) * Math.cos(radians(solar.azimuthDeg) - surfaceAzimuthRad);
  const beamTilted = dni * Math.max(incidenceCos, 0);
  const extraterrestrialNormal =
    SOLAR_CONSTANT * (1 + 0.033 * Math.cos((2 * Math.PI * solar.dayIndex) / 365));
  const rb = Math.max(incidenceCos, 0) / cosZenith;
  const anisotropyIndex = clamp(dni / Math.max(extraterrestrialNormal, 1), 0, 1);
  const diffuseTilted =
    dhi * (anisotropyIndex * rb + (1 - anisotropyIndex) * ((1 + Math.cos(tiltRad)) / 2));
  const reflected = ghi * albedo * ((1 - Math.cos(tiltRad)) / 2);

  return {
    solar,
    poaWm2: Math.max(beamTilted + diffuseTilted + reflected, 0),
    source: "transposed",
  };
}

export function simulateRepresentativeYear(weatherState, siteConfig, designConfig, layout) {
  const { records, meta } = weatherState;
  if (!records?.length) {
    return null;
  }

  const inverterEfficiency = Number(designConfig.inverterEfficiencyPct) / 100;
  const soilingFactor = 1 - Math.abs(Number(designConfig.soilingLossPct)) / 100;
  const iamFactor = 1 - Math.abs(Number(designConfig.iamLossPct)) / 100;
  const dcWiringFactor = 1 - Math.abs(Number(designConfig.dcWiringLossPct)) / 100;
  const mismatchFactor = 1 - Math.abs(Number(designConfig.mismatchLossPct)) / 100;
  const qualityFactor = 1 - Number(designConfig.qualityLossPct) / 100;
  const acLossFactor = 1 - Math.abs(Number(designConfig.acLossPct)) / 100;
  const availabilityFactor = Number(designConfig.availabilityPct) / 100;
  const tempCoeffPerDegree = Number(designConfig.tempCoeffPctPerC) / 100;
  const uc = Math.max(Number(designConfig.ucValue), 1);
  const uv = Math.max(Number(designConfig.uvValue), 0);
  const timestepHours = meta.timestepHours || 1;
  const monthlyEnergyKwh = Array(12).fill(0);
  const monthlyPoaKwhm2 = Array(12).fill(0);
  let importedPoaCount = 0;
  let transposedCount = 0;
  let baseEnergyKwh = 0;
  let planeOfArrayInsolation = 0;
  let clippingLossKwh = 0;
  let maxCellTemp = -Infinity;

  // loss accumulators (in kWh)
  let totalGrossPoaKwh = 0;
  let totalSoilingLossKwh = 0;
  let totalIamLossKwh = 0;
  let totalTempLossKwh = 0;
  let totalDcWiringLossKwh = 0;
  let totalMismatchLossKwh = 0;
  let totalQualityLossKwh = 0;
  let totalInverterLossKwh = 0;
  let totalAcLossKwh = 0;
  let totalAvailLossKwh = 0;

  for (const record of records) {
    const poa = calculatePlaneOfArray(record, siteConfig, designConfig, meta);
    const poaWm2 = poa.poaWm2;
    const windSpeed = record.wind ?? 0;
    const ambientTemp = record.temp ?? 25;
    const temperatureRise =
      (poaWm2 * 0.9 * (1 - layout.moduleEfficiency)) / Math.max(uc + uv * windSpeed, 1);
    const cellTemp = ambientTemp + temperatureRise;
    const tempFactor = Math.max(1 + tempCoeffPerDegree * (cellTemp - 25), 0);

    // step-by-step loss chain
    const grossDcKw = layout.dcCapacityKw * (poaWm2 / 1000);
    const afterSoiling = grossDcKw * soilingFactor;
    const afterIam = afterSoiling * iamFactor;
    const afterTemp = afterIam * tempFactor;
    const afterQuality = afterTemp * qualityFactor;
    const afterMismatch = afterQuality * mismatchFactor;
    const afterWiring = afterMismatch * dcWiringFactor;
    const afterInverter = afterWiring * inverterEfficiency;
    const afterClip = Math.min(afterInverter, layout.acCapacityKw);
    const afterAcLoss = afterClip * acLossFactor;
    const afterAvail = afterAcLoss * availabilityFactor;
    const energyKwh = afterAvail * timestepHours;

    // accumulate losses
    totalGrossPoaKwh += grossDcKw * timestepHours;
    totalSoilingLossKwh += (grossDcKw - afterSoiling) * timestepHours;
    totalIamLossKwh += (afterSoiling - afterIam) * timestepHours;
    totalTempLossKwh += (afterIam - afterTemp) * timestepHours;
    totalQualityLossKwh += (afterTemp - afterQuality) * timestepHours;
    totalMismatchLossKwh += (afterQuality - afterMismatch) * timestepHours;
    totalDcWiringLossKwh += (afterMismatch - afterWiring) * timestepHours;
    totalInverterLossKwh += (afterWiring - afterInverter) * timestepHours;
    clippingLossKwh += Math.max(afterInverter - afterClip, 0) * timestepHours;
    totalAcLossKwh += (afterClip - afterAcLoss) * timestepHours;
    totalAvailLossKwh += (afterAcLoss - afterAvail) * timestepHours;

    baseEnergyKwh += energyKwh;
    planeOfArrayInsolation += (poaWm2 * timestepHours) / 1000;
    maxCellTemp = Math.max(maxCellTemp, cellTemp);
    const monthIdx = meta.timestampsUtc ? record.time.getUTCMonth() : record.time.getMonth();
    monthlyEnergyKwh[monthIdx] += energyKwh;
    monthlyPoaKwhm2[monthIdx] += (poaWm2 * timestepHours) / 1000;

    if (poa.source === "imported-poa") {
      importedPoaCount += 1;
    } else {
      transposedCount += 1;
    }
  }

  const af = meta.annualizationFactor;
  const annualizedEnergyKwh = baseEnergyKwh * af;
  const annualizedPoaInsolation = planeOfArrayInsolation * af;
  const specificYield = layout.dcCapacityKw > 0 ? annualizedEnergyKwh / layout.dcCapacityKw : 0;
  const performanceRatio =
    annualizedPoaInsolation > 0 ? (specificYield / annualizedPoaInsolation) * 100 : 0;
  const capacityFactor =
    layout.acCapacityKw > 0 ? (annualizedEnergyKwh / (layout.acCapacityKw * 8760)) * 100 : 0;

  return {
    monthlyEnergyKwh,
    monthlyPoaKwhm2,
    baseEnergyKwh,
    annualizedEnergyKwh,
    annualizedPoaInsolation,
    specificYield,
    performanceRatio,
    capacityFactor,
    clippingLossKwh: clippingLossKwh * af,
    maxCellTemp,
    importedPoaCount,
    transposedCount,
    meta,
    losses: {
      nominalEnergy: totalGrossPoaKwh * af,
      soiling: totalSoilingLossKwh * af,
      iam: totalIamLossKwh * af,
      temperature: totalTempLossKwh * af,
      quality: totalQualityLossKwh * af,
      mismatch: totalMismatchLossKwh * af,
      dcWiring: totalDcWiringLossKwh * af,
      inverter: totalInverterLossKwh * af,
      clipping: clippingLossKwh * af,
      acWiring: totalAcLossKwh * af,
      availability: totalAvailLossKwh * af,
      netEnergy: annualizedEnergyKwh,
    },
  };
}

export function buildLifetimeSeries(baseAnnualEnergyKwh, designConfig) {
  const firstYearLidFactor = 1 - Number(designConfig.firstYearLidPct) / 100;
  const annualDegFactor = Number(designConfig.annualDegradationPct) / 100;
  const series = [];
  let cumulativeKwh = 0;

  for (let year = 1; year <= YEAR_COUNT; year += 1) {
    const lifeFactor =
      designConfig.degradationModel === "linear"
        ? Math.max(firstYearLidFactor - annualDegFactor * (year - 1), 0)
        : Math.max(firstYearLidFactor * Math.pow(1 - annualDegFactor, year - 1), 0);
    const energyKwh = baseAnnualEnergyKwh * lifeFactor;
    cumulativeKwh += energyKwh;
    series.push({
      year,
      lifeFactor,
      energyKwh,
      cumulativeKwh,
    });
  }

  return series;
}
