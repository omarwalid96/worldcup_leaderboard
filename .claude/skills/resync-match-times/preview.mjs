/**
 * READ-ONLY diff for the /resync-match-times skill. Fetches the provider's
 * current fixtures and compares kickoff/score/status against the DB, printing
 * what an apply WOULD change. Writes NOTHING.
 *
 * Run (server-only stub required, see SKILL.md):
 *   npx tsx --env-file=.env.local .claude/skills/resync-match-times/preview.mjs
 *
 * Mirrors the apply rules in src/lib/football/sync.ts:
 *   - kickoff only changes while a match is still 'scheduled'
 *   - finished matches are never touched
 */
import { getFootballProvider } from "../../../src/lib/football/index.ts";
import { db } from "../../../src/db/index.ts";
import { matches } from "../../../src/db/schema.ts";

const fixtures = await getFootballProvider().getFixtures();
const byExt = new Map(fixtures.map((f) => [f.externalId, f]));

const rows = await db.select().from(matches);

const changes = [];
for (const cur of rows) {
  const f = byExt.get(cur.externalId);
  if (!f) continue;
  if (cur.status === "finished") continue;

  const delta = {};
  if (f.homeScore !== cur.homeScore || f.awayScore !== cur.awayScore)
    delta.score = `${cur.homeScore ?? "-"}-${cur.awayScore ?? "-"} → ${f.homeScore ?? "-"}-${f.awayScore ?? "-"}`;
  if (f.status !== cur.status) delta.status = `${cur.status} → ${f.status}`;

  const newK = new Date(f.kickoffUtc);
  if (
    cur.status === "scheduled" &&
    !Number.isNaN(newK.getTime()) &&
    newK.getTime() !== new Date(cur.kickoffUtc).getTime()
  ) {
    const oldK = new Date(cur.kickoffUtc);
    const mins = Math.round((newK.getTime() - oldK.getTime()) / 60000);
    delta.kickoff = `${oldK.toISOString()} → ${newK.toISOString()} (${mins > 0 ? "+" : ""}${mins} min)`;
  }

  if (Object.keys(delta).length)
    changes.push({ match: `${cur.homeTeam} v ${cur.awayTeam}`, ...delta });
}

if (!changes.length) {
  console.log("No changes — DB matches the provider. Nothing to apply.");
} else {
  console.log(`${changes.length} match(es) would change:\n`);
  console.table(changes);
  const reschedules = changes.filter((c) => c.kickoff);
  if (reschedules.length)
    console.log(`\n⚠ ${reschedules.length} KICKOFF reschedule(s) — these affect lock timing.`);
}
process.exit(0);
