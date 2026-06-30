/**
 * Remove the live-pens mock scaffold: the match (cascades predictions), the
 * TEST league (cascades membership/standings), the test user, and the mock
 * JSON. PASTE the ids printed by live-pens-mock-setup.mjs below.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
globalThis.WebSocket ??= ws;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

// Fallback to the well-known test username/league if ids weren't pasted.
const USER = ""; // paste TEST_USER_ID
const LEAGUE = ""; // paste TEST_LEAGUE_ID
const MATCH = ""; // paste MATCH_ID

if (MATCH) await sql`delete from matches where id=${MATCH}`;
else await sql`delete from matches where external_id='live-pens-mock'`;

const leagueId =
  LEAGUE ||
  (await sql`select id from leagues where name='TEST League (delete me)' limit 1`)[0]?.id;
if (leagueId) {
  await sql`delete from standings where league_id=${leagueId}`;
  await sql`delete from league_members where league_id=${leagueId}`;
  await sql`delete from leagues where id=${leagueId}`;
}

const userId =
  USER || (await sql`select id from profiles where username='testpen' limit 1`)[0]?.id;
if (userId) await admin.auth.admin.deleteUser(userId);

await rm(join(process.cwd(), "scratchpad", "live-mock.json"), { force: true });
console.log("cleaned: match, league, user, live-mock.json");
await sql.end();
