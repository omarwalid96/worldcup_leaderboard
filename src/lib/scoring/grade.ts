import "server-only";
import { and, eq, isNull, sql, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  matches,
  predictions,
  standings,
  leagueMembers,
  pointsHistory,
} from "@/db/schema";
import { scorePrediction, isExactHit } from "./index";

export interface GradeSummary {
  gradedMatches: number;
  gradedPredictions: number;
  exactHits: number;
  recomputedLeagues: number;
}

/**
 * Grades every finished-but-ungraded prediction, then recomputes standings for
 * affected leagues. Idempotent: a prediction is graded only while
 * points_awarded IS NULL, so re-running never double-counts.
 *
 * Returns a summary plus the set of users who got an exact hit this run (for
 * celebratory push notifications, handled by the caller).
 */
export async function gradeFinishedMatches(): Promise<
  GradeSummary & { exactHitUserIds: string[]; affectedUserIds: string[] }
> {
  // Finished matches that still have ungraded predictions.
  const finished = await db
    .select({
      id: matches.id,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
    })
    .from(matches)
    .where(and(eq(matches.status, "finished")));

  let gradedPredictions = 0;
  let exactHits = 0;
  const exactHitUserIds = new Set<string>();
  const affectedUserIds = new Set<string>();
  const gradedMatchIds: string[] = [];

  for (const m of finished) {
    if (m.homeScore == null || m.awayScore == null) continue;

    const ungraded = await db
      .select()
      .from(predictions)
      .where(and(eq(predictions.matchId, m.id), isNull(predictions.pointsAwarded)));

    if (ungraded.length === 0) continue;
    gradedMatchIds.push(m.id);

    for (const p of ungraded) {
      const ctx = {
        homePick: p.homePick,
        awayPick: p.awayPick,
        homeActual: m.homeScore,
        awayActual: m.awayScore,
      };
      const pts = scorePrediction({ ...ctx, isDoubleDown: p.isDoubleDown });

      await db
        .update(predictions)
        .set({ pointsAwarded: pts, locked: true, updatedAt: new Date() })
        .where(eq(predictions.id, p.id));

      gradedPredictions++;
      affectedUserIds.add(p.userId);
      if (isExactHit(ctx)) {
        exactHits++;
        exactHitUserIds.add(p.userId);
      }
    }
  }

  // Recompute standings for every league (cheap at this scale, and correct).
  const recomputedLeagues = await recomputeAllStandings();

  return {
    gradedMatches: gradedMatchIds.length,
    gradedPredictions,
    exactHits,
    recomputedLeagues,
    exactHitUserIds: [...exactHitUserIds],
    affectedUserIds: [...affectedUserIds],
  };
}

/**
 * Recomputes cached standings for all leagues from the graded predictions.
 * Sets previous_rank to the old rank BEFORE assigning the new rank, so the
 * leaderboard can animate movement. Returns the number of leagues touched.
 */
export async function recomputeAllStandings(): Promise<number> {
  const leagues = await db
    .selectDistinct({ leagueId: leagueMembers.leagueId })
    .from(leagueMembers);

  for (const { leagueId } of leagues) {
    await recomputeLeagueStandings(leagueId);
  }
  return leagues.length;
}

