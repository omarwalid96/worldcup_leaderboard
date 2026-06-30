/**
 * THROWAWAY scaffold to debug the LIVE pens overlay end-to-end against a MOCK
 * ESPN match. Creates: 1 test user, 1 throwaway TEST league, 1 LIVE knockout
 * match, and the user's pick. Then writes scratchpad/live-mock.json (ESPN
 * shape) so /api/live serves a live match the client overlay can render.
 *
 * The mock match uses REAL FIFA teams (Brazil vs Argentina) so the DB row and
 * the ESPN-shaped mock reconcile by team code in useLiveMatch — exactly the
 * production path. Touches NO real predictions/standings/matches.
 *
 * Usage (Node 20):
 *   1. node --env-file=.env.local scripts/live-pens-mock-setup.mjs
 *   2. LIVE_MOCK=1 PORT=4010 npm run start   (or set LIVE_MOCK=1 in dev)
 *   3. Log in as omar, open the live match. Edit scratchpad/live-mock.json to
 *      step the shootout (shootoutHome/shootoutAway) — the 20s poll picks it up.
 *   4. node --env-file=.env.local scripts/live-pens-mock-cleanup.mjs  (remove all)
 */
import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
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

const USERNAME = "testpen";
const PASSWORD = "testpen-" + randomBytes(4).toString("hex");
const EMAIL = `${USERNAME}@groupstage.local`;

// Real FIFA teams so DB names and the ESPN-shaped mock reconcile by code.
const HOME = "Brazil";
const HCODE = "br";
const AWAY = "Argentina";
const ACODE = "ar";

// 1) Test user.
let userId;
{
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username: USERNAME, display_name: "Test Pen", is_admin: false },
  });
  if (error && !/already/i.test(error.message)) throw error;
  if (data?.user) userId = data.user.id;
  if (!userId) {
    const [p] = await sql`select id from profiles where username=${USERNAME} limit 1`;
    userId = p.id;
  }
}
console.log("TEST_USER_ID:", userId, "| login:", USERNAME, "/", PASSWORD);

// 2) Throwaway TEST league.
const code = "TEST" + randomBytes(2).toString("hex").toUpperCase();
const [league] = await sql`
  insert into leagues (name, invite_code, owner_id, is_default)
  values ('TEST League (delete me)', ${code}, ${userId}, false)
  returning id`;
await sql`insert into league_members (league_id, user_id) values (${league.id}, ${userId})
         on conflict do nothing`;
console.log("TEST_LEAGUE_ID:", league.id);

// 3) One LIVE knockout match, 2-2 (heading to pens). Kickoff 1h ago.
const past = new Date(Date.now() - 60 * 60 * 1000);
const [m] = await sql`
  insert into matches (external_id, stage, matchday, home_team, away_team,
    home_code, away_code, venue, kickoff_utc, status, home_score, away_score)
  values ('live-pens-mock', 'round_of_32', 18, ${HOME}, ${AWAY}, ${HCODE}, ${ACODE},
    'Test Arena', ${past}, 'live', 2, 2)
  returning id`;
console.log("MATCH_ID:", m.id, `(${HOME} 2-2 ${AWAY}, live)`);

// 4) User pick: 2-2, pens winner home.
const [p] = await sql`
  insert into predictions (user_id, match_id, home_pick, away_pick, pens_winner, locked)
  values (${userId}, ${m.id}, 2, 2, 'home', true)
  returning id`;
console.log("PRED_ID:", p.id, "(2-2, pens=home)");

// 5) Write the ESPN-shaped mock — starts at full time 2-2, pens 0-0 (period 5),
//    so you can step shootoutHome/shootoutAway by hand and watch it live.
const mock = {
  home: HOME,
  away: AWAY,
  homeScore: 2,
  awayScore: 2,
  clock: "120'",
  period: 5, // penalties
  detail: "Penalty Shootout",
  completed: false, // flip to true to simulate the deciding kick
  shootoutHome: 0,
  shootoutAway: 0,
  matchId: m.id,
};
await mkdir(join(process.cwd(), "scratchpad"), { recursive: true });
await writeFile(
  join(process.cwd(), "scratchpad", "live-mock.json"),
  JSON.stringify(mock, null, 2) + "\n",
);
console.log("\nWrote scratchpad/live-mock.json (pens 0-0). Edit it to step the shootout.");
console.log("Run with LIVE_MOCK=1 so /api/live serves it.");
console.log("PASTE these ids into scripts/live-pens-mock-cleanup.mjs:");
console.log(`  USER=${userId}\n  LEAGUE=${league.id}\n  MATCH=${m.id}`);
await sql.end();
