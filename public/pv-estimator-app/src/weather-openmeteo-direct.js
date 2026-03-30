/**
 * Open-Meteo archive API from the browser (CORS allows any origin).
 * Used when /api/weather is missing (static GitHub Pages without VITE_API_BASE).
 */

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
        "Historical weather year from Open-Meteo ERA5 reanalysis. This is a single calendar year, not a statistically synthesized TMY. Loaded directly in the browser because this static deployment has no /api/weather proxy (set GitHub Actions secret VITE_API_BASE if you use a PVCopilot backend).",
      ],
    },
    source: {
      provider: "openmeteo",
      label: "Open-Meteo ERA5",
      note: "Open-Meteo ERA5 (direct browser fetch).",
    },
  };
}

export async function fetchOpenMeteoArchiveWeather(latitude, longitude) {
  const lastYear = new Date().getFullYear() - 1;
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("start_date", `${lastYear}-01-01`);
  url.searchParams.set("end_date", `${lastYear}-12-31`);
  url.searchParams.set(
    "hourly",
    "shortwave_radiation,direct_normal_irradiance,diffuse_radiation,temperature_2m,wind_speed_10m,relative_humidity_2m,surface_pressure"
  );
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("timezone", "UTC");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Open-Meteo returned HTTP ${response.status}`);
  }
  const payload = await response.json();
  return normalizeOpenMeteoPayload(payload);
}
