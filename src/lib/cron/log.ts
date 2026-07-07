import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Heartbeat log so we can tell when the cron actually RAN — independent of
 * whether any data changed (a successful sync with no live matches changes
 * nothing, so matches.last_synced_at alone can't confirm the cron is alive).
 *
 * ponytail: two modes to keep quiet ticks near-free (the cron fires ~300×/day
 * but most ticks are quiet — see the Vercel Active-CPU budget). A quiet tick
 * (`heartbeatOnly`) just UPSERTs a single well-known row so "when did the cron
 * last run" is still answerable, with NO table create and NO row growth. Ticks
 * that did real work still append a detail row for the audit trail.
 * The table + heartbeat row are created once by the migration, not per call.
 */
const HEARTBEAT_ID = "00000000-0000-0000-0000-000000000001";

export async function recordCronRun(
  job: string,
  detail: Record<string, unknown> = {},
  heartbeatOnly = false,
): Promise<void> {
  try {
    if (heartbeatOnly) {
      // One fixed row, updated in place — cheapest possible "still alive" mark.
      await db.execute(sql`
        insert into cron_log (id, job, detail, ran_at)
        values (${HEARTBEAT_ID}, ${job}, ${JSON.stringify(detail)}::jsonb, now())
        on conflict (id) do update set ran_at = now(), detail = excluded.detail
      `);
      return;
    }
    await db.execute(
      sql`insert into cron_log (job, detail) values (${job}, ${JSON.stringify(detail)}::jsonb)`,
    );
  } catch {
    // Logging must never break the pipeline.
  }
}
