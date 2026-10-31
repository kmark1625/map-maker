import { create } from "zustand";
import { gridBounds, type CellCoord } from "@/lib/iso";

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
    top: "#a3c585",
    left: "#718f57",
    right: "#8aab6e",
  },
  {
    id: "water",
    label: "Water",
    shortcut: "2",
    top: "#7fb8d6",
    left: "#4f7f9c",
    right: "#669cb8",
  },
  {
    id: "sand",
    label: "Sand",
    shortcut: "3",
    top: "#e3cd91",
    left: "#b39c5e",
    right: "#cdb877",
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

function buildDemoCells(n: number): Record<string, TerrainId> {
  const cells: Record<string, TerrainId> = {};
  const c = (n - 1) / 2;
  const maxD = Math.hypot(c, c) || 1;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - c, y - c) / maxD;
      const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      const jitter = ((hash % 100) / 100 - 0.5) * 0.18;
      const t = d + jitter;
      let terrain: TerrainId = "grass";
      if (t > 0.78) terrain = "water";
      else if (t > 0.66) terrain = "sand";
      else if (t < 0.45 && hash % 7 < 2) terrain = "forest";
      else if (t < 0.3 && hash % 11 < 2) terrain = "stone";
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
