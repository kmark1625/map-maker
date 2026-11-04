import {
  DESIGNER_SCHEMA,
  DESIGNER_SYSTEM,
  buildDesignerPrompt,
  parseIslandPlan,
  type IslandMoodId,
  type IslandPlan,
} from "@/lib/island-suggest";
import { withTimeout } from "@/lib/timeout";

// Qwen2.5 0.5B at ~300 MB (vs ~1 GB for 1.5B): the model weights come
// from HuggingFace on first load and cache per-origin, so a cold cache
// (e.g. first GitHub Pages visit) pays the full download. The smaller
// model downloads ~3x less and decodes faster; grammar-constrained
// JSON + plan sanitizing cover its weaker instruction following.
// Higher-quality alternative: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC".
//
// Two builds of the same weights: q4f16 computes in half precision and
// decodes roughly 1.5-2x faster, but needs the shader-f16 WebGPU
// feature; q4f32 runs on any WebGPU adapter. We probe the adapter and
// prefer f16, falling back to f32 if the f16 engine fails to load.
export const DESIGNER_MODEL = "Qwen2.5-0.5B-Instruct-q4f32_1-MLC";
export const DESIGNER_MODEL_FAST = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
export const DESIGNER_MODEL_LABEL = "Qwen2.5 0.5B (in-browser, ~300 MB first download)";

export interface DesignerProgress {
  progress: number; // 0..1
  text: string;
}

interface GpuAdapterLike {
  features?: { has: (feature: string) => boolean };
}

let adapterPromise: Promise<GpuAdapterLike | null> | null = null;

function requestGpuAdapter(): Promise<GpuAdapterLike | null> {
  adapterPromise ??= (async () => {
    try {
      const gpu = (
        navigator as Navigator & {
          gpu?: { requestAdapter: () => Promise<GpuAdapterLike | null> };
        }
      ).gpu;
      if (!gpu) return null;
      return await gpu.requestAdapter();
    } catch {
      return null;
    }
  })();
  return adapterPromise;
}

/** WebGPU is required by WebLLM. Checked on the main thread before we
 *  ever spawn the worker, so unsupported browsers get the generator. */
export async function webGpuAvailable(): Promise<boolean> {
  return (await requestGpuAdapter()) !== null;
}

async function pickDesignerModel(): Promise<string> {
  const adapter = await requestGpuAdapter();
  return adapter?.features?.has("shader-f16")
    ? DESIGNER_MODEL_FAST
    : DESIGNER_MODEL;
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
    const createEngine = (model: string) => {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      return webllm.CreateWebWorkerMLCEngine(worker, model, {
        initProgressCallback: (report) =>
          onProgress({ progress: report.progress, text: report.text }),
      });
    };
    const picked = await pickDesignerModel();
    let engine: Engine;
    try {
      engine = await createEngine(picked);
    } catch (err) {
      if (picked === DESIGNER_MODEL) throw err;
      // The f16 build failed despite the feature probe; retry on f32.
      engine = await createEngine(DESIGNER_MODEL);
    }
    onProgress({ progress: 1, text: "Warming up the designer…" });
    await warmUpDesigner(engine);
    return engine;
  })().catch((err) => {
    enginePromise = null; // allow a retry after a failed load
    throw err;
  });
  return enginePromise;
}

/**
 * The first generation pays WebGPU shader compilation plus JSON
 * grammar compilation, which can eat most of the Suggest budget and
 * make the first click time out even on a fast GPU. Pay that cost at
 * load time with a throwaway request shaped like a real one.
 */
async function warmUpDesigner(engine: Engine): Promise<void> {
  const warmup = engine.chat.completions.create({
    messages: [
      { role: "system", content: DESIGNER_SYSTEM },
      { role: "user", content: buildDesignerPrompt(12, "serene") },
    ],
    response_format: { type: "json_object", schema: DESIGNER_SCHEMA },
    temperature: 0,
    max_tokens: 16,
  });
  await withTimeout(warmup, 20_000, () => {
    void engine.interruptGenerate();
  }).catch(() => {});
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
  n: number,
  mood: IslandMoodId,
): Promise<IslandPlan | null> {
  const started = performance.now();
  const completion = engine.chat.completions.create({
    messages: [
      { role: "system", content: DESIGNER_SYSTEM },
      { role: "user", content: buildDesignerPrompt(n, mood) },
    ],
    // Grammar-constrained JSON: the model can only emit our schema.
    response_format: { type: "json_object", schema: DESIGNER_SCHEMA },
    temperature: mood === "wild" ? 0.9 : mood === "rugged" ? 0.6 : 0.4,
    // The compact plan format needs ~80 tokens typical, ~110 worst
    // case; 128 bounds a runaway generation well inside the timeout.
    max_tokens: 128,
  });
  const reply = await withTimeout(completion, SUGGEST_TIMEOUT_MS, () => {
    void engine.interruptGenerate();
  });
  const usage = reply.usage
    ? `, ${reply.usage.completion_tokens} tokens`
    : "";
  console.debug(
    `[cartographer] plan in ${Math.round(performance.now() - started)}ms${usage}`,
  );
  const text = reply.choices[0]?.message?.content ?? "";
  return parseIslandPlan(text);
}
