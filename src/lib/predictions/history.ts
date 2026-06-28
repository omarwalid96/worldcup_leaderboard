import "server-only";
import { eq, desc, sql } from "drizzle-orm";
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
  /** Knockout pens pick + actual result (for the pens tag + accuracy chart). */
  isKnockout: boolean;
  pensWinner: "home" | "away" | null;
  pensHomePick: number | null;
  pensAwayPick: number | null;
  wentToPens: boolean;
  pensHome: number | null;
  pensAway: number | null;
}

/**
 * Full prediction history for a user, most-recent first.
 * Joins predictions → matches. When viewed by someone else, scorelines for
 * matches not yet live/finished are redacted (-1) so upcoming picks stay
 * secret until kickoff. Own profile always shows everything.
 */
export async function getUserPredictionHistory(
  userId: string,
  viewerId?: string,
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
      isKnockout: sql<boolean>`(${matches.stage} <> 'group')`,
      pensWinner: predictions.pensWinner,
      pensHomePick: predictions.pensHomePick,
      pensAwayPick: predictions.pensAwayPick,
      wentToPens: matches.wentToPens,
      pensHome: matches.pensHome,
      pensAway: matches.pensAway,
    })
    .from(predictions)
    .innerJoin(matches, eq(matches.id, predictions.matchId))
    .where(eq(predictions.userId, userId))
    .orderBy(desc(matches.kickoffUtc));

  const mapped: PredictionHistoryRow[] = rows.map((r) => ({
    ...r,
    pensWinner: (r.pensWinner as "home" | "away" | null) ?? null,
  }));

  if (viewerId && viewerId !== userId) {
    return mapped.map((r) =>
      r.status === "live" || r.status === "finished"
        ? r
        : { ...r, homePick: -1, awayPick: -1, pensWinner: null, pensHomePick: null, pensAwayPick: null },
    );
  }
  return mapped;
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
