/**
 * Logical backup of all app tables → a timestamped JSON file in ./backups.
 *
 * Version-independent (uses the `postgres` client, not pg_dump, which can't dump
 * a newer server than its own major). Small DB, so a full row dump is fine and
 * trivially restorable. Run before any migration or regrade.
 *
 *   npm run db:backup
 *
 * The grade cron refuses to run regrade=1 unless a recent backup exists (see
 * src/lib/cron/backup-guard.ts).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

// Order matters for a clean restore (parents before children), but since we
// store per-table we just capture everything.
const TABLES = [
  "profiles",
  "leagues",
  "league_members",
  "matches",
  "predictions",
  "standings",
  "badges",
  "user_badges",
  "points_history",
  "rank_history",
] as const;

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

async function main() {
  const dir = join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });

  const dump: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    try {
      dump[t] = await sql.unsafe(`select * from ${t}`);
    } catch (e) {
      // Table may not exist yet on a fresh DB — record empty, keep going.
      console.warn(`  (skipped ${t}: ${(e as Error).message.slice(0, 60)})`);
      dump[t] = [];
    }
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(dir, `backup-${ts}.json`);
  writeFileSync(
    file,
    JSON.stringify({ createdAt: new Date().toISOString(), tables: dump }, null, 2),
  );

  const counts = Object.entries(dump)
    .map(([t, rows]) => `${t}:${rows.length}`)
    .join(" ");

  // Record the backup in the DB so the regrade guard can verify freshness
  // (filesystem is ephemeral on Vercel; the DB log is the source of truth).
  await sql`create table if not exists backup_log (
    id uuid primary key default gen_random_uuid(),
    note text,
    created_at timestamptz not null default now()
  )`;
  await sql`insert into backup_log (note) values (${`file:${file}`})`;

  console.log(`Backup written: ${file}`);
  console.log(`Rows — ${counts}`);
  console.log("Recorded in backup_log (regrade now permitted for 60 min).");
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
