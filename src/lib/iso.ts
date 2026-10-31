import { pointInPolygon, type WorldPoint } from "./geo";

/** h: fixed cube edge in world units at zoom 1. Cells are h x h x h. */
export const TILE_H = 64;
/** Footprint vertical squeeze. 0.5 gives the classic slight 2:1 dimetric tilt. */
export const TILE_SLOPE = 0.5;
/** Drawn cube height as a fraction of h. 0.5 keeps cells slightly 3D. */
export const HEIGHT_SCALE = 0.5;

export const HALF_W = TILE_H / 2;
export const HALF_H = (TILE_H / 2) * TILE_SLOPE;
export const Z_H = TILE_H * HEIGHT_SCALE;

export interface CellCoord {
  x: number;
  y: number;
}

/** Base-plane center of cell (x, y) in world units. */
export function cellCenter(c: CellCoord): WorldPoint {
  return { x: (c.x - c.y) * HALF_W, y: (c.x + c.y) * HALF_H };
}

export function topFace(c: CellCoord): WorldPoint[] {
  const { x: cx, y: cy } = cellCenter(c);
  return [
    { x: cx, y: cy - HALF_H - Z_H },
    { x: cx + HALF_W, y: cy - Z_H },
    { x: cx, y: cy + HALF_H - Z_H },
    { x: cx - HALF_W, y: cy - Z_H },
  ];
}

export function leftFace(c: CellCoord): WorldPoint[] {
  const { x: cx, y: cy } = cellCenter(c);
  return [
    { x: cx - HALF_W, y: cy - Z_H },
    { x: cx, y: cy + HALF_H - Z_H },
    { x: cx, y: cy + HALF_H },
    { x: cx - HALF_W, y: cy },
  ];
}

export function rightFace(c: CellCoord): WorldPoint[] {
  const { x: cx, y: cy } = cellCenter(c);
  return [
    { x: cx + HALF_W, y: cy - Z_H },
    { x: cx, y: cy + HALF_H - Z_H },
    { x: cx, y: cy + HALF_H },
    { x: cx + HALF_W, y: cy },
  ];
}

/** Grid footprint corners in world units: top, right, bottom, left. */
export function baseDiamond(n: number): WorldPoint[] {
  return [
    { x: 0, y: -HALF_H },
    { x: n * HALF_W, y: (n - 1) * HALF_H },
    { x: 0, y: 2 * (n - 1) * HALF_H + HALF_H },
    { x: -n * HALF_W, y: (n - 1) * HALF_H },
  ];
}

export function gridBounds(n: number): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  const minX = -n * HALF_W;
  const maxX = n * HALF_W;
  const minY = -HALF_H - Z_H;
  const maxY = 2 * (n - 1) * HALF_H + HALF_H;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/** Painter order: back rows (small x + y) first. */
export function cellsInDrawOrder(n: number): CellCoord[] {
  const out: CellCoord[] = [];
  for (let s = 0; s <= 2 * (n - 1); s++) {
    for (let x = 0; x < n; x++) {
      const y = s - x;
      if (y >= 0 && y < n) out.push({ x, y });
    }
  }
  return out;
}

/** Find the cell whose drawn faces contain point p (front cells win). */
export function pickCell(p: WorldPoint, n: number): CellCoord | null {
  const fx = (p.x / HALF_W + p.y / HALF_H) / 2;
  const fy = (p.y / HALF_H - p.x / HALF_W) / 2;
  const ex = Math.round(fx);
  const ey = Math.round(fy);
  const candidates: CellCoord[] = [];
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const x = ex + dx;
      const y = ey + dy;
      if (x >= 0 && y >= 0 && x < n && y < n) candidates.push({ x, y });
    }
  }
  // Front cells are drawn last, so test them first.
  candidates.sort((a, b) => b.x + b.y - (a.x + a.y));
  for (const c of candidates) {
    if (
      pointInPolygon(p, topFace(c)) ||
      pointInPolygon(p, leftFace(c)) ||
      pointInPolygon(p, rightFace(c))
    ) {
      return c;
    }
  }
  // Fall back to the base-plane estimate when inside the footprint.
  if (
    ex >= 0 &&
    ey >= 0 &&
    ex < n &&
    ey < n &&
    pointInPolygon(p, baseDiamond(n))
  ) {
    return { x: ex, y: ey };
  }
  return null;
}
