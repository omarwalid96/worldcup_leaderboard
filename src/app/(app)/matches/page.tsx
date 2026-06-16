import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchList } from "@/components/match/match-list";
import { requireProfile } from "@/lib/auth/session";
import { getMatchesWithPredictions } from "@/lib/matches/queries";

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

  const upcoming = all.filter((m) => m.status === "scheduled");
  const live = all.filter((m) => m.status === "live");
  const finished = all.filter((m) => m.status === "finished");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Matches</h1>
        <p className="text-sm text-muted-foreground">
          Tap an upcoming match to predict the scoreline.
        </p>
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="upcoming">
            Upcoming{upcoming.length ? ` (${upcoming.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="live">
            Live{live.length ? ` (${live.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="finished">Results</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-5">
          {upcoming.length ? (
            <MatchList matches={upcoming} userTz={profile.timezone} />
          ) : (
            <EmptyState label="No upcoming matches right now." />
          )}
        </TabsContent>

        <TabsContent value="live" className="mt-5">
          {live.length ? (
            <MatchList matches={live} userTz={profile.timezone} />
          ) : (
            <EmptyState label="Nothing live at the moment. Check back on matchday." />
          )}
        </TabsContent>

        <TabsContent value="finished" className="mt-5">
          {finished.length ? (
            <MatchList matches={[...finished].reverse()} userTz={profile.timezone} />
          ) : (
            <EmptyState label="No finished matches yet." />
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-5">
          <MatchList matches={all} userTz={profile.timezone} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
