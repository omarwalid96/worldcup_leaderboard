import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  syncMatches,
  markInPlayLive,
  persistMatchEvents,
} from "@/lib/football/sync";
import {
  gradeFinishedMatches,
  snapshotPointsHistory,
} from "@/lib/scoring/grade";
import { sendGradingNotifications } from "@/lib/notifications/grading";
import { sendPushToAll } from "@/lib/notifications/send";
import { recordCronRun } from "./log";

export interface PipelineResult {
  ok: true;
  sync: Awaited<ReturnType<typeof syncMatches>>;
  markedLive: number;
  grading: Awaited<ReturnType<typeof gradeFinishedMatches>>;
  eventsStored: number;
  durationMs: number;
}

/**
 * The full matchday pipeline, run by Vercel Cron:
 *   1. sync provider → DB (scores, statuses) + lock kicked-off predictions
 *   2. mark in-play matches live (so the UI shows LIVE before the result lands)
 *   3. grade newly-finished predictions + recompute standings (+ previous_rank)
 *   4. snapshot cumulative points for the profile chart
 *
 * Returns rich detail so the cron logs are useful. The caller fires
 * notifications based on grading.exactHitUserIds / affectedUserIds.
 */
export async function runPipeline(): Promise<PipelineResult> {
  const start = Date.now();

  // ponytail: skip the upstream fetch entirely when no match is in its live
  // window. A fetch can only produce a change for a match that's live, or
  // scheduled to kick off within ~15 min, or kicked off within the last ~4h
  // (the window markInPlayLive uses). Outside that, the cron exits in ms — no
  // API call, no parse, no DB scan. This is the dominant Active-CPU saving for
  // a 5-min cron, since most ticks fall outside any match window.
  // ceiling: keeps the 5-min cadence DURING matches; if you ever want sub-15min
  // pre-kickoff price reactions, widen the +15min bound.
  const windowRows = await db.execute(sql`
    select 1 from matches
    where status = 'live'
       or (status = 'scheduled'
           and kickoff_utc <= now() + interval '15 minutes'
           and kickoff_utc > now() - interval '4 hours')
    limit 1
  `);
  const inLiveWindow = (windowRows as unknown as unknown[]).length > 0;
  if (!inLiveWindow) {
    await recordCronRun("sync", {
      scoresUpdated: 0,
      statusChanges: 0,
      markedLive: 0,
      graded: 0,
    });
    return {
      ok: true,
      sync: {
        fixturesSeen: 0,
        statusChanges: 0,
        scoresUpdated: 0,
        liveMerged: 0,
        lockedNow: 0,
        alerts: [],
      },
      markedLive: 0,
      grading: {
        gradedMatches: 0,
        gradedPredictions: 0,
        exactHits: 0,
        recomputedLeagues: 0,
        exactHitUserIds: [],
        affectedUserIds: [],
      },
      eventsStored: 0,
      durationMs: Date.now() - start,
    };
  }

  const sync = await syncMatches();

  // League-wide goal alerts (OS push to every subscriber). Fails soft so a
  // push problem never breaks the pipeline. One notification per goal detected.
  try {
    for (const a of sync.alerts) {
      await sendPushToAll(
        {
          title: `GOAL! ${a.homeTeam} ${a.homeScore}–${a.awayScore} ${a.awayTeam} ⚽`,
          body: `${a.homeTeam} vs ${a.awayTeam} — tap for the live timeline.`,
          url: `/matches/${a.matchId}`,
        },
        "liveMatch",
      );
    }
  } catch (err) {
    console.warn("[pipeline] goal alerts failed:", err);
  }

  const markedLive = await markInPlayLive();

  // ponytail: quiet-tick early-exit. The heavy tail (grade → recompute
  // standings → snapshot history → persist events → push) only has work to do
  // when a score or status actually changed this tick. With a 5-min cron most
  // ticks are quiet (no match in play), so skipping the tail on those cuts the
  // bulk of the Active CPU this cron burns. markInPlayLive still runs every
  // tick (one cheap UPDATE) so the UI flips to LIVE on time.
  const somethingChanged = sync.scoresUpdated > 0 || sync.statusChanges > 0;

  let grading: Awaited<ReturnType<typeof gradeFinishedMatches>> = {
    gradedMatches: 0,
    gradedPredictions: 0,
    exactHits: 0,
    recomputedLeagues: 0,
    exactHitUserIds: [],
    affectedUserIds: [],
  };
  let eventsStored = 0;

  if (somethingChanged) {
    grading = await gradeFinishedMatches();
    await snapshotPointsHistory();
    // Snapshot goals/cards for matches that just finished, so the timeline
    // survives after ESPN drops them. Fails soft; never blocks the pipeline.
    eventsStored = await persistMatchEvents();
    // Fire push after grading; failures must not break the pipeline.
    await sendGradingNotifications(grading.exactHitUserIds, grading.affectedUserIds);
  }

  // Heartbeat so we can confirm the cron is actually firing (cron_log table).
  await recordCronRun("sync", {
    scoresUpdated: sync.scoresUpdated,
    statusChanges: sync.statusChanges,
    markedLive,
    graded: grading.gradedPredictions,
  });

  return {
    ok: true,
    sync,
    markedLive,
    grading,
    eventsStored,
    durationMs: Date.now() - start,
  };
}
