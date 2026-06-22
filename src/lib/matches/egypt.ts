import "server-only";
import { and, asc, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";

export interface EgyptMatch {
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  isHome: boolean;
  status: "scheduled" | "live" | "finished";
  /** Egypt's goals / opponent's goals — null until a score exists. */
  egyptScore: number | null;
  oppScore: number | null;
}

/**
 * The next Egypt match if it's within the hype window (kickoff between 18h ago
 * and 18h from now) — i.e. "today's match". Drives the match-day theme. Null
 * otherwise. Egypt-only and cheap, so safe to run in the app layout.
 */
export async function getTodaysEgyptMatch(): Promise<EgyptMatch | null> {
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
        or(ilike(matches.homeTeam, "%egypt%"), ilike(matches.awayTeam, "%egypt%")),
        gte(matches.kickoffUtc, sql`now() - interval '18 hours'`),
        lte(matches.kickoffUtc, sql`now() + interval '18 hours'`),
      ),
    )
    .orderBy(asc(matches.kickoffUtc))
    .limit(1);
  if (!row) return null;
  const isHome = /egypt/i.test(row.homeTeam);
  return {
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    kickoffUtc: row.kickoffUtc.toISOString(),
    isHome,
    status: row.status as EgyptMatch["status"],
    egyptScore: isHome ? row.homeScore : row.awayScore,
    oppScore: isHome ? row.awayScore : row.homeScore,
  };
}
