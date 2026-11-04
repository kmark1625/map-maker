import type { TerrainId } from "@/stores/grid-store";

/**
 * Pure island-layout generation for the Suggest button.
 * No runtime imports, so it unit-tests standalone and doubles as the
 * fallback when WebGPU / WebLLM is unavailable.
 *
 * Division of labor: the LLM proposes a plan (where lakes, forests, and
 * stone peaks go, plus a name), and the seeded generator here paints a
 * coherent island from it. LLM output is clamped and sanitized, never
 * painted verbatim. With no plan, mood presets drive the same generator.
 */

export type IslandMoodId = "serene" | "rugged" | "wild";

export interface IslandMood {
  id: IslandMoodId;
  label: string;
  blurb: string;
  /** One-line instruction handed to the LLM designer. */
  brief: string;
}

export const ISLAND_MOODS: IslandMood[] = [
  {
    id: "serene",
    label: "Serene lagoon",
    blurb: "A calm central lagoon, wide sandy shores, gentle groves.",
    brief:
      "Design a serene lagoon island: one generous calm lake, wide sandy shores, a couple of gentle forest groves, almost no stone.",
  },
  {
    id: "rugged",
    label: "Rugged peaks",
    blurb: "Stone highlands and cliffs, a small pond, sparse woods.",
    brief:
      "Design a rugged island: two or three bold stone peak clusters, only a small pond if any, sparse hardy forest, narrow shores where cliffs meet water.",
  },
  {
    id: "wild",
    label: "Wild forest",
    blurb: "Dense overgrown woods, hidden ponds, barely any stone.",
    brief:
      "Design a wild, overgrown island: large dense forest everywhere, one or two hidden ponds, a lone stone outcrop at most, untamed shores.",
  },
];

export const ISLAND_MOOD_MAP: Record<IslandMoodId, IslandMood> =
  Object.fromEntries(ISLAND_MOODS.map((m) => [m.id, m])) as Record<
    IslandMoodId,
    IslandMood
  >;

/**
 * Pick the next sample scene at random (Serene lagoon, Rugged peaks, or
 * Wild forest), rotating away from `exclude` so back-to-back Suggest
 * clicks never repeat the same scene.
 */
export function pickRandomMood(
  exclude?: IslandMoodId | null,
  random: () => number = Math.random,
): IslandMoodId {
  const pool = ISLAND_MOODS.map((m) => m.id).filter((id) => id !== exclude);
  const choices = pool.length > 0 ? pool : ISLAND_MOODS.map((m) => m.id);
  const index = Math.min(
    choices.length - 1,
    Math.max(0, Math.floor(random() * choices.length)),
  );
  return choices[index];
}

/** A soft circular feature in normalized 0..1 map coordinates. */
export interface IslandBlob {
  cx: number;
  cy: number;
  /** Radius as a fraction of the grid size. */
  r: number;
}

export type SandRim = "none" | "narrow" | "wide";

export interface IslandPlan {
  name?: string;
  rationale?: string;
  lakes: IslandBlob[];
  forests: IslandBlob[];
  peaks: IslandBlob[];
  sandRim: SandRim;
}

interface MoodPreset {
  lakes: IslandBlob[];
  forests: IslandBlob[];
  peaks: IslandBlob[];
  sandRim: SandRim;
  /** Extra lone forest cells sprinkled on grass, 0..1 probability. */
  scatterForest: number;
  scatterStone: number;
  /** How much blob centers/radii wander per seed (fallback re-rolls). */
  wander: number;
}

const PRESETS: Record<IslandMoodId, MoodPreset> = {
  serene: {
    lakes: [{ cx: 0.5, cy: 0.48, r: 0.21 }],
    forests: [
      { cx: 0.24, cy: 0.26, r: 0.15 },
      { cx: 0.78, cy: 0.72, r: 0.14 },
    ],
    peaks: [{ cx: 0.8, cy: 0.2, r: 0.07 }],
    sandRim: "wide",
    scatterForest: 0.02,
    scatterStone: 0,
    wander: 0.1,
  },
  rugged: {
    lakes: [{ cx: 0.3, cy: 0.72, r: 0.09 }],
    forests: [{ cx: 0.72, cy: 0.78, r: 0.12 }],
    peaks: [
      { cx: 0.36, cy: 0.3, r: 0.2 },
      { cx: 0.72, cy: 0.42, r: 0.16 },
      { cx: 0.55, cy: 0.68, r: 0.11 },
    ],
    sandRim: "narrow",
    scatterForest: 0.015,
    scatterStone: 0.03,
    wander: 0.12,
  },
  wild: {
    lakes: [
      { cx: 0.34, cy: 0.36, r: 0.1 },
      { cx: 0.7, cy: 0.66, r: 0.08 },
    ],
    forests: [
      { cx: 0.3, cy: 0.3, r: 0.24 },
      { cx: 0.72, cy: 0.34, r: 0.2 },
      { cx: 0.45, cy: 0.72, r: 0.22 },
      { cx: 0.8, cy: 0.8, r: 0.14 },
    ],
    peaks: [{ cx: 0.55, cy: 0.55, r: 0.06 }],
    sandRim: "narrow",
    scatterForest: 0.1,
    scatterStone: 0.005,
    wander: 0.14,
  },
};

