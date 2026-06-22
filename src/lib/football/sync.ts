import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { getFootballProvider } from "./index";
import { fetchMatchEvents } from "./espn";

export interface SyncSummary {
  fixturesSeen: number;
  statusChanges: number;
  scoresUpdated: number;
  liveMerged: number;
  lockedNow: number;
}

/**
 * Pull fixtures + results and reconcile them into the DB:
 *  - openfootball fixtures keep the schedule current (by externalId)
 *  - the live source (worldcup26.ir) supplies in-play + final scores, matched
 *    by normalized matchKey (teams + matchday) since ids/spellings differ
 *  - never downgrade a finished match
 * Kickoff-based locking of predictions is handled by lockKickedOffPredictions().
 */
export async function syncMatches(): Promise<SyncSummary> {
  const provider = getFootballProvider();
  // worldcup26 fixtures already carry live status + in-play scores, so one
  // fetch reconciles schedule AND live by externalId (single source of truth).
  const fixtures = await provider.getFixtures();

  let statusChanges = 0;
  let scoresUpdated = 0;

  const existing = await db
    .select({
      id: matches.id,
      externalId: matches.externalId,
      status: matches.status,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      kickoffUtc: matches.kickoffUtc,
    })
    .from(matches);
  const byExt = new Map(existing.map((m) => [m.externalId, m]));

  let kickoffsUpdated = 0;

  for (const f of fixtures) {
    const cur = byExt.get(f.externalId);
    if (!cur) continue; // new fixtures are introduced by the seed, not the sync

    // Never downgrade a finished match (protects against a flaky feed blip).
    if (cur.status === "finished") continue;

    const scoreChanged =
      f.homeScore !== cur.homeScore || f.awayScore !== cur.awayScore;
    const statusChanged = f.status !== cur.status;

    // Sync kickoff reschedules (source can move a match earlier/later). Only
    // while still scheduled — never shift a live/finished match, which would
    // re-open picks or corrupt the lock. A stale kickoff is what let users
    // submit after a match moved earlier (Brazil v Haiti). lockKickedOffPredictions
    // below uses the refreshed time, so a now-passed kickoff locks this same run.
    const newKickoff = new Date(f.kickoffUtc);
    const kickoffChanged =
      cur.status === "scheduled" &&
      !Number.isNaN(newKickoff.getTime()) &&
      newKickoff.getTime() !== new Date(cur.kickoffUtc).getTime();

    if (scoreChanged || statusChanged || kickoffChanged) {
      await db
        .update(matches)
        .set({
          homeScore: f.homeScore,
          awayScore: f.awayScore,
          status: f.status,
          ...(kickoffChanged ? { kickoffUtc: newKickoff } : {}),
          lastSyncedAt: new Date(),
        })
        .where(eq(matches.id, cur.id));
      if (scoreChanged) scoresUpdated++;
      if (statusChanged) statusChanges++;
      if (kickoffChanged) kickoffsUpdated++;
    }
  }
  void kickoffsUpdated; // ponytail: counted for parity; not surfaced in summary

  const lockedNow = await lockKickedOffPredictions();

  return {
    fixturesSeen: fixtures.length,
    statusChanges,
    scoresUpdated,
    liveMerged: scoresUpdated, // live scores arrive via the same fixtures fetch
    lockedNow,
  };
}

/**
 * Snapshot the goals/cards timeline from ESPN for finished matches that don't
 * have one stored yet, so they keep their timeline after aging off ESPN's
 * scoreboard. Idempotent (only fills `events IS NULL`); fails soft per match —
 * a null fetch (ESPN down / aged off) just leaves it for a later run. Display
 * only; never touches scores/grading. Returns how many matches it stored.
 */
export async function persistMatchEvents(): Promise<number> {
  const pending = await db
    .select({
      id: matches.id,
      homeTeam: matches.homeTeam,
      awayTeam: matches.awayTeam,
    })
    .from(matches)
    .where(and(eq(matches.status, "finished"), isNull(matches.events)));

  let stored = 0;
  for (const m of pending) {
    const events = await fetchMatchEvents(m.homeTeam, m.awayTeam);
    if (events === null) continue; // not on ESPN right now — retry next run
    await db.update(matches).set({ events }).where(eq(matches.id, m.id));
    stored++;
  }
  return stored;
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
  // A scheduled match whose kickoff has passed is in play — mark it LIVE so the
  // UI shows a LIVE state during the ~2h window before the final lands. It
  // leaves 'live' once the feed reports 'finished' (handled in syncMatches).
  //
  // NOTE: we deliberately do NOT gate on `home_score is null` — fixtures can
  // carry a stray 0-0 from the data source before kickoff, which used to leave
  // matches stuck on 'scheduled' forever. The upper bound (kickoff within the
  // last ~4h) avoids resurrecting long-finished matches the feed never
  // finalized; those stay scheduled rather than flapping to live.
  const res = await db.execute(sql`
    update matches
    set status = 'live', last_synced_at = now()
    where status = 'scheduled'
      and kickoff_utc <= now()
      and kickoff_utc > now() - interval '4 hours'
  `);
  return (res as unknown as { count?: number }).count ?? 0;
}
