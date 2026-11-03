import type { StaticImageData } from "next/image";

import fireSheetPart1 from "@/app/assets/images/character/fire_elf/8_directional_part_1.png";
import fireSheetPart2 from "@/app/assets/images/character/fire_elf/8_directional_part_2.png";
import iceSheetPart1 from "@/app/assets/images/character/ice_elf/8_directional_part_1.png";
import iceSheetPart2 from "@/app/assets/images/character/ice_elf/8_directional_part_2.png";

/**
 * Elf sprite atlases, one per character variant that has sheets. Each
 * variant is two sheets of 6 walk frames x 4 directions, together covering
 * 8 screen-facing directions. All PNGs have transparent backgrounds.
 *
 * Rows are in sheet order (top to bottom), each tagged with its facing;
 * row order differs per variant, so directions map through the per-variant
 * tables below rather than by row position.
 *
 * Grid, measured from fully-transparent gutter rows in the sheets (bands
 * split at gutter midpoints): ice part 1 is 1152x1024 (192px columns),
 * every other sheet is 1254x1254 (209px columns). Frames within a row
 * share one rect so walk cycles don't jitter; `top`/`bottom` is the union
 * content extent of the row's 6 frames, used to normalize on-map size and
 * anchor the feet across directions.
 */

/** Character variants (see character-variants.ts) that have sprite sheets. */
export type ElfSpriteVariant = "fire" | "ice";

/**
 * Map a selected character variant id to its sprite atlas. Variants
 * without sheets yet (lightning) fall back to the ice elf.
 */
export function elfSpriteVariant(selectedId: string): ElfSpriteVariant {
  return selectedId === "fire" ? "fire" : "ice";
}

/** Facing directions in screen space, clockwise from front (toward camera). */
export type ElfDirectionId =
  | "S"
  | "SE"
  | "E"
  | "NE"
  | "N"
  | "NW"
  | "W"
  | "SW";

export const ELF_FRAMES = 6;
export const ELF_FRAME_MS = 140;
/** On-map content height (feet to hood top) in world units; tiles are 64. */
export const ELF_CONTENT_H = 96;

interface SheetRow {
  /** Frame band within the sheet. */
  y0: number;
  y1: number;
  /** Union content extent of the row's frames (feet anchoring + scaling). */
  top: number;
  bottom: number;
}

interface SheetGeom {
  image: StaticImageData;
  /** Matches the `8_directional_part_N.png` filename. */
  part: 1 | 2;
  rows: SheetRow[];
}

const ICE_SHEET_1: SheetGeom = {
  image: iceSheetPart1,
  part: 1,
  rows: [
    { y0: 0, y1: 295, top: 71, bottom: 289 }, // S
    { y0: 295, y1: 530, top: 303, bottom: 524 }, // E
    { y0: 530, y1: 765, top: 537, bottom: 758 }, // W
    { y0: 765, y1: 1024, top: 773, bottom: 987 }, // N
  ],
};

const ICE_SHEET_2: SheetGeom = {
  image: iceSheetPart2,
  part: 2,
  rows: [
    { y0: 0, y1: 333, top: 58, bottom: 320 }, // NE
    { y0: 333, y1: 621, top: 347, bottom: 610 }, // SE
    { y0: 621, y1: 907, top: 634, bottom: 901 }, // NW
    { y0: 907, y1: 1254, top: 915, bottom: 1182 }, // SW
  ],
};

const FIRE_SHEET_1: SheetGeom = {
  image: fireSheetPart1,
  part: 1,
  rows: [
    { y0: 0, y1: 356, top: 91, bottom: 336 }, // N
    { y0: 356, y1: 640, top: 375, bottom: 621 }, // E
    { y0: 640, y1: 923, top: 658, bottom: 904 }, // S
    { y0: 923, y1: 1254, top: 942, bottom: 1178 }, // W
  ],
};

const FIRE_SHEET_2: SheetGeom = {
  image: fireSheetPart2,
  part: 2,
  rows: [
    { y0: 0, y1: 338, top: 64, bottom: 311 }, // SE
    { y0: 338, y1: 633, top: 364, bottom: 609 }, // SW
    { y0: 633, y1: 923, top: 656, bottom: 899 }, // NW
    { y0: 923, y1: 1254, top: 946, bottom: 1192 }, // NE
  ],
};

export interface ElfDirection {
  id: ElfDirectionId;
  label: string;
  arrow: string;
  sheet: SheetGeom;
  row: number;
}

const DIRECTION_META: Record<
  ElfDirectionId,
  { label: string; arrow: string }
