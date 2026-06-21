import type { ProviderMatchStatus } from "./types";
import { teamCodeOf } from "./team-ids";

/**
 * ESPN hidden API (site.api.espn.com) — secondary live source, ESPN-preferred.
 *
 * No key, CDN-backed (cache-control max-age=6), built for heavy polling. It
 * reports a true match status (`pre`/`in`/`post` + `completed`) AND a ticking
 * clock — things worldcup26.ir doesn't give us.
 *
 * It's UNDOCUMENTED: the JSON shape can change with no warning. So every read
 * fails SOFT (returns []), and we use it only to OVERLAY live status/score onto
 * the worldcup26.ir schedule — never as the source of truth (ESPN ids don't
 * match our externalIds, so we reconcile by normalized team names).
 */
const ESPN =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

export interface EspnLive {
  /** "HOMECODE|AWAYCODE" (FIFA codes) for reconciliation against our fixtures. */
  matchKey: string;
  status: ProviderMatchStatus;
  homeScore: number | null;
  awayScore: number | null;
}

/** Cross-provider match key from FIFA team codes, or null if either is unknown. */
export function espnMatchKey(home: string, away: string): string | null {
  const h = teamCodeOf(home);
  const a = teamCodeOf(away);
  return h && a ? `${h}|${a}` : null;
}

/** ESPN state → our status. `completed` is the authoritative full-time flag. */
function statusOf(state: string, completed: boolean): ProviderMatchStatus {
  if (completed || state === "post") return "finished";
  if (state === "in") return "live";
  return "scheduled";
}

/**
 * Current ESPN scoreboard as live overlays keyed by team names. Returns [] on
 * any failure (down, timeout, reshaped JSON) so callers degrade to wc26.
 */
export async function espnLiveResults(): Promise<EspnLive[]> {
  try {
    const res = await fetch(ESPN, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`espn ${res.status}`);
    const data = await res.json();
    const out: EspnLive[] = [];
    for (const e of data?.events ?? []) {
      const st = e?.status;
      const comp = e?.competitions?.[0];
      const c = comp?.competitors ?? [];
      const home = c.find((x: { homeAway: string }) => x.homeAway === "home");
      const away = c.find((x: { homeAway: string }) => x.homeAway === "away");
      if (!home || !away) continue;
      const homeName = home.team?.displayName;
      const awayName = away.team?.displayName;
      if (!homeName || !awayName) continue;
      const matchKey = espnMatchKey(homeName, awayName);
      if (!matchKey) continue; // unknown team spelling → skip (wc26 stands)
      out.push({
        matchKey,
        status: statusOf(st?.type?.state ?? "", Boolean(st?.type?.completed)),
        homeScore: home.score == null ? null : Number(home.score),
        awayScore: away.score == null ? null : Number(away.score),
      });
    }
    return out;
  } catch {
    return [];
  }
}
