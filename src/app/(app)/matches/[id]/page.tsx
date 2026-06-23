import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, MapPin, BarChart3 } from "lucide-react";
import { ScorePicker } from "@/components/match/score-picker";
import { KickoffTime, PredictionCountdown } from "@/components/match/kickoff-time";
import { FriendsPicks } from "@/components/match/friends-picks";
import { MatchAdmin } from "@/components/admin/match-admin";
import { LiveRefresher } from "@/components/match/live-refresher";
import { FieldHero } from "@/components/match/field-hero";
import { MatchExtras } from "@/components/match/match-extras";
import { requireProfile } from "@/lib/auth/session";
import { getMatchForPrediction, getMatchPredictions } from "@/lib/predictions/queries";
import { isPredictable } from "@/lib/time/usday";

export const metadata: Metadata = { title: "Make your pick" };

const STAGE_LABEL: Record<string, string> = {
  group: "Group",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter_final: "Quarter-final",
  semi_final: "Semi-final",
  third_place: "Third place",
  final: "Final",
};

export default async function PredictPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const [data, friendsPicks] = await Promise.all([
    getMatchForPrediction(id, profile.id),
    getMatchPredictions(id, profile.id),
  ]);
  if (!data) notFound();

  const { match, locked, prediction } = data;
  // Editable only within the 24h pre-kickoff window AND before kickoff.
  const inWindow = isPredictable(match.kickoffUtc);
  const editable = inWindow && !locked;
  const isGraded = match.status === "finished";
  const isKnockout = match.stage !== "group";
  const stageText =
    match.stage === "group"
      ? `Group ${match.groupName ?? ""}`.trim()
      : (STAGE_LABEL[match.stage] ?? match.stage);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      {/* Auto-refresh the score while this match is live (polls our DB, 5 min). */}
      {match.status === "live" && <LiveRefresher />}

      <Link
        href="/matches"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All matches
      </Link>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-primary">
          {stageText}
        </span>
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

      {/* Football-pitch hero: live (ESPN score/clock) or finished (final score). */}
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

      {/* Goals + cards timeline inline (live + recent finished; fails soft). */}
      {match.status !== "scheduled" && (
        <MatchExtras
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
          live={match.status === "live"}
          show={["timeline"]}
        />
      )}

      {/* Stats + lineups live on their own page so predictions stay the focus
          here. Only relevant once the match has started. */}
      {match.status !== "scheduled" && (
        <Link
          href={`/matches/${id}/stats`}
          className="flex items-center justify-between rounded-xl border border-border/60 bg-card/50 px-4 py-3 text-sm font-medium transition-colors hover:bg-card"
        >
          <span className="inline-flex items-center gap-2">
            <BarChart3 className="size-4 text-gold" /> Match stats &amp; lineups
          </span>
          <span className="text-muted-foreground">→</span>
        </Link>
      )}

      {/* Live countdown to the lock — coarse until the final 10 min, then a
          ticking mm:ss with an urgent red pulse. */}
      {editable && (
        <div className="flex items-center justify-center rounded-xl border border-border/60 bg-card/50 py-2.5 text-sm">
          <PredictionCountdown kickoffUtc={match.kickoffUtc} withLabel />
        </div>
      )}

      <ScorePicker
        matchId={match.id}
        home={{ name: match.homeTeam, code: match.homeCode }}
        away={{ name: match.awayTeam, code: match.awayCode }}
        initialHome={prediction?.homePick ?? null}
        initialAway={prediction?.awayPick ?? null}
        initialDoubleDown={prediction?.isDoubleDown ?? false}
        locked={!editable}
        lockReason={
          !inWindow && !locked
            ? "Predictions open 24 hours before kickoff."
            : undefined
        }
        isKnockout={match.stage !== "group"}
        initialPensWinner={prediction?.pensWinner ?? null}
        initialPensHome={prediction?.pensHomePick ?? null}
        initialPensAway={prediction?.pensAwayPick ?? null}
      />

      {editable && (
        <p className="text-center text-xs text-muted-foreground">
          {isKnockout
            ? "Exact 3 · correct result 1 · exact draw 2 · pens +1 winner, +1 exact."
            : "Exact score = 3 pts · correct result = 1 pt. Picks lock at kickoff."}
        </p>
      )}

      {/* Actual shootout result, once recorded (visible to everyone) */}
      {match.wentToPens && match.pensHome != null && match.pensAway != null && (
        <div className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5 text-center text-sm font-medium text-gold">
          Won on penalties {match.pensHome}–{match.pensAway}
        </div>
      )}

      {/* Admin-only: record the shootout result for a knockout */}
      {profile.isAdmin && isKnockout && (
        <MatchAdmin
          matchId={match.id}
          homeName={match.homeTeam}
          awayName={match.awayTeam}
          wentToPens={match.wentToPens}
          pensHome={match.pensHome}
          pensAway={match.pensAway}
        />
      )}

      <FriendsPicks
        picks={friendsPicks}
        currentUserId={profile.id}
        graded={isGraded}
        live={match.status === "live"}
        liveHome={match.homeScore}
        liveAway={match.awayScore}
        isKnockout={isKnockout}
      />
    </div>
  );
}
