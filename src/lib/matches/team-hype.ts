import "server-only";
import { unstable_cache } from "next/cache";
import { and, asc, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { LIVE_TAG } from "@/lib/cache/tags";

/** A supported "home crowd" country for the match-day hype banner. */
export type HypeCountry = "egypt" | "brazil";

export interface TeamHypeMatch {
  country: HypeCountry;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  isHome: boolean;
  status: "scheduled" | "live" | "finished";
  /** Our team's goals / opponent's goals — null until a score exists. */
  teamScore: number | null;
  oppScore: number | null;
}

// Name match per country (the provider spells them in English).
const NAME_PATTERN: Record<HypeCountry, string> = {
  egypt: "%egypt%",
  brazil: "%brazil%",
};

/**
 * The next match for `country` if it's within the hype window (kickoff between
 * 18h ago and 18h from now) — i.e. "today's match". Drives the match-day theme.
 * Null otherwise.
 *
 * Cached (60s, keyed by country) and tagged LIVE_TAG: this runs in the app
 * layout on EVERY page nav (twice — egypt + brazil), so caching removes two
 * remote-DB round-trips per tab switch. The result carries the live score, so
 * staleness would matter — but the cron busts LIVE_TAG on every score change,
 * so a live goal updates the banner immediately. The 60s TTL only bounds
 * staleness while the cron is idle (no scoring), which is harmless.
 */
export const getTodaysTeamMatch = unstable_cache(
  async (country: HypeCountry): Promise<TeamHypeMatch | null> => {
    const pattern = NAME_PATTERN[country];
    const [row] = await db
      .select({
        homeTeam: matches.homeTeam,
        awayTeam: matches.awayTeam,
        kickoffUtc: matches.kickoffUtc,
        status: matches.status,
        homeScore: matches.homeScore,
        awayScore: matches.awayScore,
      })
      .from(matches)
      .where(
        and(
          or(ilike(matches.homeTeam, pattern), ilike(matches.awayTeam, pattern)),
          gte(matches.kickoffUtc, sql`now() - interval '18 hours'`),
          lte(matches.kickoffUtc, sql`now() + interval '18 hours'`),
        ),
      )
      .orderBy(asc(matches.kickoffUtc))
      .limit(1);
    if (!row) return null;
    const re = new RegExp(country, "i");
    const isHome = re.test(row.homeTeam);
    return {
      country,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      kickoffUtc: row.kickoffUtc.toISOString(),
      isHome,
      status: row.status as TeamHypeMatch["status"],
      teamScore: isHome ? row.homeScore : row.awayScore,
      oppScore: isHome ? row.awayScore : row.homeScore,
    };
  },
  ["todays-team-match"],
  { revalidate: 60, tags: [LIVE_TAG] },
);
