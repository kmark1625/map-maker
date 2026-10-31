"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type SyntheticEvent,
  type WheelEvent,
} from "react";
import {
  TERRAIN_MAP,
  TOOLS,
  terrainAt,
  useGridStore,
  type TerrainId,
  type ToolId,
} from "@/stores/grid-store";
import {
  baseDiamond,
  cellsInDrawOrder,
  leftFace,
  pickCell,
  rightFace,
  topFace,
  type CellCoord,
} from "@/lib/iso";
import { screenToWorld, type WorldPoint } from "@/lib/geo";

const TOOL_CURSORS: Record<ToolId, string> = {
  select: "cursor-default",
  pan: "cursor-grab",
  paint: "cursor-crosshair",
  erase: "cursor-crosshair",
};

function pointsToString(points: WorldPoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function shiftDown(p: WorldPoint, dy: number): WorldPoint {
  return { x: p.x, y: p.y + dy };
}

function BaseSlab({ n }: { n: number }) {
  const corners = baseDiamond(n);
  const depth = 18;
  const top = corners[0];
  const right = corners[1];
  const bottom = corners[2];
  const left = corners[3];
  return (
    <g>
      <polygon
        points={pointsToString([
          left,
          bottom,
          shiftDown(bottom, depth),
          shiftDown(left, depth),
        ])}
        fill="#44403c"
      />
      <polygon
        points={pointsToString([
          bottom,
          right,
          shiftDown(right, depth),
          shiftDown(bottom, depth),
        ])}
        fill="#57534c"
      />
      <polygon
        points={pointsToString([top, right, bottom, left])}
        fill="#78716c"
        stroke="#57534c"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </g>
  );
}

const CellShape = memo(function CellShape({
  x,
  y,
  terrain,
  selected,
  hovered,
}: {
  x: number;
  y: number;
  terrain: TerrainId;
  selected: boolean;
  hovered: boolean;
}) {
  const cell: CellCoord = { x, y };
  const t = TERRAIN_MAP[terrain];
  const top = pointsToString(topFace(cell));
  return (
    <g>
      <polygon
        points={pointsToString(leftFace(cell))}
        fill={t.left}
        stroke="rgba(0,0,0,0.25)"
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <polygon
        points={pointsToString(rightFace(cell))}
        fill={t.right}
        stroke="rgba(0,0,0,0.25)"
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <polygon
        points={top}
        fill={t.top}
        stroke="rgba(0,0,0,0.28)"
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {hovered && !selected ? (
        <polygon points={top} fill="#ffffff" opacity={0.35} />
      ) : null}
      {selected ? (
        <>
          <polygon
            points={top}
            fill="none"
            stroke="#ffffff"
            strokeWidth={4.5}
            strokeLinejoin="round"
            opacity={0.9}
          />
          <polygon
            points={top}
            fill="none"
            stroke="#1c1917"
            strokeWidth={2}
            strokeDasharray="8 5"
            strokeLinejoin="round"
          />
        </>
      ) : null}
    </g>
  );
});

export default function IsoCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const strokeRef = useRef<"paint" | "erase" | null>(null);
  const [panning, setPanning] = useState(false);

  const tool = useGridStore((s) => s.tool);
  const n = useGridStore((s) => s.n);
  const cells = useGridStore((s) => s.cells);
  const selected = useGridStore((s) => s.selected);
  const hover = useGridStore((s) => s.hover);
  const viewport = useGridStore((s) => s.viewport);
  const fitSignal = useGridStore((s) => s.fitSignal);
  const paintCell = useGridStore((s) => s.paintCell);
  const eraseCell = useGridStore((s) => s.eraseCell);
  const setSelected = useGridStore((s) => s.setSelected);
  const setHover = useGridStore((s) => s.setHover);
  const setViewport = useGridStore((s) => s.setViewport);
  const zoomAt = useGridStore((s) => s.zoomAt);
  const fitGrid = useGridStore((s) => s.fitGrid);

  const drawOrder = useMemo(() => cellsInDrawOrder(n), [n]);
  const toolMeta = TOOLS.find((t) => t.id === tool);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      fitGrid(rect.width, rect.height);
    }
  }, [n, fitSignal, fitGrid]);

  const cellFromEvent = (clientX: number, clientY: number): CellCoord | null => {
    const rect = containerRef.current?.getBoundingClientRect();
    const sx = clientX - (rect?.left ?? 0);
    const sy = clientY - (rect?.top ?? 0);
    return pickCell(screenToWorld(sx, sy, viewport), n);
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (tool === "pan") {
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: viewport.x,
        originY: viewport.y,
      };
      setPanning(true);
      return;
    }
    const cell = cellFromEvent(e.clientX, e.clientY);
    if (!cell) {
      if (tool === "select") setSelected(null);
      return;
    }
    if (tool === "select") {
      setSelected(cell);
    } else if (tool === "paint") {
      paintCell(cell.x, cell.y);
      setSelected(cell);
      strokeRef.current = "paint";
    } else {
      eraseCell(cell.x, cell.y);
      setSelected(cell);
      strokeRef.current = "erase";
    }
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const cell = cellFromEvent(e.clientX, e.clientY);
    setHover(cell);
    const pan = panRef.current;
    if (pan) {
      setViewport({
        x: pan.originX + e.clientX - pan.startX,
        y: pan.originY + e.clientY - pan.startY,
      });
      return;
    }
    const stroke = strokeRef.current;
    if (stroke && cell) {
      if (stroke === "paint") paintCell(cell.x, cell.y);
      else eraseCell(cell.x, cell.y);
      setSelected(cell);
    }
  };

  const endStroke = () => {
    panRef.current = null;
    strokeRef.current = null;
    setPanning(false);
  };

  const handleMouseLeave = () => {
    endStroke();
    setHover(null);
  };

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, {
      sx: e.clientX - rect.left,
      sy: e.clientY - rect.top,
    });
  };

  const stop = (e: SyntheticEvent) => e.stopPropagation();

  const zoomStep = (factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(factor, { sx: rect.width / 2, sy: rect.height / 2 });
  };

  const fit = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    fitGrid(rect.width, rect.height);
  };

  const { x, y, zoom } = viewport;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={endStroke}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
      className={`relative min-w-0 flex-1 touch-none overflow-hidden bg-stone-800 select-none ${
        panning ? "cursor-grabbing" : TOOL_CURSORS[tool]
      }`}
    >
      <svg className="absolute inset-0 h-full w-full">
        <g transform={`translate(${x} ${y}) scale(${zoom})`}>
          <BaseSlab n={n} />
          {drawOrder.map((c) => (
            <CellShape
              key={`${c.x},${c.y}`}
              x={c.x}
              y={c.y}
              terrain={terrainAt(cells, c.x, c.y)}
              selected={selected?.x === c.x && selected?.y === c.y}
              hovered={hover?.x === c.x && hover?.y === c.y}
            />
          ))}
        </g>
      </svg>

      {toolMeta ? (
        <div
          onMouseDown={stop}
          onWheel={stop}
          className="absolute top-3 left-3 rounded-md border border-stone-600 bg-stone-900/90 px-2.5 py-1.5 text-xs text-stone-300 shadow-sm"
        >
          <span className="font-semibold text-white">{toolMeta.label}</span> —{" "}
          {toolMeta.hint}
        </div>
      ) : null}

      <div
        onMouseDown={stop}
        onWheel={stop}
        className="absolute right-4 bottom-4 flex items-center gap-1 rounded-md border border-stone-600 bg-stone-900/90 px-1.5 py-1 shadow-sm"
      >
        <button
          type="button"
          title="Zoom out"
          onClick={() => zoomStep(1 / 1.25)}
          className="rounded px-2 py-0.5 text-sm font-semibold text-stone-200 hover:bg-stone-700"
        >
          −
        </button>
        <span className="w-12 text-center text-xs tabular-nums text-stone-400">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          title="Zoom in"
          onClick={() => zoomStep(1.25)}
          className="rounded px-2 py-0.5 text-sm font-semibold text-stone-200 hover:bg-stone-700"
        >
          +
        </button>
        <button
          type="button"
          title="Fit grid to view"
          onClick={fit}
          className="rounded px-2 py-0.5 text-xs font-medium text-stone-200 hover:bg-stone-700"
        >
          Fit
        </button>
      </div>
    </div>
  );
}
