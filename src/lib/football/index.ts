import type { FootballProvider } from "./types";
import { openfootballProvider } from "./openfootball";
import { env } from "@/lib/env";

/**
 * Returns the configured football data provider. Swap sources via the
 * FOOTBALL_PROVIDER env var without touching app code.
 *
 * Today only "openfootball" is implemented (fixtures + final results). Add a
 * keyed live provider here and the cron will merge its in-play scores.
 */
export function getFootballProvider(): FootballProvider {
  switch (env.footballProvider) {
    case "openfootball":
      return openfootballProvider;
    default:
      // Unknown value → fall back to the safe default rather than crashing.
      return openfootballProvider;
  }
}

export * from "./types";
export { teamCode, flagUrl, TEAM_ISO } from "./teams";
