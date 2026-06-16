import "server-only";
import { asc, gte, lt, eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, predictions, type Match } from "@/db/schema";

export interface MatchWithPrediction extends Match {
  prediction: {
    homePick: number;
    awayPick: number;
    isDoubleDown: boolean;
    locked: boolean;
    pointsAwarded: number | null;
  } | null;
}

/** All matches, ordered by kickoff, joined with the given user's predictions. */
export async function getMatchesWithPredictions(
  userId: string,
): Promise<MatchWithPrediction[]> {
  // These two queries are independent (predictions are fetched by user_id,
  // not by the match rows), so run them in parallel.
  const [rows, preds] = await Promise.all([
    db.select().from(matches).orderBy(asc(matches.kickoffUtc)),
    db.select().from(predictions).where(eq(predictions.userId, userId)),
  ]);

  const byMatch = new Map(preds.map((p) => [p.matchId, p]));

  return rows.map((m) => {
    const p = byMatch.get(m.id);
    return {
      ...m,
      prediction: p
        ? {
            homePick: p.homePick,
            awayPick: p.awayPick,
            isDoubleDown: p.isDoubleDown,
            locked: p.locked,
            pointsAwarded: p.pointsAwarded,
          }
        : null,
    };
  });
}

/** Upcoming matches within `hours` from now (used for the dashboard strip). */
export async function getUpcomingMatches(
  userId: string,
  limit = 6,
): Promise<MatchWithPrediction[]> {
  const now = new Date();
  const rows = await db
    .select()
    .from(matches)
    .where(gte(matches.kickoffUtc, now))
    .orderBy(asc(matches.kickoffUtc))
    .limit(limit);

  if (rows.length === 0) return [];

  const preds = await db
    .select()
    .from(predictions)
    .where(
      and(
        eq(predictions.userId, userId),
        inArray(
          predictions.matchId,
          rows.map((r) => r.id),
        ),
      ),
    );
  const byMatch = new Map(preds.map((p) => [p.matchId, p]));

  return rows.map((m) => {
    const p = byMatch.get(m.id);
    return {
      ...m,
      prediction: p
        ? {
            homePick: p.homePick,
            awayPick: p.awayPick,
            isDoubleDown: p.isDoubleDown,
            locked: p.locked,
            pointsAwarded: p.pointsAwarded,
          }
        : null,
    };
  });
}

/** A single match by id (for the prediction page). */
export async function getMatchById(matchId: string): Promise<Match | null> {
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  return m ?? null;
}

/** Live matches right now (status = live). */
export async function getLiveMatches(): Promise<Match[]> {
  return db.select().from(matches).where(eq(matches.status, "live")).orderBy(asc(matches.kickoffUtc));
}

/** Matches happening today in UTC terms (cheap heuristic for "today's slate"). */
export async function getTodayMatches(): Promise<Match[]> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return db
    .select()
    .from(matches)
    .where(and(gte(matches.kickoffUtc, start), lt(matches.kickoffUtc, end)))
    .orderBy(asc(matches.kickoffUtc));
}

/**
 * Matches on the current US Eastern calendar day (the prediction window),
 * joined with the user's prediction. The whole tournament is US-anchored, so
 * "today" is ET — not the user's local day.
 */
export async function getUsTodayMatches(
  userId: string,
): Promise<MatchWithPrediction[]> {
  const rows = await db
    .select()
    .from(matches)
    .where(
      sql`(${matches.kickoffUtc} at time zone 'America/New_York')::date
          = (now() at time zone 'America/New_York')::date`,
    )
    .orderBy(asc(matches.kickoffUtc));

  if (rows.length === 0) return [];

  const preds = await db
    .select()
    .from(predictions)
    .where(
      and(
        eq(predictions.userId, userId),
        inArray(
          predictions.matchId,
          rows.map((r) => r.id),
        ),
      ),
    );
  const byMatch = new Map(preds.map((p) => [p.matchId, p]));

  return rows.map((m) => {
    const p = byMatch.get(m.id);
    return {
      ...m,
      prediction: p
        ? {
            homePick: p.homePick,
            awayPick: p.awayPick,
            isDoubleDown: p.isDoubleDown,
            locked: p.locked,
            pointsAwarded: p.pointsAwarded,
          }
        : null,
    };
  });
}
