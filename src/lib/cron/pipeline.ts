import "server-only";
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

  const sync = await syncMatches();
  const markedLive = await markInPlayLive();
  const grading = await gradeFinishedMatches();
  await snapshotPointsHistory();
  // Snapshot goals/cards for matches that just finished, so the timeline
  // survives after ESPN drops them. Fails soft; never blocks the pipeline.
  const eventsStored = await persistMatchEvents();
  // Fire push notifications after grading; failures must not break the pipeline.
  await sendGradingNotifications(grading.exactHitUserIds, grading.affectedUserIds);

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
