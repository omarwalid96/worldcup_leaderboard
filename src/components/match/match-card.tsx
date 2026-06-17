"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Lock, Check, ChevronRight, Zap } from "lucide-react";
import { TeamFlag } from "./team-flag";
import { KickoffTime, KickoffCountdown } from "./kickoff-time";
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
 * When `predictable` (within 12h of kickoff and not yet locked), the WHOLE card
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
  /** True only when the match is in the 12h pre-kickoff window and not locked. */
  predictable?: boolean;
}) {
  const { status, homeScore, awayScore, prediction } = match;
  const isLive = status === "live";
  const isFinished = status === "finished";
  const isUpcoming = status === "scheduled";

  const homeWon = isFinished && (homeScore ?? 0) > (awayScore ?? 0);
  const awayWon = isFinished && (awayScore ?? 0) > (homeScore ?? 0);

  const tappable = isUpcoming && predictable && !prediction?.locked;

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
            <span className="size-1.5 rounded-full bg-live animate-live-pulse" /> Live
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

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3 text-xs">
        {isUpcoming ? (
          <span className="text-muted-foreground">
            <KickoffTime kickoffUtc={match.kickoffUtc} fallbackTz={userTz} format="HH:mm" />
            <KickoffCountdown kickoffUtc={match.kickoffUtc} className="ml-1.5 text-primary" />
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
            prediction.locked ? (
              <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
                <Lock className="size-3.5" /> Locked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-primary">
                <Check className="size-3.5" />
                {prediction.isDoubleDown && <Zap className="size-3.5 text-gold" />}
                {prediction.homePick}–{prediction.awayPick}
                {tappable && (
                  <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                )}
              </span>
            )
          ) : tappable ? (
            <span className="inline-flex items-center gap-1 font-semibold text-gold">
              Predict
              <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          ) : (
            <span className="text-muted-foreground">Opens 12h before</span>
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
    </>
  );

  const baseClass = cn(
    "group relative block rounded-2xl border bg-card/70 p-4 backdrop-blur transition-colors",
    tappable && "hover:border-gold/50",
    isLive && "border-live/40",
  );

  if (tappable) {
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
