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

/** Horizontal chord of a closed polygon at y (same units as vertices). */
export function polygonXRangeAtY(vertices, y) {
  if (!vertices || vertices.length < 3) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let intersections = 0;
  for (let i = 0; i < vertices.length; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % vertices.length];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
      const x = x1 + (y - y1) / (y2 - y1) * (x2 - x1);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      intersections++;
    }
  }
  if (intersections < 2) return null;
  return { minX, maxX };
}

/**
 * Minimum inside width (m) along horizontal scans from yRowBase to yRowBase + collectorDepthM,
 * after applying setbackM on each side — matches how a full row footprint intersects the polygon.
 * (A single slice at row center can be much wider than the top/bottom of the row band.)
 */
export function minRowUsableWidthM(vertices, yRowBaseM, collectorDepthM, setbackM, samples = 13) {
  if (!vertices || vertices.length < 3) return 0;
  const sw = Math.max(Number(setbackM) || 0, 0);
  const depth = Math.max(Number(collectorDepthM) || 0, 1e-9);
  const yLo = yRowBaseM;
  const yHi = yRowBaseM + depth;
  const n = Math.max(2, Math.floor(samples));
  let minAvail = Infinity;
  for (let k = 0; k < n; k++) {
    const yy = yLo + (k / (n - 1)) * (yHi - yLo);
    const range = polygonXRangeAtY(vertices, yy);
    if (!range) return 0;
    const avail = Math.max((range.maxX - sw) - (range.minX + sw), 0);
    minAvail = Math.min(minAvail, avail);
  }
  return minAvail === Infinity ? 0 : minAvail;
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

/**
 * Physical span (m) of n modules in a row: n·(span+gap) − gap.
 */
export function rowModulesPhysicalSpanM(n, moduleStep, moduleGapM) {
  const nn = Math.max(0, Math.floor(n));
  if (nn <= 0) return 0;
  const step = Math.max(moduleStep, 0.001);
  const gap = Number(moduleGapM) || 0;
  return nn * step - gap;
}

/**
 * Drop trailing partial segment (or an all-partial row) if its physical width < minRowWidthM.
 * When maxRowWidth splits a row, the last "tail" chunk can be one narrow module.
 */
export function trimRowModuleCountForMinSegmentWidthM(
  rowModuleCount,
  modulesPerSegment,
  moduleStep,
  moduleGapM,
  minRowWidthM
) {
  const minW = Number(minRowWidthM) || 0;
  const n = Math.max(0, Math.floor(Number(rowModuleCount) || 0));
  if (n <= 0 || !(minW > 0)) return n;
  const step = Math.max(Number(moduleStep) || 0.001, 0.001);
  const gap = Number(moduleGapM) || 0;
  const mps = Math.max(0, Math.floor(Number(modulesPerSegment) || 0));
  if (mps <= 0) {
    const span = rowModulesPhysicalSpanM(n, step, gap);
    return span < minW - 1e-9 ? 0 : n;
  }
  const tail = n % mps;
  const full = n - tail;
  if (tail > 0) {
    const tailSpan = rowModulesPhysicalSpanM(tail, step, gap);
    if (tailSpan < minW - 1e-9) return full;
  }
  if (full === 0 && n > 0) {
    const span = rowModulesPhysicalSpanM(n, step, gap);
    if (span < minW - 1e-9) return 0;
  }
  return n;
}

/**
 * After exclusions, drop contiguous runs of slot centers whose physical span is < minRowWidthM.
 */
export function dropShortSlotRuns(slots, moduleSpanInRowM, moduleGapM, minRowWidthM) {
  const minW = Number(minRowWidthM) || 0;
  if (!(minW > 0) || !slots || slots.length === 0) return slots || [];
  const step = Math.max(moduleSpanInRowM + moduleGapM, 0.001);
  const gap = Number(moduleGapM) || 0;
  const sorted = [...slots].sort((a, b) => a.x - b.x);
  const runs = [];
  let cur = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const dx = sorted[i].x - sorted[i - 1].x;
    if (Math.abs(dx - step) < Math.max(0.02, step * 1e-4)) cur.push(sorted[i]);
    else {
      runs.push(cur);
      cur = [sorted[i]];
    }
  }
  runs.push(cur);
  const out = [];
  for (const run of runs) {
    const spanM = rowModulesPhysicalSpanM(run.length, step, gap);
    if (spanM >= minW - 1e-9) out.push(...run);
  }
  return out;
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
