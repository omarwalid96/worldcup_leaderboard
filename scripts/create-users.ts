/**
 * Creates preset username/password accounts via the Supabase Admin API.
 *
 * Usage:
 *   npm run users:create                       # creates the default roster below
 *   npm run users:create -- omar alex sam      # creates these usernames
 *
 * For each user we:
 *   - create an auth user with a synthetic email (username@groupstage.local),
 *     email pre-confirmed, password = generated (or USER_PASSWORD env for all)
 *   - pass username/display_name/is_admin in user_metadata so the DB trigger
 *     creates the matching profiles row
 *   - ensure a default "Main League" exists and add the user to it
 *
 * Prints a credentials table at the end. Requires SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY + DATABASE_URL in the environment.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const DOMAIN = "groupstage.local";

if (!SUPABASE_URL || !SERVICE_KEY || !DATABASE_URL) {
  console.error(
    "Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL.",
  );
  process.exit(1);
}

// Default roster: just the admin for now. Friends added later.
const DEFAULT_USERS = ["omar"];
const ADMIN_USERS = new Set(["omar"]);

const argv = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const usernames = (argv.length > 0 ? argv : DEFAULT_USERS).map((u) =>
  u.trim().toLowerCase(),
);

function genPassword(): string {
  // Readable-ish 16-char password.
  return randomBytes(12).toString("base64url").slice(0, 16);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

async function ensureDefaultLeague(ownerId: string): Promise<string> {
  const existing = await sql<{ id: string }[]>`
    select id from leagues where is_default = true limit 1
  `;
  if (existing.length > 0) return existing[0].id;

  const code = randomBytes(4).toString("hex").toUpperCase();
  const [created] = await sql<{ id: string }[]>`
    insert into leagues (name, invite_code, owner_id, is_default)
    values ('Main League', ${code}, ${ownerId}, true)
    returning id
  `;
  console.log(`  created default "Main League" (invite ${code})`);
  return created.id;
}

async function main() {
  const results: { username: string; password: string; status: string }[] = [];
  const sharedPassword = process.env.USER_PASSWORD; // optional: same password for all

  for (const username of usernames) {
    const email = `${username}@${DOMAIN}`;
    const password = sharedPassword || genPassword();
    const isAdmin = ADMIN_USERS.has(username);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        display_name: username.charAt(0).toUpperCase() + username.slice(1),
        is_admin: isAdmin,
        timezone: "UTC",
      },
    });

    if (error) {
      // If the user already exists, surface that rather than failing the run.
      results.push({ username, password: "—", status: `skip (${error.message})` });
      continue;
    }

    const userId = data.user!.id;

    // The trigger created the profile; ensure default league + membership.
    const leagueId = await ensureDefaultLeague(userId);
    await sql`
      insert into league_members (league_id, user_id)
      values (${leagueId}, ${userId})
      on conflict do nothing
    `;
    // Seed an empty standings row so the user shows on the table immediately.
    await sql`
      insert into standings (league_id, user_id)
      values (${leagueId}, ${userId})
      on conflict do nothing
    `;

    results.push({ username, password, status: isAdmin ? "created (admin)" : "created" });
  }

  console.log("\n┌─ Credentials ───────────────────────────────");
  for (const r of results) {
    console.log(`│ ${r.username.padEnd(14)} ${r.password.padEnd(18)} ${r.status}`);
  }
  console.log("└─────────────────────────────────────────────");
  console.log("Log in at /login with the username + password above.");
}

main()
  .then(() => sql.end())
  .catch(async (err) => {
    console.error(err);
    await sql.end();
    process.exit(1);
  });
