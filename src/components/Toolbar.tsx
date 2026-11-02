"use client";

import type { ReactNode } from "react";
import { TOOLS, useGridStore, type ToolId } from "@/stores/grid-store";
import Icon from "@/components/Icon";

const TOOL_ICONS: Record<ToolId, ReactNode> = {
  select: <path d="M6 3l11 8.5-6.5 1L8 19z" />,
  pan: (
    <>
      <path d="M10 2v16M2 10h16" />
      <path d="M10 2L7.5 4.5M10 2l2.5 2.5M10 18l-2.5-2.5M10 18l2.5-2.5M2 10l2.5-2.5M2 10l2.5 2.5M18 10l-2.5-2.5M18 10l-2.5 2.5" />
    </>
  ),
  paint: (
    <>
      <path d="M13.5 3.5l3 3L8 15l-4.5 1.5L5 12z" />
      <path d="M12 5l3 3" />
    </>
  ),
};

export default function Toolbar() {
  const tool = useGridStore((s) => s.tool);
  const setTool = useGridStore((s) => s.setTool);

  return (
    <nav
      className="flex w-[76px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-stone-300 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900"
      aria-label="Map tools"
    >
      {TOOLS.map((t) => {
        const active = t.id === tool;
        return (
          <button
            key={t.id}
            type="button"
            title={`${t.label} (${t.shortcut}) — ${t.hint}`}
            onClick={() => setTool(t.id)}
            className={`flex flex-col items-center gap-0.5 rounded-md px-1 py-2 ${
              active
                ? "bg-stone-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-stone-600 hover:bg-stone-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            <Icon size={18}>{TOOL_ICONS[t.id]}</Icon>
            <span className="text-[11px] font-medium leading-none">
              {t.label}
            </span>
            <span
              className={`text-[10px] leading-none ${
                active
                  ? "text-stone-300 dark:text-zinc-500"
                  : "text-stone-400 dark:text-zinc-500"
              }`}
            >
              {t.shortcut}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
