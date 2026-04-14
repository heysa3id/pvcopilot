/**
 * Layout obstacle polygons in field meters (same frame as layout.polygonVerticesM).
 * Row / preview math uses rotated row space; obstacles are rotated with the site azimuth.
 */

/** @param {number[][]} ring [[x,y], ...] in field meters */
export function rotateFieldRingToRowSpace(ring, grossWidthM, grossDepthM, azimuthDeg) {
  if (!ring || ring.length < 3) return [];
  const cx = grossWidthM / 2;
  const cy = grossDepthM / 2;
  const rRad = -((Number(azimuthDeg) || 180) - 180) * (Math.PI / 180);
  const cosR = Math.cos(rRad);
  const sinR = Math.sin(rRad);
  return ring.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    return [cx + dx * cosR - dy * sinR, cy + dx * sinR + dy * cosR];
  });
}

/** Ray-casting; ring closed (first point may duplicate last or not). */
export function pointInPolygon(x, y, ring) {
  if (!ring || ring.length < 3) return false;
  const n = ring.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-30) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInAnyExclusion(x, y, rotatedRings) {
  if (!rotatedRings || rotatedRings.length === 0) return false;
  for (const ring of rotatedRings) {
    if (ring && ring.length >= 3 && pointInPolygon(x, y, ring)) return true;
  }
  return false;
}

/**
 * Module slot centers along one row (rotated meters), same packing as charts / main row draw.
 * @returns {{ x: number, y: number }[]}
 */
/** Inverse of rotateFieldRingToRowSpace for one point (field meters). */
export function rowSpaceToFieldMeters(xr, yr, grossWidthM, grossDepthM, azimuthDeg) {
  const cx = grossWidthM / 2;
  const cy = grossDepthM / 2;
  const rRad = -((Number(azimuthDeg) || 180) - 180) * (Math.PI / 180);
  const dx = xr - cx;
  const dy = yr - cy;
  const xf = cx + dx * Math.cos(-rRad) - dy * Math.sin(-rRad);
  const yf = cy + dx * Math.sin(-rRad) + dy * Math.cos(-rRad);
  return [xf, yf];
}

/**
 * Logical canvas px (relative to canvas) -> rotated row meters, matching module draw transform.
 */
export function canvasLogicalToRotatedRowMeters(
  lx,
  ly,
  ox,
  oy,
  scale,
  grossWidthM,
  grossDepthM,
  azRotRad
) {
  const gx = ox;
  const gy = oy;
  const gw = grossWidthM * scale;
  const gh = grossDepthM * scale;
  const cx = gx + gw / 2;
  const cy = gy + gh / 2;
  const cos = Math.cos(azRotRad);
  const sin = Math.sin(azRotRad);
  const dpx = lx - cx;
  const dpy = ly - cy;
  const wx = cx + dpx * cos + dpy * sin;
  const wy = cy - dpx * sin + dpy * cos;
  const xr = (wx - ox) / scale;
  const yr = (wy - oy) / scale;
  return { xr, yr };
}

export function walkRowSlotCenters(
  rowStartX,
  rowEndX,
  rowCenterY,
  moduleSpanInRowM,
  moduleGapM,
  maxRowWidthM,
  rowWidthGapM
) {
  const availableWidth = rowEndX - rowStartX;
  if (availableWidth <= 0) return [];
  const moduleStep = Math.max(moduleSpanInRowM + moduleGapM, 0.001);
  const modulesPerSegment =
    maxRowWidthM > 0 ? Math.max(Math.floor((maxRowWidthM + moduleGapM) / moduleStep), 1) : 0;

  let rowModules;
  if (modulesPerSegment > 0) {
    const segWidthM = modulesPerSegment * moduleStep - moduleGapM;
    const segStepM = segWidthM + moduleGapM + rowWidthGapM;
    const numFullSegs =
      availableWidth >= segWidthM
        ? 1 + Math.max(Math.floor((availableWidth - segWidthM) / segStepM), 0)
        : 0;
    const usedW = numFullSegs > 0 ? segWidthM + (numFullSegs - 1) * segStepM : 0;
    const remW = availableWidth - usedW;
    const tailMods =
      numFullSegs > 0 && remW >= rowWidthGapM + moduleSpanInRowM
        ? Math.min(
            Math.floor((remW - rowWidthGapM + moduleGapM) / moduleStep),
            modulesPerSegment
          )
        : 0;
    rowModules = numFullSegs * modulesPerSegment + tailMods;
  } else {
    rowModules = Math.max(Math.floor((availableWidth + moduleGapM) / moduleStep), 0);
  }
  if (rowModules <= 0) return [];

  const out = [];
  let remaining = rowModules;
  let segX = rowStartX;
  while (remaining > 0) {
    const segModules = modulesPerSegment > 0 ? Math.min(remaining, modulesPerSegment) : remaining;
    for (let j = 0; j < segModules; j++) {
      const xLeft = segX + j * moduleStep;
      out.push({
        x: xLeft + moduleSpanInRowM / 2,
        y: rowCenterY,
      });
    }
    const segWidthM = segModules * moduleStep - moduleGapM;
    segX += segWidthM + moduleGapM + rowWidthGapM;
    remaining -= segModules;
  }
  return out;
}
