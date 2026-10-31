"use client";

import {
  TERRAIN_MAP,
  TOOLS,
  terrainAt,
  useGridStore,
} from "@/stores/grid-store";

export default function StatusBar() {
  const tool = useGridStore((s) => s.tool);
  const activeTerrain = useGridStore((s) => s.activeTerrain);
  const n = useGridStore((s) => s.n);
  const cells = useGridStore((s) => s.cells);
  const selected = useGridStore((s) => s.selected);
  const hover = useGridStore((s) => s.hover);
  const viewport = useGridStore((s) => s.viewport);

  const toolLabel = TOOLS.find((t) => t.id === tool)?.label ?? tool;
  const focus = selected ?? hover;
  const focusTerrain = focus ? terrainAt(cells, focus.x, focus.y) : null;
  const painted = Object.keys(cells).length;

  return (
    <footer className="flex items-center gap-4 border-t border-stone-300 bg-white px-4 py-1.5 text-xs text-stone-600">
      <span>
        <span className="font-semibold text-stone-900">{toolLabel}</span> tool
      </span>
      {tool === "paint" ? (
        <span className="hidden sm:inline">
          Paint:{" "}
          <span className="font-medium text-stone-900">
            {TERRAIN_MAP[activeTerrain].label}
          </span>
        </span>
      ) : null}
      <span className="ml-auto tabular-nums">
        {focus && focusTerrain
          ? `(${focus.x}, ${focus.y}) · ${TERRAIN_MAP[focusTerrain].label}`
          : "—"}
      </span>
      <span className="tabular-nums">{Math.round(viewport.zoom * 100)}%</span>
      <span className="tabular-nums">
        {n}×{n} · {painted} painted
      </span>
    </footer>
  );
}
