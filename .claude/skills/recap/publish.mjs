/**
 * Publishes a recap to the home "AI Summary" card (inserts one ai_summaries row).
 * The /recap skill calls this after writing the recap. Reads the body from stdin
 * so multi-line text + emoji + Arabic pass through cleanly:
 *
 *   printf '%s' "$BODY" | node --env-file=.env.local .claude/skills/recap/publish.mjs
 *
 * This is the ONLY write the skill performs, and only to ai_summaries — it never
 * touches predictions/standings/matches (per CLAUDE.md DB-safety rules).
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

async function main() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (!body) {
    console.error("No recap body on stdin — nothing published.");
    process.exit(1);
  }
  const [row] = await sql`
    insert into ai_summaries (body) values (${body}) returning id, created_at`;
  console.log(`Published AI summary ${row.id} at ${row.created_at.toISOString()}`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e.message);
    await sql.end();
    process.exit(1);
  });
