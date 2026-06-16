import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { runPipeline } from "@/lib/cron/pipeline";

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
