import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { gradeFinishedMatches, snapshotPointsHistory } from "@/lib/scoring/grade";
import { lockKickedOffPredictions } from "@/lib/football/sync";

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
    const locked = await lockKickedOffPredictions();
    const grading = await gradeFinishedMatches();
    await snapshotPointsHistory();
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
