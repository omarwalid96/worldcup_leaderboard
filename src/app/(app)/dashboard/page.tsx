import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, Trophy, Target, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MatchCard } from "@/components/match/match-card";
import { LeagueLeaders } from "@/components/leaderboard/league-leaders";
import { SponsorsGallery } from "@/components/sponsors/sponsors-gallery";
import { AiSummaryCard } from "@/components/summary/ai-summary-card";
import { PaperRollBanners } from "@/components/layout/paper-roll-banners";
import { requireProfile } from "@/lib/auth/session";
import { getPredictableMatches } from "@/lib/matches/queries";
import { getMainLeagueLeaders } from "@/lib/leaderboard/queries";
import { listSponsors } from "@/lib/sponsors/actions";
import { getLatestSummary } from "@/lib/summary/queries";
import { getMyComment, listComments } from "@/lib/summary/comments-actions";
import { time } from "@/lib/perf/timing";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  const profile = await requireProfile();
  const [openNow, leaders, sponsors, summary] = await Promise.all([
    time("dashboard: predictable matches", () => getPredictableMatches(profile.id)),
    time("dashboard: league leaders", () => getMainLeagueLeaders()),
    time("dashboard: sponsors", () => listSponsors()),
    time("dashboard: latest summary", () => getLatestSummary()),
  ]);
  const [comments, myComment] = summary
    ? await Promise.all([
        time("dashboard: comments", () => listComments(summary.id)),
        time("dashboard: my comment", () => getMyComment(summary.id)),
      ])
    : [[], null];

  return (
    <div className="flex flex-col gap-6">
      {/* Party paper-roll banners that drop from the top on the home page. */}
      <PaperRollBanners />

      <div>
        <p className="text-sm text-muted-foreground">Welcome back,</p>
        <h1 className="text-2xl font-bold tracking-tight">{profile.displayName}</h1>
      </div>

      {/* Current league leader(s) — crowned */}
      {leaders && <LeagueLeaders data={leaders} />}

      {/* AI Summary — the latest /recap, published to all users. Under Leaders. */}
      <AiSummaryCard
        summary={summary}
        currentUserId={profile.id}
        comments={comments}
        myComment={myComment}
      />

      {/* Quick actions — compact: icon beside the words, single tidy row each. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/matches"
          className="group flex items-center gap-3.5 rounded-xl border border-border/60 bg-card/70 px-4 py-3.5 transition-colors hover:border-primary/40"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <Target className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold leading-tight">ازني يا دولي</p>
            <p className="truncate text-sm text-muted-foreground">Predict before kickoff</p>
          </div>
          <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>

        <Link
          href="/leaderboard"
          className="group flex items-center gap-3.5 rounded-xl border border-border/60 bg-card/70 px-4 py-3.5 transition-colors hover:border-gold/40"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-gold/15 text-gold">
            <Trophy className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold leading-tight">The table</p>
            <p className="truncate text-sm text-muted-foreground">See where you stand</p>
          </div>
          <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
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
