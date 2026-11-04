import {
  DESIGNER_SCHEMA,
  DESIGNER_SYSTEM,
  buildDesignerPrompt,
  parseIslandPlan,
  type IslandMoodId,
  type IslandPlan,
} from "@/lib/island-suggest";
import { withTimeout } from "@/lib/timeout";
import type { TerrainId } from "@/stores/grid-store";

// Qwen2.5 0.5B at ~300 MB (vs ~1 GB for 1.5B): the model weights come
// from HuggingFace on first load and cache per-origin, so a cold cache
// (e.g. first GitHub Pages visit) pays the full download. The smaller
// model downloads ~3x less and decodes faster; grammar-constrained
// JSON + plan sanitizing cover its weaker instruction following.
// The q4f32 build avoids the shader-f16 WebGPU feature, so it runs on
// more GPUs. Higher-quality alternative: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC".
export const DESIGNER_MODEL = "Qwen2.5-0.5B-Instruct-q4f32_1-MLC";
export const DESIGNER_MODEL_LABEL = "Qwen2.5 0.5B (in-browser, ~300 MB first download)";

export interface DesignerProgress {
  progress: number; // 0..1
  text: string;
}

/** WebGPU is required by WebLLM. Checked on the main thread before we
 *  ever spawn the worker, so unsupported browsers get the generator. */
export async function webGpuAvailable(): Promise<boolean> {
  try {
    const gpu = (
      navigator as Navigator & {
        gpu?: { requestAdapter: () => Promise<unknown> };
      }
    ).gpu;
    if (!gpu) return false;
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

// The engine type comes from the dynamically imported package; keeping
// it behind this alias keeps WebLLM out of the initial bundle.
type Engine = Awaited<
  ReturnType<typeof import("@mlc-ai/web-llm").CreateWebWorkerMLCEngine>
>;

let enginePromise: Promise<Engine> | null = null;

/**
 * Load (once) the WebLLM engine inside a dedicated Web Worker. The
 * dynamic import + worker mean neither the library code nor any
 * inference work touches the editor's main thread or initial bundle.
 */
export function loadDesigner(
  onProgress: (p: DesignerProgress) => void,
): Promise<Engine> {
  enginePromise ??= (async () => {
    const webllm = await import("@mlc-ai/web-llm");
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    return webllm.CreateWebWorkerMLCEngine(worker, DESIGNER_MODEL, {
      initProgressCallback: (report) =>
        onProgress({ progress: report.progress, text: report.text }),
    });
  })().catch((err) => {
    enginePromise = null; // allow a retry after a failed load
    throw err;
  });
  return enginePromise;
}

/** How long a Suggest click waits on the LLM before the caller falls
 *  back to the built-in generator. Decode speed varies a lot by GPU,
 *  so a slow plan should never block the editor. */
export const SUGGEST_TIMEOUT_MS = 5_000;

/** Ask the loaded LLM for an island plan. Throws TimeoutError after
 *  SUGGEST_TIMEOUT_MS (interrupting generation so the worker is free
 *  for the next request); returns null when the reply has no usable plan. */
export async function requestIslandPlan(
  engine: Engine,
  terrainAt: (x: number, y: number) => TerrainId,
  n: number,
  mood: IslandMoodId,
): Promise<IslandPlan | null> {
  const completion = engine.chat.completions.create({
    messages: [
      { role: "system", content: DESIGNER_SYSTEM },
      { role: "user", content: buildDesignerPrompt(terrainAt, n, mood) },
    ],
    // Grammar-constrained JSON: the model can only emit our schema.
    response_format: { type: "json_object", schema: DESIGNER_SCHEMA },
    temperature: mood === "wild" ? 0.9 : mood === "rugged" ? 0.6 : 0.4,
    max_tokens: 256,
  });
  const reply = await withTimeout(completion, SUGGEST_TIMEOUT_MS, () => {
    void engine.interruptGenerate();
  });
  const text = reply.choices[0]?.message?.content ?? "";
  return parseIslandPlan(text);
}
