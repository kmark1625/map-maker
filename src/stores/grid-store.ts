import { create } from "zustand";
import { gridBounds, type CellCoord } from "@/lib/iso";
import conceptMap from "@/data/concept-map.json";

export type ToolId = "select" | "pan" | "paint" | "erase";
export type TerrainId = "grass" | "water" | "sand" | "stone" | "forest";

export interface Terrain {
  id: TerrainId;
  label: string;
  shortcut: string;
  top: string;
  left: string;
  right: string;
}

export const TERRAINS: Terrain[] = [
  {
    id: "grass",
    label: "Grass",
    shortcut: "1",
    top: "#8fd16a",
    left: "#5e9c46",
    right: "#74b958",
  },
  {
    id: "water",
    label: "Water",
    shortcut: "2",
    top: "#40a6e6",
    left: "#2b6e9c",
    right: "#378bb8",
  },
  {
    id: "sand",
    label: "Sand",
    shortcut: "3",
    top: "#e7d8a8",
    left: "#b3a06b",
    right: "#cfbd85",
  },
  {
    id: "stone",
    label: "Stone",
    shortcut: "4",
    top: "#bcbec2",
    left: "#7f8288",
    right: "#9a9da3",
  },
  {
    id: "forest",
    label: "Forest",
    shortcut: "5",
    top: "#5e9c6a",
    left: "#39683f",
    right: "#4a8454",
  },
];

export const TERRAIN_MAP: Record<TerrainId, Terrain> = Object.fromEntries(
  TERRAINS.map((t) => [t.id, t]),
) as Record<TerrainId, Terrain>;

export const DEFAULT_TERRAIN: TerrainId = "grass";
export const MIN_N = 4;
export const MAX_N = 20;
export const DEFAULT_N = 12;

export const TOOLS: ReadonlyArray<{
  id: ToolId;
  label: string;
  shortcut: string;
  hint: string;
}> = [
  { id: "select", label: "Select", shortcut: "V", hint: "Click a cell to select it" },
  { id: "pan", label: "Pan", shortcut: "H", hint: "Drag to pan the view" },
  { id: "paint", label: "Paint", shortcut: "P", hint: "Click or drag to paint terrain" },
  { id: "erase", label: "Erase", shortcut: "E", hint: "Click or drag to reset cells to grass" },
];

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

// Hand-authored concept layout (see concept-map.json + floating_island.jpg):
// sand rim, northern stone peaks, central lake with a stone plaza core,
// forest bands. Other sizes nearest-neighbor sample the 12x12 template.
const CONCEPT_ROWS: string[] = conceptMap.rows;
const CONCEPT_N = CONCEPT_ROWS.length;
const CONCEPT_LEGEND: Record<string, TerrainId> = Object.fromEntries(
  Object.entries(conceptMap.legend as Record<string, string>).map(
    ([key, value]) => [
      key,
      (TERRAINS.some((t) => t.id === value)
        ? value
        : DEFAULT_TERRAIN) as TerrainId,
    ],
  ),
);

function buildDemoCells(n: number): Record<string, TerrainId> {
  const cells: Record<string, TerrainId> = {};
  for (let y = 0; y < n; y++) {
    const row =
      CONCEPT_ROWS[Math.min(CONCEPT_N - 1, Math.floor((y * CONCEPT_N) / n))];
    for (let x = 0; x < n; x++) {
      const terrain =
        CONCEPT_LEGEND[
          row[Math.min(CONCEPT_N - 1, Math.floor((x * CONCEPT_N) / n))]
        ] ?? DEFAULT_TERRAIN;
      if (terrain !== DEFAULT_TERRAIN) cells[cellKey(x, y)] = terrain;
    }
  }
  return cells;
}

interface GridState {
  tool: ToolId;
  activeTerrain: TerrainId;
  n: number;
  cells: Record<string, TerrainId>;
  selected: CellCoord | null;
  hover: CellCoord | null;
  viewport: Viewport;
  fitSignal: number;