> = {
  S: { label: "South", arrow: "↓" },
  SE: { label: "South-East", arrow: "↘" },
  E: { label: "East", arrow: "→" },
  NE: { label: "North-East", arrow: "↗" },
  N: { label: "North", arrow: "↑" },
  NW: { label: "North-West", arrow: "↖" },
  W: { label: "West", arrow: "←" },
  SW: { label: "South-West", arrow: "↙" },
};

function atlas(
  rows: Partial<Record<ElfDirectionId, { sheet: SheetGeom; row: number }>>,
): ElfDirection[] {
  return (Object.keys(DIRECTION_META) as ElfDirectionId[]).map((id) => ({
    id,
    ...DIRECTION_META[id],
    sheet: rows[id]!.sheet,
    row: rows[id]!.row,
  }));
}

const ICE_DIRECTIONS: ElfDirection[] = atlas({
  S: { sheet: ICE_SHEET_1, row: 0 },
  SE: { sheet: ICE_SHEET_2, row: 1 },
  E: { sheet: ICE_SHEET_1, row: 1 },
  NE: { sheet: ICE_SHEET_2, row: 0 },
  N: { sheet: ICE_SHEET_1, row: 3 },
  NW: { sheet: ICE_SHEET_2, row: 2 },
  W: { sheet: ICE_SHEET_1, row: 2 },
  SW: { sheet: ICE_SHEET_2, row: 3 },
});

const FIRE_DIRECTIONS: ElfDirection[] = atlas({
  S: { sheet: FIRE_SHEET_1, row: 2 },
  SE: { sheet: FIRE_SHEET_2, row: 0 },
  E: { sheet: FIRE_SHEET_1, row: 1 },
  NE: { sheet: FIRE_SHEET_2, row: 3 },
  N: { sheet: FIRE_SHEET_1, row: 0 },
  NW: { sheet: FIRE_SHEET_2, row: 2 },
  W: { sheet: FIRE_SHEET_1, row: 3 },
  SW: { sheet: FIRE_SHEET_2, row: 1 },
});

const ATLASES: Record<ElfSpriteVariant, ElfDirection[]> = {
  fire: FIRE_DIRECTIONS,
  ice: ICE_DIRECTIONS,
};

export function elfDirections(variant: ElfSpriteVariant): ElfDirection[] {
  return ATLASES[variant];
}

/** Ice atlas, kept for callers that don't track a variant. */
export const ELF_DIRECTIONS: ElfDirection[] = ICE_DIRECTIONS;

export function elfDirection(
  id: ElfDirectionId,
  variant: ElfSpriteVariant = "ice",
): ElfDirection {
  const dirs = ATLASES[variant];
  return dirs.find((d) => d.id === id) ?? dirs[0];
}

/** Distinct sheet image URLs a variant needs loaded. */
export function elfSheetUrls(variant: ElfSpriteVariant): string[] {
  return [...new Set(ATLASES[variant].map((d) => d.sheet.image.src))];
}

export interface ElfFrameLayout {
  url: string;
  sheetW: number;
  sheetH: number;
  /** Frame rect in sheet pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** World units per sheet pixel (content height normalized). */
  scale: number;
  /** Feet point in frame pixels from the frame's top-left. */
  footDx: number;
  footDy: number;
}

export function elfFrameLayout(
  id: ElfDirectionId,
  frame: number,
  variant: ElfSpriteVariant = "ice",
): ElfFrameLayout {
  const dir = elfDirection(id, variant);
  const { image, rows } = dir.sheet;
  const r = rows[dir.row];
  const f = ((frame % ELF_FRAMES) + ELF_FRAMES) % ELF_FRAMES;
  const sw = image.width / ELF_FRAMES;
  const sh = r.y1 - r.y0;
  return {
    url: image.src,
    sheetW: image.width,
    sheetH: image.height,
    sx: f * sw,
    sy: r.y0,
    sw,
    sh,
    scale: ELF_CONTENT_H / (r.bottom - r.top),
    footDx: sw / 2,
    footDy: r.bottom - r.y0,
  };
}

/** Normalized UV rect (bottom-left origin, three.js convention) per frame. */
export function elfFrameUV(
  id: ElfDirectionId,
  frame: number,
  variant: ElfSpriteVariant = "ice",
): {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
} {
  const l = elfFrameLayout(id, frame, variant);
  return {
    u0: l.sx / l.sheetW,
    v0: 1 - (l.sy + l.sh) / l.sheetH,
    u1: (l.sx + l.sw) / l.sheetW,
    v1: 1 - l.sy / l.sheetH,
  };
}
