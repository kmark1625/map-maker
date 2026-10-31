"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Toolbar from "@/components/Toolbar";
import IsoCanvas from "@/components/IsoCanvas";
import ThreeCanvas from "@/components/ThreeCanvas";
import GridPanel from "@/components/GridPanel";
import CellInspector from "@/components/CellInspector";
import StatusBar from "@/components/StatusBar";
import Shortcuts from "@/components/Shortcuts";
import FlowSteps from "@/components/FlowSteps";
import { getVariant } from "@/data/character-variants";
import { useCharacterStore } from "@/stores/character-store";
import "@/lib/debug-grid";

type ViewId = "2d" | "3d";

const VIEWS: ReadonlyArray<{ id: ViewId; label: string; title: string }> = [
  { id: "2d", label: "2D Iso", title: "2D isometric SVG editor" },
  { id: "3d", label: "3D", title: "3D Three.js viewer — same saved grid" },
];

const VIEW_HINTS: Record<ViewId, string> = {
  "2d": "Click or drag to paint · Scroll to zoom · F fits the grid",
  "3d": "Drag to orbit · Scroll to zoom · Click to apply the tool",
};

export default function MapEditor() {
  // Both views read the same Zustand grid (n + cells), so switching tabs
  // always shows the same saved tiles — no manual save/load needed.
  const [view, setView] = useState<ViewId>("2d");
  const selectedId = useCharacterStore((s) => s.selectedId);
  const character = getVariant(selectedId);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2">
        <Link
          href="/select"
          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-100"
        >
          ← Characters
        </Link>
        <div className="min-w-0 flex-1">
          <FlowSteps currentStep={2} />
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 py-1 pr-3 pl-1">
          <span className="relative block h-8 w-8 overflow-hidden rounded-md bg-zinc-900">
            <Image
              src={character.image}
              alt=""
              fill
              sizes="32px"
              className="object-contain"
            />
          </span>
          <span className="hidden text-xs font-semibold whitespace-nowrap sm:inline">
            {character.name} · {character.element}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-stone-200 text-stone-900">
        <Shortcuts />
        <header className="flex items-center justify-between border-b border-stone-300 bg-white px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-teal-700 text-white">
              <svg
                width={16}
                height={16}
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 2l7 4v8l-7 4-7-4V6z" />
                <path d="M10 2v8m0 0l7-4M10 10L3 6" />
              </svg>
            </span>
            <h1 className="text-sm font-semibold tracking-tight">Map Editor</h1>
          </div>
          <div
            role="tablist"
            aria-label="View"
            className="flex rounded-md border border-stone-300 bg-stone-100 p-0.5"
          >
            {VIEWS.map((v) => {
              const active = v.id === view;
              return (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  title={v.title}
                  onClick={() => setView(v.id)}
                  className={`rounded px-3 py-1 text-xs font-medium ${
                    active
                      ? "bg-stone-900 text-white shadow-sm"
                      : "text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
          <p className="hidden text-xs text-stone-500 md:block">
            {VIEW_HINTS[view]}
          </p>
        </header>
        <div className="flex min-h-0 flex-1">
          <Toolbar />
          {view === "2d" ? <IsoCanvas /> : <ThreeCanvas />}
          <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-stone-300 bg-stone-100 p-3">
            <GridPanel />
            <CellInspector />
          </aside>
        </div>
        <StatusBar />
      </div>
    </div>
  );
}
