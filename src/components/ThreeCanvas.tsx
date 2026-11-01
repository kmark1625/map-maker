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
import grassTile from "@/app/assets/images/tiles/grass_flat.webp";
import waterTile from "@/app/assets/images/tiles/water_flat.webp";
import sandTile from "@/app/assets/images/tiles/sand_flat.webp";
import stoneTile from "@/app/assets/images/tiles/stone.webp";
import forestTile from "@/app/assets/images/tiles/forest.webp";
import sideTile from "@/app/assets/images/side_tiles/side_icy_mountain.webp";
import cliffLipTile from "@/app/assets/images/tiles/cliff_with_grass_lip.webp";
import bareRockTile from "@/app/assets/images/tiles/bare_cliff_rock.webp";
import deepRockTile from "@/app/assets/images/tiles/deep_underbelly_rock.webp";
import {
  ISLAND_D,
  ISLAND_H,
  ISLAND_W,
  isIslandSolid,
} from "@/data/floating-island";
import {
  ELF_FRAMES,
  ELF_FRAME_MS,
  elfFrameLayout,
  elfFrameUV,
  type ElfDirectionId,
} from "@/lib/elf-sprite";
import type { ToolId } from "@/stores/grid-store";
import { useCharacterStore } from "@/stores/character-store";

const CUBE = TILE_H; // full h x h x h cubes
const BG = "#292524"; // stone-800, matches the 2D canvas
const GROUND = "#1c1917"; // stone-900
const CLICK_SLOP_PX = 6;
// Wandering elf sketch on the rendered map: random-walk the grid with a
// walk-cycle billboard, camera-relative 8-direction facing, and fading
// element-tinted trail decals on visited tiles.
const ELF_STEP_MS = 550; // per tile; diagonal steps take ~1.4x
const ELF_IDLE_MIN_MS = 250;
const ELF_IDLE_MAX_MS = 800;
const ELF_SHADOW_R = 15;
const TRAIL_R = 22;
const TRAIL_OPACITY = 0.55;
const TRAIL_MS = 2600;
const TRAIL_MAX = 48;
const ELEMENT_TRAIL: Record<string, string> = {
  fire: "#fb923c",
  ice: "#7dd3fc",
  shadow: "#c084fc",
};
const FACING_ORDER = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"] as const;

const TILE_URLS: Record<TerrainId, string> = {
  grass: grassTile.src,
  water: waterTile.src,
  sand: sandTile.src,
  stone: stoneTile.src,
  forest: forestTile.src,
};

// Surface cubes wear the grass-lipped cliff on their sides. The island
// column below bands by depth: bare blue rock up top, icy strata mid,
// dark underbelly at the keel.
const SURFACE_SIDE_URL = cliffLipTile.src;
const ROCK_SIDE_URL = bareRockTile.src;
const ICE_SIDE_URL = sideTile.src;
const DEEP_SIDE_URL = deepRockTile.src;
// z = 0 is the cap under the terrain, increasing downward (ISLAND_H = 10).
// Bands follow the concept art: icy blue cliffs up top, pale ice strata mid,
// dark purple underbelly at the keel.
const ROCK_MAX_Z = 3;
const ICE_MAX_Z = 6;
function islandSideBand(z: number): number {
  if (z <= ROCK_MAX_Z) return 0;
  if (z <= ICE_MAX_Z) return 1;
  return 2;
}

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
  setWander: (on: boolean) => void;
}

