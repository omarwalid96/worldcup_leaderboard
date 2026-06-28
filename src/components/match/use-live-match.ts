"use client";

import { useEffect, useState } from "react";
import { teamCodeOf } from "@/lib/football/team-ids";

/**
 * ESPN live overlay for one match, looked up by FIFA team code. Polls /api/live
 * every 20s while the tab is visible. /api/live caches ESPN server-side for 30s,
 * so any number of cards/pages sharing this hook cause ≤2 upstream fetches/min.
 * Returns null when ESPN has nothing live for this match (page/card falls back
 * to DB values). Display only.
 */
export interface LiveMatch {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  clock: string; // "87'"
  period: number; // 1 H1, 2 H2/HT, 3-4 extra time, 5 penalties
  detail: string; // ESPN phase text e.g. "Halftime", "Penalty Shootout"
  completed: boolean;
  shootoutHome: number | null; // live pens score, null outside a shootout
  shootoutAway: number | null;
}

/**
 * Short live-phase label from ESPN's period/clock, for the card status pill.
 * Falls back to the raw clock (or "Live") when ESPN gives no period — so a
 * missing/flaky ESPN overlay never regresses below today's behavior.
 */
export function livePhaseLabel(m: Pick<LiveMatch, "clock" | "period" | "detail">): string {
  switch (m.period) {
    case 5:
      return "Pens";
    case 4:
    case 3:
      // Extra time — keep the running clock if present (e.g. "105'").
      return m.clock ? `ET ${m.clock}` : "Extra time";
    case 2:
      // Halftime shows clock "45'" with the break; the detail text disambiguates.
      if (/half-?time/i.test(m.detail)) return "HT";
      return m.clock || "Live";
    default:
      return m.clock || "Live";
  }
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
        // no-store + cache-bust: the browser must actually re-hit our route
        // each poll (else it serves the cached body and the minute never
        // updates until a navigation). ESPN is still shielded by the route's
        // own 60s server cache, so this adds no upstream load.
        const res = await fetch(`/api/live?t=${Math.floor(Date.now() / 15_000)}`, {
          cache: "no-store",
        });
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
    // Poll every 20s so the minute tracks closely. ESPN is unaffected — the
    // /api/live route caches it 30s server-side, so polls share that fetch.
    const id = setInterval(poll, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [homeTeam, awayTeam, enabled]);

  return m;
}
