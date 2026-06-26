import "server-only";
import { unstable_cache } from "next/cache";
import { asc, gte, lt, eq, ne, and, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, predictions, type Match } from "@/db/schema";
import { LIVE_TAG } from "@/lib/cache/tags";

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
 * Kickoff time of the next not-yet-finished match (live OR upcoming), or null.
 * Lets the live-island poll fast around kickoff and idle otherwise — instant
 * "match started" detection without pinging ESPN round the clock.
 *
 * Cached (60s) and tagged LIVE_TAG: this runs in the app layout on EVERY page
 * nav, so caching removes one remote-DB round-trip per tab switch. The cron
 * busts LIVE_TAG the moment a status changes, so a match flipping live/finished
 * is reflected immediately; the 60s TTL only bounds staleness when the cron is
 * idle (no live changes), where a stale kickoff time is harmless. Returns ISO
 * string (Date isn't serializable through the cache) — callers parse it.
 */
const cachedNextKickoffIso = unstable_cache(
  async (): Promise<string | null> => {
    const [m] = await db
      .select({ kickoffUtc: matches.kickoffUtc })
      .from(matches)
      .where(ne(matches.status, "finished"))
      .orderBy(asc(matches.kickoffUtc))
      .limit(1);
    return m?.kickoffUtc?.toISOString() ?? null;
  },
  ["next-kickoff"],
  { revalidate: 60, tags: [LIVE_TAG] },
);

export async function getNextKickoff(): Promise<Date | null> {
  const iso = await cachedNextKickoffIso();
  return iso ? new Date(iso) : null;
}

/**
 * Matches currently in the prediction window — within 24h before kickoff and
 * not yet started — joined with the user's prediction. These are the matches a
 * user can predict right now.
 */
export async function getPredictableMatches(
  userId: string,
): Promise<MatchWithPrediction[]> {
  const rows = await db
    .select()
    .from(matches)
    .where(
      sql`now() >= ${matches.kickoffUtc} - interval '24 hours'
          and now() < ${matches.kickoffUtc}`,
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
