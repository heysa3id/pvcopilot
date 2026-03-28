/**
 * Cell temperature (°C) used by PVWatts on the Data Filtering page: Sandia-style POA/wind/ambient
 * model plus the (G·δ)/1000 conduction term (King/Boyson / NREL-style), same as backend datafiltering.
 *
 * @param {number} airTemp - Ambient temperature (°C)
 * @param {number} gti - Plane-of-array irradiance (W/m²)
 * @param {number} wind - Wind speed (m/s)
 * @param {number} coef_a - Sandia model coefficient a
 * @param {number} coef_b - Sandia model coefficient b
 * @param {number} delta - Conduction term (°C per 1000 W/m²)
 * @returns {number|null} T_cell in °C, or null if any input is not finite
 */
export function computePvwattsCellTempC(airTemp, gti, wind, coef_a, coef_b, delta) {
  if (![airTemp, gti, wind, coef_a, coef_b, delta].every((x) => Number.isFinite(x))) return null;
  return airTemp + gti * Math.exp(coef_a + coef_b * wind) + (gti * delta) / 1000;
}
