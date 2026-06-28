/**
 * Remove ALL test scaffold: the 2 matches (cascades predictions), the TEST
 * league (cascades membership), and the test auth user + profile. By id only.
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
globalThis.WebSocket ??= ws;

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

const USER = "486f827e-4247-4f00-8ea9-32daa7892d8c";
const LEAGUE = "2a263fd5-cbd6-4494-8fdc-6d1df1ce7a18";
const M1 = "ffac47dd-7411-4ebf-a752-280a51d1fc0a";
const M2 = "d348ada9-f8f7-47e7-a5cf-bf9e3cd6d5e6";

const delMatches = await sql`delete from matches where id in (${M1}, ${M2}) returning id`;
// Remove any standings/membership in the TEST league (incl. omar, who joined to
// view it). Scoped by league_id so real-league rows are never touched. The
// league delete cascades these too, but we clear explicitly for clarity.
await sql`delete from standings where league_id=${LEAGUE}`;
await sql`delete from league_members where league_id=${LEAGUE}`;
const delLeague = await sql`delete from leagues where id=${LEAGUE} returning id`;
const { error } = await admin.auth.admin.deleteUser(USER); // cascades profiles row
console.log("deleted matches:", delMatches.length, "| league:", delLeague.length, "| user:", error ? "ERR "+error.message : "ok");
await sql.end();
