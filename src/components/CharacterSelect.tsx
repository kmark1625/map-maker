"use client";

import { useCallback, useEffect } from "react";
import Image from "next/image";
import {
  CHARACTER_VARIANTS,
  getVariant,
  stepVariant,
} from "@/data/character-variants";
import { useCharacterStore } from "@/stores/character-store";

function ChevronLeft() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12.5 4L6.5 10l6 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7.5 4l6 6-6 6" />
    </svg>
  );
}

export default function CharacterSelect() {
  const selectedId = useCharacterStore((state) => state.selectedId);
  const select = useCharacterStore((state) => state.select);
  const selected = getVariant(selectedId);
  const position =
    CHARACTER_VARIANTS.findIndex((v) => v.id === selected.id) + 1;

  const step = useCallback(
    (direction: 1 | -1) => {
      select(stepVariant(selected.id, direction).id);
    },
    [select, selected.id],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Choose an elemental variant"
      className="mx-auto flex w-full max-w-xl flex-col"
    >
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="relative aspect-square max-h-[55vh] w-full bg-zinc-900">
          <Image
            key={selected.id}
            src={selected.image}
            alt={`${selected.name} — ${selected.element} elemental variant`}
            fill
            sizes="(max-width: 640px) 100vw, 576px"
            className="object-contain p-4"
            priority
          />
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous variant"
            className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-zinc-900 shadow-md transition hover:bg-zinc-200"
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next variant"
            className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-zinc-900 shadow-md transition hover:bg-zinc-200"
          >
            <ChevronRight />
          </button>
          <p
            aria-hidden="true"
            className="absolute bottom-3 right-4 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold tabular-nums text-white"
          >
            {position} / {CHARACTER_VARIANTS.length}
          </p>
        </div>

        <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div aria-live="polite">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={`h-2.5 w-2.5 rounded-full ${selected.accentDot}`}
              />
              <h2 className="text-xl font-bold tracking-tight">
                {selected.name} · {selected.element}
              </h2>
            </div>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              {selected.description}
            </p>
          </div>

          <div
            role="group"
            aria-label="Variants"
            className="mt-3 flex items-center gap-2"
          >
            {CHARACTER_VARIANTS.map((variant) => {
              const isSelected = variant.id === selected.id;
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => select(variant.id)}
                  aria-label={`Show ${variant.element} variant`}
                  aria-current={isSelected}
                  className={`h-2.5 rounded-full transition-all ${
                    isSelected
                      ? `w-7 ${variant.accentDot}`
                      : "w-2.5 bg-zinc-300 hover:bg-zinc-400 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                  }`}
                />
              );
            })}
          </div>

          <button
            type="button"
            disabled
            title="The map editor is not built yet"
            className="mt-4 w-full cursor-not-allowed rounded-lg bg-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
          >
            Continue to map editor — coming soon
          </button>
        </div>
      </div>
    </section>
  );
}
