const STEPS = [
  { index: 1, label: "Character select", note: null as string | null },
  { index: 2, label: "Map editor", note: "2.5D" },
  { index: 3, label: "Map render", note: "3D" },
];

export default function FlowSteps({ currentStep }: { currentStep: number }) {
  return (
    <ol aria-label="Creation flow" className="flex items-center gap-2 sm:gap-3">
      {STEPS.map((step, i) => {
        const isCurrent = step.index === currentStep;
        const isDone = step.index < currentStep;
        return (
          <li key={step.index} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div
              aria-current={isCurrent ? "step" : undefined}
              className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg border px-3 py-2.5 sm:px-4 ${
                isCurrent
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                  isCurrent
                    ? "bg-white text-zinc-900 dark:bg-zinc-900 dark:text-white"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {step.index}
              </span>
              <span className="truncate text-sm font-semibold">
                {step.label}
              </span>
              {step.note !== null && (
                <span className="ml-auto hidden shrink-0 rounded-full border border-current px-2 py-0.5 text-[11px] font-semibold opacity-70 sm:inline">
                  {step.note}
                </span>
              )}
              {isDone && <span className="sr-only">(completed)</span>}
            </div>
            {i < STEPS.length - 1 && (
              <span aria-hidden className="shrink-0 text-zinc-300 dark:text-zinc-700">
                →
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
