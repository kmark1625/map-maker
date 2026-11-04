// Floating-island voxel volume, generated for the current grid size:
// n x n x ISLAND_H of 0/1. Index order is [z][y][x] — z = 0 is the layer
// directly beneath the terrain surface, z increases downward to the island
// tip, and x/y are grid coordinates, so the footprint fills the grid edges
// at any size instead of centering a fixed 12x12 sample under larger grids.
//
// Shape: iceberg-style floating island (see floating_island_1.jpg) — a full
// rounded-square plateau with sheer upper cliffs, an accelerating taper
// through the mid strata, and a narrow jagged keel, with seeded value noise
// so generation is deterministic. The profile is tuned at the default
// 12x12 grid (BASE_N) and scaled by n / BASE_N, so grids of other sizes
// get the same silhouette at native resolution; 12x12 is unchanged.

export const ISLAND_H = 10;

export type IslandVoxel = 0 | 1;

const BASE_N = 12;
const SEED = 1337;
const CAP_Z = 3; // z < CAP_Z is solid, flush under the terrain layer

// Deterministic PRNG (mulberry32).
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildVolume(n: number): IslandVoxel[][][] {
  const rand = rng(SEED);

  // Coarse 3D value-noise lattice with trilinear interpolation, so the rock
  // reads as chunky strata instead of per-voxel static. The same lattice
  // serves every grid size, keeping the wobble pattern stable on resize.
  const LATTICE = 4;
  const lattice: number[] = [];
  for (let i = 0; i < (LATTICE + 1) ** 3; i++) lattice.push(rand());

  const span = Math.max(1, n - 1);
  function noise(x: number, y: number, z: number): number {
    const fx = (x / span) * LATTICE;
    const fy = (y / span) * LATTICE;
    const fz = (z / (ISLAND_H - 1)) * LATTICE;
    const x0 = Math.min(Math.floor(fx), LATTICE - 1);
    const y0 = Math.min(Math.floor(fy), LATTICE - 1);
    const z0 = Math.min(Math.floor(fz), LATTICE - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const tz = fz - z0;
    const at = (ix: number, iy: number, iz: number) =>
      lattice[ix + (LATTICE + 1) * (iy + (LATTICE + 1) * iz)];
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    return lerp(
      lerp(
        lerp(at(x0, y0, z0), at(x0 + 1, y0, z0), tx),
        lerp(at(x0, y0 + 1, z0), at(x0 + 1, y0 + 1, z0), tx),
        ty,
      ),
      lerp(
        lerp(at(x0, y0, z0 + 1), at(x0 + 1, y0, z0 + 1), tx),
        lerp(at(x0, y0 + 1, z0 + 1), at(x0 + 1, y0 + 1, z0 + 1), tx),
        ty,
      ),
      tz,
    );
  }

  const c = (n - 1) / 2;
  const scale = n / BASE_N;

  // Rounded-square distance (superellipse, p = 4): the concept island is a
  // chunky plateau with rounded corners, not a cone.
  function shapeDist(x: number, y: number): number {
    const dx = Math.abs(x - c);
    const dy = Math.abs(y - c);
    return (dx ** 4 + dy ** 4) ** (1 / 4);
  }

  // Half-width profile: sheer cliffs just under the cap, then an
  // accelerating taper to the dark keel. Tuned at BASE_N (corner
  // superellipse distance ~6.55, edge midpoint 5.5), scaled with the grid.
  function radiusAt(z: number): number {
    if (z < CAP_Z) return Infinity;
    const t = (z - (CAP_Z - 1)) / (ISLAND_H - 1 - (CAP_Z - 1));
    return (0.95 + (6.9 - 0.95) * (1 - Math.pow(t, 1.7))) * scale;
  }

  const volume: IslandVoxel[][][] = [];
  for (let z = 0; z < ISLAND_H; z++) {
    const layer: IslandVoxel[][] = [];
    const r = radiusAt(z);
    for (let y = 0; y < n; y++) {
      const row: IslandVoxel[] = [];
      for (let x = 0; x < n; x++) {
        if (z < CAP_Z) {
          row.push(1); // solid cap: sits flush under the terrain layer
          continue;
        }
        const wobble = (noise(x, y, z) - 0.5) * 2.2 * scale;
        row.push(shapeDist(x, y) + wobble < r ? 1 : 0);
      }
      layer.push(row);
    }
    volume.push(layer);
  }

  // Guarantee: no hollow gap in the middle, every layer keeps its core.
  const c0 = Math.floor((n - 1) / 2);
  const c1 = Math.ceil((n - 1) / 2);
  for (let z = 0; z < ISLAND_H; z++) {
    let solid = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) solid += volume[z][y][x];
    }
    if (solid === 0) {
      for (let y = c0; y <= c1; y++) {
        for (let x = c0; x <= c1; x++) volume[z][y][x] = 1;
      }
    }
  }
  return volume;
}

const volumeCache = new Map<number, IslandVoxel[][][]>();

// Island volume for an n x n grid, cached per size. Treat as read-only.
export function generateIslandVolume(n: number): IslandVoxel[][][] {
  const size = Math.max(1, Math.round(n));
  let volume = volumeCache.get(size);
  if (!volume) {
    volume = buildVolume(size);
    volumeCache.set(size, volume);
  }
  return volume;
}

export function isIslandSolid(
  n: number,
  x: number,
  y: number,
  z: number,
): boolean {
  const size = Math.max(1, Math.round(n));
  if (x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= ISLAND_H) {
    return false;
  }
  return generateIslandVolume(size)[z][y][x] === 1;
}
