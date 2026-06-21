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

  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-live/40 bg-live/5 py-3">
      <div className="flex items-center gap-2 font-numeric text-3xl tabular-nums">
        <span>{m.homeScore}</span>
        <span className="text-muted-foreground">–</span>
        <span>{m.awayScore}</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-live">
        <span className="size-1.5 animate-pulse rounded-full bg-live" />
        {m.clock || "Live"}
      </div>
    </div>
  );
}
