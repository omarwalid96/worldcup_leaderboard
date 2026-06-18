import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { TriviaParty } from "@/components/games/trivia/trivia-party";

export const metadata: Metadata = { title: "Party Trivia" };

export default function TriviaPartyPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Link
        href="/games"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Games
      </Link>
      <TriviaParty />
    </div>
  );
}
