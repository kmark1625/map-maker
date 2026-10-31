import Link from "next/link";
import CharacterSelect from "@/components/CharacterSelect";
import FlowSteps from "@/components/FlowSteps";

export default function SelectPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 pb-6 pt-4 sm:px-8">
      <FlowSteps currentStep={1} />

      <CharacterSelect />
    </main>
  );
}
