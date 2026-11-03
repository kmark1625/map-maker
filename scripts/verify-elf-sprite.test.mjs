// Structural check for the elf sprite atlases in src/lib/elf-sprite.ts:
// each character variant with sheets (fire, ice, lightning) must cover all 8 facing
// directions exactly once, and every sheet's row bands must tile the real
// PNG (dimensions read from its IHDR) with content extents inside the band.
// Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "src", "lib", "elf-sprite.ts"), "utf8");

const assetPath = (importPath) =>
  join(root, "src", importPath.replace("@/", ""));

// PNG width/height live at fixed offsets in the IHDR chunk.
const pngSize = (path) => {
  const buf = readFileSync(path);
  assert.equal(
    buf.subarray(1, 4).toString("ascii"),
    "PNG",
    `${path} is not a PNG`,
  );
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};

// import name -> { variant, part, path }
const imports = {};
for (const m of source.matchAll(
  /import (\w+) from "(@\/app\/assets\/images\/character\/(\w+)_elf\/8_directional_part_(\d)\.png)";/g,
)) {
  imports[m[1]] = { variant: m[3], part: Number(m[4]), path: assetPath(m[2]) };
}

// Sheet const name -> { image import name, rows: [{y0,y1,top,bottom,dir}] }
const sheets = {};
for (const m of source.matchAll(
  /const (\w+): SheetGeom = \{([\s\S]*?)\n\};/g,
)) {
  const image = m[2].match(/image: (\w+),/)?.[1];
  const rows = [
    ...m[2].matchAll(
      /\{ y0: (\d+), y1: (\d+), top: (\d+), bottom: (\d+) \}, \/\/ (\w+)/g,
    ),
  ].map((r) => ({
    y0: Number(r[1]),
    y1: Number(r[2]),
    top: Number(r[3]),
    bottom: Number(r[4]),
    dir: r[5],
  }));
  sheets[m[1]] = { image, rows };
}

const DIRECTION_IDS = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"];

describe("elf-sprite atlases", () => {
  it("imports both sheet parts for fire, ice, and lightning, all present on disk", () => {
    for (const variant of ["fire", "ice", "lightning"]) {
      for (const part of [1, 2]) {
        const hit = Object.values(imports).find(
          (i) => i.variant === variant && i.part === part,
        );
        assert.ok(hit, `no ${variant} part ${part} sheet import`);
        assert.ok(existsSync(hit.path), `missing file ${hit.path}`);
      }
    }
  });

  it("covers all 8 directions exactly once per variant", () => {
    for (const variant of ["fire", "ice", "lightning"]) {
      const dirs = Object.values(sheets)
        .filter((s) => imports[s.image]?.variant === variant)
        .flatMap((s) => s.rows.map((r) => r.dir))
        .sort();
      assert.deepEqual(
        dirs,
        [...DIRECTION_IDS].sort(),
        `${variant} directions: ${dirs}`,
      );
    }
  });

  it("tiles each real PNG with contiguous bands and in-band content", () => {
    for (const [name, sheet] of Object.entries(sheets)) {
      assert.ok(sheet.image, `${name} has no image`);
      const imp = imports[sheet.image];
      assert.ok(imp, `${name} image ${sheet.image} is not an elf sheet`);
      const { width, height } = pngSize(imp.path);
      assert.equal(
        width % 6,
        0,
        `${name} width ${width} not divisible by 6 frames`,
      );
      assert.equal(sheet.rows.length, 4, `${name} should have 4 rows`);
      let cursor = 0;
      for (const row of sheet.rows) {
        assert.equal(row.y0, cursor, `${name} ${row.dir} band gap/overlap`);
        assert.ok(row.y1 > row.y0, `${name} ${row.dir} empty band`);
        assert.ok(
          row.top >= row.y0 && row.bottom <= row.y1 && row.bottom > row.top,
          `${name} ${row.dir} content ${row.top}-${row.bottom} escapes band ${row.y0}-${row.y1}`,
        );
        cursor = row.y1;
      }
      assert.equal(
        cursor,
        height,
        `${name} bands end at ${cursor}, PNG is ${height}px tall`,
      );
    }
  });

  it("maps the selected character variant onto a sprite variant", () => {
    assert.match(source, /export function elfSpriteVariant\(/);
    assert.match(source, /selectedId === "lightning"/);
    assert.match(source, /export function elfFrameLayout\([\s\S]*?variant/);
  });
});
