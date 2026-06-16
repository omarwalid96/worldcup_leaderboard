import type { FootballProvider } from "./types";
import { openfootballProvider } from "./openfootball";
import { worldcup26Provider } from "./worldcup26";
import { compositeProvider } from "./composite";
import { env } from "@/lib/env";

/**
 * Returns the configured football data provider. Swap sources via the
 * FOOTBALL_PROVIDER env var without touching app code.
 *
 *   worldcup26    → worldcup26.ir near-live + openfootball fallback (default)
 *   worldcup26only→ worldcup26.ir only (no fallback)
 *   openfootball  → fixtures + final results only (no in-play)
 */
export function getFootballProvider(): FootballProvider {
  switch (env.footballProvider) {
    case "openfootball":
      return openfootballProvider;
    case "worldcup26only":
      return worldcup26Provider;
    case "worldcup26":
    case "composite":
      return compositeProvider;
    default:
      return compositeProvider;
  }
}

export * from "./types";
export { teamCode, flagUrl, TEAM_ISO, matchKey } from "./teams";
export { getLiveSourceResults } from "./composite";
