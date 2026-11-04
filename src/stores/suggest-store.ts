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

/** Consecutive live (Suggest-click) LLM failures that trigger an
 *  automatic Cartographer unload. A live failure is a click with the
 *  Cartographer ready that still falls back to the generator — it
 *  timed out, errored, or produced no usable plan. Any click that
 *  applies an LLM plan resets the streak. */
export const MAX_CONSECUTIVE_LIVE_FAILURES = 3;

export const SUGGEST_CARTOGRAPHER_UNLOADED_NOTICE =
  "Cartographer failed 3 times in a row — unloading it and falling back to the default layout generator. Load Cartographer again to retry.";

export type EngineStatus = "idle" | "unsupported" | "loading" | "ready" | "error";
export type SuggestSource = "llm" | "generator";

type Engine = Awaited<
  ReturnType<typeof import("@/lib/webllm/designer").loadDesigner>
>;

let engine: Engine | null = null;
let suggestRequestId = 0;
/** Live Suggest failures since the last LLM success (or engine load). */
let consecutiveLiveFailures = 0;
/** Set by any unload (manual or after repeated failures) so the
 *  editor's default auto-load does not immediately undo it when the
 *  page is revisited within this app session. An explicit Load
 *  clears it; a fresh page load resets it. */
let unloadedThisSession = false;

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
  /** Default load attempt when the editor opens: only from the
   *  never-loaded state, and never after an unload this session. */
  autoLoadEngine: () => Promise<void>;
  /** Manually unload the Cartographer (clicking the loaded badge). */
  unloadEngine: () => void;
  suggest: () => Promise<void>;
}

export const useSuggestStore = create<SuggestState>()((set, get) => {
  /**
   * Unload the Cartographer and return to the default
   * (generator-only) behavior. Used after repeated live failures
   * (with the failure notice) and for a manual unload (no notice).
   * State is cleared synchronously so no new LLM work can start;
   * the actual model unload/worker teardown finishes in the
   * background. The user can load the Cartographer again from the
   * not-loaded state.
   */
  const unloadCartographer = (engineNote: string | null) => {
    const currentEngine = engine;
    engine = null;
    consecutiveLiveFailures = 0;
    unloadedThisSession = true;
    set({
      engineStatus: "idle",
      engineNote,
      progress: null,
    });
    if (currentEngine) {
      void import("@/lib/webllm/designer")
        .then((designer) => designer.unloadDesigner(currentEngine))
        .catch(() => {});
    }
  };

  /** Shared load path for the explicit Load button and auto-load. */
  const startLoadEngine = async (): Promise<void> => {
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
      consecutiveLiveFailures = 0; // a (re)load starts a fresh streak
      set({ engineStatus: "ready", progress: null, engineNote: null });
    } catch (err) {
      set({
        engineStatus: "error",
        progress: null,
        engineNote: `Designer failed to load (${err instanceof Error ? err.message : "unknown error"}). Suggestions still work with the generator.`,
      });
    }
  };

  return {
    last: null,
    engineStatus: "idle",
    engineNote: null,
    progress: null,
    thinking: false,

    loadEngine: async () => {
      // Explicit load: overrides an earlier unload this session.
      unloadedThisSession = false;
      await startLoadEngine();
    },

    autoLoadEngine: async () => {
      // Default attempt on editor visit only: never override an
      // unload, and never retry states the user must act on
      // (error/unsupported) or that are already loading/ready.
      if (unloadedThisSession) return;
      if (get().engineStatus !== "idle") return;
      await startLoadEngine();
    },

    unloadEngine: () => {
      if (!engine) return;
      unloadCartographer(null);
    },

    suggest: async () => {
      const requestId = ++suggestRequestId;
      const grid = useGridStore.getState();
      // Rotate randomly between the sample scenes, never repeating the last.
      const mood = pickRandomMood(get().last?.mood ?? null);
      const seed = Math.floor(Math.random() * 2 ** 31);

      let plan: IslandPlan | null = null;
      let source: SuggestSource = "generator";
      let notice: string | null = null;
      // No background pre-design: the LLM runs only for this click,
      // so a loaded-but-idle Cartographer costs no GPU while editing.
      const currentEngine = engine;
      const engineReady =
        currentEngine !== null && get().engineStatus === "ready";
      if (engineReady) {
        set({ thinking: true });
        try {
          const designer = await import("@/lib/webllm/designer");
          plan = await designer.requestIslandPlan(currentEngine, grid.n, mood);
          if (plan) source = "llm";
        } catch (err) {
          plan = null; // LLM hiccup: the generator below still suggests
          if (isTimeoutError(err)) notice = SUGGEST_TIMEOUT_NOTICE;
        } finally {
          if (requestId === suggestRequestId) set({ thinking: false });
        }
      }
      if (requestId !== suggestRequestId) return; // a newer click superseded us

      // Track the live-call streak for this click. Applying an LLM
      // plan resets it; falling back to the generator with the
      // Cartographer ready counts as a live failure. At the limit,
      // unload the Cartographer so later clicks go straight to
      // the default generator. Skipped when the engine is gone
      // (e.g. manually unloaded mid-click): that is not a failure.
      if (engineReady && engine !== null) {
        if (source === "llm") {
          consecutiveLiveFailures = 0;
        } else {
          consecutiveLiveFailures += 1;
          if (consecutiveLiveFailures >= MAX_CONSECUTIVE_LIVE_FAILURES) {
            notice = SUGGEST_CARTOGRAPHER_UNLOADED_NOTICE;
            unloadCartographer(SUGGEST_CARTOGRAPHER_UNLOADED_NOTICE);
          }
        }
      }

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
    },
  };
});
