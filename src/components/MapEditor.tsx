"use client";

import Link from "next/link";
import Toolbar from "@/components/Toolbar";
import IsoCanvas from "@/components/IsoCanvas";
import GridPanel from "@/components/GridPanel";
import CellInspector from "@/components/CellInspector";
import SuggestPanel from "@/components/SuggestPanel";
import StatusBar from "@/components/StatusBar";
import Shortcuts from "@/components/Shortcuts";
import FlowBar from "@/components/FlowBar";
import "@/lib/debug-grid";

export default function MapEditor() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <FlowBar backHref="/select" backLabel="Characters" currentStep={2} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-stone-200 text-stone-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Shortcuts />
        <header className="flex items-center justify-between border-b border-stone-300 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
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
          <Link
            href="/render"
            className="rounded-md bg-stone-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-stone-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Render Map →
          </Link>
          <p className="hidden text-xs text-stone-500 md:block dark:text-zinc-400">
            Click or drag to paint · F fits the grid
          </p>
        </header>
        <div className="flex min-h-0 flex-1">
          <Toolbar />
          <IsoCanvas />
          <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-stone-300 bg-stone-100 p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <GridPanel />
            <SuggestPanel />
            <CellInspector />
          </aside>
        </div>
        <StatusBar />
      </div>
    </div>
  );
}
