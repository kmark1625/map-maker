// Structural check for the character-select variants: the offered set is
// fire / ice / lightning (shadow was replaced by lightning), every variant's
// select-screen image exists on disk, and every variant id has an
// element-trail color on the 3D map. Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const variantsSource = readFileSync(
  join(root, "src", "data", "character-variants.ts"),
  "utf8",
);
const threeSource = readFileSync(
  join(root, "src", "components", "ThreeCanvas.tsx"),
  "utf8",
);

const ids = [...variantsSource.matchAll(/\bid: "(\w+)"/g)].map((m) => m[1]);

describe("character variants", () => {
  it("offers fire, ice, and lightning — and no shadow", () => {
    assert.deepEqual(ids, ["fire", "ice", "lightning"]);
    assert.doesNotMatch(variantsSource, /shadow/i);
  });

  it("imports select-screen images that all exist on disk", () => {
    const imports = [
      ...variantsSource.matchAll(
        /from "(@\/app\/assets\/images\/character_select_screen\/[\w.]+)";/g,
      ),
    ].map((m) => m[1]);
    assert.equal(imports.length, ids.length);
    for (const importPath of imports) {
      const path = join(root, "src", importPath.replace("@/", ""));
      assert.ok(existsSync(path), `missing file ${path}`);
    }
    assert.ok(imports.some((p) => p.endsWith("elf_lightning_variant.png")));
  });

  it("has an element-trail color for every variant id", () => {
    const block = threeSource.match(
      /const ELEMENT_TRAIL: Record<string, string> = \{([\s\S]*?)\};/,
    );
    assert.ok(block, "ELEMENT_TRAIL not found in ThreeCanvas.tsx");
    const keys = [...block[1].matchAll(/(\w+):/g)].map((m) => m[1]);
    assert.deepEqual([...keys].sort(), [...ids].sort());
  });
});
