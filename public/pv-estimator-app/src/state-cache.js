const STORAGE_KEY = "pv-estimator-state-v1";
const CACHE_VERSION = 1;

const CONFIG_FIELD_IDS = [
  "siteName",
  "moduleManufacturer",
  "moduleModel",
  "inverterManufacturer",
  "inverterModel",
  "inverterCount",
  "stringsPerInverter",
  "modulesPerString",
  "siteLat",
  "siteLng",
  "azimuthDegSite",
  "timezoneOffset",
  "surfaceAlbedo",
  "manualWidthM",
  "manualHeightM",
  "edgeSetbackM",
  "edgeSetbackDepthM",
  "modulePowerWp",
  "manualModuleCount",
  "moduleLengthM",
  "moduleWidthM",
  "moduleOrientation",
  "tiltDeg",
  "azimuthDeg",
  "frontClearanceM",
  "rowSpacingM",
  "moduleGapM",
  "maxRowWidthM",
  "minRowWidthM",
  "rowWidthGapM",
  "targetDcAcRatio",
  "manualAcCapacityKw",
  "inverterEfficiencyPct",
  "tempCoeffPctPerC",
  "ucValue",
  "uvValue",
  "soilingLossPct",
  "iamLossPct",
  "dcWiringLossPct",
  "mismatchLossPct",
  "qualityLossPct",
  "acLossPct",
  "availabilityPct",
  "firstYearLidPct",
  "annualDegradationPct",
  "degradationModel",
  "weatherProvider",
];

function setDomFieldValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (value === "" || value == null) {
    el.value = "";
    return;
  }
  el.value = String(value);
}

function serializeWeather(weather) {
  if (!weather?.meta?.ready) {
    return null;
  }

  return {
    records: (weather.records || []).map((record) => ({
      ...record,
      time: record.time instanceof Date ? record.time.toISOString() : record.time,
    })),
    meta: {
      ...weather.meta,
      start:
        weather.meta.start instanceof Date
          ? weather.meta.start.toISOString()
          : weather.meta.start ?? null,
      end:
        weather.meta.end instanceof Date ? weather.meta.end.toISOString() : weather.meta.end ?? null,
    },
    source: weather.source ?? null,
  };
}

export function deserializeWeather(weather) {
  if (!weather?.meta?.ready) {
    return { records: [], meta: { ready: false, issues: [] } };
  }

  return {
    ...weather,
    records: (weather.records || []).map((record) => ({
      ...record,
      time: new Date(record.time),
    })),
    meta: {
      ...weather.meta,
      start: weather.meta?.start ? new Date(weather.meta.start) : null,
      end: weather.meta?.end ? new Date(weather.meta.end) : null,
    },
  };
}

export function buildStateSnapshot(state, config, { drawnSiteRing = null, mapView = null } = {}) {
  return {
    version: CACHE_VERSION,
    savedAt: new Date().toISOString(),
    config,
    layout: {
      moduleExclusionPolygonsM: state.moduleExclusionPolygonsM || [],
      layoutBlocks: state.layoutBlocks || [],
      layoutEquipment: state.layoutEquipment || [],
      layoutAdvancedMode: Boolean(state.layoutAdvancedMode),
      layoutPanelSections: { ...(state.layoutPanelSections || { exclusions: true, design: true }) },
      polygonAreaM2: state.polygonAreaM2 ?? null,
      polygonVerticesM: state.layout?.polygonVerticesM || null,
      drawnSiteRing,
      mapView,
    },
    weather: serializeWeather(state.weather),
  };
}

function tryWriteSnapshot(snapshot) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export function saveStateCache(snapshot) {
  try {
    tryWriteSnapshot(snapshot);
    return true;
  } catch (error) {
    const isQuota =
      error?.name === "QuotaExceededError" ||
      error?.code === 22 ||
      error?.code === 1014;
    if (!isQuota || !snapshot.weather?.records?.length) {
      console.warn("PV estimator: failed to save state cache.", error);
      return false;
    }

    const trimmed = {
      ...snapshot,
      weather: {
        ...snapshot.weather,
        records: [],
      },
    };
    try {
      tryWriteSnapshot(trimmed);
      console.warn(
        "PV estimator: weather records omitted from cache due to localStorage quota; config and layout were saved."
      );
      return true;
    } catch (retryError) {
      console.warn("PV estimator: failed to save state cache after trimming weather.", retryError);
      return false;
    }
  }
}

export function loadStateCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== CACHE_VERSION || typeof parsed.config !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearStateCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function applyConfigToDom(config) {
  if (!config || typeof config !== "object") return;
  for (const id of CONFIG_FIELD_IDS) {
    setDomFieldValue(id, config[id]);
  }
}

export function applyLayoutStateToMemory(state, layout) {
  if (!layout || typeof layout !== "object") return;
  state.moduleExclusionPolygonsM = Array.isArray(layout.moduleExclusionPolygonsM)
    ? layout.moduleExclusionPolygonsM
    : [];
  state.layoutBlocks = Array.isArray(layout.layoutBlocks) ? layout.layoutBlocks : [];
  state.layoutEquipment = Array.isArray(layout.layoutEquipment) ? layout.layoutEquipment : [];
  state.layoutAdvancedMode = Boolean(layout.layoutAdvancedMode);
  state.layoutPanelSections = {
    exclusions: layout.layoutPanelSections?.exclusions !== false,
    design: layout.layoutPanelSections?.design !== false,
  };
  state.polygonAreaM2 =
    layout.polygonAreaM2 != null && Number.isFinite(Number(layout.polygonAreaM2))
      ? Number(layout.polygonAreaM2)
      : null;
  state.cachedPolygonVerticesM = Array.isArray(layout.polygonVerticesM)
    ? layout.polygonVerticesM.map(([x, y]) => [Number(x), Number(y)])
    : null;
}
