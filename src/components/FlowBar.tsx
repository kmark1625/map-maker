"use client";

import Image from "next/image";
import Link from "next/link";
import FlowSteps from "@/components/FlowSteps";
import { getVariant } from "@/data/character-variants";
import { useCharacterStore } from "@/stores/character-store";

export default function FlowBar({
  backHref,
  backLabel,
  currentStep,
}: {
  backHref: string;
  backLabel: string;
  currentStep: number;
}) {
  const selectedId = useCharacterStore((s) => s.selectedId);
  const character = getVariant(selectedId);

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <Link
        href={backHref}
        className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        ← {backLabel}
      </Link>
      <div className="min-w-0 flex-1">
        <FlowSteps currentStep={currentStep} />
      </div>
      <div className="flex shrink-0 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 py-1 pr-3 pl-1 dark:border-zinc-700 dark:bg-zinc-800">
        <span className="relative block h-8 w-8 overflow-hidden rounded-md bg-zinc-900">
          <Image
            src={character.image}
            alt=""
            fill
            sizes="32px"
            className="object-contain"
          />
        </span>
        <span className="hidden text-xs font-semibold whitespace-nowrap sm:inline dark:text-zinc-100">
          {character.name} · {character.element}
        </span>
      </div>
    </div>
  );
}
