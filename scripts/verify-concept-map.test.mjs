// Focused check for the hand-authored concept demo map consumed by
// grid-store.ts (buildDemoCells samples src/data/concept-map.json).
// Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const map = JSON.parse(
  readFileSync(join(root, "src", "data", "concept-map.json"), "utf8"),
);

const TERRAINS = new Set(["grass", "water", "sand", "stone", "forest"]);
const N = 12;

describe("concept-map", () => {
  it("is a 12x12 grid over the legend", () => {
    assert.equal(map.rows.length, N);
    for (const row of map.rows) {
      assert.equal(row.length, N);
      for (const ch of row) {
        assert.ok(ch in map.legend, `unknown cell ${ch}`);
      }
    }
    for (const terrain of Object.values(map.legend)) {
      assert.ok(TERRAINS.has(terrain), `unknown terrain ${terrain}`);
    }
  });

  it("keeps a full sand rim", () => {
    for (let i = 0; i < N; i++) {
      for (const ch of [
        map.rows[0][i],
        map.rows[N - 1][i],
        map.rows[i][0],
        map.rows[i][N - 1],
      ]) {
        assert.equal(map.legend[ch], "sand");
      }
    }
  });

  it("has a stone plaza core ringed by water", () => {
    for (const [x, y] of [
      [5, 5],
      [6, 5],
      [5, 6],
      [6, 6],
    ]) {
      assert.equal(map.legend[map.rows[y][x]], "stone");
    }
    let water = 0;
    for (let y = 4; y <= 7; y++) {
      for (let x = 4; x <= 7; x++) {
        if (x >= 5 && x <= 6 && y >= 5 && y <= 6) continue;
        if (map.legend[map.rows[y][x]] === "water") water++;
      }
    }
    assert.ok(water >= 10, `expected a full moat, got ${water}/12 water`);
  });

  it("has northern peaks and forests", () => {
    let stoneNorth = 0;
    let forest = 0;
    map.rows.forEach((row, y) => {
      for (const ch of row) {
        const terrain = map.legend[ch];
        if (terrain === "forest") forest++;
        if (terrain === "stone" && y <= 3) stoneNorth++;
      }
    });
    assert.ok(stoneNorth >= 6, `expected 6+ northern stone, got ${stoneNorth}`);
    assert.ok(forest >= 8, `expected 8+ forest, got ${forest}`);
  });
});
