/**
 * Block-based layout design: string blocks and equipment footprints in row-aligned meters.
 */
import {
  dropShortSlotRuns,
  minRowUsableWidthM,
  pointInAnyExclusion,
  pointInPolygon,
  polygonXRangeAtY,
  rowSpaceToFieldMeters,
  walkRowSlotCenters,
} from "./layout-exclusions.js";

export const EQUIPMENT_TYPES = {
  combiner: {
    label: "Combiner box",
    widthM: 2,
    depthM: 2,
    color: "#f59e0b",
    glyph: "C",
  },
  transformer: {
    label: "Transformer station",
    widthM: 6,
    depthM: 4,
    color: "#dc2626",
    glyph: "T",
  },
  weather: {
    label: "Weather station",
    widthM: 3,
    depthM: 3,
    color: "#0ea5e9",
    glyph: "W",
  },
  monitoring: {
    label: "Monitoring unit",
    widthM: 1,
    depthM: 1,
    color: "#8b5cf6",
    glyph: "M",
  },
};

/**
 * @param {{ modulesPerString?: number, strings?: number }} spec
 * @param {{ moduleSpanInRowM: number, moduleGapM: number, rowPitchM: number, collectorProjectionM: number }} layoutCtx
 */
export function blockFootprintM(spec, layoutCtx) {
  const modulesPerString = Math.max(1, Math.floor(Number(spec.modulesPerString) || 1));
  const strings = Math.max(1, Math.floor(Number(spec.strings) || 1));
  const moduleGapM = Number(layoutCtx.moduleGapM) || 0;
  const moduleStep = Math.max(layoutCtx.moduleSpanInRowM + moduleGapM, 0.001);
  const widthM = modulesPerString * moduleStep - moduleGapM;
  const depthM =
    strings <= 1
      ? layoutCtx.collectorProjectionM
      : (strings - 1) * layoutCtx.rowPitchM + layoutCtx.collectorProjectionM;
  return { widthM, depthM, moduleCount: modulesPerString * strings };
}

/** @param {{ type?: string, widthM?: number, depthM?: number }} item */
export function equipmentFootprintM(item) {
  const typeDef = EQUIPMENT_TYPES[item.type] || EQUIPMENT_TYPES.combiner;
  return {
    widthM: Math.max(Number(item.widthM) || typeDef.widthM, 0.5),
    depthM: Math.max(Number(item.depthM) || typeDef.depthM, 0.5),
  };
}

/**
 * Snap a block center so its strings sit exactly on the auto-layout row grid.
 * Y snaps to row lines (rowMinY + i*rowPitchM) so the tilt-derived pitch / winter
 * shading clearance is preserved between blocks; X snaps to the module step grid
 * so columns align with the module orientation in use.
 */
export function snapBlockOriginRowM(originRowM, widthM, depthM, layoutCtx) {
  const sd = Math.max(Number(layoutCtx.setbackDepthM) || 0, 0);
  const sw = Math.max(Number(layoutCtx.setbackM) || 0, 0);
  const bounds = layoutCtx.rotatedBoundsM;
  const rowMinY = (bounds ? bounds.minY : 0) + sd;
  const rowMinX = (bounds ? bounds.minX : 0) + sw;
  const pitch = Math.max(Number(layoutCtx.rowPitchM) || 0.001, 0.001);
  const moduleGapM = Number(layoutCtx.moduleGapM) || 0;
  const moduleStep = Math.max(layoutCtx.moduleSpanInRowM + moduleGapM, 0.001);

  const topY = (Number(originRowM[1]) || 0) - depthM / 2;
  const snappedTopY = rowMinY + Math.round((topY - rowMinY) / pitch) * pitch;
  const leftX = (Number(originRowM[0]) || 0) - widthM / 2;
  const snappedLeftX = rowMinX + Math.round((leftX - rowMinX) / moduleStep) * moduleStep;

  return [snappedLeftX + widthM / 2, snappedTopY + depthM / 2];
}

/** Axis-aligned rectangle ring; origin is footprint center in row meters. */
export function footprintRingRowM(originRowM, widthM, depthM) {
  const ox = Number(originRowM[0]) || 0;
  const oy = Number(originRowM[1]) || 0;
  const hw = widthM / 2;
  const hd = depthM / 2;
  return [
    [ox - hw, oy - hd],
    [ox + hw, oy - hd],
    [ox + hw, oy + hd],
    [ox - hw, oy + hd],
  ];
}

