import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leagues, leagueMembers } from "@/db/schema";

export interface LeagueSummary {
  id: string;
  name: string;
  inviteCode: string;
  isDefault: boolean;
  isOwner: boolean;
  memberCount: number;
}

/** Leagues the user belongs to, with member counts (for the leagues page). */
export async function getMyLeagues(userId: string): Promise<LeagueSummary[]> {
  const rows = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      inviteCode: leagues.inviteCode,
      isDefault: leagues.isDefault,
      ownerId: leagues.ownerId,
      memberCount: sql<number>`(
        select count(*)::int from league_members lm where lm.league_id = ${leagues.id}
      )`,
    })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
    .where(eq(leagueMembers.userId, userId))
    .orderBy(desc(leagues.isDefault), leagues.name);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    inviteCode: r.inviteCode,
    isDefault: r.isDefault,
    isOwner: r.ownerId === userId,
    memberCount: r.memberCount,
  }));
}
