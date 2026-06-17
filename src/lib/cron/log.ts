import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Heartbeat log so we can tell when the cron actually RAN — independent of
 * whether any data changed (a successful sync with no live matches changes
 * nothing, so matches.last_synced_at alone can't confirm the cron is alive).
 */
export async function recordCronRun(
  job: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.execute(sql`
      create table if not exists cron_log (
        id uuid primary key default gen_random_uuid(),
        job text not null,
        detail jsonb,
        ran_at timestamptz not null default now()
      )
    `);
    await db.execute(
      sql`insert into cron_log (job, detail) values (${job}, ${JSON.stringify(detail)}::jsonb)`,
    );
  } catch {
    // Logging must never break the pipeline.
  }
}
