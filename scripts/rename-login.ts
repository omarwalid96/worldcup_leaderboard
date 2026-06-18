/**
 * Renames a user's LOGIN username (what they type to sign in), preserving their
 * UID and ALL their data.
 *
 * This is different from `users:rename`, which only changes the display name.
 * Here we change the login identity itself:
 *   - profiles.username
 *   - auth.users.email  (the synthetic <username>@groupstage.local login email)
 *
 * The UID (auth.users.id == profiles.id) is NEVER touched, so every prediction,
 * standing, badge, and history row — all keyed by that id — stays intact. The
 * password also lives on the auth user (keyed by id), so it is unchanged: the
 * user logs in with the NEW username and their SAME password.
 *
 * Runs in a single transaction with guards: it aborts unless exactly one
 * profile matches the old username, and refuses if the new username/email is
 * already taken by someone else.
 *
 * Usage:
 *   npm run users:rename-login -- testa nayara
 *
 * Requires DATABASE_URL in the environment.
 */
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
const DOMAIN = "groupstage.local";
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

if (!DATABASE_URL) {
  console.error("Missing env. Need DATABASE_URL.");
  process.exit(1);
}

const argv = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const [rawOld, rawNew] = argv;
const oldUsername = rawOld?.trim().toLowerCase();
const newUsername = rawNew?.trim().toLowerCase();

if (!oldUsername || !newUsername) {
  console.error("Usage: npm run users:rename-login -- <old-username> <new-username>");
  process.exit(1);
}

if (!USERNAME_RE.test(newUsername)) {
  console.error(
    `Invalid new username "${newUsername}". Must match ${USERNAME_RE} (3-20 lowercase letters/digits/underscore).`,
  );
  process.exit(1);
}

const newEmail = `${newUsername}@${DOMAIN}`;
const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

async function main() {
  await sql.begin(async (tx) => {
    const prof = await tx<{ id: string; username: string }[]>`
      select id, username from profiles where username = ${oldUsername}
    `;
    if (prof.length !== 1) {
      throw new Error(
        `Expected exactly 1 profile with username "${oldUsername}", found ${prof.length}.`,
      );
    }
    const uid = prof[0].id;

    const clashProfile = await tx`
      select id from profiles where username = ${newUsername} and id <> ${uid}
    `;
    if (clashProfile.length) {
      throw new Error(`Username "${newUsername}" is already taken in profiles.`);
    }
    const clashAuth = await tx`
      select id from auth.users where email = ${newEmail} and id <> ${uid}
    `;
    if (clashAuth.length) {
      throw new Error(`Email "${newEmail}" is already taken in auth.users.`);
    }

    const p = await tx<{ id: string; username: string; display_name: string }[]>`
      update profiles set username = ${newUsername}
      where id = ${uid}
      returning id, username, display_name
    `;
    const u = await tx<{ id: string; email: string }[]>`
      update auth.users set email = ${newEmail}
      where id = ${uid}
      returning id, email
    `;
    if (u.length !== 1) {
      throw new Error(`auth.users update affected ${u.length} rows (expected 1).`);
    }

    console.log(`Renamed login "${oldUsername}" -> "${newUsername}".`);
    console.log(`  profiles.username  = ${p[0].username}`);
    console.log(`  auth.users.email   = ${u[0].email}`);
    console.log(`  display_name       = ${p[0].display_name} (unchanged)`);
    console.log(`  UID (unchanged)    = ${uid}`);
    console.log(`  Password unchanged — log in with "${newUsername}" + same password.`);
  });
}

main()
  .then(() => sql.end())
  .catch(async (err) => {
    console.error("FAILED (rolled back):", err.message ?? err);
    await sql.end();
    process.exit(1);
  });
