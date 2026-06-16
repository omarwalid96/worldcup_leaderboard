import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import {
  gradeFinishedMatches,
  snapshotPointsHistory,
  regradeAll,
} from "@/lib/scoring/grade";
import { lockKickedOffPredictions } from "@/lib/football/sync";
import { sendGradingNotifications } from "@/lib/notifications/grading";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Lighter grade-only endpoint for the off-peak cron cadence: locks kicked-off
 * picks, grades finished matches, recomputes standings, snapshots history.
 * Skips the provider fetch.
 */
async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // ?regrade=1 re-grades all finished matches under the current rules.
    const regrade = new URL(req.url).searchParams.get("regrade") === "1";
    if (regrade) {
      const grading = await regradeAll();
      await sendGradingNotifications(grading.exactHitUserIds, grading.affectedUserIds);
      return NextResponse.json({ ok: true, regraded: true, grading });
    }
    const locked = await lockKickedOffPredictions();
    const grading = await gradeFinishedMatches();
    await snapshotPointsHistory();
    await sendGradingNotifications(grading.exactHitUserIds, grading.affectedUserIds);
    return NextResponse.json({ ok: true, locked, grading });
  } catch (err) {
    console.error("[cron/grade] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "grade error" },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
