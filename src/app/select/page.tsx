import Link from "next/link";
import CharacterSelect from "@/components/CharacterSelect";
import FlowSteps from "@/components/FlowSteps";

export default function SelectPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-6 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Map Maker
          </h1>
          <p className="mt-1 max-w-lg text-zinc-600 dark:text-zinc-400">
            Pick your character&apos;s elemental variant to begin — then build
            the map they adventure through.
          </p>
        </div>
        <nav aria-label="Secondary" className="flex gap-2">
          <Link
            href="/"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            ← Title
          </Link>
          <Link
            href="/assets"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Asset gallery
          </Link>
        </nav>
      </header>

      <FlowSteps currentStep={1} />

      <CharacterSelect />
    </main>
  );
}
