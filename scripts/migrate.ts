/**
 * Applies all SQL files in ./drizzle in lexical order against DATABASE_URL.
 *
 * We use this instead of `drizzle-kit migrate` because we keep a hand-written
 * RLS/trigger migration (0001_rls.sql) alongside the generated schema migration.
 * Each file runs inside its own transaction. Re-running is safe: the schema
 * migration uses CREATE TABLE (which will error if already applied), so this is
 * intended for first-time setup — use `drizzle-kit push` for iterative dev.
 *
 *   DATABASE_URL=... npm run db:migrate:all
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local.");
  process.exit(1);
}

const dir = join(process.cwd(), "drizzle");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const sql = postgres(url, { prepare: false, max: 1 });

async function main() {
  for (const file of files) {
    const text = readFileSync(join(dir, file), "utf8");
    process.stdout.write(`→ applying ${file} ... `);
    try {
      await sql.unsafe(text);
      console.log("ok");
    } catch (err) {
      console.log("FAILED");
      console.error(err);
      throw err;
    }
  }
  console.log(`\nApplied ${files.length} migration file(s).`);
}

main()
  .then(() => sql.end())
  .catch(async () => {
    await sql.end();
    process.exit(1);
  });
