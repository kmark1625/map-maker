// Structural check for elemental tile themes: every theme folder covers
// every terrain with the same filenames as base, the registry imports
// files that exist, elemental abilities are registered for the fire
// and ice elves, and the 3D canvas wires the ability button + theme swap.
// Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const themesSource = readFileSync(join(root, "src", "lib", "tile-themes.ts"), "utf8");
const threeSource = readFileSync(
  join(root, "src", "components", "ThreeCanvas.tsx"),
  "utf8",
);
const gridSource = readFileSync(join(root, "src", "stores", "grid-store.ts"), "utf8");
const tileDir = join(root, "src", "app", "assets", "images", "tile");

const terrainUnion = gridSource.match(/export type TerrainId = ([^;]+);/);
assert.ok(terrainUnion, "TerrainId union not found in grid-store.ts");
const terrains = [...terrainUnion[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);

describe("tile themes", () => {
  it("fire and ice folders mirror the base filenames, one per terrain", () => {
    const base = readdirSync(join(tileDir, "base")).sort();
    const fire = readdirSync(join(tileDir, "fire")).sort();
    const ice = readdirSync(join(tileDir, "ice")).sort();
    assert.deepEqual(fire, base);
    assert.deepEqual(ice, base);
    assert.deepEqual(
      base,
      terrains.map((t) => `${t}_flat.webp`).sort(),
    );
  });

  it("registry imports base + fire + ice textures that all exist on disk", () => {
    const imports = [
      ...themesSource.matchAll(/from "(@\/app\/assets\/images\/tile\/[\w/.]+)";/g),
    ].map((m) => m[1]);
    assert.equal(imports.length, terrains.length * 3);
    for (const importPath of imports) {
      const path = join(root, "src", importPath.replace("@/", ""));
      assert.ok(existsSync(path), `missing file ${path}`);
    }
  });

  it("registers flame for fire and freeze for ice, each mapped to its theme", () => {
    const block = themesSource.match(/const TILE_ABILITIES[^=]*= \{([\s\S]*?)\n\};/);
    assert.ok(block, "TILE_ABILITIES not found in tile-themes.ts");
    const keys = [...block[1].matchAll(/(\w+): \{/g)].map((m) => m[1]);
    assert.deepEqual(keys, ["fire", "ice"]);
    assert.match(block[1], /theme: "fire"/);
    assert.match(block[1], /label: "Flame"/);
    assert.match(block[1], /theme: "ice"/);
    assert.match(block[1], /label: "Freeze"/);
    assert.doesNotMatch(block[1], /\blightning:/);
  });

  it("grid store tracks tileTheme, defaulting to base", () => {
    assert.match(gridSource, /export type TileThemeId = "base" \| "fire" \| "ice";/);
    assert.match(gridSource, /tileTheme: "base",/);
    assert.match(gridSource, /setTileTheme:/);
  });

  it("3D canvas swaps tile textures by theme behind the ability button", () => {
    assert.match(threeSource, /tileAbilityFor\(selectedId\)/);
    assert.match(threeSource, /TILE_TEXTURE_URLS\[theme\]\[t\.id\]/);
    assert.match(threeSource, /setTileTheme\(active \? "base" : ability\.theme\)/);
    assert.match(threeSource, /aria-pressed=\{active\}/);
    assert.match(threeSource, /ability\.activeClass/);
    assert.match(threeSource, /ability\.icon === "snowflake"/);
  });
});
