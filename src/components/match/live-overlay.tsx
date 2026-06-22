"use client";

import { useLiveMatch } from "./use-live-match";

/**
 * Live score + match clock for the match detail page, sourced from ESPN via
 * useLiveMatch (/api/live). Renders NOTHING unless ESPN reports this exact match
 * live — so if ESPN is down or the match isn't live there, the page is
 * unchanged (DB scores stand). Display only; never grades.
 */
export function LiveOverlay({
  homeTeam,
  awayTeam,
}: {
  homeTeam: string;
  awayTeam: string;
}) {
  const m = useLiveMatch(homeTeam, awayTeam);
  if (!m) return null;

  // ESPN's full-time flag is terminal — show "Full time" with no pulsing clock,
  // not a frozen ticking minute, once it reports completed. Stops the
  // live↔finished flap while the cron/DB catch up.
  const done = m.completed;

  return (
    <div
      className={
        done
          ? "flex flex-col items-center gap-1 rounded-xl border border-border/60 bg-card/50 py-3"
          : "flex flex-col items-center gap-1 rounded-xl border border-live/40 bg-live/5 py-3"
      }
    >
      <div className="flex items-center gap-2 font-numeric text-3xl tabular-nums">
        <span>{m.homeScore}</span>
        <span className="text-muted-foreground">–</span>
        <span>{m.awayScore}</span>
      </div>
      {done ? (
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Full time
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-live">
          <span className="size-1.5 animate-pulse rounded-full bg-live" />
          {m.clock || "Live"}
        </div>
      )}
    </div>
  );
}
