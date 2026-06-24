import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchList } from "@/components/match/match-list";
import { MatchSearch } from "@/components/match/match-search";
import { LiveRefresher } from "@/components/match/live-refresher";
import { requireProfile } from "@/lib/auth/session";
import { getMatchesWithPredictions } from "@/lib/matches/queries";
import { isPredictable } from "@/lib/time/usday";

export const metadata: Metadata = { title: "Matches" };

function EmptyState({ label }: { label: string }) {
  return (
    <Card className="border-dashed border-border/60 bg-card/40">
      <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
        <CalendarDays className="size-8 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export default async function MatchesPage() {
  const profile = await requireProfile();
  const all = await getMatchesWithPredictions(profile.id);

  // "Open" = within the 24h pre-kickoff window; only these are predictable now.
  const open = all.filter((m) => isPredictable(m.kickoffUtc));
  const upcoming = all.filter((m) => m.status === "scheduled");
  const live = all.filter((m) => m.status === "live");
  const finished = all.filter((m) => m.status === "finished");

  return (
    <div className="flex flex-col gap-6">
      {/* Auto-refresh on-screen scores only while a match is live (polls our DB,
          not the football API; every 5 min, visible tab only). */}
      {live.length > 0 && <LiveRefresher />}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Matches</h1>
          <p className="text-sm text-muted-foreground">
            Predictions open 24 hours before kickoff. Tap a card to pick.
          </p>
        </div>
        <Link
          href="/matches/standings"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm font-medium text-gold transition-colors hover:bg-gold/20"
        >
          <Trophy className="size-4" /> Standings
        </Link>
      </div>

      <MatchSearch allMatches={all} userTz={profile.timezone}>
        <Tabs defaultValue={open.length ? "open" : "upcoming"}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="open">
              Open{open.length ? ` (${open.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="live">
              Live{live.length ? ` (${live.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="finished">Results</TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="mt-5">
            {open.length ? (
              <MatchList matches={open} userTz={profile.timezone} />
            ) : (
              <EmptyState label="Nothing open right now. Picks open 24 hours before each match." />
            )}
          </TabsContent>

          <TabsContent value="live" className="mt-5">
            {live.length ? (
              <MatchList matches={live} userTz={profile.timezone} />
            ) : (
              <EmptyState label="Nothing live at the moment. Check back on matchday." />
            )}
          </TabsContent>

          <TabsContent value="upcoming" className="mt-5">
            {upcoming.length ? (
              <MatchList matches={upcoming} userTz={profile.timezone} />
            ) : (
              <EmptyState label="No upcoming matches right now." />
            )}
          </TabsContent>

          <TabsContent value="finished" className="mt-5">
            {finished.length ? (
              <MatchList matches={[...finished].reverse()} userTz={profile.timezone} />
            ) : (
              <EmptyState label="No finished matches yet." />
            )}
          </TabsContent>
        </Tabs>
      </MatchSearch>
    </div>
  );
}
