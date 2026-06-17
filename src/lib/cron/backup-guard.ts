import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Safety guard for destructive operations (regrade). A bad regrade once wiped
 * real standings, so regrade now REFUSES unless a backup was recorded recently.
 *
 * Backups are logged to a `backup_log` table (created lazily) by db:backup.
 * Because Vercel's filesystem is ephemeral, we track backups in the DB, not on
 * disk — so the guard works the same locally and in production.
 */
const FRESH_MINUTES = 60;

export async function recordBackup(note = "manual"): Promise<void> {
  await ensureTable();
  await db.execute(sql`insert into backup_log (note) values (${note})`);
}

export async function hasFreshBackup(): Promise<boolean> {
  await ensureTable();
  const rows = await db.execute<{ ok: boolean }>(sql`
    select (max(created_at) > now() - interval '${sql.raw(String(FRESH_MINUTES))} minutes') as ok
    from backup_log
  `);
  // drizzle execute returns an array-like; normalize.
  const first = (rows as unknown as { ok: boolean | null }[])[0];
  return first?.ok === true;
}

async function ensureTable(): Promise<void> {
  await db.execute(sql`
    create table if not exists backup_log (
      id uuid primary key default gen_random_uuid(),
      note text,
      created_at timestamptz not null default now()
    )
  `);
}
