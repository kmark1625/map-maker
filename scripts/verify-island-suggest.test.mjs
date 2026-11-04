// Focused check: "Suggest an island" paints valid, mood-flavored
// islands from mood presets and from sanitized LLM plans, and keeps all
// WebLLM work inside a Web Worker. Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

// island-suggest.ts has no runtime imports, so transpile it standalone
// and exercise the real generator / plan-parsing behavior in Node.
const { outputText } = ts.transpileModule(read("src", "lib", "island-suggest.ts"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const tmpFile = join(mkdtempSync(join(tmpdir(), "island-")), "island-suggest.mjs");
writeFileSync(tmpFile, outputText);
const isle = await import(pathToFileURL(tmpFile).href);

const TERRAINS = new Set(["grass", "water", "sand", "stone", "forest"]);

function toGrid(cells, n) {
  return Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => cells[`${x},${y}`] ?? "grass"),
  );
}

function countTerrain(cells, n, terrain) {
  return toGrid(cells, n).flat().filter((t) => t === terrain).length;
}

function assertValidCells(cells, n) {
  for (const [key, terrain] of Object.entries(cells)) {
    const [x, y] = key.split(",").map(Number);
    assert.ok(x >= 0 && y >= 0 && x < n && y < n, `cell ${key} out of bounds`);
    assert.ok(TERRAINS.has(terrain), `unknown terrain ${terrain}`);
    assert.notEqual(terrain, "grass", "sparse record must omit default grass");
  }
}

describe("generateIsland", () => {
  it("paints a valid sparse island at min and max grid sizes", () => {
    for (const n of [4, 12, 20]) {
      assertValidCells(isle.generateIsland(n, "serene", null, 42), n);
    }
  });

  it("is deterministic per seed and varies across seeds", () => {
    const a = isle.generateIsland(12, "wild", null, 7);
    const b = isle.generateIsland(12, "wild", null, 7);
    const c = isle.generateIsland(12, "wild", null, 8);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
  });

  it("mood changes the island: rugged has the stone, wild has the forest", () => {
    const total = (mood, terrain) =>
      [1, 2, 3, 4, 5].reduce(
        (sum, seed) => sum + countTerrain(isle.generateIsland(12, mood, null, seed), 12, terrain),
        0,
      );
    assert.ok(total("rugged", "stone") > total("serene", "stone"), "rugged should out-stone serene");
    assert.ok(total("rugged", "stone") > total("wild", "stone"), "rugged should out-stone wild");
    assert.ok(total("wild", "forest") > total("serene", "forest"), "wild should out-forest serene");
    assert.ok(total("serene", "water") > total("rugged", "water"), "serene lagoon should out-water rugged");
  });

  it("rings water with sand (stone cliffs excepted) and sands the perimeter", () => {
    const n = 12;
    const grid = toGrid(isle.generateIsland(n, "serene", null, 7), n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (grid[y][x] === "water") {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ax = x + dx;
              const ay = y + dy;
              if (ax < 0 || ay < 0 || ax >= n || ay >= n) continue;
              assert.ok(
                ["water", "sand", "stone"].includes(grid[ay][ax]),
                `(${ax},${ay})=${grid[ay][ax]} touches water without a shore`,
              );
            }
          }
        }
        const onEdge = x === 0 || y === 0 || x === n - 1 || y === n - 1;
        if (onEdge) {
          assert.ok(
            grid[y][x] === "sand" || grid[y][x] === "water",
            `perimeter (${x},${y}) should be sand, got ${grid[y][x]}`,
          );
        }
      }
    }
  });

  it("honors an LLM plan: the lake lands where the plan puts it", () => {
    const plan = {
      name: "Test Isle",
      lakes: [{ cx: 0.15, cy: 0.15, r: 0.16 }],
      forests: [],
      peaks: [],
      sandRim: "narrow",
    };
    const cells = isle.generateIsland(12, "serene", plan, 3);
    assert.equal(cells["1,1"], "water");
    assertValidCells(cells, 12);
  });
});

