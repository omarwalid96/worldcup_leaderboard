import { NextResponse } from "next/server";
import { getLiveMatches } from "@/lib/matches/queries";
import { teamCodeOf } from "@/lib/football/team-ids";
import { liveShootoutScore } from "@/lib/football/espn";

/**
 * Live-score overlay for the match page. Read-only, decoupled from the cron.
 *
 * Smart polling: this server route caches ESPN's WC scoreboard for 10s (see
 * `revalidate` below for why 10 and not longer), so N concurrent users trigger
 * at most ONE upstream fetch per 10s (Next's fetch cache fans the result out to
 * all of them). ~6 ESPN hits/min regardless of how many people are watching.
 * ESPN is undocumented, so every read fails SOFT: any error returns an empty
 * overlay and the page keeps showing the DB scores the cron wrote.
 *
 * This NEVER writes to the DB or grades — grading stays cron-authoritative.
 * ponytail: Next fetch-cache is the proxy+cache layer; no Redis needed.
 */
const ESPN =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

interface LiveMatch {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  clock: string; // "60'"
  period: number; // 1 H1, 2 H2/HT, 3-4 extra time, 5 penalties
  detail: string; // ESPN phase text e.g. "Halftime", "2nd Half - Extra Time", "Penalty Shootout"
  completed: boolean; // ESPN says full-time — the stale-LIVE tiebreaker signal
  // Live penalty-shootout score (ESPN competitor.shootoutScore), null outside pens.
  shootoutHome: number | null;
  shootoutAway: number | null;
  matchId: string | null; // our DB match id (resolved by FIFA code), for deep-linking
}

// 10s shared server cache: short enough that the scoreboard tracks ESPN goals
// closely (the events list below it polls the summary endpoint, so a longer
// window here made the score visibly trail the goals — France 1-0 while two
// goals were already listed). All clients share this one fetch → ~6 ESPN
// hits/min total regardless of how many people are watching.
export const revalidate = 10; // shared server cache window

export async function GET() {
  try {
    const res = await fetch(ESPN, {
      next: { revalidate: 10 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`espn ${res.status}`);
    const data = await res.json();

    // DB live matches, keyed by sorted FIFA-code pair, to deep-link each pill
    // to its match page. Cheap (one query per 10s cache window). Fails soft.
    // Key by the FIFA-code pair derived from the DB *team names* (the stored
    // home_code/away_code are ISO-2 flag codes, not FIFA codes — different space).
    const dbById = new Map<string, string>();
    try {
      for (const m of await getLiveMatches()) {
        const hc = teamCodeOf(m.homeTeam);
        const ac = teamCodeOf(m.awayTeam);
        if (hc && ac) dbById.set([hc, ac].sort().join("-"), m.id);
      }
    } catch {
      /* no deep-link; pills still link to /matches */
    }

    const matches: LiveMatch[] = [];
    for (const e of data?.events ?? []) {
      const st = e?.status;
      const state = st?.type?.state;
      // Emit in-play AND just-finished matches: a `post`/completed entry is how
      // the client learns ESPN says full-time while our DB is still stuck
      // `live` (stale wc26 feed). Skip only `pre` (not started yet).
      if (state !== "in" && state !== "post") continue;
      const comp = e?.competitions?.[0];
      const c = comp?.competitors ?? [];
      const home = c.find((x: { homeAway: string }) => x.homeAway === "home");
      const away = c.find((x: { homeAway: string }) => x.homeAway === "away");
      if (!home || !away) continue;
      const homeName = home.team?.displayName ?? "";
      const awayName = away.team?.displayName ?? "";
      const hc = teamCodeOf(homeName);
      const ac = teamCodeOf(awayName);
      const matchId =
        hc && ac ? (dbById.get([hc, ac].sort().join("-")) ?? null) : null;
      const period = st.period ?? 0;
      // Pens score isn't in the scoreboard payload — only in the summary
      // endpoint's keyEvents. Fetch that one match's summary ONLY when ESPN says
      // we're in the shootout (period 5), so we don't pull a summary per match
      // every poll. Fails soft to null (label still shows "Pens").
      let shootoutHome: number | null = null;
      let shootoutAway: number | null = null;
      if (period >= 5 && e?.id) {
        const sh = await liveShootoutScore(String(e.id));
        if (sh) {
          shootoutHome = sh.home;
          shootoutAway = sh.away;
        }
      }
      matches.push({
        home: homeName,
        away: awayName,
        homeScore: Number(home.score) || 0,
        awayScore: Number(away.score) || 0,
        clock: st.displayClock ?? "",
        period,
        detail: st.type?.detail ?? st.type?.shortDetail ?? "",
        completed: Boolean(st.type?.completed),
        shootoutHome,
        shootoutAway,
        matchId,
      });
    }
    return NextResponse.json({ matches });
  } catch {
    // Fail soft: no overlay, page falls back to DB scores.
    return NextResponse.json({ matches: [] });
  }
}