export default function ThreeCanvas({
  readonly = false,
}: {
  readonly?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ViewApi | null>(null);
  const [zoomPct, setZoomPct] = useState(100);
  const [wander, setWanderState] = useState(readonly);

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
    controls.maxPolarAngle = readonly ? Math.PI * 0.8 : Math.PI * 0.495;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.65));
    const sun = new THREE.DirectionalLight(0xffffff, 0.45);
    sun.position.set(0.8, 1.5, 1);
    scene.add(sun);

    // Per-face materials: textured top, textured sides + dark bottom.
    // BoxGeometry group order is +x, -x, +y, -y, +z, -z.
    const terrainTopMats = Object.fromEntries(
      TERRAINS.map((t) => [t.id, new THREE.MeshLambertMaterial({ color: t.top })]),
    ) as Record<TerrainId, THREE.MeshLambertMaterial>;
    const terrainSideMats = Object.fromEntries(
      TERRAINS.map((t) => [
        t.id,
        {
          left: new THREE.MeshLambertMaterial({ color: t.left }),
          right: new THREE.MeshLambertMaterial({ color: t.right }),
        },
      ]),
    ) as Record<
      TerrainId,
      { left: THREE.MeshLambertMaterial; right: THREE.MeshLambertMaterial }
    >;
    const bottomMat = new THREE.MeshLambertMaterial({ color: "#292524" });
    const terrainBoxMats = Object.fromEntries(
      TERRAINS.map((t) => {
        const { left, right } = terrainSideMats[t.id];
        return [t.id, [right, left, terrainTopMats[t.id], bottomMat, right, left]];
      }),
    ) as Record<TerrainId, THREE.MeshLambertMaterial[]>;

    // Load tile textures asynchronously; tops keep their flat terrain color
    // until each texture arrives, then switch to the true texture colors.
    const textureLoader = new THREE.TextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const loadedTextures: THREE.Texture[] = [];
    let texturesCancelled = false;
    for (const t of TERRAINS) {
      textureLoader.load(
        TILE_URLS[t.id],
        (tex) => {
          if (texturesCancelled) {
            tex.dispose();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = Math.min(8, maxAniso);
          loadedTextures.push(tex);
          const mat = terrainTopMats[t.id];
          mat.map = tex;
          mat.color.set("#ffffff");
          mat.needsUpdate = true;
        },
        undefined,
        () => {},
      );
    }

    const cubeGeo = new THREE.BoxGeometry(CUBE, CUBE, CUBE);
    // Island column materials: one side texture per depth band (top and
    // bottom share the cap color). Bands follow islandSideBand below.
    const islandMat = new THREE.MeshLambertMaterial({ color: "#7e9cb5" });
    const islandSideMats = [
      new THREE.MeshLambertMaterial({ color: "#7fc4e4" }),
      new THREE.MeshLambertMaterial({ color: "#ffffff" }),
      new THREE.MeshLambertMaterial({ color: "#5b4a8a" }),
    ];
    // BoxGeometry group order is +x, -x, +y, -y, +z, -z.
    const islandBoxMatsByBand = islandSideMats.map((side) => [
      side,
      side,
      islandMat,
      islandMat,
      side,
      side,
    ]);

    // Side textures arrive asynchronously; each material keeps its flat
    // fallback color until its texture lands, then shows it at full color.
    const applySideTexture = (
      url: string,
      targets: THREE.MeshLambertMaterial[],
    ) => {
      textureLoader.load(
        url,
        (tex) => {
          if (texturesCancelled) {
            tex.dispose();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = Math.min(8, maxAniso);
          loadedTextures.push(tex);
          for (const mat of targets) {
            mat.map = tex;
            mat.color.set("#ffffff");
            mat.needsUpdate = true;
          }
        },
        undefined,
        () => {},
      );
    };
    applySideTexture(
      SURFACE_SIDE_URL,
      TERRAINS.flatMap((t) => [
        terrainSideMats[t.id].left,
        terrainSideMats[t.id].right,
      ]),
    );
    applySideTexture(ROCK_SIDE_URL, [islandSideMats[0]]);
    applySideTexture(ICE_SIDE_URL, [islandSideMats[1]]);
    applySideTexture(DEEP_SIDE_URL, [islandSideMats[2]]);
    const gridGroup = new THREE.Group();
    scene.add(gridGroup);
    const islandGroup = new THREE.Group();
    scene.add(islandGroup);
    let cellMeshes: THREE.Mesh[] = [];

    // Wandering elf on the rendered map: a walk-cycle billboard that
    // random-walks the grid. THREE.Sprite always faces the camera; the
    // artwork row is picked per-step in camera space so facing stays
    // correct while orbiting.
    const elfGroup = new THREE.Group();
    elfGroup.visible = readonly;
    scene.add(elfGroup);
    const elfFeet = new THREE.Vector3(0, CUBE, 0);
    let elfSprite: THREE.Sprite | null = null;
    const elfTextures: Record<string, THREE.Texture> = {};
    const elfShadow = new THREE.Mesh(
      new THREE.CircleGeometry(ELF_SHADOW_R, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    elfShadow.rotation.x = -Math.PI / 2;
    elfGroup.add(elfShadow);

    // Wander state: logical cell plus step interpolation between world feet.
    let wanderOn = readonly;
    let elfCell: CellCoord = { x: 0, y: 0 };
    let elfFrom: CellCoord = elfCell;
    let elfTo: CellCoord = elfCell;
    let elfT = 1;
    let stepDur = ELF_STEP_MS;
    const stepFromW = new THREE.Vector3(0, CUBE, 0);
    const stepToW = new THREE.Vector3(0, CUBE, 0);
    let idleUntil = 0;
    let elfDir: ElfDirectionId = "S";
    let elfFrame = 0;
    let lastFrameAt = 0;

    // Swap the billboard to (elfDir, elfFrame): sheet texture, UV crop,
    // and per-row size/feet anchoring (rows differ across the 2 sheets).
    const applyElfFrame = () => {
      if (!elfSprite) return;
      const layout = elfFrameLayout(elfDir, elfFrame);
      const tex = elfTextures[layout.url];
      if (!tex) return; // sheet still loading; keep the previous frame
      const uv = elfFrameUV(elfDir, elfFrame);
      tex.repeat.set(uv.u1 - uv.u0, uv.v1 - uv.v0);
      tex.offset.set(uv.u0, uv.v0);
      const mat = elfSprite.material as THREE.SpriteMaterial;
      if (mat.map !== tex) mat.map = tex;
      elfSprite.scale.set(
        layout.sw * layout.scale,
        layout.sh * layout.scale,
        1,
      );
      // Feet sit below the frame center by (footDy - sh/2) image pixels.
      const lift = (layout.footDy - layout.sh / 2) * layout.scale;
      elfSprite.position.set(elfFeet.x, CUBE + lift, elfFeet.z);
    };
    const tryCreateSprite = () => {
      if (elfSprite) return;
      const layout = elfFrameLayout(elfDir, elfFrame);
      if (!elfTextures[layout.url]) return;
      elfSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ transparent: true, depthWrite: false }),
      );
      elfGroup.add(elfSprite);
      applyElfFrame();
    };
    if (readonly) {
      // S lives on sheet 1, SE on sheet 2: together they cover both URLs.
      for (const id of ["S", "SE"] as const) {
        const url = elfFrameLayout(id, 0).url;
        textureLoader.load(
          url,
          (tex) => {
            if (texturesCancelled) {
              tex.dispose();
              return;
            }
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = Math.min(8, maxAniso);
            elfTextures[url] = tex;
            tryCreateSprite();
          },
          undefined,
          () => {},
        );
      }
    }

    // Screen-space facing for a grid step, from the movement vector in
    // camera space: +x is screen right, +y is toward the viewer.
    const camFwd = new THREE.Vector3();
    const facingForMove = (from: CellCoord, to: CellCoord): ElfDirectionId => {
      const mx = to.x - from.x;
      const mz = to.y - from.y;
      if (!mx && !mz) return elfDir;
      camFwd.subVectors(controls.target, camera.position);
      camFwd.y = 0;
      if (camFwd.lengthSq() < 1e-6) return "S";
      camFwd.normalize();
      const sx = mx * -camFwd.z + mz * camFwd.x;
      const sy = -(mx * camFwd.x + mz * camFwd.z);
      const idx =
        ((Math.round(Math.atan2(sx, sy) / (Math.PI / 4)) % 8) + 8) % 8;
      return FACING_ORDER[idx];
    };

    // Random 8-neighbor step, staying dry when a non-water move exists.
    const pickNext = (): CellCoord => {
      const { cells } = useGridStore.getState();
      const all: CellCoord[] = [];
      const dry: CellCoord[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = elfCell.x + dx;
          const y = elfCell.y + dy;
          if (x < 0 || y < 0 || x >= gridN || y >= gridN) continue;
          const c = { x, y };
          all.push(c);
          if (terrainAt(cells, x, y) !== "water") dry.push(c);
        }
      }
      const pool = dry.length ? dry : all;
      return pool[(Math.random() * pool.length) | 0] ?? elfCell;
    };

    // Tile-effect hook: a fading element-tinted decal where the elf steps.
    // Color follows the selected character variant (fire/ice/shadow).
    const trailGeo = new THREE.CircleGeometry(TRAIL_R, 24);
    const trails: { mesh: THREE.Mesh; born: number }[] = [];
    const spawnTileEffect = (cell: CellCoord, now: number) => {
      const p = cellCenter(cell, gridN);
      const selected = useCharacterStore.getState().selectedId;
      const mesh = new THREE.Mesh(
        trailGeo,
        new THREE.MeshBasicMaterial({
          color: ELEMENT_TRAIL[selected] ?? ELEMENT_TRAIL.ice,
          transparent: true,
          opacity: TRAIL_OPACITY,
          depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(p.x, CUBE + 0.6, p.z);
      elfGroup.add(mesh);
      trails.push({ mesh, born: now });
      while (trails.length > TRAIL_MAX) {
        const old = trails.shift();
        if (old) {
          elfGroup.remove(old.mesh);
          (old.mesh.material as THREE.Material).dispose();
        }
      }
    };
    const updateTrails = (now: number) => {
      for (let i = trails.length - 1; i >= 0; i--) {
        const t = trails[i];
        const age = (now - t.born) / TRAIL_MS;
        if (age >= 1) {
          elfGroup.remove(t.mesh);
          (t.mesh.material as THREE.Material).dispose();
          trails.splice(i, 1);
        } else {
          (t.mesh.material as THREE.MeshBasicMaterial).opacity =
            TRAIL_OPACITY * (1 - age);
        }
      }
    };

    const smooth = (t: number) => t * t * (3 - 2 * t);
    const updateWander = (now: number, dt: number) => {
      if (!wanderOn || !elfSprite) return;
      if (elfT < 1) {
        elfT = Math.min(1, elfT + dt / stepDur);
        elfFeet.lerpVectors(stepFromW, stepToW, smooth(elfT));
        elfDir = facingForMove(elfFrom, elfTo);
        if (now - lastFrameAt >= ELF_FRAME_MS) {
          lastFrameAt = now;
          elfFrame = (elfFrame + 1) % ELF_FRAMES;
        }
        applyElfFrame();
        elfShadow.position.set(elfFeet.x, CUBE + 0.5, elfFeet.z);
        if (elfT >= 1) {
          elfCell = elfTo;
          spawnTileEffect(elfCell, now);
          idleUntil =
            now +
            ELF_IDLE_MIN_MS +
            Math.random() * (ELF_IDLE_MAX_MS - ELF_IDLE_MIN_MS);
        }
      } else if (now >= idleUntil) {
        const next = pickNext();
        elfFrom = elfCell;
        elfTo = next;
        elfT = 0;
        const a = cellCenter(elfFrom, gridN);
        const b = cellCenter(elfTo, gridN);
        stepFromW.set(a.x, CUBE, a.z);
        stepToW.set(b.x, CUBE, b.z);
        stepDur =
          ELF_STEP_MS *
          Math.hypot(next.x - elfCell.x, next.y - elfCell.y);
        elfDir = facingForMove(elfFrom, elfTo);
        elfFrame = 0;
        lastFrameAt = now;
        applyElfFrame();
      }
    };

    const placeElf = () => {
      const c = {
        x: Math.floor(gridN / 2),
        y: Math.floor(gridN / 2),
      };
      elfCell = c;
      elfFrom = c;
      elfTo = c;
      elfT = 1;
      const p = cellCenter(c, gridN);
      elfFeet.set(p.x, CUBE, p.z);
      stepFromW.set(p.x, CUBE, p.z);
      stepToW.set(p.x, CUBE, p.z);
      elfShadow.position.set(p.x, CUBE + 0.5, p.z);
      idleUntil = performance.now() + 600;
      for (const t of trails) {
        elfGroup.remove(t.mesh);
        (t.mesh.material as THREE.Material).dispose();
      }
      trails.length = 0;
      if (elfSprite) {
        elfDir = "S";
        elfFrame = 0;
        applyElfFrame();
      }
    };

    const setWander = (on: boolean) => {
      wanderOn = on;
      const now = performance.now();
      if (on) {
        idleUntil = now + 200;
        lastFrameAt = now;
      } else if (elfSprite) {
        elfFrame = 0;
        applyElfFrame();
      }
    };

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

    // Render step: the island floats free — no slab or ground plane.
    slabTop.visible = !readonly;
    slabBase.visible = !readonly;
    ground.visible = !readonly;

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
      const footprint = Math.hypot(gridN * CUBE, gridN * CUBE) / 2;
      const top = CUBE;
      const bottom = readonly ? -ISLAND_H * CUBE : 0;
      const radius =
        Math.hypot(footprint, readonly ? (top - bottom) / 2 : 0) + CUBE * 0.75;
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
      const target = new THREE.Vector3(
        0,
        readonly ? (top + bottom) / 2 : CUBE * 0.25,
        0,
      );
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
            terrainBoxMats[terrainAt(state.cells, x, y)],
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
      islandGroup.clear();
      if (readonly) {
        // Center the sample island under the grid, clipping to grid bounds.
        const ox = Math.floor((nextN - ISLAND_W) / 2);
        const oy = Math.floor((nextN - ISLAND_D) / 2);
        for (let z = 0; z < ISLAND_H; z++) {
          for (let y = 0; y < ISLAND_D; y++) {
            for (let x = 0; x < ISLAND_W; x++) {
              if (!isIslandSolid(x, y, z)) continue;
              const gx = x + ox;
              const gy = y + oy;
              if (gx < 0 || gy < 0 || gx >= nextN || gy >= nextN) continue;
              const mesh = new THREE.Mesh(
                cubeGeo,
                islandBoxMatsByBand[islandSideBand(z)],
              );
              const p = cellCenter({ x: gx, y: gy }, nextN);
              mesh.position.set(p.x, -(z * CUBE + CUBE / 2), p.z);
              islandGroup.add(mesh);
            }
          }
        }
      }
      refreshOverlays();
      placeElf();
      fit();
    };

    const recolor = (nextCells: Record<string, TerrainId>) => {
      for (const mesh of cellMeshes) {
        const c = mesh.userData.cell as CellCoord;
        mesh.material = terrainBoxMats[terrainAt(nextCells, c.x, c.y)];
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
    let lastNow = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(100, now - lastNow);
      lastNow = now;
      if (pendingHover) {
        useGridStore.getState().setHover(pick(pendingHover));
        pendingHover = null;
      }
      updateWander(now, dt);
      updateTrails(now);
      controls.update();
      renderer.render(scene, camera);
    };

    apiRef.current = {
      rebuild,
      recolor,
      refreshOverlays,
      fit,
      dolly,
      setWander,
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();
    loop();

    return () => {
      cancelAnimationFrame(raf);
      texturesCancelled = true;
      loadedTextures.forEach((t) => t.dispose());
      Object.values(elfTextures).forEach((t) => t.dispose());
      trailGeo.dispose();
      for (const t of trails) {
        (t.mesh.material as THREE.Material).dispose();
      }
      if (elfSprite) (elfSprite.material as THREE.Material).dispose();
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
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <div className="pointer-events-none rounded-md border border-stone-600 bg-stone-900/90 px-2.5 py-1.5 text-xs text-stone-300 shadow-sm">
            Drag to orbit · Scroll to zoom
          </div>
          <button
            type="button"
            title={wander ? "Pause the wandering elf" : "Let the elf wander"}
            aria-pressed={wander}
            onClick={() => {
              const next = !wander;
              setWanderState(next);
              apiRef.current?.setWander(next);
            }}
            className={`rounded-md border px-2.5 py-1.5 text-xs shadow-sm ${
              wander
                ? "border-sky-600 bg-sky-600/90 font-semibold text-white"
                : "border-stone-600 bg-stone-900/90 text-stone-300 hover:bg-stone-700"
            }`}
          >
            {wander ? "Wandering…" : "Wander"}
          </button>
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
