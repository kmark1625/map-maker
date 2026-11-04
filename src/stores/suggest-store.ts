import { create } from "zustand";
import { useGridStore } from "@/stores/grid-store";
import {
  FALLBACK_RATIONALE,
  fallbackName,
  generateIsland,
  pickRandomMood,
  type IslandMoodId,
  type IslandPlan,
} from "@/lib/island-suggest";
import { TimeoutError } from "@/lib/timeout";
import type { DesignerProgress } from "@/lib/webllm/designer";

export const SUGGEST_TIMEOUT_NOTICE =
  "LLM is taking longer than expected — using the default layout instead.";

export type EngineStatus = "idle" | "unsupported" | "loading" | "ready" | "error";
export type SuggestSource = "llm" | "generator";

type Engine = Awaited<
  ReturnType<typeof import("@/lib/webllm/designer").loadDesigner>
>;

let engine: Engine | null = null;
let suggestRequestId = 0;

interface PrefetchOutcome {
  plan: IslandPlan | null;
  /** True when generation hit the Suggest timeout (vs other failures). */
  timedOut: boolean;
}

/**
 * Single prefetch slot: at most one background generation exists at a
 * time. A ready plan sits here until a Suggest click consumes it —
 * no further prefetch starts while the slot is occupied. Plans are
 * prompted for a specific grid size, so the slot records its `n`;
 * changing the grid size resets the slot (see the subscription in
 * the store initializer).
 */
type PrefetchSlot =
  | {
      status: "pending";
      mood: IslandMoodId;
      n: number;
      promise: Promise<PrefetchOutcome>;
    }
  | { status: "ready"; mood: IslandMoodId; n: number; plan: IslandPlan }
  | null;

let prefetchSlot: PrefetchSlot = null;
/** Bumped on reset so a late result from a discarded prefetch is dropped. */
let prefetchGeneration = 0;

function isTimeoutError(err: unknown): boolean {
  // Match by name too: the designer loads as a separate chunk.
  return (
    err instanceof TimeoutError ||
    (err instanceof Error && err.name === "TimeoutError")
  );
}

export interface LastSuggestion {
  name: string;
  rationale: string;
  source: SuggestSource;
  mood: IslandMoodId;
  /** Set when the LLM timed out and the default layout was used. */
  notice: string | null;
}

interface SuggestState {
  last: LastSuggestion | null;
  engineStatus: EngineStatus;
  engineNote: string | null;
  progress: DesignerProgress | null;
  thinking: boolean;

  loadEngine: () => Promise<void>;
  suggest: () => Promise<void>;
}

