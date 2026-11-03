"use client";

import { MAX_N, MIN_N, TERRAINS, useGridStore } from "@/stores/grid-store";
import { useSuggestStore } from "@/stores/suggest-store";
import { TILE_H } from "@/lib/iso";
import { ISLAND_MOOD_MAP } from "@/lib/island-suggest";

export default function GridPanel() {
  const n = useGridStore((s) => s.n);
  const setN = useGridStore((s) => s.setN);
  const activeTerrain = useGridStore((s) => s.activeTerrain);
  const setActiveTerrain = useGridStore((s) => s.setActiveTerrain);
  const setTool = useGridStore((s) => s.setTool);
  const requestFit = useGridStore((s) => s.requestFit);
  const resetGrid = useGridStore((s) => s.resetGrid);
  const suggest = useSuggestStore((s) => s.suggest);
  const thinking = useSuggestStore((s) => s.thinking);
  const last = useSuggestStore((s) => s.last);

  return (
    <section className="rounded-lg border border-stone-300 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-zinc-400">
        Grid
      </h2>
      <div className="flex items-center justify-between">
        <span className="text-sm text-stone-700 dark:text-zinc-200">Size</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Shrink grid"
            disabled={n <= MIN_N}
            onClick={() => setN(n - 1)}
            className="rounded border border-stone-300 px-2 py-0.5 text-sm font-semibold text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            −
          </button>
          <span className="w-14 text-center text-sm tabular-nums">
            {n}×{n}
          </span>
          <button
            type="button"
            title="Grow grid"
            disabled={n >= MAX_N}
            onClick={() => setN(n + 1)}
            className="rounded border border-stone-300 px-2 py-0.5 text-sm font-semibold text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            +
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-stone-500 dark:text-zinc-400">
        Cubes {TILE_H}×{TILE_H}×{TILE_H} · h fixed · slight iso tilt
      </p>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={requestFit}
          className="flex-1 rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Fit view
        </button>
        <button
          type="button"
          title="Suggest a random island — rotates between Serene lagoon, Rugged peaks, and Wild forest. Replaces the current layout; every click re-rolls."
          disabled={thinking}
          onClick={() => void suggest()}
          className="flex-1 rounded-md border border-teal-700 px-2 py-1 text-xs font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50 dark:border-teal-500 dark:text-teal-200 dark:hover:bg-teal-950"
        >
          {thinking ? "…" : "Suggest"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Reset every cell to grass?")) resetGrid();
          }}
          className="flex-1 rounded-md border border-stone-300 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Reset
        </button>
      </div>
      <div aria-live="polite" className="mt-1.5">
        {thinking ? (
          <p className="text-[11px] text-stone-400 dark:text-zinc-500">Designing…</p>
        ) : last ? (
          <>
            <p className="text-xs text-stone-700 dark:text-zinc-200">
              <span className="font-semibold">{ISLAND_MOOD_MAP[last.mood].label}</span>
              {" — "}
              {last.name}
            </p>
            <p className="text-[11px] text-stone-400 italic dark:text-zinc-500">
              “{last.rationale}”{" "}
              {last.source === "llm"
                ? "Planned by the LLM Designer."
                : "Painted by the island generator."}{" "}
              Suggest again for another scene.
            </p>
          </>
        ) : (
          <p className="text-[11px] text-stone-400 dark:text-zinc-500">
            Suggest rotates randomly: Serene lagoon · Rugged peaks · Wild
            forest. Replaces the current layout.
          </p>
        )}
      </div>

      <h2 className="mt-3 mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-zinc-400">
        Terrain
      </h2>
      <ul className="flex flex-col gap-1">
        {TERRAINS.map((t) => {
          const active = t.id === activeTerrain;
          return (
            <li key={t.id}>
              <button
                type="button"
                title={`Paint ${t.label} (${t.shortcut})`}
                onClick={() => {
                  setActiveTerrain(t.id);
                  setTool("paint");
                }}
                className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                  active
                    ? "border-teal-700 bg-teal-50 font-medium text-stone-900 dark:border-teal-500 dark:bg-teal-950 dark:text-zinc-100"
                    : "border-transparent text-stone-700 hover:border-stone-200 hover:bg-stone-50 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
                }`}
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-sm border border-black/20"
                  style={{ backgroundColor: t.top }}
                />
                <span className="flex-1 text-left">{t.label}</span>
                <span className="text-xs text-stone-400 dark:text-zinc-500">{t.shortcut}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