const FALLBACK_NAMES: Record<IslandMoodId, string[]> = {
  serene: ["Lagoon of Quiet Hours", "Stillwater Isle", "The Calm Between"],
  rugged: ["The Broken Crown", "High Cinder Isle", "Peaks of Small Mercy"],
  wild: ["The Overgrown Dark", "Tanglewood Isle", "Where the Map Gives Up"],
};

export function fallbackName(mood: IslandMoodId, seed: number): string {
  const names = FALLBACK_NAMES[mood];
  return names[Math.abs(seed) % names.length];
}

export const FALLBACK_RATIONALE: Record<IslandMoodId, string> = {
  serene: "One calm lagoon, soft shores, room to breathe.",
  rugged: "Stone first. Everything else negotiates with the peaks.",
  wild: "The forest was here first. The ponds are just visiting.",
};

/** Deterministic PRNG so a seed always repaints the same island. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash01(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function sanitizeBlobs(value: unknown, max: number): IslandBlob[] {
  if (!Array.isArray(value)) return [];
  const out: IslandBlob[] = [];
  for (const raw of value) {
    if (out.length >= max) break;
    let cx: number, cy: number, r: number;
    if (Array.isArray(raw)) {
      // Compact wire form: [cx, cy, r] as integer percents. Values that
      // all look like 0..1 fractions are taken as fractions instead.
      [cx, cy, r] = [Number(raw[0]), Number(raw[1]), Number(raw[2])];
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) continue;
      if (Math.abs(cx) > 1.5 || Math.abs(cy) > 1.5 || Math.abs(r) > 1.5) {
        cx /= 100;
        cy /= 100;
        r /= 100;
      }
    } else if (typeof raw === "object" && raw !== null) {
      // Legacy object form: {cx, cy, r} as 0..1 fractions.
      const b = raw as Record<string, unknown>;
      cx = Number(b.cx);
      cy = Number(b.cy);
      r = Number(b.r);
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) continue;
    } else {
      continue;
    }
    out.push({ cx: clamp(cx, 0, 1), cy: clamp(cy, 0, 1), r: clamp(r, 0.03, 0.35) });
  }
  return out;
}

/**
 * Parse the LLM designer's reply into an IslandPlan. Tolerant of code
 * fences and prose; strict about shapes, with every number clamped.
 * Returns null when nothing usable is found.
 */
export function parseIslandPlan(text: string): IslandPlan | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const lakes = sanitizeBlobs(obj.lakes, 2);
  const forests = sanitizeBlobs(obj.forests, 3);
  const peaks = sanitizeBlobs(obj.peaks, 2);
  if (lakes.length + forests.length + peaks.length === 0) return null;
  const sandRim: SandRim =
    obj.sandRim === "none" || obj.sandRim === "wide" ? obj.sandRim : "narrow";
  return {
    name: typeof obj.name === "string" ? obj.name.slice(0, 48) : undefined,
    rationale:
      typeof obj.rationale === "string" ? obj.rationale.slice(0, 240) : undefined,
    lakes,
    forests,
    peaks,
    sandRim,
  };
}

// Decode is the bottleneck for a small in-browser model, so the plan
// format is built to be emitted in as few tokens as possible: features
// are [cx, cy, r] integer percents (48 costs one token where 0.48
// costs three, and an array drops the per-blob object keys), and the
// model writes neither a rationale sentence nor an island name (the
// UI falls back to the per-mood line and name). A typical plan
// decodes in ~60 tokens, down from ~190 for the old
// {"cx": 0.48, ...} object form. The parser still accepts a name
// if one appears; the grammar below just never asks for it.
export const DESIGNER_SYSTEM =
  "You place circular features to design a square island for a map editor. " +
  "Each feature is [cx, cy, r] in percents of the map size: cx, cy run 0-100 from the top-left, " +
  "r is the radius percent (5 pond, 20 large lake or range). Choose lakes (water), forests, " +
  'peaks (stone), and sandRim ("none", "narrow", or "wide") for sandy shores. ' +
  "Leave some open grass. " +
  'Example: {"lakes":[[50,48,18]],"forests":[[24,26,14]],"peaks":[],"sandRim":"wide"}';

// No minItems: stick to schema keywords the previous (working)
// grammar already used. Short arrays parse to NaN and are dropped.
const BLOB_SCHEMA = {
  type: "array",
  items: { type: "integer" },
  maxItems: 3,
};

function designerSchema(lakes: number, forests: number, peaks: number): string {
  return JSON.stringify({
    type: "object",
    properties: {
      lakes: { type: "array", items: BLOB_SCHEMA, maxItems: lakes },
      forests: { type: "array", items: BLOB_SCHEMA, maxItems: forests },
      peaks: { type: "array", items: BLOB_SCHEMA, maxItems: peaks },
      sandRim: { type: "string", enum: ["none", "narrow", "wide"] },
    },
    required: ["lakes", "forests", "peaks", "sandRim"],
  });
}

