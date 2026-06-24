import "server-only";
import { and, asc, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";

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
 * Null otherwise. Cheap + indexed, so safe to run in the app layout.
 */
export async function getTodaysTeamMatch(
  country: HypeCountry,
): Promise<TeamHypeMatch | null> {
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
}