export async function recomputeLeagueStandings(leagueId: string): Promise<void> {
  const members = await db
    .select({ userId: leagueMembers.userId })
    .from(leagueMembers)
    .where(eq(leagueMembers.leagueId, leagueId));

  if (members.length === 0) return;
  const userIds = members.map((m) => m.userId);

  // Per-user aggregates from graded predictions.
  const agg = await db
    .select({
      userId: predictions.userId,
      totalPoints: sql<number>`coalesce(sum(${predictions.pointsAwarded}), 0)::int`,
      exactHits: sql<number>`count(*) filter (where ${predictions.pointsAwarded} = 5 or (${predictions.isDoubleDown} and ${predictions.pointsAwarded} = 10))::int`,
    })
    .from(predictions)
    .where(inArray(predictions.userId, userIds))
    .groupBy(predictions.userId);

  const byUser = new Map(agg.map((a) => [a.userId, a]));

  // Existing standings (to carry forward previous_rank).
  const existing = await db
    .select()
    .from(standings)
    .where(eq(standings.leagueId, leagueId));
  const prevByUser = new Map(existing.map((s) => [s.userId, s]));

  // Compute streaks per user from graded matchdays.
  const streaks = await computeStreaks(userIds);

  // Rank: order by points desc; ties share no special handling beyond order.
  const rows = userIds.map((userId) => {
    const a = byUser.get(userId);
    return {
      userId,
      totalPoints: a?.totalPoints ?? 0,
      exactHits: a?.exactHits ?? 0,
      streak: streaks.get(userId) ?? 0,
    };
  });
  rows.sort((x, y) => y.totalPoints - x.totalPoints || x.userId.localeCompare(y.userId));

  let rank = 0;
  let lastPoints: number | null = null;
  let seen = 0;
  for (const r of rows) {
    seen++;
    // Standard competition ranking (1,2,2,4).
    if (lastPoints === null || r.totalPoints !== lastPoints) {
      rank = seen;
      lastPoints = r.totalPoints;
    }
    const prev = prevByUser.get(r.userId);
    await db
      .insert(standings)
      .values({
        leagueId,
        userId: r.userId,
        totalPoints: r.totalPoints,
        rank,
        previousRank: prev?.rank ?? rank,
        exactHits: r.exactHits,
        streak: r.streak,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [standings.leagueId, standings.userId],
        set: {
          totalPoints: r.totalPoints,
          // carry the row's old rank into previous_rank before overwriting rank
          previousRank: prev?.rank ?? rank,
          rank,
          exactHits: r.exactHits,
          streak: r.streak,
          updatedAt: new Date(),
        },
      });
  }
}

/**
 * Streak = consecutive most-recent matchdays (with >=1 graded pick) where the
 * user got at least one correct result, capped via streakBonus(). Returns the
 * raw consecutive-day count (the bonus is applied at scoring time elsewhere).
 */
async function computeStreaks(userIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (userIds.length === 0) return result;

  // For each user, per matchday: did they get >=1 correct result?
  const rows = await db
    .select({
      userId: predictions.userId,
      matchday: matches.matchday,
      hit: sql<number>`max(case when ${predictions.pointsAwarded} > 0 then 1 else 0 end)::int`,
    })
    .from(predictions)
    .innerJoin(matches, eq(matches.id, predictions.matchId))
    .where(
      and(inArray(predictions.userId, userIds), sql`${predictions.pointsAwarded} is not null`),
    )
    .groupBy(predictions.userId, matches.matchday);

  const byUser = new Map<string, { matchday: number; hit: number }[]>();
  for (const r of rows) {
    const arr = byUser.get(r.userId) ?? [];
    arr.push({ matchday: r.matchday, hit: r.hit });
    byUser.set(r.userId, arr);
  }

  for (const userId of userIds) {
    const days = (byUser.get(userId) ?? []).sort((a, b) => b.matchday - a.matchday);
    let streak = 0;
    for (const d of days) {
      if (d.hit > 0) streak++;
      else break;
    }
    result.set(userId, streak);
  }
  return result;
}

/** Snapshots each user's cumulative points by matchday for the profile chart. */
export async function snapshotPointsHistory(): Promise<void> {
  // Cumulative points per user per matchday, from graded predictions.
  const rows = await db
    .select({
      userId: predictions.userId,
      matchday: matches.matchday,
      points: sql<number>`coalesce(sum(${predictions.pointsAwarded}), 0)::int`,
    })
    .from(predictions)
    .innerJoin(matches, eq(matches.id, predictions.matchId))
    .where(sql`${predictions.pointsAwarded} is not null`)
    .groupBy(predictions.userId, matches.matchday)
    .orderBy(predictions.userId, matches.matchday);

  // Build cumulative series and upsert one row per (user, matchday).
  const cum = new Map<string, number>();
  for (const r of rows) {
    const running = (cum.get(r.userId) ?? 0) + r.points;
    cum.set(r.userId, running);
    await db
      .insert(pointsHistory)
      .values({ userId: r.userId, matchday: r.matchday, cumulativePoints: running })
      .onConflictDoUpdate({
        target: [pointsHistory.userId, pointsHistory.matchday],
        set: { cumulativePoints: running, recordedAt: new Date() },
      });
  }
}
