"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Lock, Check, ChevronRight } from "lucide-react";
import { TeamFlag } from "./team-flag";
import { KickoffTime, PredictionCountdown } from "./kickoff-time";
import { CardPicks } from "./card-picks";
import { useLiveMatch, livePhaseLabel } from "./use-live-match";
import { cn } from "@/lib/utils";
import type { MatchWithPrediction } from "@/lib/matches/queries";

const STAGE_LABEL: Record<string, string> = {
  group: "Group",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter_final: "Quarter-final",
  semi_final: "Semi-final",
  third_place: "Third place",
  final: "Final",
};

function stageLabel(stage: string, group: string | null): string {
  if (stage === "group") return group ? `Group ${group}` : "Group";
  return STAGE_LABEL[stage] ?? stage;
}

function TeamRow({
  name,
  code,
  score,
  emphasize,
}: {
  name: string;
  code: string | null;
  score: number | null;
  emphasize: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <TeamFlag code={code} alt={name} size={26} />
        <span className={cn("truncate text-sm", emphasize ? "font-bold" : "font-medium")}>
          {name}
        </span>
      </div>
      {score != null && (
        <span className={cn("font-numeric text-2xl leading-none", emphasize ? "text-gold" : "text-foreground")}>
          {score}
        </span>
      )}
    </div>
  );
}

/**
 * Match card with three visual states (scheduled / live / finished).
 * When `predictable` (within 24h of kickoff and not yet locked), the WHOLE card
 * is a tappable link to the prediction page with a snappy press animation.
 * Otherwise it's static.
 */
