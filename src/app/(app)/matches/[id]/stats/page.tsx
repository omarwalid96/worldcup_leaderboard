import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, MapPin } from "lucide-react";
import { KickoffTime } from "@/components/match/kickoff-time";
import { FieldHero } from "@/components/match/field-hero";
import { MatchExtras } from "@/components/match/match-extras";
import { LiveRefresher } from "@/components/match/live-refresher";
import { requireProfile } from "@/lib/auth/session";
import { getMatchForPrediction } from "@/lib/predictions/queries";

export const metadata: Metadata = { title: "Match stats & lineups" };

/**
 * Match stats / lineups / timeline on their own page, so the prediction page
 * stays focused on picks (the app's main feature). Linked from the detail page;
 * only meaningful once a match is live/finished.
 */
export default async function MatchStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const data = await getMatchForPrediction(id, profile.id);
  if (!data) notFound();

  const { match } = data;
  const isGraded = match.status === "finished";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      {match.status === "live" && <LiveRefresher />}

      <Link
        href={`/matches/${id}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to predictions
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight">
          {match.homeTeam} vs {match.awayTeam}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <KickoffTime
            kickoffUtc={match.kickoffUtc}
            fallbackTz={profile.timezone}
            format="EEE d MMM · HH:mm"
          />
          {match.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {match.venue}
            </span>
          )}
        </div>
      </div>

      {(match.status === "live" || isGraded) && (
        <FieldHero
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
          homeCode={match.homeCode}
          awayCode={match.awayCode}
          dbHome={match.homeScore}
          dbAway={match.awayScore}
          status={match.status === "live" ? "live" : "finished"}
        />
      )}

      {match.status !== "scheduled" ? (
        <MatchExtras
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
          live={match.status === "live"}
          show={["lineups", "stats", "players"]}
        />
      ) : (
        <p className="rounded-xl border border-border/60 bg-card/40 p-6 text-center text-sm text-muted-foreground">
          Stats &amp; lineups appear once the match kicks off.
        </p>
      )}
    </div>
  );
}
