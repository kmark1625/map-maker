// Structural check for the floating-island voxel volume consumed by
// ThreeCanvas (readonly render step). The volume is generated for the
// current grid size (not a fixed 12x12 sample centered under larger
// grids), so the iceberg footprint fills the grid edges at every size
// from MIN_N to MAX_N. Guards the concept-art silhouette: full sheer
// cap, accelerating taper, narrow keel, and the shipped 12x12 shape.
// Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

// floating-island.ts has no runtime imports, so transpile it standalone
// and exercise the real generator in Node.
const { outputText } = ts.transpileModule(
  read("src", "data", "floating-island.ts"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
);
const tmpFile = join(
  mkdtempSync(join(tmpdir(), "floating-island-")),
  "floating-island.mjs",
);
writeFileSync(tmpFile, outputText);
const island = await import(pathToFileURL(tmpFile).href);
const { ISLAND_H, generateIslandVolume, isIslandSolid } = island;

// Grid-size limits follow grid-store (MIN_N / MAX_N / DEFAULT_N).
const gridNum = (name) => {
  const m = read("src", "stores", "grid-store.ts").match(
    new RegExp(`export const ${name} = (\\d+);`),
  );
  assert.ok(m, `missing ${name} in grid-store`);
  return Number(m[1]);
};
const MIN_N = gridNum("MIN_N");
const MAX_N = gridNum("MAX_N");
const DEFAULT_N = gridNum("DEFAULT_N");
const ALL_SIZES = Array.from(
  { length: MAX_N - MIN_N + 1 },
  (_, i) => MIN_N + i,
);

const solidCount = (volume, z) =>
  volume[z].flat().reduce((sum, voxel) => sum + voxel, 0);

describe("floating-island", () => {
  it("generates an n x n x ISLAND_H volume of 0/1 for every grid size", () => {
    assert.equal(ISLAND_H, 10);
    for (const n of ALL_SIZES) {
      const volume = generateIslandVolume(n);
      assert.equal(volume.length, ISLAND_H, `n=${n} layer count`);
      for (const layer of volume) {
        assert.equal(layer.length, n, `n=${n} row count`);
        for (const row of layer) {
          assert.equal(row.length, n, `n=${n} row length`);
          for (const voxel of row) {
            assert.ok(voxel === 0 || voxel === 1, `n=${n} bad voxel ${voxel}`);
          }
        }
      }
    }
  });

  it("fills the full grid footprint (edges included) in the solid cap", () => {
    for (const n of ALL_SIZES) {
      const volume = generateIslandVolume(n);
      for (let z = 0; z < 3; z++) {
        assert.equal(
          solidCount(volume, z),
          n * n,
          `n=${n} cap layer z=${z} leaves grid edges empty`,
        );
      }
      // Corners and edge midpoints directly under the terrain are rock.
      const mid = Math.floor(n / 2);
      for (const [x, y] of [
        [0, 0],
        [n - 1, 0],
        [0, n - 1],
        [n - 1, n - 1],
        [mid, 0],
        [mid, n - 1],
        [0, mid],
        [n - 1, mid],
      ]) {
        assert.ok(isIslandSolid(n, x, y, 0), `n=${n} edge (${x},${y}) is empty`);
      }
    }
  });

  it("tapers monotonically below sheer upper cliffs at every size", () => {
    for (const n of ALL_SIZES) {
      const volume = generateIslandVolume(n);
      assert.ok(
        solidCount(volume, 3) >= 0.9 * n * n,
        `n=${n} expected sheer cliffs at z=3, got ${solidCount(volume, 3)}/${n * n}`,
      );
      for (let z = 4; z < ISLAND_H; z++) {
        assert.ok(
          solidCount(volume, z) <= solidCount(volume, z - 1),
          `n=${n} layer z=${z} (${solidCount(volume, z)}) bulges past z=${z - 1} (${solidCount(volume, z - 1)})`,
        );
      }
    }
  });

  it("ends in a small centered keel with a solid core on every layer", () => {
    for (const n of ALL_SIZES) {
      const volume = generateIslandVolume(n);
      for (let z = 3; z < ISLAND_H; z++) {
        assert.ok(solidCount(volume, z) > 0, `n=${n} layer z=${z} is hollow`);
      }
      const tip = solidCount(volume, ISLAND_H - 1);
      assert.ok(
        tip >= 1 && tip <= 8,
        `n=${n} expected a narrow keel, got ${tip}`,
      );
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (volume[ISLAND_H - 1][y][x] === 1) {
            assert.ok(
              Math.hypot(x - (n - 1) / 2, y - (n - 1) / 2) <= 2,
              `n=${n} keel voxel drifts to (${x},${y})`,
            );
          }
        }
      }
    }
  });

  it("stays centered layer by layer at every size", () => {
    for (const n of ALL_SIZES) {
      const volume = generateIslandVolume(n);
      for (let z = 3; z < ISLAND_H; z++) {
        let sx = 0;
        let sy = 0;
        let k = 0;
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            if (volume[z][y][x] === 1) {
              sx += x;
              sy += y;
              k++;
            }
          }
        }
        assert.ok(
          Math.hypot(sx / k - (n - 1) / 2, sy / k - (n - 1) / 2) <= 1.5,
          `n=${n} layer z=${z} leans off-center`,
        );
      }
    }
  });

  it("keeps the shipped silhouette at the default 12x12 grid", () => {
    const volume = generateIslandVolume(DEFAULT_N);
    assert.equal(DEFAULT_N, 12);
    assert.deepEqual(
      volume.map((_, z) => solidCount(volume, z)),
      [144, 144, 144, 141, 140, 122, 84, 42, 22, 4],
    );
  });

  it("treats out-of-bounds voxels as empty", () => {
    assert.equal(isIslandSolid(MAX_N, -1, 0, 0), false);
    assert.equal(isIslandSolid(MAX_N, 0, -1, 0), false);
    assert.equal(isIslandSolid(MAX_N, 0, 0, -1), false);
    assert.equal(isIslandSolid(MAX_N, MAX_N, 0, 0), false);
    assert.equal(isIslandSolid(MAX_N, 0, MAX_N, 0), false);
    assert.equal(isIslandSolid(MAX_N, 0, 0, ISLAND_H), false);
  });

  it("sizes the rendered island from the grid in ThreeCanvas (no fixed 12x12 centering)", () => {
    const canvas = read("src", "components", "ThreeCanvas.tsx");
    assert.ok(
      canvas.includes("generateIslandVolume"),
      "ThreeCanvas does not generate the island for the grid size",
    );
    assert.ok(
      !canvas.includes("ISLAND_W") && !canvas.includes("ISLAND_D"),
      "ThreeCanvas still centers a fixed-size island under the grid",
    );
  });
});
