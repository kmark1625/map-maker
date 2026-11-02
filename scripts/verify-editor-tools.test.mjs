// Focused check: the 2.5D map editor has no user zoom and no erase
// tool/functionality. Painting grass covers what erase did, and the
// grid is fit-scaled internally via fitGrid (viewport.zoom is not a
// user control). The 3D map render (ThreeCanvas) has rotation and
// zoom disabled too; its camera stays at the fitted isometric angle.
// Run with: npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

describe("2.5D editor tools", () => {
  it("has no zoom controls in IsoCanvas", () => {
    const iso = read("src", "components", "IsoCanvas.tsx");
    assert.ok(!iso.includes("onWheel"), "IsoCanvas still handles wheel zoom");
    assert.ok(!iso.includes("zoomAt"), "IsoCanvas still calls zoomAt");
    assert.ok(!iso.includes("Zoom in"), "IsoCanvas still has a zoom-in button");
    assert.ok(!iso.includes("Zoom out"), "IsoCanvas still has a zoom-out button");
  });

  it("has no zoom text in the editor chrome", () => {
    const editor = read("src", "components", "MapEditor.tsx");
    assert.ok(!editor.includes("Scroll to zoom"), "MapEditor still hints at scroll zoom");
    const status = read("src", "components", "StatusBar.tsx");
    assert.ok(!status.includes("viewport.zoom"), "StatusBar still shows a zoom %");
  });

  it("exposes no zoomAt or eraseCell in the grid store", () => {
    const store = read("src", "stores", "grid-store.ts");
    assert.ok(!store.includes("zoomAt"), "grid-store still exposes zoomAt");
    assert.ok(!store.includes("eraseCell"), "grid-store still exposes eraseCell");
    assert.ok(!store.includes('"erase"'), "grid-store still has an erase tool");
  });

  it("has no erase references in editor or canvas components", () => {
    for (const file of [
      "IsoCanvas.tsx",
      "Toolbar.tsx",
      "Shortcuts.tsx",
      "CellInspector.tsx",
      "ThreeCanvas.tsx",
    ]) {
      const src = read("src", "components", file);
      assert.ok(!/erase/i.test(src), `${file} still references erase`);
    }
  });

  it("still offers select, pan, and paint", () => {
    const store = read("src", "stores", "grid-store.ts");
    for (const tool of ['"select"', '"pan"', '"paint"']) {
      assert.ok(store.includes(tool), `grid-store lost the ${tool} tool`);
    }
    assert.ok(store.includes("paintCell"), "grid-store lost paintCell");
    assert.ok(store.includes("fitGrid"), "grid-store lost fitGrid");
  });
});

describe("3D map render controls", () => {
  it("disables rotation and zoom on OrbitControls", () => {
    const three = read("src", "components", "ThreeCanvas.tsx");
    assert.ok(
      three.includes("controls.enableRotate = false"),
      "ThreeCanvas does not disable rotation",
    );
    assert.ok(
      three.includes("controls.enableZoom = false"),
      "ThreeCanvas does not disable zoom",
    );
  });

  it("has no zoom buttons or orbit/zoom hints", () => {
    const three = read("src", "components", "ThreeCanvas.tsx");
    assert.ok(!three.includes("Zoom in"), "ThreeCanvas still has a zoom-in button");
    assert.ok(!three.includes("Zoom out"), "ThreeCanvas still has a zoom-out button");
    assert.ok(!three.includes("Drag to orbit"), "ThreeCanvas still hints at orbiting");
    assert.ok(!three.includes("Scroll to zoom"), "ThreeCanvas still hints at scroll zoom");
    assert.ok(!three.includes("dolly"), "ThreeCanvas still exposes a dolly/zoom helper");
  });

  it("still fits the camera to the grid", () => {
    const three = read("src", "components", "ThreeCanvas.tsx");
    assert.ok(three.includes("Fit grid to view"), "ThreeCanvas lost its Fit button");
    assert.ok(three.includes("OrbitControls"), "ThreeCanvas lost OrbitControls");
  });
});
