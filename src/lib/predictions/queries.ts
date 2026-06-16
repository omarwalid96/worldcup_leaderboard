import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, predictions, type Match } from "@/db/schema";

export interface MatchForPrediction {
  match: Match;
  /** SERVER-computed: true when kickoff has passed (DB clock). */
  locked: boolean;
  prediction: {
    homePick: number;
    awayPick: number;
    isDoubleDown: boolean;
    pointsAwarded: number | null;
  } | null;
}

/**
 * Loads a match for the prediction page, computing the lock against the DB
 * clock (never the client). Also returns the user's current pick if any.
 */
export async function getMatchForPrediction(
  matchId: string,
  userId: string,
): Promise<MatchForPrediction | null> {
  const [row] = await db
    .select({
      match: matches,
      locked: sql<boolean>`(${matches.kickoffUtc} <= now())`,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!row) return null;

  const [pred] = await db
    .select()
    .from(predictions)
    .where(and(eq(predictions.matchId, matchId), eq(predictions.userId, userId)))
    .limit(1);

  return {
    match: row.match,
    locked: row.locked,
    prediction: pred
      ? {
          homePick: pred.homePick,
          awayPick: pred.awayPick,
          isDoubleDown: pred.isDoubleDown,
          pointsAwarded: pred.pointsAwarded,
        }
      : null,
  };
}