export function MatchCard({
  match,
  userTz,
  predictable = false,
}: {
  match: MatchWithPrediction;
  userTz: string;
  /** True only when the match is in the 24h pre-kickoff window and not locked. */
  predictable?: boolean;
}) {
  const { status, prediction } = match;
  const isUpcoming = status === "scheduled";

  // While the DB says live, prefer ESPN's score+minute (fresher than the cron's
  // DB write). Falls back to DB values if ESPN has nothing for this match.
  const live = useLiveMatch(match.homeTeam, match.awayTeam, status === "live");
  const homeScore = live ? live.homeScore : match.homeScore;
  const awayScore = live ? live.awayScore : match.awayScore;

  // ESPN's full-time flag is terminal: if ESPN says completed, show Full time
  // even while the DB is still stuck `live` (stale wc26 feed / cron lag). This
  // stops the pill flapping live↔finished. The cron still does the real grade;
  // this only fixes display. Never the reverse — ESPN never re-opens a match
  // the DB already marked finished.
  const isFinished = status === "finished" || (status === "live" && live?.completed === true);
  const isLive = status === "live" && !isFinished;

  const homeWon = isFinished && (homeScore ?? 0) > (awayScore ?? 0);
  const awayWon = isFinished && (awayScore ?? 0) > (homeScore ?? 0);

  // Has kickoff passed? Server-authoritative `prediction.locked` is the SSR-safe
  // base; after mount we also check the clock so a kicked-off-but-still-
  // "scheduled" match (cron status lag) is treated as locked. Starting from the
  // SSR value avoids a hydration mismatch.
  const [kickedOff, setKickedOff] = useState<boolean>(prediction?.locked === true);
  useEffect(() => {
    if (new Date(match.kickoffUtc).getTime() <= Date.now()) setKickedOff(true);
  }, [match.kickoffUtc]);

  // Picks are visible once the match has locked OR the cron marked it live/finished.
  const showPicks = !isUpcoming || kickedOff;
  // `tappable` = the predict-CTA state (drives the gold hover + press anim).
  const tappable = isUpcoming && predictable && !kickedOff;
  // `linkable` = the whole card opens the detail page. True whenever there's a
  // detail page worth seeing: an editable upcoming match, OR a live/finished one
  // (score, full league picks, ESPN goals+cards timeline). The League-picks
  // expander stops propagation, so it still toggles without navigating.
  const linkable = tappable || isLive || isFinished;

  const inner = (
    <>
      {/* Header: stage + status */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {stageLabel(match.stage, match.groupName)}
          {match.venue ? ` · ${match.venue}` : ""}
        </span>
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-live/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-live">
            <span className="size-1.5 rounded-full bg-live animate-live-pulse" />
            {live ? livePhaseLabel(live) : "Live"}
          </span>
        ) : isFinished ? (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Full time
          </span>
        ) : (
          <span className="text-[11px] font-medium text-muted-foreground">
            <KickoffTime kickoffUtc={match.kickoffUtc} fallbackTz={userTz} format="EEE d MMM" />
          </span>
        )}
      </div>

      {/* Teams */}
      <div className="flex flex-col gap-2">
        <TeamRow name={match.homeTeam} code={match.homeCode} score={isUpcoming ? null : homeScore} emphasize={homeWon} />
        <TeamRow name={match.awayTeam} code={match.awayCode} score={isUpcoming ? null : awayScore} emphasize={awayWon} />
      </div>

      {/* Live penalty shootout score (only while ESPN reports one). */}
      {isLive && live?.shootoutHome != null && live?.shootoutAway != null && (
        <div className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-live">
          🥅 Pens {live.shootoutHome}–{live.shootoutAway}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3 text-xs">
        {isUpcoming ? (
          <span className="text-muted-foreground">
            <KickoffTime kickoffUtc={match.kickoffUtc} fallbackTz={userTz} format="HH:mm" />
            <PredictionCountdown kickoffUtc={match.kickoffUtc} className="ml-1.5" />
          </span>
        ) : (
          <span className="text-muted-foreground">
            Your pick:{" "}
            {prediction ? (
              <span className="font-semibold text-foreground tabular-nums">
                {prediction.homePick}–{prediction.awayPick}
              </span>
            ) : (
              <span className="italic">none</span>
            )}
          </span>
        )}

        {/* Right side: pick status / result */}
        {isUpcoming ? (
          prediction ? (
            kickedOff ? (
              <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
                <Lock className="size-3.5" /> Locked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-primary">
                <Check className="size-3.5" />
                {/* Double-down disabled for now (kept for future use):
                {prediction.isDoubleDown && <Zap className="size-3.5 text-gold" />} */}
                {prediction.homePick}–{prediction.awayPick}
                {tappable && (
                  <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                )}
              </span>
            )
          ) : tappable ? (
            <span className="inline-flex items-center gap-1 font-semibold text-gold">
              ازني يا دولي
              <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          ) : kickedOff ? (
            <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
              <Lock className="size-3.5" /> Locked
            </span>
          ) : (
            <span className="text-muted-foreground">Opens 24h before</span>
          )
        ) : prediction?.pointsAwarded != null ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-bold tabular-nums",
              prediction.pointsAwarded > 0
                ? "bg-success/15 text-success"
                : "bg-muted text-muted-foreground",
            )}
          >
            {prediction.pointsAwarded > 0 ? `+${prediction.pointsAwarded}` : "0"} pts
          </span>
        ) : null}
      </div>

      {/* Once locked (or live/finished): expand to see everyone's picks inline. */}
      {showPicks && (
        <CardPicks
          matchId={match.id}
          graded={isFinished}
          live={isLive}
          liveHome={homeScore}
          liveAway={awayScore}
          isKnockout={match.stage !== "group"}
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
        />
      )}
    </>
  );

  const baseClass = cn(
    "group relative block rounded-2xl border bg-card p-4 transition-colors",
    tappable && "hover:border-gold/50",
    linkable && !tappable && "hover:border-border",
    isLive && "border-live/40",
  );

  if (linkable) {
    return (
      <motion.div
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 700, damping: 30 }}
      >
        <Link href={`/matches/${match.id}`} className={baseClass}>
          {inner}
        </Link>
      </motion.div>
    );
  }

  return <div className={baseClass}>{inner}</div>;
}
