/**
 * THROWAWAY test scaffold for the knockout pens UI. Creates one test user, a
 * throwaway TEST league, 2 LIVE knockout matches, and the test user's 2 picks.
 * Touches NO real predictions/standings/matches.
 *
 * Usage (Node 20):
 *   1. node --env-file=.env.local scripts/test-pens-setup.mjs
 *      → prints the new ids. PASTE them into test-pens-finish.mjs and
 *        test-pens-cleanup.mjs (the ids hardcoded there are from a prior run).
 *   2. node --env-file=.env.local scripts/test-pens-finish.mjs  (grade + finish)
 *   3. node --env-file=.env.local scripts/test-pens-cleanup.mjs (remove all)
 */
import { randomBytes } from "node:crypto";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
globalThis.WebSocket ??= ws;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

const USERNAME = "testpen";
const PASSWORD = "testpen-" + randomBytes(4).toString("hex");
const EMAIL = `${USERNAME}@groupstage.local`;

// 1) Test user (auth + profile via trigger). Reuse if it already exists.
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

// 2) Throwaway TEST league owned by the test user.
const code = "TEST" + randomBytes(2).toString("hex").toUpperCase();
const [league] = await sql`
  insert into leagues (name, invite_code, owner_id, is_default)
  values ('TEST League (delete me)', ${code}, ${userId}, false)
  returning id`;
await sql`insert into league_members (league_id, user_id) values (${league.id}, ${userId})
         on conflict do nothing`;
console.log("TEST_LEAGUE_ID:", league.id);

// 3) Two LIVE knockout matches. Kickoff in the past so they're "live" now.
const past = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
async function makeMatch(ext, home, hcode, away, acode, homeScore, awayScore) {
  const [m] = await sql`
    insert into matches (external_id, stage, matchday, home_team, away_team,
      home_code, away_code, venue, kickoff_utc, status, home_score, away_score)
    values (${ext}, 'round_of_32', 18, ${home}, ${away}, ${hcode}, ${acode},
      'Test Arena', ${past}, 'live', ${homeScore}, ${awayScore})
    returning id`;
  return m.id;
}
// M1: live 1–1 (exact draw). M2: live 2–2 (draw → will go to pens).
const m1 = await makeMatch("test-pen-1", "Atlantis FC", "br", "Mock United", "ar", 1, 1);
const m2 = await makeMatch("test-pen-2", "Test City", "de", "Demo Rovers", "fr", 2, 2);
console.log("MATCH_1_ID:", m1, "(Atlantis 1-1 Mock United, live)");
console.log("MATCH_2_ID:", m2, "(Test City 2-2 Demo Rovers, live)");

// 4) Test user's predictions.
//    M1: exact draw 1–1 + pens winner home (Atlantis) → correct. finished: 3+1=4
//    M2: wrong scoreline 1–0 (non-draw, 0 base) + pens winner away (Demo Rovers). finished: 0+1=1
async function makePred(matchId, hp, ap, pensWinner) {
  const [p] = await sql`
    insert into predictions (user_id, match_id, home_pick, away_pick, pens_winner, locked)
    values (${userId}, ${matchId}, ${hp}, ${ap}, ${pensWinner}, true)
    returning id`;
  return p.id;
}
const p1 = await makePred(m1, 1, 1, "home");
const p2 = await makePred(m2, 1, 0, "away");
console.log("PRED_1_ID:", p1, "(1-1, pens=home/Atlantis)");
console.log("PRED_2_ID:", p2, "(1-0, pens=away/Demo Rovers)");

console.log("\nDONE. View as omar → Matches → Live tab. Open each match to see League picks + pens tag.");
await sql.end();
