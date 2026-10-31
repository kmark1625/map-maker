"use client";

import {
  TERRAIN_MAP,
  terrainAt,
  useGridStore,
  type TerrainId,
} from "@/stores/grid-store";

/**
 * 2-char glyph per terrain. Each cell is printed 2 chars wide x 2 rows tall
 * so the console map looks roughly square in a monospace font.
 *
 * - grass (default terrain): "GG"
 * - water:                  "~~"
 * - sand:                   ".."
 * - stone:                  "##"
 * - forest:                 "TT"
 */
export const CELL_GLYPH: Record<TerrainId, string> = {
  grass: "GG",
  water: "~~",
  sand: "..",
  stone: "##",
  forest: "TT",
};

/** Render rows y=0..n-1 top to bottom, x=0..n-1 left to right. */
export function formatGrid(
  n: number,
  cells: Record<string, TerrainId>,
): string {
  const colHeader =
    "   " + Array.from({ length: n }, (_, x) => String(x % 10).padStart(2, " ")).join("");
  const border = "   +" + "-".repeat(n * 2) + "+";
  const lines: string[] = [colHeader, border];
  for (let y = 0; y < n; y++) {
    const rowCells: string[] = [];
    for (let x = 0; x < n; x++) {
      rowCells.push(CELL_GLYPH[terrainAt(cells, x, y)]);
    }
    const row = rowCells.join("");
    const label = String(y % 100).padStart(2, " ");
    // 2x2: each cell row prints as two identical console lines.
    lines.push(`${label} |${row}|`);
    lines.push(`   |${row}|`);
  }
  lines.push(border);
  lines.push(legendLine());
  return lines.join("\n");
}

function legendLine(): string {
  const parts = (Object.keys(CELL_GLYPH) as TerrainId[]).map(
    (id) => `${CELL_GLYPH[id]}=${TERRAIN_MAP[id].label}`,
  );
  return `Legend: ${parts.join("  ")}`;
}

/**
 * Print the current grid to the dev console.
 * Usage in DevTools: `printGrid()`
 * Returns the printed string so it can be copied: `copy(printGrid())`.
 */
export function printGrid(): string {
  const { n, cells } = useGridStore.getState();
  const out = `Grid ${n}x${n} (x -> right, y -> down, each cell 2x2 chars)\n${formatGrid(n, cells)}`;
  console.log(out);
  return out;
}

declare global {
  interface Window {
    printGrid?: typeof printGrid;
    formatGrid?: typeof formatGrid;
  }
}

/** Attach `printGrid()` (+ `formatGrid`) to window for the dev console. Safe to call twice. */
export function installGridDebugger(): void {
  if (typeof window === "undefined") return;
  window.printGrid = printGrid;
  window.formatGrid = formatGrid;
}

// Auto-install on the client so `printGrid()` just works in DevTools.
installGridDebugger();
