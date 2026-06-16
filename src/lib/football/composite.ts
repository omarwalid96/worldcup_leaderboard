import type { FootballProvider, ProviderFixture, ProviderResult } from "./types";
import { openfootballProvider } from "./openfootball";
import { worldcup26Provider, worldcup26AllResults } from "./worldcup26";

/**
 * Near-live provider with a reliable fallback:
 *   - PRIMARY: worldcup26.ir — fixtures + in-play live + results (single source,
 *     so live scores match our fixtures 1:1). Flaky, so it retries internally.
 *   - FALLBACK: openfootball — used for getFixtures only if worldcup26 is fully
 *     unreachable, so seeding/sync never hard-fails.
 *
 * Scores persist to the DB (cron → DB → users), so an outage just means the
 * last-known scores stay until the source recovers.
 */
export const compositeProvider: FootballProvider = {
  name: "worldcup26+openfootball",

  async getFixtures(): Promise<ProviderFixture[]> {
    try {
      const fixtures = await worldcup26Provider.getFixtures();
      if (fixtures.length > 0) return fixtures;
      throw new Error("worldcup26 returned no fixtures");
    } catch {
      // Fallback so we always have a schedule to seed.
      return openfootballProvider.getFixtures();
    }
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
