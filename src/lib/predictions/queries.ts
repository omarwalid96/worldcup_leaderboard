import "server-only";
import { and, eq, sql, desc } from "drizzle-orm";
import { db } from "@/db";
import { matches, predictions, profiles, type Match } from "@/db/schema";

export interface MatchForPrediction {
  match: Match;
  /** SERVER-computed: true when kickoff has passed (DB clock). */
  locked: boolean;
  prediction: {
    homePick: number;
    awayPick: number;
    isDoubleDown: boolean;
    pointsAwarded: number | null;
    pensWinner: "home" | "away" | null;
    pensHomePick: number | null;
    pensAwayPick: number | null;
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
          pensWinner: (pred.pensWinner as "home" | "away" | null) ?? null,
          pensHomePick: pred.pensHomePick,
          pensAwayPick: pred.pensAwayPick,
        }
      : null,
  };
}

export interface FriendPick {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  homePick: number;
  awayPick: number;
  isDoubleDown: boolean;
  pointsAwarded: number | null;
}

/**
 * All members' predictions for a match (picks are always visible in this
 * league). Ordered by points desc once graded, else by who picked first.
 */
export async function getMatchPredictions(
  matchId: string,
): Promise<FriendPick[]> {
  return db
    .select({
      userId: predictions.userId,
      username: profiles.username,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
      homePick: predictions.homePick,
      awayPick: predictions.awayPick,
      isDoubleDown: predictions.isDoubleDown,
      pointsAwarded: predictions.pointsAwarded,
    })
    .from(predictions)
    .innerJoin(profiles, eq(profiles.id, predictions.userId))
    .where(eq(predictions.matchId, matchId))
    .orderBy(desc(predictions.pointsAwarded), predictions.createdAt);
}
