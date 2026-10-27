"use client";

import { useHelloStore } from "@/stores/hello-store";

export default function HelloCounter() {
  const count = useHelloStore((state) => state.count);
  const increment = useHelloStore((state) => state.increment);
  const decrement = useHelloStore((state) => state.decrement);
  const reset = useHelloStore((state) => state.reset);

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Zustand counter
      </p>
      <p
        className="text-5xl font-bold tabular-nums"
        aria-live="polite"
        data-testid="count"
      >
        {count}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={decrement}
          className="rounded-lg bg-zinc-200 px-4 py-2 text-sm font-semibold transition hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
        >
          − Decrement
        </button>
        <button
          type="button"
          onClick={increment}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          + Increment
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