describe("random scene rotation", () => {
  it("picks among Serene lagoon, Rugged peaks, and Wild forest", () => {
    assert.deepEqual(
      isle.ISLAND_MOODS.map((m) => m.label),
      ["Serene lagoon", "Rugged peaks", "Wild forest"],
    );
    assert.equal(isle.pickRandomMood(null, () => 0), "serene");
    assert.equal(isle.pickRandomMood(null, () => 0.5), "rugged");
    assert.equal(isle.pickRandomMood(null, () => 0.99), "wild");
  });

  it("rotates away from the previous scene", () => {
    for (const prev of ["serene", "rugged", "wild"]) {
      for (const roll of [0, 0.25, 0.5, 0.75, 0.99]) {
        const next = isle.pickRandomMood(prev, () => roll);
        assert.notEqual(next, prev);
        assert.ok(isle.ISLAND_MOOD_MAP[next], `unknown mood ${next}`);
      }
    }
  });
});

describe("LLM plan handling", () => {
  it("parses fenced JSON and clamps out-of-range numbers", () => {
    const plan = isle.parseIslandPlan(
      '```json\n{"name":"Big","rationale":"r","lakes":[{"cx":5,"cy":-1,"r":9}],"forests":[],"peaks":[],"sandRim":"bogus"}\n```',
    );
    assert.deepEqual(plan.lakes, [{ cx: 1, cy: 0, r: 0.35 }]);
    assert.equal(plan.sandRim, "narrow");
    assert.equal(plan.name, "Big");
  });

  it("returns null for garbage and for plans with no features", () => {
    assert.equal(isle.parseIslandPlan("no json"), null);
    assert.equal(
      isle.parseIslandPlan('{"name":"x","lakes":[],"forests":[],"peaks":[]}'),
      null,
    );
  });

  it("parses the compact integer-percent blob arrays", () => {
    const plan = isle.parseIslandPlan(
      '{"name":"Stillwater","lakes":[[50,48,19]],"forests":[[24,26,15]],"peaks":[],"sandRim":"wide"}',
    );
    assert.deepEqual(plan.lakes, [{ cx: 0.5, cy: 0.48, r: 0.19 }]);
    assert.deepEqual(plan.forests, [{ cx: 0.24, cy: 0.26, r: 0.15 }]);
    assert.equal(plan.name, "Stillwater");
    // Out-of-range percents clamp like fractions did.
    const clamped = isle.parseIslandPlan('{"lakes":[[250,-10,90]],"forests":[],"peaks":[]}');
    assert.deepEqual(clamped.lakes, [{ cx: 1, cy: 0, r: 0.35 }]);
  });

  it("prompt is just the size and mood brief (no grid dump to prefill)", () => {
    const prompt = isle.buildDesignerPrompt(20, "rugged");
    assert.ok(prompt.includes("20x20"));
    assert.ok(prompt.includes(isle.ISLAND_MOOD_MAP.rugged.brief));
    assert.ok(!prompt.includes("\n"), "prompt should not dump grid rows");
    assert.ok(prompt.length < 220, `prompt should stay tiny, got ${prompt.length} chars`);
  });

  it("schema asks for compact blobs and no rationale sentence", () => {
    const schema = JSON.parse(isle.DESIGNER_SCHEMA);
    assert.ok(!schema.required.includes("rationale"), "rationale costs decode tokens; drop it");
    assert.equal(schema.properties.lakes.maxItems, 2);
    assert.equal(schema.properties.forests.maxItems, 4);
    assert.equal(schema.properties.peaks.maxItems, 3);
    assert.equal(schema.properties.lakes.items.items.type, "integer");
    assert.equal(schema.properties.lakes.items.maxItems, 3);
    assert.ok(!isle.DESIGNER_SYSTEM.includes('"cx"'), "system prompt should teach the array form");
    assert.ok(isle.DESIGNER_SYSTEM.includes("[50,48,18]"), "system prompt should show a compact example");
  });
});