export const useSuggestStore = create<SuggestState>()((set, get) => {
  /**
   * Start one background plan generation for the next Suggest click.
   * No-op while the slot is occupied (pending or ready): the current
   * prefetched plan must be consumed (or reset) first.
   */
  const schedulePrefetch = () => {
    const currentEngine = engine;
    if (!currentEngine || prefetchSlot) return;
    if (get().engineStatus !== "ready") return;
    const generation = prefetchGeneration;
    // Rotate randomly between the sample scenes, never repeating the last.
    const mood = pickRandomMood(get().last?.mood ?? null);
    const n = useGridStore.getState().n;
    const promise: Promise<PrefetchOutcome> = (async () => {
      try {
        const designer = await import("@/lib/webllm/designer");
        const plan = await designer.requestIslandPlan(currentEngine, n, mood);
        return { plan, timedOut: false };
      } catch (err) {
        return { plan: null, timedOut: isTimeoutError(err) };
      }
    })();
    const slot: PrefetchSlot = { status: "pending", mood, n, promise };
    prefetchSlot = slot;
    void promise.then(({ plan }) => {
      // Only settle into the slot if this prefetch is still the
      // current one (not consumed by a click or discarded by a reset).
      if (prefetchSlot !== slot || generation !== prefetchGeneration) return;
      prefetchSlot = plan ? { status: "ready", mood, n, plan } : null;
    });
  };

  /**
   * Discard any pending/ready prefetched plan and prefetch a fresh
   * one for the current grid size. A discarded in-flight generation
   * is interrupted so the GPU is free for its replacement.
   */
  const resetPrefetch = () => {
    prefetchGeneration += 1;
    const discarded = prefetchSlot;
    prefetchSlot = null;
    if (discarded?.status === "pending" && engine) {
      // Interrupt the discarded generation, then wait for it to
      // settle before generating again so the replacement never
      // overlaps it. (The worker engine's interrupt is fire-and-
      // forget; the pending promise settling is the completion
      // signal.) The generation check keeps rapid repeated resizes
      // to a single restart.
      try {
        engine.interruptGenerate();
      } catch {
        // A failed interrupt still lets the promise settle below.
      }
      const generation = prefetchGeneration;
      void discarded.promise.then(() => {
        if (generation === prefetchGeneration) schedulePrefetch();
      });
    } else {
      schedulePrefetch();
    }
  };

  // Any grid size change invalidates a plan prompted for the old
  // size, so it resets the prefetch. Subscribed once with the store.
  useGridStore.subscribe((state, prev) => {
    if (state.n !== prev.n) resetPrefetch();
  });

  return {
    last: null,
    engineStatus: "idle",
    engineNote: null,
    progress: null,
    thinking: false,

    loadEngine: async () => {
      if (get().engineStatus === "loading" || engine) return;
      set({ engineStatus: "loading", engineNote: null, progress: null });
      try {
        // Dynamic import: WebLLM stays out of the initial bundle and SSR.
        const designer = await import("@/lib/webllm/designer");
        if (!(await designer.webGpuAvailable())) {
          set({
            engineStatus: "unsupported",
            engineNote:
              "WebGPU is not available in this browser, so suggestions use the built-in island generator instead.",
          });
          return;
        }
        engine = await designer.loadDesigner((progress) => set({ progress }));
        set({ engineStatus: "ready", progress: null, engineNote: null });
        // Pre-design the first suggestion so the first Suggest is instant.
        schedulePrefetch();
      } catch (err) {
        set({
          engineStatus: "error",
          progress: null,
          engineNote: `Designer failed to load (${err instanceof Error ? err.message : "unknown error"}). Suggestions still work with the generator.`,
        });
      }
    },

    suggest: async () => {
      const requestId = ++suggestRequestId;
      const grid = useGridStore.getState();
      // Rotate randomly between the sample scenes, never repeating the
      // last. A consumed prefetch overrides this with its own mood,
      // which was picked the same way when it was scheduled.
      let mood = pickRandomMood(get().last?.mood ?? null);
      const seed = Math.floor(Math.random() * 2 ** 31);

      let plan: IslandPlan | null = null;
      let source: SuggestSource = "generator";
      let notice: string | null = null;
      const engineReady = engine !== null && get().engineStatus === "ready";
      if (engineReady && prefetchSlot && prefetchSlot.status === "ready") {
        // Consume the prefetched plan: this click paints instantly.
        mood = prefetchSlot.mood;
        plan = prefetchSlot.plan;
        source = "llm";
        prefetchSlot = null;
      } else if (engineReady) {
        set({ thinking: true });
        try {
          if (prefetchSlot && prefetchSlot.status === "pending") {
            // A prefetch is already generating for this click; await
            // it rather than starting a second generation.
            const pending = prefetchSlot;
            mood = pending.mood;
            prefetchSlot = null;
            const outcome = await pending.promise;
            plan = outcome.plan;
            if (plan) source = "llm";
            else if (outcome.timedOut) notice = SUGGEST_TIMEOUT_NOTICE;
          } else if (engine) {
            const designer = await import("@/lib/webllm/designer");
            plan = await designer.requestIslandPlan(engine, grid.n, mood);
            if (plan) source = "llm";
          }
        } catch (err) {
          plan = null; // LLM hiccup: the generator below still suggests
          if (isTimeoutError(err)) notice = SUGGEST_TIMEOUT_NOTICE;
        } finally {
          if (requestId === suggestRequestId) set({ thinking: false });
        }
      }
      if (requestId !== suggestRequestId) return; // a newer click superseded us

      // The suggestion replaces the current layout.
      const n = useGridStore.getState().n;
      useGridStore.getState().setCells(generateIsland(n, mood, plan, seed));
      set({
        last: {
          name: plan?.name ?? fallbackName(mood, seed),
          rationale: plan?.rationale ?? FALLBACK_RATIONALE[mood],
          source,
          mood,
          notice,
        },
      });
      // Slot is empty now (consumed, awaited, or never filled):
      // pre-design the next suggestion in the background.
      schedulePrefetch();
    },
  };
});
