import type { Metadata } from "next";
import { Trophy, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { RealtimeLeaderboard } from "@/components/leaderboard/realtime-leaderboard";
import { requireProfile } from "@/lib/auth/session";
import { getMainLeaderboard } from "@/lib/leaderboard/queries";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage() {
  const profile = await requireProfile();
  const data = await getMainLeaderboard();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Trophy className="size-6 text-gold" />
            {data?.leagueName ?? "Leaderboard"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Live standings · updates the moment results land.
          </p>
        </div>
        {data && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <Users className="size-3.5" /> {data.rows.length}
          </span>
        )}
      </div>

      {data ? (
        <RealtimeLeaderboard
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
