"use client";

import { useEffect, useState } from "react";
import { teamCodeOf } from "@/lib/football/team-ids";

/**
 * ESPN live overlay for one match, looked up by FIFA team code. Polls /api/live
 * every 60s while the tab is visible. /api/live caches ESPN server-side for 60s,
 * so any number of cards/pages sharing this hook cause ≤1 upstream fetch/min.
 * Returns null when ESPN has nothing live for this match (page/card falls back
 * to DB values). Display only.
 */
export interface LiveMatch {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  clock: string; // "87'"
  period: number;
  completed: boolean;
}

export function useLiveMatch(
  homeTeam: string,
  awayTeam: string,
  enabled = true,
): LiveMatch | null {
  const [m, setM] = useState<LiveMatch | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const wantHome = teamCodeOf(homeTeam);
    const wantAway = teamCodeOf(awayTeam);
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/live");
        const data: { matches?: LiveMatch[] } = await res.json();
        const hit = (data.matches ?? []).find(
          (x) =>
            teamCodeOf(x.home) === wantHome && teamCodeOf(x.away) === wantAway,
        );
        if (alive) setM(hit ?? null);
      } catch {
        /* fail soft */
      }
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [homeTeam, awayTeam, enabled]);

  return m;
}
