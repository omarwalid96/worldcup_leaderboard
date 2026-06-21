import type { FootballProvider, ProviderFixture, ProviderResult } from "./types";
import { openfootballProvider } from "./openfootball";
import { worldcup26Provider, worldcup26AllResults } from "./worldcup26";
import { espnLiveResults, espnMatchKey } from "./espn";

/**
 * Near-live provider with redundant sources:
 *   - SCHEDULE: worldcup26.ir — fixtures + ids (kept authoritative so our
 *     externalIds stay stable). Flaky, so it retries internally.
 *   - LIVE (preferred): ESPN — overlays live status+score onto the wc26
 *     schedule, matched by team names. ESPN is more reliable for in-play state
 *     and reports a real full-time flag, so its `finished` flips a wc26 match
 *     that's stuck `live` (the stale-feed bug) and the cron then grades it.
 *   - FALLBACK: openfootball — getFixtures only, if wc26 is fully unreachable.
 *
 * ESPN is undocumented and fails soft (espnLiveResults → [] on any error), so a
 * dead/reshaped ESPN just leaves the wc26 status untouched. Scores persist to
 * the DB (cron → DB → users); an outage keeps the last-known scores.
 */

/** Overlay ESPN's live status+score onto wc26 fixtures, ESPN preferred. */
function applyEspnOverlay(
  fixtures: ProviderFixture[],
  espn: Awaited<ReturnType<typeof espnLiveResults>>,
): ProviderFixture[] {
  if (espn.length === 0) return fixtures; // ESPN down/empty → wc26 stands
  const byKey = new Map(espn.map((e) => [e.matchKey, e]));
  return fixtures.map((f) => {
    const key = espnMatchKey(f.homeTeam, f.awayTeam);
    const e = key ? byKey.get(key) : undefined;
    // Only adopt ESPN when it actually reports the match in-play or done —
    // a `scheduled` ESPN entry never overrides a wc26 live/finished state.
    if (!e || e.status === "scheduled") return f;
    return {
      ...f,
      status: e.status,
      homeScore: e.homeScore ?? f.homeScore,
      awayScore: e.awayScore ?? f.awayScore,
    };
  });
}

export const compositeProvider: FootballProvider = {
  name: "espn+worldcup26+openfootball",

  async getFixtures(): Promise<ProviderFixture[]> {
    let fixtures: ProviderFixture[];
    try {
      fixtures = await worldcup26Provider.getFixtures();
      if (fixtures.length === 0) throw new Error("worldcup26 returned no fixtures");
    } catch {
      // Fallback so we always have a schedule to seed.
      fixtures = await openfootballProvider.getFixtures();
    }
    // ESPN-preferred live overlay (soft: [] leaves fixtures unchanged).
    return applyEspnOverlay(fixtures, await espnLiveResults());
  },

  async getLiveMatches(): Promise<ProviderResult[]> {
    try {
      return await worldcup26Provider.getLiveMatches();
    } catch {
      return [];
    }
  },

  async getResult(externalId: string): Promise<ProviderResult | null> {
    try {
      return await worldcup26Provider.getResult(externalId);
    } catch {
      return null;
    }
  },
};

/** All worldcup26 results (live + finished) for sync reconciliation by id. */
export async function getLiveSourceResults(): Promise<ProviderResult[]> {
  try {
    return await worldcup26AllResults();
  } catch {
    return [];
  }
}
