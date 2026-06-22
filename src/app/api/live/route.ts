import { NextResponse } from "next/server";
import { getLiveMatches } from "@/lib/matches/queries";
import { teamCodeOf } from "@/lib/football/team-ids";

/**
 * Live-score overlay for the match page. Read-only, decoupled from the cron.
 *
 * Smart polling: this server route caches ESPN's WC scoreboard for 30s, so N
 * concurrent users trigger at most ONE upstream fetch per 30s (Next's fetch
 * cache fans the result out to all of them). 100 users → still ≤120 ESPN
 * hits/hour. ESPN is undocumented, so every read fails SOFT: any error returns
 * an empty overlay and the page keeps showing the DB scores the cron wrote.
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
  period: number;
  completed: boolean; // ESPN says full-time — the stale-LIVE tiebreaker signal
  matchId: string | null; // our DB match id (resolved by FIFA code), for deep-linking
}

export const revalidate = 30; // shared server cache window

export async function GET() {
  try {
    const res = await fetch(ESPN, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`espn ${res.status}`);
    const data = await res.json();

    // DB live matches, keyed by sorted FIFA-code pair, to deep-link each pill
    // to its match page. Cheap (one query per 30s cache window). Fails soft.
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
      matches.push({
        home: homeName,
        away: awayName,
        homeScore: Number(home.score) || 0,
        awayScore: Number(away.score) || 0,
        clock: st.displayClock ?? "",
        period: st.period ?? 0,
        completed: Boolean(st.type?.completed),
        matchId,
      });
    }
    return NextResponse.json({ matches });
  } catch {
    // Fail soft: no overlay, page falls back to DB scores.
    return NextResponse.json({ matches: [] });
  }
}
