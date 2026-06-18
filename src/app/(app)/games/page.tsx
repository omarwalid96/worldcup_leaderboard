import type { Metadata } from "next";
import { Gamepad2 } from "lucide-react";
import { requireProfile } from "@/lib/auth/session";
import { listMyMatches, listOpponents } from "@/lib/games/queries";
import { playableGames } from "@/lib/games/registry";
import { GamesHub } from "@/components/games/games-hub";
import type { GameDefinitionMeta } from "@/components/games/games-hub";

export const metadata: Metadata = { title: "Games" };

export default async function GamesPage() {
  const profile = await requireProfile();
  const [matches, opponents] = await Promise.all([
    listMyMatches(profile.id),
    listOpponents(profile.id),
  ]);

  // Strip the (non-serializable) reducer/component from definitions for the client.
  const games: GameDefinitionMeta[] = playableGames().map((g) => ({
    type: g.type,
    title: g.title,
    emoji: g.emoji,
    blurb: g.blurb,
    mode: g.mode,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Gamepad2 className="size-7 text-gold" />
        <div>
          <h1 className="font-display text-2xl tracking-tight">Games</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Challenge a friend to a quick duel.
          </p>
        </div>
      </div>

      <GamesHub
        games={games}
        matches={matches}
        opponents={opponents}
        currentUserId={profile.id}
      />
    </div>
  );
}
