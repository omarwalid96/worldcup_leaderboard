import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, Trophy, Target, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MatchCard } from "@/components/match/match-card";
import { LeagueLeaders } from "@/components/leaderboard/league-leaders";
import { SponsorsGallery } from "@/components/sponsors/sponsors-gallery";
import { requireProfile } from "@/lib/auth/session";
import { getPredictableMatches } from "@/lib/matches/queries";
import { getMainLeagueLeaders } from "@/lib/leaderboard/queries";
import { listSponsors } from "@/lib/sponsors/actions";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  const profile = await requireProfile();
  const [openNow, leaders, sponsors] = await Promise.all([
    getPredictableMatches(profile.id),
    getMainLeagueLeaders(),
    listSponsors(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">Welcome back,</p>
        <h1 className="text-2xl font-bold tracking-tight">{profile.displayName}</h1>
      </div>

      {/* Current league leader(s) — crowned */}
      {leaders && <LeagueLeaders data={leaders} />}

      {/* Quick actions — these light up as later milestones land */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="border-border/60 bg-card/70">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
              <Target className="size-5" />
            </span>
            <CardTitle className="text-base">ازني يا دولي</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Predict upcoming scorelines before kickoff.
            </p>
            <Button asChild size="sm" variant="secondary" className="group shrink-0">
              <Link href="/matches">
                Open <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/70">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <span className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold">
              <Trophy className="size-5" />
            </span>
            <CardTitle className="text-base">The table</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              See where you stand in the league.
            </p>
            <Button asChild size="sm" variant="secondary" className="group shrink-0">
              <Link href="/leaderboard">
                View <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Open to predict now — within 24h of kickoff */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Open to predict
          </h2>
          <Link
            href="/matches"
            className="text-xs font-medium text-gold hover:underline"
          >
            See all
          </Link>
        </div>
        {openNow.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {openNow.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                userTz={profile.timezone}
                predictable
              />
            ))}
          </div>
        ) : (
          <Card className="border-dashed border-border/60 bg-card/40">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <CalendarDays className="size-8 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">
                Nothing to predict right now. Picks open 24 hours before kickoff.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Sponsors gallery — shared, any member can add (up to 10). */}
      <SponsorsGallery initial={sponsors} />
    </div>
  );
}
