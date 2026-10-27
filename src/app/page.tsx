import HelloCounter from "@/components/HelloCounter";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Hello World
      </h1>
      <p className="max-w-md text-balance text-zinc-600 dark:text-zinc-400">
        Welcome to Map Maker — a Hello World stub built with Next.js,
        Zustand, and Tailwind CSS.
      </p>
      <HelloCounter />
    </main>
  );
}