/** @param {{ modulesPerString: number, strings: number, originRowM?: number[] }} block */
export function blockRingRowM(block, layoutCtx) {
  const { widthM, depthM } = blockFootprintM(block, layoutCtx);
  if (!block.originRowM || block.originRowM.length < 2) {
    return footprintRingRowM([0, 0], widthM, depthM);
  }
  return footprintRingRowM(block.originRowM, widthM, depthM);
}

/** Ring (row meters) for any block kind: drawn area or grid-snapped string block. */
export function blockAnyRingRowM(block, layoutCtx) {
  if (block.kind === "area") {
    return Array.isArray(block.ringRowM) && block.ringRowM.length >= 3 ? block.ringRowM : null;
  }
  if (!block.originRowM || block.originRowM.length < 2) return null;
  return blockRingRowM(block, layoutCtx);
}

/** @param {{ type?: string, widthM?: number, depthM?: number, originRowM?: number[] }} item */
export function equipmentRingRowM(item) {
  const { widthM, depthM } = equipmentFootprintM(item);
  const origin = item.originRowM && item.originRowM.length >= 2 ? item.originRowM : [0, 0];
  return footprintRingRowM(origin, widthM, depthM);
}

export function equipmentRingFieldM(item, grossWidthM, grossDepthM, azimuthDeg) {
  return equipmentRingRowM(item).map(([x, y]) =>
    rowSpaceToFieldMeters(x, y, grossWidthM, grossDepthM, azimuthDeg)
  );
}

function ringCenter(ring) {
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return [cx, cy];
}

function rectsOverlap(ringA, ringB) {
  const aMinX = Math.min(...ringA.map((p) => p[0]));
  const aMaxX = Math.max(...ringA.map((p) => p[0]));
  const aMinY = Math.min(...ringA.map((p) => p[1]));
  const aMaxY = Math.max(...ringA.map((p) => p[1]));
  const bMinX = Math.min(...ringB.map((p) => p[0]));
  const bMaxX = Math.max(...ringB.map((p) => p[0]));
  const bMinY = Math.min(...ringB.map((p) => p[1]));
  const bMaxY = Math.max(...ringB.map((p) => p[1]));
  return aMinX < bMaxX - 1e-6 && aMaxX > bMinX + 1e-6 && aMinY < bMaxY - 1e-6 && aMaxY > bMinY + 1e-6;
}

/**
 * Polygon-aware overlap test for block/area rings: bbox quick-reject, then
 * vertex/center containment either way (sufficient for the convex-ish shapes here).
 */
export function ringsOverlapRowM(ringA, ringB) {
  if (!ringA || ringA.length < 3 || !ringB || ringB.length < 3) return false;
  if (!rectsOverlap(ringA, ringB)) return false;
  for (const [x, y] of ringA) {
    if (pointInPolygon(x, y, ringB)) return true;
  }
  for (const [x, y] of ringB) {
    if (pointInPolygon(x, y, ringA)) return true;
  }
  const [cax, cay] = ringCenter(ringA);
  if (pointInPolygon(cax, cay, ringB)) return true;
  const [cbx, cby] = ringCenter(ringB);
  return pointInPolygon(cbx, cby, ringA);
}

function isPointInsideSite(x, y, ctx) {
  const sw = Math.max(Number(ctx.setbackM) || 0, 0);
  const sd = Math.max(Number(ctx.setbackDepthM) || 0, 0);
  const verts = ctx.rotatedPolyVerts;
  if (verts && verts.length >= 3) {
    if (!pointInPolygon(x, y, verts)) return false;
    return true;
  }
  const b = ctx.rotatedBoundsM || {
    minX: sw,
    maxX: (ctx.netWidthM || 0) + sw,
    minY: sd,
    maxY: (ctx.netDepthM || 0) + sd,
  };
  return (
    x >= b.minX + sw - 1e-6 &&
    x <= b.maxX - sw + 1e-6 &&
    y >= b.minY + sd - 1e-6 &&
    y <= b.maxY - sd + 1e-6
  );
}

/**
 * @param {number[][]} ringRowM
 * @param {{
 *   rotatedPolyVerts?: number[][],
 *   rotatedBoundsM?: { minX: number, maxX: number, minY: number, maxY: number },
 *   setbackM?: number,
 *   setbackDepthM?: number,
 *   netWidthM?: number,
 *   netDepthM?: number,
 *   exclusionRingsRow?: number[][][],
 *   placedBlocks?: object[],
 *   placedEquipment?: object[],
 *   layoutCtx: object,
 * }} ctx
 */
