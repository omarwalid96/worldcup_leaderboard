import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { standings, profiles, leagues, leagueMembers } from "@/db/schema";

export interface LeaderboardRow {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
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
      totalPoints: standings.totalPoints,
      rank: standings.rank,
      previousRank: standings.previousRank,
      exactHits: standings.exactHits,
      streak: standings.streak,
    })
    .from(standings)
    .innerJoin(profiles, eq(profiles.id, standings.userId))
    .where(eq(standings.leagueId, leagueId))
    .orderBy(asc(standings.rank), desc(standings.totalPoints));

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