  setTool: (tool: ToolId) => void;
  setActiveTerrain: (terrain: TerrainId) => void;
  setN: (n: number) => void;
  paintCell: (x: number, y: number, terrain?: TerrainId) => void;
  eraseCell: (x: number, y: number) => void;
  setSelected: (cell: CellCoord | null) => void;
  setHover: (cell: CellCoord | null) => void;
  setViewport: (patch: Partial<Viewport>) => void;
  zoomAt: (factor: number, anchor: { sx: number; sy: number }) => void;
  fitGrid: (width: number, height: number) => void;
  requestFit: () => void;
  resetGrid: () => void;
  demoGrid: () => void;
}

function sameCell(a: CellCoord | null, b: CellCoord | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y;
}

export const useGridStore = create<GridState>()((set) => ({
  tool: "select",
  activeTerrain: "forest",
  n: DEFAULT_N,
  cells: buildDemoCells(DEFAULT_N),
  selected: null,
  hover: null,
  viewport: { x: 0, y: 0, zoom: 1 },
  fitSignal: 0,

  setTool: (tool) => set({ tool }),
  setActiveTerrain: (terrain) => set({ activeTerrain: terrain }),
  setN: (next) =>
    set((state) => {
      const n = Math.min(MAX_N, Math.max(MIN_N, Math.round(next)));
      if (n === state.n) return state;
      const cells: Record<string, TerrainId> = {};
      for (const [key, terrain] of Object.entries(state.cells)) {
        const [x, y] = key.split(",").map(Number);
        if (x < n && y < n) cells[key] = terrain;
      }
      const inBounds = (c: CellCoord | null) =>
        c && c.x < n && c.y < n ? c : null;
      return {
        n,
        cells,
        selected: inBounds(state.selected),
        hover: inBounds(state.hover),
      };
    }),
  paintCell: (x, y, terrain) =>
    set((state) => {
      const t = terrain ?? state.activeTerrain;
      const key = cellKey(x, y);
      const current = state.cells[key] ?? DEFAULT_TERRAIN;
      if (current === t) return state;
      const cells = { ...state.cells };
      if (t === DEFAULT_TERRAIN) delete cells[key];
      else cells[key] = t;
      return { cells };
    }),
  eraseCell: (x, y) =>
    set((state) => {
      const key = cellKey(x, y);
      if (!(key in state.cells)) return state;
      const cells = { ...state.cells };
      delete cells[key];
      return { cells };
    }),
  setSelected: (cell) =>
    set((state) =>
      sameCell(state.selected, cell) ? state : { selected: cell },
    ),
  setHover: (cell) =>
    set((state) => (sameCell(state.hover, cell) ? state : { hover: cell })),

  setViewport: (patch) =>
    set((state) => ({ viewport: { ...state.viewport, ...patch } })),
  zoomAt: (factor, anchor) =>
    set((state) => {
      const zoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, state.viewport.zoom * factor),
      );
      const k = zoom / state.viewport.zoom;
      return {
        viewport: {
          zoom,
          x: anchor.sx - (anchor.sx - state.viewport.x) * k,
          y: anchor.sy - (anchor.sy - state.viewport.y) * k,
        },
      };
    }),
  fitGrid: (width, height) =>
    set((state) => {
      const bounds = gridBounds(state.n);
      const padding = 72;
      const zoom = Math.min(
        MAX_ZOOM,
        Math.max(
          MIN_ZOOM,
          Math.min(
            (width - padding) / bounds.width,
            (height - padding) / bounds.height,
          ),
        ),
      );
      return {
        viewport: {
          zoom,
          x: (width - bounds.width * zoom) / 2 - bounds.minX * zoom,
          y: (height - bounds.height * zoom) / 2 - bounds.minY * zoom,
        },
      };
    }),
  requestFit: () => set((state) => ({ fitSignal: state.fitSignal + 1 })),
  resetGrid: () => set({ cells: {}, selected: null }),
  demoGrid: () =>
    set((state) => ({ cells: buildDemoCells(state.n), selected: null })),
}));

export function terrainAt(
  cells: Record<string, TerrainId>,
  x: number,
  y: number,
): TerrainId {
  return cells[cellKey(x, y)] ?? DEFAULT_TERRAIN;
}