export function isPlacementValid(ringRowM, ctx) {
  if (!ringRowM || ringRowM.length < 3) return false;
  const [cx, cy] = ringCenter(ringRowM);
  const testPoints = [...ringRowM, [cx, cy]];
  for (const [x, y] of testPoints) {
    if (!isPointInsideSite(x, y, ctx)) return false;
    if (pointInAnyExclusion(x, y, ctx.exclusionRingsRow || [])) return false;
  }
  const layoutCtx = ctx.layoutCtx;
  for (const block of ctx.placedBlocks || []) {
    const ring = blockAnyRingRowM(block, layoutCtx);
    if (ring && ringsOverlapRowM(ringRowM, ring)) return false;
  }
  for (const eq of ctx.placedEquipment || []) {
    if (!eq.originRowM) continue;
    if (rectsOverlap(ringRowM, equipmentRingRowM(eq))) return false;
  }
  return true;
}

/**
 * Auto-fill a drawn area (row meters) with module slots using the same rules as
 * the auto layout: global row grid (tilt-derived pitch), orientation-aware module
 * step, site polygon + setbacks, exclusions/equipment, min/max row width rules.
 *
 * @param {number[][]} ringRowM drawn area in row-aligned meters
 * @param {object} layoutCtx from buildLayoutCtx (must include row-width rules)
 * @param {number[][][]} exclusionRingsRow exclusion + equipment rings in row space
 * @param {number[][][]} otherBlockRings rings of other blocks to avoid
 * @param {number} maxModules remaining module budget cap
 * @returns {{ slots: { x: number, y: number }[], truncated: boolean }}
 */
export function areaBlockSlotsRowM(
  ringRowM,
  layoutCtx,
  exclusionRingsRow = [],
  otherBlockRings = [],
  maxModules = Infinity
) {
  if (!ringRowM || ringRowM.length < 3) return { slots: [], truncated: false };

  const sd = Math.max(Number(layoutCtx.setbackDepthM) || 0, 0);
  const bounds = layoutCtx.rotatedBoundsM;
  const rowMinY = (bounds ? bounds.minY : 0) + sd;
  const pitch = Math.max(Number(layoutCtx.rowPitchM) || 0.001, 0.001);
  const collectorProjectionM = layoutCtx.collectorProjectionM;
  const moduleGapM = Number(layoutCtx.moduleGapM) || 0;
  const moduleSpanInRowM = layoutCtx.moduleSpanInRowM;
  const maxRowWidthM = Number(layoutCtx.maxRowWidthM) || 0;
  const minRowWidthM = Number(layoutCtx.minRowWidthM) || 0;
  const rowWidthGapM = Number(layoutCtx.rowWidthGapM) || 0;

  const ys = ringRowM.map((p) => p[1]);
  const ringMinY = Math.min(...ys);
  const ringMaxY = Math.max(...ys);
  const iStart = Math.max(0, Math.floor((ringMinY - collectorProjectionM - rowMinY) / pitch));

  const slots = [];
  let truncated = false;
  for (let i = iStart; ; i++) {
    const yM = rowMinY + i * pitch;
    if (yM > ringMaxY) break;
    const rowCenterY = yM + collectorProjectionM / 2;
    const range = polygonXRangeAtY(ringRowM, rowCenterY);
    if (!range) continue;
    const rowSlots = walkRowSlotCenters(
      range.minX,
      range.maxX,
      rowCenterY,
      moduleSpanInRowM,
      moduleGapM,
      maxRowWidthM,
      rowWidthGapM
    );
    const kept = rowSlots.filter(
      (p) =>
        pointInPolygon(p.x, p.y, ringRowM) &&
        isPointInsideSite(p.x, p.y, layoutCtx) &&
        !pointInAnyExclusion(p.x, p.y, exclusionRingsRow) &&
        !otherBlockRings.some((r) => r && r.length >= 3 && pointInPolygon(p.x, p.y, r))
    );
    const placed = dropShortSlotRuns(kept, moduleSpanInRowM, moduleGapM, minRowWidthM);
    for (const p of placed) {
      if (slots.length >= maxModules) {
        truncated = true;
        break;
      }
      slots.push(p);
    }
    if (truncated) break;
  }
  return { slots, truncated };
}

/**
 * @param {{
 *   moduleSpanInRowM: number,
 *   moduleGapM: number,
 *   rowPitchM: number,
 *   collectorProjectionM: number,
 *   rotatedPolyVerts?: number[][],
 *   rotatedBoundsM?: { minX: number, maxX: number, minY: number, maxY: number },
 *   setbackM?: number,
 *   setbackDepthM?: number,
 *   netWidthM?: number,
 *   netDepthM?: number,
 *   autoModuleCount?: number,
 *   placedBlocks?: object[],
 * }} layoutCtx
 */
