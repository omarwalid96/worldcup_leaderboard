"use client";

import { Zap } from "lucide-react";
import { TeamFlag } from "@/components/match/team-flag";
import { KickoffTime } from "@/components/match/kickoff-time";
import { cn } from "@/lib/utils";
import type { PredictionHistoryRow } from "@/lib/predictions/history";

function PointsPill({ points }: { points: number | null }) {
  if (points === null) return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
        points > 0
          ? "bg-success/15 text-success"
          : "bg-muted text-muted-foreground",
      )}
    >
      {points > 0 ? `+${points}` : "0"}
    </span>
  );
}

export function PredictionHistory({
  rows,
  fallbackTz,
}: {
  rows: PredictionHistoryRow[];
  fallbackTz: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No picks yet. Lock in your first prediction.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card/40">
      {rows.map((row) => {
        const isFinished = row.status === "finished";
        return (
          <li
            key={row.matchId}
            className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
          >
            {/* Teams + flags */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <TeamFlag code={row.homeCode} alt={row.homeTeam} size={22} />
              <span className="truncate text-sm font-medium">{row.homeTeam}</span>
              <span className="text-xs text-muted-foreground">vs</span>
              <TeamFlag code={row.awayCode} alt={row.awayTeam} size={22} />
              <span className="truncate text-sm font-medium">{row.awayTeam}</span>
            </div>

            {/* Date */}
            <KickoffTime
              kickoffUtc={row.kickoffUtc}
              fallbackTz={fallbackTz}
              format="d MMM"
              className="shrink-0 text-xs text-muted-foreground"
            />

            {/* Pick */}
            <div className="flex items-center gap-1.5">
              {row.isDoubleDown && (
                <Zap className="size-3.5 shrink-0 text-gold" aria-label="Double down" />
              )}
              <span className="font-numeric text-base tabular-nums">
                {row.homePick}–{row.awayPick}
              </span>
            </div>

            {/* Actual result */}
            {isFinished && row.homeScore != null && row.awayScore != null ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                ({row.homeScore}–{row.awayScore})
              </span>
            ) : (
              <span className="shrink-0 w-[48px]" />
            )}

            {/* Points pill */}
            <PointsPill points={isFinished ? row.pointsAwarded : null} />
          </li>
        );
      })}
    </ul>
  );
}
