import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth/session";
import { getMatch } from "@/lib/games/queries";
import { getGameDefinition } from "@/lib/games/registry";

export const metadata: Metadata = { title: "Game" };

export default async function GameMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const profile = await requireProfile();

  const match = await getMatch(matchId);
  if (!match) notFound();

  // Only participants may view the match.
  if (match.player1Id !== profile.id && match.player2Id !== profile.id) {
    redirect("/games");
  }

  const def = getGameDefinition(match.gameType);
  if (!def || def.comingSoon) notFound();

  const GameComponent = def.component;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Link
        href="/games"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Games
      </Link>
      <GameComponent
        matchId={matchId}
        initialMatch={match}
        currentUserId={profile.id}
      />
    </div>
  );
}