describe("Suggest timeout fallback", () => {
  it("withTimeout resolves fast work and rejects slow work with TimeoutError", async () => {
    const { outputText: timeoutJs } = ts.transpileModule(read("src", "lib", "timeout.ts"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    const timeoutFile = join(mkdtempSync(join(tmpdir(), "timeout-")), "timeout.mjs");
    writeFileSync(timeoutFile, timeoutJs);
    const timeout = await import(pathToFileURL(timeoutFile).href);

    assert.equal(await timeout.withTimeout(Promise.resolve("plan"), 50), "plan");

    let interrupted = 0;
    const slow = new Promise((resolve) => setTimeout(() => resolve("late"), 200));
    await assert.rejects(
      timeout.withTimeout(slow, 10, () => interrupted++),
      (err) => err instanceof timeout.TimeoutError,
    );
    assert.equal(interrupted, 1, "onTimeout should fire once so generation can be interrupted");
    // Let the slow promise settle; its late result must not surface.
    assert.equal(await slow, "late");
  });

  it("caps live LLM suggests at 10s, interrupts them, and falls back with a notice", () => {
    const designer = read("src", "lib", "webllm", "designer.ts");
    assert.ok(designer.includes("SUGGEST_TIMEOUT_MS = 10_000"), "designer should cap a live suggest at 10s");
    assert.ok(designer.includes("withTimeout("), "designer should race the completion against the timeout");
    assert.ok(designer.includes("interruptGenerate"), "timed-out generation must be interrupted, not left running");
    assert.ok(!designer.includes("60_000"), "the old 60s ceiling should be gone");
    assert.ok(
      designer.includes("Qwen2.5-0.5B-Instruct-q4f32_1-MLC"),
      "designer should use the smaller/faster model for cold-cache loads",
    );
    assert.ok(
      designer.includes("Qwen2.5-0.5B-Instruct-q4f16_1-MLC"),
      "designer should prefer the faster-decoding f16 build when available",
    );
    assert.ok(
      designer.includes("shader-f16"),
      "f16 build should be gated on the shader-f16 WebGPU feature",
    );
    assert.ok(
      designer.includes("warmUpDesigner"),
      "engine should warm up at load so the first Suggest skips shader/grammar compile",
    );
    assert.ok(
      designer.includes("max_tokens: 128"),
      "compact plan format should cap generation at 128 tokens",
    );
    assert.ok(
      designer.includes("withTimeout(completion, SUGGEST_TIMEOUT_MS,"),
      "requestIslandPlan should apply the 10s live-click timeout directly",
    );
    assert.ok(
      !designer.includes("PREFETCH_TIMEOUT_MS"),
      "the 30s background-prefetch timeout should be gone with the prefetch",
    );
    const store = read("src", "stores", "suggest-store.ts");
    assert.ok(store.includes("TimeoutError"), "store should distinguish a timeout from other LLM failures");
    assert.ok(
      store.includes("LLM is taking longer than expected"),
      "store should record the timeout fallback notice",
    );
    const gridPanel = read("src", "components", "GridPanel.tsx");
    assert.ok(gridPanel.includes("last.notice"), "GridPanel should render the fallback notice");
  });
});

describe("Suggest runs live only (no background prefetch)", () => {
  it("starts no LLM generation outside a Suggest click", () => {
    const store = read("src", "stores", "suggest-store.ts");
    for (const gone of ["prefetch", "Prefetch", "schedulePrefetch", "resetPrefetch"]) {
      assert.ok(!store.includes(gone), `store should have no ${gone} left`);
    }
    assert.ok(
      !store.includes("useGridStore.subscribe("),
      "resizing the grid must not trigger any LLM work",
    );
    // The single plan request lives in suggest(): loadEngine must
    // stay generation-free so a loaded-but-idle Cartographer is idle.
    const requests = store.split("requestIslandPlan(").length - 1;
    assert.equal(requests, 1, `expected one live plan request in suggest(), got ${requests}`);
    const loadEngineBody = store.split("const startLoadEngine")[1].split("loadEngine: async")[0];
    assert.ok(
      !loadEngineBody.includes("requestIslandPlan"),
      "loading the Cartographer should not pre-design a layout",
    );
    assert.ok(
      store.includes("designer.requestIslandPlan(currentEngine, grid.n, mood)"),
      "Suggest should request its plan live, for the current grid size and mood",
    );
    const designer = read("src", "lib", "webllm", "designer.ts");
    assert.ok(
      !/prefetch/i.test(designer),
      "designer should have no prefetch timeout/config left",
    );
  });
});

describe("Cartographer unload after repeated live failures", () => {
  it("unloads after 3 consecutive live failures, notifies, and falls back to default", () => {
    const store = read("src", "stores", "suggest-store.ts");
    assert.ok(
      store.includes("MAX_CONSECUTIVE_LIVE_FAILURES = 3"),
      "store should cap the consecutive live-failure streak at 3",
    );
    assert.ok(
      store.includes("consecutiveLiveFailures += 1"),
      "a Suggest click that falls back with the Cartographer ready should count as a live failure",
    );
    assert.ok(
      store.includes("consecutiveLiveFailures >= MAX_CONSECUTIVE_LIVE_FAILURES"),
      "reaching the streak limit should trigger the unload",
    );
    assert.ok(
      store.includes('if (source === "llm")') &&
        store.includes("consecutiveLiveFailures = 0"),
      "applying an LLM plan (and loading the engine) should reset the streak",
    );
    assert.ok(
      store.includes("Cartographer failed 3 times in a row") &&
        store.includes("unloading it") &&
        store.includes("falling back to the default"),
      "the user notice should report the failure, the unload, and the fallback to default behavior",
    );
    assert.ok(
      store.includes("notice = SUGGEST_CARTOGRAPHER_UNLOADED_NOTICE"),
      "the unload notice should ride on the suggestion so GridPanel renders it",
    );
    assert.ok(
      store.includes("engine = null") && store.includes('engineStatus: "idle"'),
      "unload should clear the engine and return to the not-loaded default state",
    );
    assert.ok(
      store.includes("unloadDesigner(currentEngine)"),
      "unload should tear down the designer engine/worker",
    );
    // Only the live click counts: the streak increments once, in
    // suggest(), guarded by the engine having been ready.
    const increments = store.split("consecutiveLiveFailures += 1").length - 1;
    assert.equal(increments, 1, `streak should increment in exactly one place, got ${increments}`);
    assert.ok(
      store.includes("if (engineReady && engine !== null) {"),
      "generator-only clicks (Cartographer not loaded or manually unloaded mid-click) must not touch the streak",
    );
  });

  it("designer unload releases the model and lets a later load start fresh", () => {
    const designer = read("src", "lib", "webllm", "designer.ts");
    assert.ok(designer.includes("unloadDesigner"), "designer should expose an unload helper");
    assert.ok(designer.includes("engine.unload()"), "unload should release the loaded model");
    assert.ok(
      designer.includes("worker?.terminate()"),
      "unload should terminate the designer worker",
    );
    const unloadBody = designer.split("export async function unloadDesigner")[1];
    assert.ok(
      unloadBody.includes("enginePromise = null"),
      "unload must clear the cached engine so reloading builds a fresh one",
    );
  });
});

describe("Cartographer auto-load and manual unload", () => {
  it("attempts to load by default when the editor page opens", () => {
    const editor = read("src", "components", "MapEditor.tsx");
    assert.ok(editor.includes("useEffect"), "editor should auto-load from a mount effect");
    assert.ok(
      editor.includes("autoLoadEngine"),
      "editor should trigger the default Cartographer load attempt on visit",
    );
    const store = read("src", "stores", "suggest-store.ts");
    assert.ok(
      store.includes("autoLoadEngine: async"),
      "store should expose a dedicated auto-load action",
    );
    assert.ok(
      store.includes('get().engineStatus !== "idle"'),
      "auto-load should only attempt from the never-loaded state (no retrying error/unsupported/ready)",
    );
    assert.ok(
      store.includes("unloadedThisSession"),
      "auto-load must not undo an unload when the editor is revisited in the same session",
    );
    assert.ok(
      store.includes("unloadedThisSession = false"),
      "an explicit Load should re-enable loading after an unload",
    );
  });

  it("clicking the loaded Cartographer badge unloads it", () => {
    const iso = read("src", "components", "IsoCanvas.tsx");
    assert.ok(
      iso.includes("unloadEngine"),
      "IsoCanvas should wire the loaded badge to the unload action",
    );
    const readyBadge = iso.split('engineStatus === "ready"')[1].split("Cartographer loaded")[0];
    assert.ok(
      readyBadge.includes("<button") && readyBadge.includes("onClick={unloadEngine}"),
      "the loaded badge should be a click-to-unload button",
    );
    assert.ok(
      readyBadge.includes("Click to unload"),
      "the loaded badge tooltip should say clicking unloads it",
    );
    const store = read("src", "stores", "suggest-store.ts");
    assert.ok(store.includes("unloadEngine: () =>"), "store should expose a manual unload action");
    assert.ok(
      store.includes("unloadCartographer(null)"),
      "a manual unload should not carry the 3-failure notice",
    );
    assert.ok(
      store.includes("unloadCartographer(SUGGEST_CARTOGRAPHER_UNLOADED_NOTICE)"),
      "the 3-failure unload should still carry its notice",
    );
  });
});

describe("WebLLM wiring and repurpose", () => {
  it("runs the designer engine in a Web Worker, lazily", () => {
    const worker = read("src", "lib", "webllm", "worker.ts");
    assert.ok(worker.includes("WebWorkerMLCEngineHandler"));
    const designer = read("src", "lib", "webllm", "designer.ts");
    assert.ok(designer.includes("CreateWebWorkerMLCEngine"));
    assert.ok(designer.includes("new Worker("));
    assert.ok(designer.includes('await import("@mlc-ai/web-llm")'));
    assert.ok(!designer.includes("CreateMLCEngine("), "main thread must not create its own engine");
    const store = read("src", "stores", "suggest-store.ts");
    assert.ok(store.includes('await import("@/lib/webllm/designer")'));
    assert.ok(store.includes("webGpuAvailable"));
  });

  it("constrains the model to the island plan schema", () => {
    assert.ok(
      read("src", "lib", "webllm", "designer.ts").includes(
        'response_format: { type: "json_object", schema: DESIGNER_SCHEMA }',
      ),
    );
  });

  it("applies suggestions and leaves no Demo or chart-a-course behind", () => {
    const gridStore = read("src", "stores", "grid-store.ts");
    assert.ok(gridStore.includes("setCells"));
    assert.ok(!gridStore.includes("demoGrid"), "grid-store still exposes demoGrid");
    assert.ok(
      gridStore.includes("buildConceptCells(DEFAULT_N)"),
      "grid-store lost its initial concept map",
    );
    assert.ok(read("src", "stores", "suggest-store.ts").includes("setCells(generateIsland("));
    const editor = read("src", "components", "MapEditor.tsx");
    assert.ok(!editor.includes("SuggestPanel"), "MapEditor still renders the Suggest panel");
    assert.ok(!editor.includes("Suggest an island"), "MapEditor still has the Suggest panel heading");
    assert.ok(
      !existsSync(join(root, "src", "components", "SuggestPanel.tsx")),
      "SuggestPanel.tsx should be removed",
    );
    const gridPanel = read("src", "components", "GridPanel.tsx");
    assert.ok(!gridPanel.includes("Demo"), "GridPanel still has the Demo button");
    assert.ok(!gridPanel.includes("demoGrid"), "GridPanel still calls demoGrid");
    assert.ok(gridPanel.includes("Suggest"));
    for (const label of ["Serene lagoon", "Rugged peaks", "Wild forest"]) {
      assert.ok(gridPanel.includes(label), `GridPanel Suggest help lost ${label}`);
    }
    assert.ok(
      gridPanel.includes("Load Cartographer for customized map suggestions"),
      "GridPanel Suggest help should prompt to load Cartographer",
    );
    assert.ok(
      gridPanel.includes("engineStatus"),
      "GridPanel Cartographer hint should be gated on engine status",
    );
    assert.ok(
      read("src", "stores", "suggest-store.ts").includes("pickRandomMood("),
      "suggest() should rotate scenes via pickRandomMood",
    );
    for (const [file, ...parts] of [
      ["grid-store", "src", "stores", "grid-store.ts"],
      ["IsoCanvas", "src", "components", "IsoCanvas.tsx"],
      ["Toolbar", "src", "components", "Toolbar.tsx"],
      ["Shortcuts", "src", "components", "Shortcuts.tsx"],
    ]) {
      assert.ok(!read(...parts).includes("course"), `${file} still references course`);
    }
    assert.ok(read("package.json").includes('"@mlc-ai/web-llm"'));
  });
});
