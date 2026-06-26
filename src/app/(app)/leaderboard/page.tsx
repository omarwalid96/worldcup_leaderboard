import type { Metadata } from "next";
import { Trophy, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { RealtimeLeaderboard } from "@/components/leaderboard/realtime-leaderboard";
import { LeagueSwitcher } from "@/components/leaderboard/league-switcher";
import { requireProfile } from "@/lib/auth/session";
import {
  getLeaderboard,
  getMainLeaderboard,
  getUserLeagues,
} from "@/lib/leaderboard/queries";
import { time } from "@/lib/perf/timing";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const profile = await requireProfile();
  const { league: requestedId } = await searchParams;

  // Fetch the user's leagues and the default leaderboard in parallel — they're
  // independent. If a specific (allowed) league was requested we fetch that one
  // after the membership check; the common no-param case needs no extra trip.
  const [myLeagues, defaultData] = await Promise.all([
    time("leaderboard: my leagues", () => getUserLeagues(profile.id)),
    time("leaderboard: default standings", () => getMainLeaderboard()),
  ]);

  const allowed = requestedId && myLeagues.some((l) => l.id === requestedId);
  const data = allowed
    ? await time("leaderboard: requested standings", () => getLeaderboard(requestedId!))
    : defaultData;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Trophy className="size-6 shrink-0 text-gold" />
            <span className="truncate">{data?.leagueName ?? "Leaderboard"}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Live standings · updates the moment results land.
          </p>
        </div>
        {data && (
          <div className="flex shrink-0 items-center gap-2">
            <LeagueSwitcher
              leagues={myLeagues.map((l) => ({ id: l.id, name: l.name }))}
              currentId={data.leagueId}
            />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
              <Users className="size-3.5" /> {data.rows.length}
            </span>
          </div>
        )}
      </div>

      {data ? (
        <RealtimeLeaderboard
          key={data.leagueId}
          leagueId={data.leagueId}
          initialRows={data.rows}
          currentUserId={profile.id}
        />
      ) : (
        <Card className="border-dashed border-border/60 bg-card/40">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Trophy className="size-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              No league yet. Standings appear once a league exists.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
