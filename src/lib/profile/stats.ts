import "server-only";
import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  predictions,
  standings,
  leagues,
  profiles,
  userBadges,
  badges,
  pointsHistory,
  rankHistory,
  matches,
} from "@/db/schema";
import { RELEASE_DATE_UTC } from "@/lib/time/usday";

// Fallback cutoff if a profile somehow has no createdAt (shouldn't happen).
const RELEASE = new Date(RELEASE_DATE_UTC);

/** The participation cutoff for a user: when they joined (can't predict before). */
async function participationSince(userId: string): Promise<Date> {
  const [p] = await db
    .select({ createdAt: profiles.createdAt })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return p?.createdAt ?? RELEASE;
}

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
  /** How many locked/past matches the user made a prediction for (0..1). */
  participation: number;
  /** Numerator: predictions the user made on locked matches. */
  predictedOfLocked: number;
  /** Denominator: total matches whose kickoff has passed. */
  lockedAvailable: number;
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

  // Participation: of the matches that locked since the user JOINED, how many
  // did they predict? (A user can't be penalized for matches before they joined.)
  const now = new Date();
  const since = await participationSince(userId);
  const [lockedCounts] = await db
    .select({
      lockedAvailable: sql<number>`count(*)::int`,
      predictedOfLocked: sql<number>`count(${predictions.id})::int`,
    })
    .from(matches)
    .leftJoin(
      predictions,
      and(eq(predictions.matchId, matches.id), eq(predictions.userId, userId)),
    )
    .where(and(lt(matches.kickoffUtc, now), gte(matches.kickoffUtc, since)));

  const graded = counts?.graded ?? 0;
  const hits = counts?.hits ?? 0;
  const lockedAvailable = lockedCounts?.lockedAvailable ?? 0;
  const predictedOfLocked = lockedCounts?.predictedOfLocked ?? 0;

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
    participation: lockedAvailable > 0 ? predictedOfLocked / lockedAvailable : 0,
    predictedOfLocked,
    lockedAvailable,
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

export interface OutcomeBreakdown {
  exact: number;
  correctOnly: number;
  wrong: number;
}

/**
 * Breakdown of graded predictions into:
 * - exact: score exactly right (3 pts)
 * - correctOnly: correct outcome (win/draw) but not exact score (1 pt)
 * - wrong: incorrect outcome (0 pts)
 */
export async function getOutcomeBreakdown(userId: string): Promise<OutcomeBreakdown> {
  const [row] = await db
    .select({
      exact: sql<number>`count(*) filter (
        where ${predictions.pointsAwarded} is not null
          and ${predictions.homePick} = ${matches.homeScore}
          and ${predictions.awayPick} = ${matches.awayScore}
      )::int`,
      correctOnly: sql<number>`count(*) filter (
        where ${predictions.pointsAwarded} = 1
      )::int`,
      wrong: sql<number>`count(*) filter (
        where ${predictions.pointsAwarded} = 0
      )::int`,
    })
    .from(predictions)
    .innerJoin(matches, eq(matches.id, predictions.matchId))
    .where(and(eq(predictions.userId, userId), isNotNull(predictions.pointsAwarded)));

  return {
    exact: row?.exact ?? 0,
    correctOnly: row?.correctOnly ?? 0,
    wrong: row?.wrong ?? 0,
  };
}

export interface RankPoint {
  matchday: number;
  rank: number;
}

/**
 * Rank-over-time series for the rank chart (default league only).
 * Lower rank number = better position; the chart Y axis should be inverted.
 */
export async function getRankHistory(userId: string): Promise<RankPoint[]> {
  const [defaultLeague] = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(eq(leagues.isDefault, true))
    .limit(1);

  if (!defaultLeague) return [];

  const rows = await db
    .select({
      matchday: rankHistory.matchday,
      rank: rankHistory.rank,
    })
    .from(rankHistory)
    .where(
      and(eq(rankHistory.userId, userId), eq(rankHistory.leagueId, defaultLeague.id)),
    )
    .orderBy(rankHistory.matchday);

  return rows;
}

export interface ParticipationPoint {
  matchday: number;
  predicted: number;
  missed: number;
}

/**
 * Per-matchday participation: how many locked matches did the user predict vs miss.
 */
export async function getParticipationHistory(userId: string): Promise<ParticipationPoint[]> {
  const now = new Date();
  const since = await participationSince(userId);
  const rows = await db
    .select({
      matchday: matches.matchday,
      total: sql<number>`count(*)::int`,
      predicted: sql<number>`count(${predictions.id})::int`,
    })
    .from(matches)
    .leftJoin(
      predictions,
      and(eq(predictions.matchId, matches.id), eq(predictions.userId, userId)),
    )
    .where(and(lt(matches.kickoffUtc, now), gte(matches.kickoffUtc, since)))
    .groupBy(matches.matchday)
    .orderBy(matches.matchday);

  return rows.map((r) => ({
    matchday: r.matchday,
    predicted: r.predicted,
    missed: r.total - r.predicted,
  }));
}
