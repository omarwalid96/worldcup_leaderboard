import "server-only";
import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { standings, profiles, leagues, leagueMembers } from "@/db/schema";
import { LIVE_TAG } from "@/lib/cache/tags";

export interface LeaderboardRow {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  quote: string | null;
  totalPoints: number;
  rank: number;
  previousRank: number;
  exactHits: number;
  streak: number;
}

export interface LeaderboardData {
  leagueId: string;
  leagueName: string;
  inviteCode: string;
  rows: LeaderboardRow[];
}

/** The default "Main League", or null if none exists. */
export async function getDefaultLeague() {
  const [l] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.isDefault, true))
    .limit(1);
  return l ?? null;
}

/** Standings for a league, ordered by rank, joined with member profiles. */
export async function getLeaderboard(
  leagueId: string,
): Promise<LeaderboardData | null> {
  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);
  if (!league) return null;

  const rows = await db
    .select({
      userId: standings.userId,
      username: profiles.username,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
      quote: profiles.quote,
      totalPoints: standings.totalPoints,
      rank: standings.rank,
      previousRank: standings.previousRank,
      exactHits: standings.exactHits,
      streak: standings.streak,
    })
    .from(standings)
    .innerJoin(profiles, eq(profiles.id, standings.userId))
    // Deactivated members are hidden from the leaderboard (their standings row
    // stays in the DB; it reappears on reactivation).
    .where(and(eq(standings.leagueId, leagueId), isNull(profiles.deactivatedAt)))
    // Order by points (the source of truth), not stored rank — a not-yet-ranked
    // row (rank=0, e.g. a newly added member) must never sort above everyone.
    .orderBy(desc(standings.totalPoints), asc(profiles.displayName));

  return {
    leagueId: league.id,
    leagueName: league.name,
    inviteCode: league.inviteCode,
    rows,
  };
}

/** Leagues a user belongs to (for the league switcher). */
export async function getUserLeagues(userId: string) {
  return db
    .select({ id: leagues.id, name: leagues.name, isDefault: leagues.isDefault })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
    .where(eq(leagueMembers.userId, userId))
    .orderBy(desc(leagues.isDefault));
}

/** The user's default-league leaderboard (convenience for the main page). */
export async function getMainLeaderboard(): Promise<LeaderboardData | null> {
  const league = await getDefaultLeague();
  if (!league) return null;
  return getLeaderboard(league.id);
}

export interface LeagueLeaders {
  leagueName: string;
  points: number;
  leaders: LeaderboardRow[]; // everyone tied at the top
}

/**
 * The current #1 of the Main League — all users tied for the top score (dense
 * rank 1). Returns null until someone has scored (top points > 0), so we don't
 * crown anyone at 0–0.
 *
 * Cached: this runs in the app layout on EVERY page nav (and every 5-min
 * LiveRefresher tick) for every user, and leaders only change when the cron
 * grades a match — which busts LIVE_TAG. So the 60s TTL just bounds staleness
 * while the cron is idle. Removes the standings/profiles/leagues joins from the
 * per-request hot path (the Vercel Active-CPU burn — see memory).
 */
export const getMainLeagueLeaders = unstable_cache(
  async (): Promise<LeagueLeaders | null> => {
    const data = await getMainLeaderboard();
    if (!data || data.rows.length === 0) return null;

    const top = Math.max(...data.rows.map((r) => r.totalPoints));
    if (top <= 0) return null;

    return {
      leagueName: data.leagueName,
      points: top,
      leaders: data.rows.filter((r) => r.totalPoints === top),
    };
  },
  ["main-league-leaders"],
  { revalidate: 60, tags: [LIVE_TAG] },
);
