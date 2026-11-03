import { create } from "zustand";
import { terrainAt, useGridStore } from "@/stores/grid-store";
import {
  FALLBACK_RATIONALE,
  fallbackName,
  generateIsland,
  type IslandMoodId,
  type IslandPlan,
} from "@/lib/island-suggest";
import type { DesignerProgress } from "@/lib/webllm/designer";

export type EngineStatus = "idle" | "unsupported" | "loading" | "ready" | "error";
export type SuggestSource = "llm" | "generator";

type Engine = Awaited<
  ReturnType<typeof import("@/lib/webllm/designer").loadDesigner>
>;

let engine: Engine | null = null;
let suggestRequestId = 0;

export interface LastSuggestion {
  name: string;
  rationale: string;
  source: SuggestSource;
  mood: IslandMoodId;
}

interface SuggestState {
  mood: IslandMoodId;
  last: LastSuggestion | null;
  engineStatus: EngineStatus;
  engineNote: string | null;
  progress: DesignerProgress | null;
  thinking: boolean;

  setMood: (mood: IslandMoodId) => void;
  loadEngine: () => Promise<void>;
  suggest: () => Promise<void>;
}

export const useSuggestStore = create<SuggestState>()((set, get) => ({
  mood: "serene",
  last: null,
  engineStatus: "idle",
  engineNote: null,
  progress: null,
  thinking: false,

  setMood: (mood) => set({ mood }),

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
    const mood = get().mood;
    const seed = Math.floor(Math.random() * 2 ** 31);

    let plan: IslandPlan | null = null;
    let source: SuggestSource = "generator";
    if (engine && get().engineStatus === "ready") {
      set({ thinking: true });
      try {
        const designer = await import("@/lib/webllm/designer");
        const terrainFn = (x: number, y: number) => terrainAt(grid.cells, x, y);
        plan = await designer.requestIslandPlan(engine, terrainFn, grid.n, mood);
        if (plan) source = "llm";
      } catch {
        plan = null; // LLM hiccup: the generator below still suggests
      } finally {
        if (requestId === suggestRequestId) set({ thinking: false });
      }
    }
    if (requestId !== suggestRequestId) return; // a newer click superseded us

    // Like the Demo button: the suggestion replaces the current layout.
    const n = useGridStore.getState().n;
    useGridStore.getState().setCells(generateIsland(n, mood, plan, seed));
    set({
      last: {
        name: plan?.name ?? fallbackName(mood, seed),
        rationale: plan?.rationale ?? FALLBACK_RATIONALE[mood],
        source,
        mood,
      },
    });
  },
}));
