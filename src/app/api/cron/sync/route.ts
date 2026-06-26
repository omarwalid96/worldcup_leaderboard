import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { runPipeline } from "@/lib/cron/pipeline";
import { LIVE_TAG } from "@/lib/cache/tags";

// Always run dynamically on the server; never cache.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Main matchday pipeline endpoint. Registered in vercel.json to run frequently
 * during live windows. Syncs scores/statuses, locks kicked-off picks, grades
 * finished matches, and recomputes standings.
 */
async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runPipeline();
    // Bust the cached live-dependent reads (next kickoff, team-hype banners) the
    // instant something actually changed — a score, a status flip, a match going
    // live, or a grade. Quiet ticks (nothing changed) skip it, so the cache
    // survives between real updates. This is what keeps cached pages from ever
    // showing stale live results.
    const changed =
      result.sync.scoresUpdated > 0 ||
      result.sync.statusChanges > 0 ||
      result.markedLive > 0 ||
      result.grading.gradedPredictions > 0;
    if (changed) revalidateTag(LIVE_TAG);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/sync] pipeline failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "pipeline error" },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
