"use client";

import { ISLAND_MOODS, ISLAND_MOOD_MAP } from "@/lib/island-suggest";
import { useSuggestStore } from "@/stores/suggest-store";
import { DESIGNER_MODEL_LABEL } from "@/lib/webllm/designer";

export default function SuggestPanel() {
  const mood = useSuggestStore((s) => s.mood);
  const last = useSuggestStore((s) => s.last);
  const engineStatus = useSuggestStore((s) => s.engineStatus);
  const engineNote = useSuggestStore((s) => s.engineNote);
  const progress = useSuggestStore((s) => s.progress);
  const thinking = useSuggestStore((s) => s.thinking);
  const setMood = useSuggestStore((s) => s.setMood);
  const loadEngine = useSuggestStore((s) => s.loadEngine);
  const suggest = useSuggestStore((s) => s.suggest);

  return (
    <section className="rounded-lg border border-stone-300 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-zinc-400">
          Suggest an island
        </h2>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            engineStatus === "ready"
              ? "bg-teal-700 text-white"
              : "bg-stone-200 text-stone-600 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {engineStatus === "ready"
            ? "WebLLM ready"
            : engineStatus === "loading"
              ? "Loading…"
              : "Generator"}
        </span>
      </div>

      <div className="flex flex-col gap-1" role="group" aria-label="Island mood">
        {ISLAND_MOODS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMood(m.id)}
            aria-pressed={mood === m.id}
            className={`rounded-md px-2 py-1.5 text-left text-xs ${
              mood === m.id
                ? "bg-stone-900 font-semibold text-white dark:bg-white dark:text-zinc-900"
                : "text-stone-600 hover:bg-stone-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-stone-500 dark:text-zinc-400">
        {ISLAND_MOOD_MAP[mood].blurb}
      </p>

      <button
        type="button"
        disabled={thinking}
        onClick={() => void suggest()}
        className="mt-2.5 w-full rounded-md bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-600 disabled:bg-stone-300 disabled:text-stone-500 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
      >
        {thinking ? "Designing…" : last ? "Suggest another" : "Suggest island"}
      </button>
      <p className="mt-1.5 text-[11px] text-stone-400 dark:text-zinc-500">
        Replaces the current layout, like Demo. Every click re-rolls.
      </p>

      {last ? (
        <div className="mt-2 flex flex-col gap-1">
          <p className="text-sm font-semibold text-stone-900 dark:text-zinc-100">{last.name}</p>
          <p className="text-xs text-stone-500 italic dark:text-zinc-400">“{last.rationale}”</p>
          <p className="text-[11px] text-stone-400 dark:text-zinc-500">
            {last.source === "llm"
              ? "Planned by WebLLM, painted by the island generator."
              : "Painted by the built-in island generator."}{" "}
            Paint over it freely — it is a starting point.
          </p>
        </div>
      ) : null}

      <div className="mt-3 border-t border-stone-200 pt-2.5 dark:border-zinc-800">
        {engineStatus === "idle" || engineStatus === "error" ? (
          <>
            <button
              type="button"
              onClick={() => void loadEngine()}
              className="w-full rounded-md bg-stone-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-stone-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {engineStatus === "error" ? "Retry WebLLM designer" : "Load WebLLM designer"}
            </button>
            <p className="mt-1.5 text-[11px] leading-snug text-stone-400 dark:text-zinc-500">
              {DESIGNER_MODEL_LABEL}. Runs in a Web Worker on WebGPU — the
              editor stays responsive. Cached after first download.
            </p>
          </>
        ) : null}
        {engineStatus === "loading" ? (
          <div>
            <div className="h-1.5 overflow-hidden rounded bg-stone-200 dark:bg-zinc-800">
              <div
                className="h-full bg-teal-700 transition-all"
                style={{ width: `${Math.round((progress?.progress ?? 0) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] break-words text-stone-500 dark:text-zinc-400">
              {progress?.text ?? "Starting worker…"}
            </p>
            <p className="text-[11px] text-stone-400 dark:text-zinc-500">
              You can keep editing — loading happens off the main thread.
            </p>
          </div>
        ) : null}
        {engineStatus === "ready" ? (
          <p className="text-[11px] leading-snug text-stone-400 dark:text-zinc-500">
            {DESIGNER_MODEL_LABEL}, running in a Web Worker on WebGPU.
            {thinking
              ? " Designing…"
              : " It places lakes, forests, and peaks; the generator paints a coherent island."}
          </p>
        ) : null}
        {engineNote ? (
          <p className="mt-1 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
            {engineNote}
          </p>
        ) : null}
      </div>
    </section>
  );
}
