import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { sendLockReminders } from "@/lib/notifications/reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron endpoint that sends "lock your pick" reminders to users who haven't
 * predicted matches kicking off in 45–60 minutes.
 * Idempotent: the 45–60min window is narrow enough that one cron tick per
 * frequency covers exactly one reminder per match.
 */
async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await sendLockReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/notify] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "notify error" },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
