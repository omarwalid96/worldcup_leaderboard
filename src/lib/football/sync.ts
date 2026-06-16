import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { getFootballProvider } from "./index";

export interface SyncSummary {
  fixturesSeen: number;
  statusChanges: number;
  scoresUpdated: number;
  lockedNow: number;
}

/**
 * Pull the provider's fixtures/results and reconcile them into the DB:
 *  - update scores + status for matches that changed
 *  - flip scheduled→live / →finished as the provider reports
 *
 * Live transitions: openfootball has no in-play feed, so a match flips to
 * "finished" when a final score appears. If a keyed live provider is wired,
 * its getLiveMatches() marks matches live. Either way, kickoff-based locking of
 * predictions is handled by lockKickedOffPredictions() below.
 */
export async function syncMatches(): Promise<SyncSummary> {
  const provider = getFootballProvider();
  const fixtures = await provider.getFixtures();

  let statusChanges = 0;
  let scoresUpdated = 0;

  // Map current DB state by external id.
  const existing = await db
    .select({
      id: matches.id,
      externalId: matches.externalId,
      status: matches.status,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
    })
    .from(matches);
  const byExt = new Map(existing.map((m) => [m.externalId, m]));

  for (const f of fixtures) {
    const cur = byExt.get(f.externalId);
    if (!cur) continue; // new fixtures are added by the seed, not the sync

    const scoreChanged =
      f.homeScore !== cur.homeScore || f.awayScore !== cur.awayScore;
    // Never downgrade live→scheduled from a schedule-only feed.
    const nextStatus =
      cur.status === "live" && f.status === "scheduled" ? "live" : f.status;
    const statusChanged = nextStatus !== cur.status;

    if (scoreChanged || statusChanged) {
      await db
        .update(matches)
        .set({
          homeScore: f.homeScore,
          awayScore: f.awayScore,
          status: nextStatus,
          lastSyncedAt: new Date(),
        })
        .where(eq(matches.id, cur.id));
      if (scoreChanged) scoresUpdated++;
      if (statusChanged) statusChanges++;
    }
  }

  // Merge any in-play results from a live provider (no-op for openfootball).
  const live = await provider.getLiveMatches();
  for (const r of live) {
    const cur = byExt.get(r.externalId);
    if (!cur) continue;
    await db
      .update(matches)
      .set({
        status: r.status,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
        lastSyncedAt: new Date(),
      })
      .where(eq(matches.id, cur.id));
  }

  const lockedNow = await lockKickedOffPredictions();

  return {
    fixturesSeen: fixtures.length,
    statusChanges,
    scoresUpdated,
    lockedNow,
  };
}

/**
 * Locks every prediction whose match has kicked off. The kickoff lock is
 * already enforced on write (Server Action + RLS); this flips the stored
 * `locked` flag so the UI shows the lock without recomputing kickoff each time.
 * Compares against the DB clock — never the client.
 */
export async function lockKickedOffPredictions(): Promise<number> {
  const result = await db.execute(sql`
    update predictions p
    set locked = true, updated_at = now()
    from matches m
    where p.match_id = m.id
      and p.locked = false
      and m.kickoff_utc <= now()
  `);
  // postgres-js returns affected count on .count for execute results
  return (result as unknown as { count?: number }).count ?? 0;
}

/**
 * Mark matches as "live" when kickoff has passed but no final score exists yet.
 * Useful even without a live feed so the UI shows a LIVE state during the
 * ~2h window before the result lands. A match leaves live once a score appears
 * (handled in syncMatches).
 */
export async function markInPlayLive(): Promise<number> {
  const res = await db.execute(sql`
    update matches
    set status = 'live', last_synced_at = now()
    where status = 'scheduled'
      and kickoff_utc <= now()
      and home_score is null
  `);
  return (res as unknown as { count?: number }).count ?? 0;
}
