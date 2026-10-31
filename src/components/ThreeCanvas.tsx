"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  TERRAINS,
  TOOLS,
  terrainAt,
  useGridStore,
  type TerrainId,
} from "@/stores/grid-store";
import { TILE_H, type CellCoord } from "@/lib/iso";
import type { ToolId } from "@/stores/grid-store";

const CUBE = TILE_H; // full h x h x h cubes
const BG = "#292524"; // stone-800, matches the 2D canvas
const GROUND = "#1c1917"; // stone-900
const CLICK_SLOP_PX = 6;

const TOOL_CURSORS: Record<ToolId, string> = {
  select: "cursor-default",
  pan: "cursor-grab",
  paint: "cursor-crosshair",
  erase: "cursor-crosshair",
};

function cellCenter(cell: CellCoord, n: number): THREE.Vector3 {
  return new THREE.Vector3(
    (cell.x - (n - 1) / 2) * CUBE,
    CUBE / 2,
    (cell.y - (n - 1) / 2) * CUBE,
  );
}

interface ViewApi {
  rebuild: (n: number) => void;
  recolor: (cells: Record<string, TerrainId>) => void;
  refreshOverlays: () => void;
  fit: () => void;
  dolly: (factor: number) => void;
}

export default function ThreeCanvas({
  readonly = false,
}: {
  readonly?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ViewApi | null>(null);
  const [zoomPct, setZoomPct] = useState(100);

  const tool = useGridStore((s) => s.tool);
  const n = useGridStore((s) => s.n);
  const cells = useGridStore((s) => s.cells);
  const selected = useGridStore((s) => s.selected);
  const hover = useGridStore((s) => s.hover);
  const fitSignal = useGridStore((s) => s.fitSignal);

  // Mount once: renderer, scene, camera, controls, lights, loop.
  // Grid contents are (re)built by the effects below from the shared store,
  // so this tab always shows the same saved tiles as the 2D tab.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.495;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.65));
    const sun = new THREE.DirectionalLight(0xffffff, 0.45);
    sun.position.set(0.8, 1.5, 1);
    scene.add(sun);

    const terrainMats = Object.fromEntries(
      TERRAINS.map((t) => [t.id, new THREE.MeshLambertMaterial({ color: t.top })]),
    ) as Record<TerrainId, THREE.MeshLambertMaterial>;

    const cubeGeo = new THREE.BoxGeometry(CUBE, CUBE, CUBE);
    const gridGroup = new THREE.Group();
    scene.add(gridGroup);
    let cellMeshes: THREE.Mesh[] = [];

    const slabTop = new THREE.Mesh(
      new THREE.BoxGeometry(1, 20, 1),
      new THREE.MeshLambertMaterial({ color: "#78716c" }),
    );
    slabTop.position.y = -10;
    scene.add(slabTop);
    const slabBase = new THREE.Mesh(
      new THREE.BoxGeometry(1, 26, 1),
      new THREE.MeshLambertMaterial({ color: "#44403c" }),
    );
    slabBase.position.y = -33;
    scene.add(slabBase);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40000, 40000),
      new THREE.MeshLambertMaterial({ color: GROUND }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -46;
    scene.add(ground);

    const selectedBox = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(CUBE + 4, CUBE + 4, CUBE + 4),
      ),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    );
    selectedBox.visible = false;
    scene.add(selectedBox);

    const hoverBox = new THREE.Mesh(
      new THREE.BoxGeometry(CUBE + 2, CUBE + 2, CUBE + 2),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    hoverBox.visible = false;
    scene.add(hoverBox);

    let gridN = useGridStore.getState().n;
    let fitDist = 1000;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height);
    };

    const reportZoom = () => {
      const d = camera.position.distanceTo(controls.target);
      if (d > 0) setZoomPct(Math.round((fitDist / d) * 100));
    };

    const fit = () => {
      const radius = Math.hypot(gridN * CUBE, gridN * CUBE) / 2 + CUBE * 0.75;
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
      const dist = radius / Math.sin(Math.min(vFov, hFov) / 2);
      fitDist = dist;
      const polar = Math.acos(1 / Math.sqrt(3)); // ~54.7deg classic iso tilt
      const azim = Math.PI / 4;
      const dir = new THREE.Vector3(
        Math.sin(polar) * Math.sin(azim),
        Math.cos(polar),
        Math.sin(polar) * Math.cos(azim),
      );
      const target = new THREE.Vector3(0, CUBE * 0.25, 0);
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.near = Math.max(1, dist / 100);
      camera.far = dist * 20;
      camera.updateProjectionMatrix();
      controls.target.copy(target);
      controls.minDistance = dist * 0.15;
      controls.maxDistance = dist * 3;
      controls.update();
      reportZoom();
    };

    const refreshOverlays = () => {
      const s = useGridStore.getState().selected;
      const h = useGridStore.getState().hover;
      const inBounds = (c: CellCoord | null) =>
        !!c && c.x >= 0 && c.y >= 0 && c.x < gridN && c.y < gridN;
      if (inBounds(s)) {
        selectedBox.position.copy(cellCenter(s as CellCoord, gridN));
        selectedBox.visible = true;
      } else {
        selectedBox.visible = false;
      }
      // Hover hides under selection, like the 2D view.
      const hoverWins =
        inBounds(h) && !(s && h && s.x === h.x && s.y === h.y);
      if (hoverWins) {
        hoverBox.position.copy(cellCenter(h as CellCoord, gridN));
        hoverBox.visible = true;
      } else {
        hoverBox.visible = false;
      }
    };

    const rebuild = (nextN: number) => {
      gridN = nextN;
      gridGroup.clear();
      cellMeshes = [];
      const state = useGridStore.getState();
      for (let y = 0; y < nextN; y++) {
        for (let x = 0; x < nextN; x++) {
          const mesh = new THREE.Mesh(
            cubeGeo,
            terrainMats[terrainAt(state.cells, x, y)],
          );
          mesh.position.copy(cellCenter({ x, y }, nextN));
          mesh.userData.cell = { x, y };
          gridGroup.add(mesh);
          cellMeshes.push(mesh);
        }
      }
      const slabW = nextN * CUBE + 32;
      slabTop.scale.set(slabW, 1, slabW);
      slabBase.scale.set(slabW, 1, slabW);
      refreshOverlays();
      fit();
    };

    const recolor = (nextCells: Record<string, TerrainId>) => {
      for (const mesh of cellMeshes) {
        const c = mesh.userData.cell as CellCoord;
        mesh.material = terrainMats[terrainAt(nextCells, c.x, c.y)];
      }
    };

    const dolly = (factor: number) => {
      const off = camera.position.clone().sub(controls.target);
      off.setLength(
        THREE.MathUtils.clamp(
          off.length() * factor,
          controls.minDistance,
          controls.maxDistance,
        ),
      );
      camera.position.copy(controls.target).add(off);
      controls.update();
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pick = (e: PointerEvent): CellCoord | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(cellMeshes, false)[0];
      return hit ? (hit.object.userData.cell as CellCoord) : null;
    };

    const aborter = new AbortController();
    const { signal } = aborter;
    let downAt: { x: number; y: number } | null = null;
    let pendingHover: PointerEvent | null = null;

    renderer.domElement.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button === 0) downAt = { x: e.clientX, y: e.clientY };
      },
      { signal },
    );
    renderer.domElement.addEventListener(
      "pointerup",
      (e) => {
        const start = downAt;
        downAt = null;
        if (e.button !== 0 || !start) return;
        if (
          Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP_PX
        ) {
          return; // was an orbit drag, not a click
        }
        if (!readonly) {
          const cell = pick(e);
          const st = useGridStore.getState();
          if (st.tool === "select") {
            st.setSelected(cell);
          } else if (st.tool === "paint") {
            if (cell) {
              st.paintCell(cell.x, cell.y);
              st.setSelected(cell);
            }
          } else if (st.tool === "erase") {
            if (cell) {
              st.eraseCell(cell.x, cell.y);
              st.setSelected(cell);
            }
          }
          // pan: orbit controls own the drag; click does nothing
        }
      },
      { signal },
    );
    renderer.domElement.addEventListener(
      "pointermove",
      (e) => {
        pendingHover = e;
      },
      { signal },
    );
    renderer.domElement.addEventListener(
      "pointerleave",
      () => {
        pendingHover = null;
        useGridStore.getState().setHover(null);
      },
      { signal },
    );
    controls.addEventListener("change", reportZoom);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (pendingHover) {
        useGridStore.getState().setHover(pick(pendingHover));
        pendingHover = null;
      }
      controls.update();
      renderer.render(scene, camera);
    };

    apiRef.current = { rebuild, recolor, refreshOverlays, fit, dolly };

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      aborter.abort();
      controls.removeEventListener("change", reportZoom);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    apiRef.current?.rebuild(n);
  }, [n]);
  useEffect(() => {
    apiRef.current?.recolor(cells);
  }, [cells]);
  useEffect(() => {
    apiRef.current?.refreshOverlays();
  }, [selected, hover]);
  useEffect(() => {
    apiRef.current?.fit();
  }, [fitSignal]);

  const toolMeta = TOOLS.find((t) => t.id === tool);

  return (
    <div
      ref={containerRef}
      className={`relative min-w-0 flex-1 touch-none overflow-hidden bg-stone-800 select-none ${readonly ? "cursor-grab" : TOOL_CURSORS[tool]}`}
    >
      {readonly ? (
        <div className="pointer-events-none absolute top-3 left-3 rounded-md border border-stone-600 bg-stone-900/90 px-2.5 py-1.5 text-xs text-stone-300 shadow-sm">
          Drag to orbit · Scroll to zoom
        </div>
      ) : toolMeta ? (
        <div className="pointer-events-none absolute top-3 left-3 rounded-md border border-stone-600 bg-stone-900/90 px-2.5 py-1.5 text-xs text-stone-300 shadow-sm">
          <span className="font-semibold text-white">{toolMeta.label}</span> —{" "}
          {toolMeta.hint} · Drag to orbit
        </div>
      ) : null}

      <div className="absolute right-4 bottom-4 flex items-center gap-1 rounded-md border border-stone-600 bg-stone-900/90 px-1.5 py-1 shadow-sm">
        <button
          type="button"
          title="Zoom out"
          onClick={() => apiRef.current?.dolly(1.25)}
          className="rounded px-2 py-0.5 text-sm font-semibold text-stone-200 hover:bg-stone-700"
        >
          −
        </button>
        <span className="w-12 text-center text-xs tabular-nums text-stone-400">
          {zoomPct}%
        </span>
        <button
          type="button"
          title="Zoom in"
          onClick={() => apiRef.current?.dolly(1 / 1.25)}
          className="rounded px-2 py-0.5 text-sm font-semibold text-stone-200 hover:bg-stone-700"
        >
          +
        </button>
        <button
          type="button"
          title="Fit grid to view"
          onClick={() => apiRef.current?.fit()}
          className="rounded px-2 py-0.5 text-xs font-medium text-stone-200 hover:bg-stone-700"
        >
          Fit
        </button>
      </div>
    </div>
  );
}
