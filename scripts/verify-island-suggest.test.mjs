// Focused check: "Suggest an island" paints valid, mood-flavored
// islands from mood presets and from sanitized LLM plans, and keeps all
// WebLLM work inside a Web Worker. Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
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

  it("prompt carries the current map and the mood brief", () => {
    const at = (x, y) => (x === 0 && y === 0 ? "water" : "grass");
    const prompt = isle.buildDesignerPrompt(at, 4, "rugged");
    assert.ok(prompt.includes("~..."));
    assert.ok(prompt.includes(isle.ISLAND_MOOD_MAP.rugged.brief));
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

  it("applies suggestions like Demo and leaves no chart-a-course behind", () => {
    assert.ok(read("src", "stores", "grid-store.ts").includes("setCells"));
    assert.ok(read("src", "stores", "suggest-store.ts").includes("setCells(generateIsland("));
    assert.ok(read("src", "components", "MapEditor.tsx").includes("SuggestPanel"));
    assert.ok(read("src", "components", "GridPanel.tsx").includes("Suggest"));
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
