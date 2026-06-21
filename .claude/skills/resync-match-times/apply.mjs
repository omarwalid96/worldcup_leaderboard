/**
 * APPLY for the /resync-match-times skill. Calls the real server sync
 * (src/lib/football/sync.ts) against the LIVE DB: updates scores/status, syncs
 * kickoff reschedules for still-scheduled matches, and locks any pick whose
 * (refreshed) kickoff has passed. Does NOT grade or recompute standings.
 *
 * ⚠ LIVE MUTATION. Only run after a backup + the user's explicit OK (see SKILL.md).
 *
 * Run (server-only stub required, see SKILL.md):
 *   npx tsx --env-file=.env.local .claude/skills/resync-match-times/apply.mjs
 */
import { syncMatches } from "../../../src/lib/football/sync.ts";

const r = await syncMatches();
console.log("SYNC RESULT:", JSON.stringify(r, null, 2));
process.exit(0);
