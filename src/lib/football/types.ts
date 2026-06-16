/** Provider-agnostic shapes the rest of the app codes against. */

export type ProviderMatchStatus = "scheduled" | "live" | "finished";

export type ProviderStage =
  | "group"
  | "round_of_32"
  | "round_of_16"
  | "quarter_final"
  | "semi_final"
  | "third_place"
  | "final";

export interface ProviderFixture {
  /** Stable provider id used for idempotent upserts. */
  externalId: string;
  stage: ProviderStage;
  groupName: string | null;
  matchday: number;
  homeTeam: string;
  awayTeam: string;
  /** ISO 3166-1 alpha-2 country code (lowercase) for flag CDN, or null if TBD. */
  homeCode: string | null;
  awayCode: string | null;
  venue: string | null;
  kickoffUtc: string; // ISO 8601, UTC
  status: ProviderMatchStatus;
  homeScore: number | null;
  awayScore: number | null;
}

export interface ProviderResult {
  /** Provider's own id (may not match our externalId across providers). */
  externalId: string;
  /**
   * Cross-provider match key (normalized teams + matchday). Used to reconcile
   * results from a live provider against fixtures seeded from another source.
   */
  matchKey?: string;
  status: ProviderMatchStatus;
  homeScore: number | null;
  awayScore: number | null;
}

/**
 * Single seam every data source implements. Swap providers via FOOTBALL_PROVIDER
 * env var without touching app code.
 */
export interface FootballProvider {
  readonly name: string;
  /** Full fixture list (used for the initial seed and periodic reconciliation). */
  getFixtures(): Promise<ProviderFixture[]>;
  /** Currently in-play matches (polled frequently during live windows). */
  getLiveMatches(): Promise<ProviderResult[]>;
  /** Latest state for a single match by external id. */
  getResult(externalId: string): Promise<ProviderResult | null>;
}
