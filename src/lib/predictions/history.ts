import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { matches, predictions, profiles } from "@/db/schema";

export interface PredictionHistoryRow {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeCode: string | null;
  awayCode: string | null;
  kickoffUtc: Date;
  status: "scheduled" | "live" | "finished";
  homeScore: number | null;
  awayScore: number | null;
  homePick: number;
  awayPick: number;
  isDoubleDown: boolean;
  pointsAwarded: number | null;
}

/**
 * Full prediction history for a user, most-recent first.
 * Joins predictions → matches. Only locked predictions are returned
 * (once kickoff has passed the pick is public).
 */
export async function getUserPredictionHistory(
  userId: string,
): Promise<PredictionHistoryRow[]> {
  const rows = await db
    .select({
      matchId: matches.id,
      homeTeam: matches.homeTeam,
      awayTeam: matches.awayTeam,
      homeCode: matches.homeCode,
      awayCode: matches.awayCode,
      kickoffUtc: matches.kickoffUtc,
      status: matches.status,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      homePick: predictions.homePick,
      awayPick: predictions.awayPick,
      isDoubleDown: predictions.isDoubleDown,
      pointsAwarded: predictions.pointsAwarded,
    })
    .from(predictions)
    .innerJoin(matches, eq(matches.id, predictions.matchId))
    .where(eq(predictions.userId, userId))
    .orderBy(desc(matches.kickoffUtc));

  return rows;
}

/** Look up a profile by username. Returns null when not found. */
export async function getProfileByUsername(username: string) {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.username, username))
    .limit(1);
  return profile ?? null;
}
