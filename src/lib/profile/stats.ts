import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  predictions,
  standings,
  leagues,
  userBadges,
  badges,
  pointsHistory,
} from "@/db/schema";

export interface ProfileStats {
  totalPoints: number;
  rank: number | null;
  previousRank: number | null;
  streak: number;
  exactHits: number;
  /** Share of graded picks that got at least the result right (0..1). */
  accuracy: number;
  gradedCount: number;
  predictionsMade: number;
}

/** Aggregate stats for a user within the default league (the "Main League"). */
export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const [defaultLeague] = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(eq(leagues.isDefault, true))
    .limit(1);

  let standingRow:
    | { totalPoints: number; rank: number; previousRank: number; streak: number; exactHits: number }
    | undefined;

  if (defaultLeague) {
    [standingRow] = await db
      .select({
        totalPoints: standings.totalPoints,
        rank: standings.rank,
        previousRank: standings.previousRank,
        streak: standings.streak,
        exactHits: standings.exactHits,
      })
      .from(standings)
      .where(and(eq(standings.leagueId, defaultLeague.id), eq(standings.userId, userId)))
      .limit(1);
  }

  // Accuracy from the predictions ledger (counts a "hit" as points > 0).
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      graded: sql<number>`count(*) filter (where ${predictions.pointsAwarded} is not null)::int`,
      hits: sql<number>`count(*) filter (where ${predictions.pointsAwarded} > 0)::int`,
    })
    .from(predictions)
    .where(eq(predictions.userId, userId));

  const graded = counts?.graded ?? 0;
  const hits = counts?.hits ?? 0;

  return {
    totalPoints: standingRow?.totalPoints ?? 0,
    rank: standingRow?.rank && standingRow.rank > 0 ? standingRow.rank : null,
    previousRank:
      standingRow?.previousRank && standingRow.previousRank > 0
        ? standingRow.previousRank
        : null,
    streak: standingRow?.streak ?? 0,
    exactHits: standingRow?.exactHits ?? 0,
    accuracy: graded > 0 ? hits / graded : 0,
    gradedCount: graded,
    predictionsMade: counts?.total ?? 0,
  };
}

export interface EarnedBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: Date;
}

export async function getUserBadges(userId: string): Promise<EarnedBadge[]> {
  return db
    .select({
      id: badges.id,
      name: badges.name,
      description: badges.description,
      icon: badges.icon,
      earnedAt: userBadges.earnedAt,
    })
    .from(userBadges)
    .innerJoin(badges, eq(userBadges.badgeId, badges.id))
    .where(eq(userBadges.userId, userId));
}

export interface PointsPoint {
  matchday: number;
  cumulativePoints: number;
}

/** Points-over-time series for the profile chart. */
export async function getPointsHistory(userId: string): Promise<PointsPoint[]> {
  return db
    .select({
      matchday: pointsHistory.matchday,
      cumulativePoints: pointsHistory.cumulativePoints,
    })
    .from(pointsHistory)
    .where(and(eq(pointsHistory.userId, userId), isNotNull(pointsHistory.cumulativePoints)))
    .orderBy(pointsHistory.matchday);
}
