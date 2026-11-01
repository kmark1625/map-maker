import type { StaticImageData } from "next/image";

import sheetPart1 from "@/app/assets/images/character/ice_elf/8_directional_part_1.png";
import sheetPart2 from "@/app/assets/images/character/ice_elf/8_directional_part_2.png";

/**
 * Ice elf sprite atlas. Two sheets of 6 walk frames x 4 directions each,
 * together covering 8 screen-facing directions. Both PNGs already have
 * transparent backgrounds.
 *
 * Grid, measured from fully-transparent gutter columns/rows in the sheets:
 * part 1 is 1152x1024 with uniform 192px columns and row bands at
 * y = 0/295/530/765/1024; part 2 is 1254x1254 with uniform 209px columns
 * and row bands at y = 0/333/621/907/1254. Frames within a row share one
 * rect so walk cycles don't jitter; `top`/`bottom` is the union content
 * extent of the row's 6 frames, used to normalize on-map size and anchor
 * the feet across directions.
 */

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

const SHEET_1: SheetGeom = {
  image: sheetPart1,
  part: 1,
  rows: [
    { y0: 0, y1: 295, top: 71, bottom: 289 }, // S
    { y0: 295, y1: 530, top: 303, bottom: 524 }, // E
    { y0: 530, y1: 765, top: 537, bottom: 758 }, // W
    { y0: 765, y1: 1024, top: 773, bottom: 987 }, // N
  ],
};

const SHEET_2: SheetGeom = {
  image: sheetPart2,
  part: 2,
  rows: [
    { y0: 0, y1: 333, top: 58, bottom: 320 }, // NE
    { y0: 333, y1: 621, top: 347, bottom: 610 }, // SE
    { y0: 621, y1: 907, top: 634, bottom: 901 }, // NW
    { y0: 907, y1: 1254, top: 915, bottom: 1182 }, // SW
  ],
};

export interface ElfDirection {
  id: ElfDirectionId;
  label: string;
  arrow: string;
  sheet: SheetGeom;
  row: number;
}

export const ELF_DIRECTIONS: ElfDirection[] = [
  { id: "S", label: "South", arrow: "↓", sheet: SHEET_1, row: 0 },
  { id: "SE", label: "South-East", arrow: "↘", sheet: SHEET_2, row: 1 },
  { id: "E", label: "East", arrow: "→", sheet: SHEET_1, row: 1 },
  { id: "NE", label: "North-East", arrow: "↗", sheet: SHEET_2, row: 0 },
  { id: "N", label: "North", arrow: "↑", sheet: SHEET_1, row: 3 },
  { id: "NW", label: "North-West", arrow: "↖", sheet: SHEET_2, row: 2 },
  { id: "W", label: "West", arrow: "←", sheet: SHEET_1, row: 2 },
  { id: "SW", label: "South-West", arrow: "↙", sheet: SHEET_2, row: 3 },
];

export function elfDirection(id: ElfDirectionId): ElfDirection {
  return ELF_DIRECTIONS.find((d) => d.id === id) ?? ELF_DIRECTIONS[0];
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
): ElfFrameLayout {
  const dir = elfDirection(id);
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
): {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
} {
  const l = elfFrameLayout(id, frame);
  return {
    u0: l.sx / l.sheetW,
    v0: 1 - (l.sy + l.sh) / l.sheetH,
    u1: (l.sx + l.sw) / l.sheetW,
    v1: 1 - l.sy / l.sheetH,
  };
}