export const DESIGNER_SCHEMA = designerSchema(2, 3, 2);

/** Step-down for slow devices: at most 4 features total (vs 7), so a
 *  plan decodes in roughly half the tokens and can still land inside
 *  the Suggest timeout on a weak GPU. */
export const DESIGNER_SCHEMA_COMPACT = designerSchema(1, 2, 1);

export function buildDesignerPrompt(n: number, mood: IslandMoodId): string {
  // No dump of the current grid: the designer is told to design
  // something fresh, so those n² prefill tokens bought nothing.
  // Mood rotation plus sampling temperature provide the variety.
  return `Map: ${n}x${n}. ${ISLAND_MOOD_MAP[mood].brief} JSON only.`;
}

function wanderBlobs(blobs: IslandBlob[], amount: number, rnd: () => number): IslandBlob[] {
  return blobs.map((b) => ({
    cx: clamp(b.cx + (rnd() * 2 - 1) * amount, 0.05, 0.95),
    cy: clamp(b.cy + (rnd() * 2 - 1) * amount, 0.05, 0.95),
    r: clamp(b.r * (0.85 + rnd() * 0.4), 0.03, 0.35),
  }));
}

/**
 * Paint an island into the grid store's sparse cell record (grass is the
 * default and is omitted). Same seed + plan always yields the same
 * island. Water is placed first, peaks override forest, and a sandy
 * shore rings every lake (width per plan; stone cliffs keep their edge).
 */
export function generateIsland(
  n: number,
  mood: IslandMoodId,
  plan: IslandPlan | null | undefined,
  seed: number,
): Record<string, TerrainId> {
  const preset = PRESETS[mood];
  const rnd = mulberry32(seed);
  const lakes = plan ? plan.lakes : wanderBlobs(preset.lakes, preset.wander, rnd);
  const forests = plan ? plan.forests : wanderBlobs(preset.forests, preset.wander, rnd);
  const peaks = plan ? plan.peaks : wanderBlobs(preset.peaks, preset.wander, rnd);
  const sandRim = plan?.sandRim ?? preset.sandRim;

  // Blob coordinates are cell indices in a 0..n space for even coverage.
  const influence = (blob: IslandBlob, x: number, y: number): number => {
    const dx = (x + 0.5) / n - blob.cx;
    const dy = (y + 0.5) / n - blob.cy;
    return Math.sqrt(dx * dx + dy * dy) / blob.r; // <1 inside, 0 at center
  };

  const grid: TerrainId[][] = Array.from({ length: n }, () =>
    Array<TerrainId>(n).fill("grass"),
  );

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const noise = hash01(x, y, seed);
      for (const lake of lakes) {
        if (influence(lake, x, y) < 0.82 + noise * 0.36) grid[y][x] = "water";
      }
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (grid[y][x] === "water") continue;
      for (const peak of peaks) {
        const d = influence(peak, x, y);
        if (d < 0.75 || (d < 1.1 && hash01(x, y, seed + 7) < (1.1 - d) * 1.6)) {
          grid[y][x] = "stone";
          break;
        }
      }
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (grid[y][x] !== "grass") continue;
      let forestP = preset.scatterForest;
      for (const forest of forests) {
        const d = influence(forest, x, y);
        if (d < 1.25) forestP = Math.max(forestP, 1.05 - d * 0.75);
      }
      if (hash01(x, y, seed + 13) < forestP) grid[y][x] = "forest";
      else if (hash01(x, y, seed + 29) < preset.scatterStone) grid[y][x] = "stone";
    }
  }

  // Sandy shore around water; stone cliffs keep their edge.
  if (sandRim !== "none") {
    const nearWater = (x: number, y: number, dist: number): boolean => {
      for (let dy = -dist; dy <= dist; dy++) {
        for (let dx = -dist; dx <= dist; dx++) {
          const ax = x + dx;
          const ay = y + dy;
          if (ax >= 0 && ay >= 0 && ax < n && ay < n && grid[ay][ax] === "water") {
            return true;
          }
        }
      }
      return false;
    };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (grid[y][x] === "water" || grid[y][x] === "stone") continue;
        if (nearWater(x, y, 1)) grid[y][x] = "sand";
        else if (
          sandRim === "wide" &&
          nearWater(x, y, 2) &&
          hash01(x, y, seed + 41) < 0.55
        ) {
          grid[y][x] = "sand";
        }
      }
    }
  }

  // The island's sandy perimeter, like the hand-authored concept island.
  // Rugged islands let stone break through the rim here and there.
  for (let i = 0; i < n; i++) {
    const edge: Array<[number, number]> = [
      [i, 0],
      [i, n - 1],
      [0, i],
      [n - 1, i],
    ];
    for (const [x, y] of edge) {
      if (grid[y][x] === "water") continue;
      if (mood === "rugged" && hash01(x, y, seed + 53) < 0.2) grid[y][x] = "stone";
      else grid[y][x] = "sand";
    }
  }

  const cells: Record<string, TerrainId> = {};
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (grid[y][x] !== "grass") cells[`${x},${y}`] = grid[y][x];
    }
  }
  return cells;
}
