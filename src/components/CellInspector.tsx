"use client";

import { useMemo } from "react";
import {
  TERRAIN_MAP,
  TERRAINS,
  terrainAt,
  useGridStore,
  type TerrainId,
} from "@/stores/grid-store";

export default function CellInspector() {
  const selected = useGridStore((s) => s.selected);
  const hover = useGridStore((s) => s.hover);
  const cells = useGridStore((s) => s.cells);
  const n = useGridStore((s) => s.n);
  const paintCell = useGridStore((s) => s.paintCell);

  const focus = selected ?? hover;
  const focusTerrain: TerrainId | null = focus
    ? terrainAt(cells, focus.x, focus.y)
    : null;

  const counts = useMemo(() => {
    const result: Record<TerrainId, number> = {
      grass: 0,
      water: 0,
      sand: 0,
      stone: 0,
      forest: 0,
    };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        result[terrainAt(cells, x, y)] += 1;
      }
    }
    return result;
  }, [cells, n]);

  return (
    <section className="rounded-lg border border-stone-300 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-zinc-400">
        Cell
      </h2>
      {focus && focusTerrain ? (
        <div className="flex flex-col gap-2.5">
          <p className="text-sm text-stone-700 dark:text-zinc-300">
            <span className="font-semibold text-stone-900 tabular-nums dark:text-zinc-100">
              ({focus.x}, {focus.y})
            </span>{" "}
            · {TERRAIN_MAP[focusTerrain].label}
            {!selected ? (
              <span className="text-stone-400 dark:text-zinc-500"> (hover)</span>
            ) : null}
          </p>
          <div className="flex flex-col gap-1 text-xs font-medium text-stone-600 dark:text-zinc-400">
            Set terrain
            <div className="flex gap-1.5">
              {TERRAINS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  title={t.label}
                  onClick={() => paintCell(focus.x, focus.y, t.id)}
                  style={{ backgroundColor: t.top }}
                  className={`h-6 w-6 rounded-full ${
                    focusTerrain === t.id
                      ? "ring-2 ring-stone-900 ring-offset-1"
                      : "ring-1 ring-black/10"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-stone-500 dark:text-zinc-400">Hover or select a cell.</p>
      )}

      <h3 className="mt-3 mb-1.5 text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-zinc-400">
        Counts
      </h3>
      <dl className="flex flex-col gap-1 text-xs">
        {TERRAINS.map((t) => (
          <div key={t.id} className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-sm border border-black/20"
              style={{ backgroundColor: t.top }}
            />
            <dt className="text-stone-600 dark:text-zinc-400">{t.label}</dt>
            <dd className="ml-auto font-medium text-stone-900 tabular-nums dark:text-zinc-100">
              {counts[t.id]}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