export function blockMaxFit(layoutCtx) {
  const moduleGapM = Number(layoutCtx.moduleGapM) || 0;
  const moduleStep = Math.max(layoutCtx.moduleSpanInRowM + moduleGapM, 0.001);
  const sw = Math.max(Number(layoutCtx.setbackM) || 0, 0);
  const sd = Math.max(Number(layoutCtx.setbackDepthM) || 0, 0);
  const rowPitchM = Math.max(layoutCtx.rowPitchM, 0.001);
  const collectorProjectionM = layoutCtx.collectorProjectionM;

  let maxRowWidthM = layoutCtx.netWidthM - 2 * sw;
  const bounds = layoutCtx.rotatedBoundsM;
  const verts = layoutCtx.rotatedPolyVerts;
  if (verts && bounds) {
    const innerMinY = bounds.minY + sd;
    const innerMaxY = bounds.maxY - sd;
    const yM = innerMinY + Math.max(0, innerMaxY - innerMinY) / 2;
    maxRowWidthM = minRowUsableWidthM(verts, yM, collectorProjectionM, sw);
  }

  const maxModulesPerString = Math.max(
    1,
    Math.floor((Math.max(maxRowWidthM, moduleStep) + moduleGapM) / moduleStep)
  );

  let maxDepth = layoutCtx.netDepthM - 2 * sd;
  if (bounds) {
    maxDepth = bounds.maxY - bounds.minY - 2 * sd;
  }
  const maxStrings = Math.max(
    1,
    Math.floor((Math.max(maxDepth, collectorProjectionM) - collectorProjectionM) / rowPitchM) + 1
  );

  const usedModules = (layoutCtx.placedBlocks || []).reduce(
    (sum, b) => sum + (b.moduleCount || 0),
    0
  );
  const remainingModuleBudget = Math.max(0, (layoutCtx.autoModuleCount || 0) - usedModules);

  return { maxModulesPerString, maxStrings, remainingModuleBudget, maxRowWidthM };
}

/**
 * @param {{ modulesPerString?: number, strings?: number }} spec
 * @param {object} layoutCtx
 */
export function validateBlockSpec(spec, layoutCtx) {
  const maxFit = blockMaxFit(layoutCtx);
  const mps = Math.floor(Number(spec.modulesPerString) || 0);
  const str = Math.floor(Number(spec.strings) || 0);
  const total = mps * str;
  const reasons = [];
  if (mps < 1) reasons.push("At least 1 module per string");
  if (str < 1) reasons.push("At least 1 string");
  if (mps > maxFit.maxModulesPerString) {
    reasons.push(`Modules/string exceeds max ${maxFit.maxModulesPerString}`);
  }
  if (str > maxFit.maxStrings) {
    reasons.push(`Strings exceed max ${maxFit.maxStrings}`);
  }
  if (total > maxFit.remainingModuleBudget) {
    reasons.push(
      `Total modules (${total}) exceed remaining budget (${maxFit.remainingModuleBudget})`
    );
  }
  const footprint = blockFootprintM(
    { modulesPerString: Math.max(mps, 1), strings: Math.max(str, 1) },
    layoutCtx
  );
  return {
    valid: reasons.length === 0 && mps >= 1 && str >= 1,
    reasons,
    maxFit,
    footprint,
    moduleCount: total,
  };
}

export function buildLayoutCtx(layout, config, placedBlocks = []) {
  const rowPitchM = layout.rowPitchM || 1;
  const collectorProjectionM =
    layout.winterSpacing?.collectorProjectionM || rowPitchM * 0.5;
  return {
    moduleSpanInRowM: layout.moduleSpanInRowM || 1,
    moduleGapM: Number(config.moduleGapM) || 0.03,
    rowPitchM,
    collectorProjectionM,
    rotatedPolyVerts: layout.rotatedPolygonVerticesM || null,
    rotatedBoundsM: layout.rotatedBoundsM || null,
    setbackM: Number(config.edgeSetbackM) || 0,
    setbackDepthM: Number(config.edgeSetbackDepthM) || 0,
    netWidthM: layout.netWidthM || Number(config.manualWidthM) || 1,
    netDepthM: layout.netDepthM || Number(config.manualHeightM) || 1,
    maxRowWidthM: Number(config.maxRowWidthM) || 0,
    minRowWidthM: Number(config.minRowWidthM) || 0,
    rowWidthGapM: Number(config.rowWidthGapM) || 0,
    autoModuleCount: layout.autoModuleCount || layout.moduleCount || 0,
    placedBlocks,
  };
}
