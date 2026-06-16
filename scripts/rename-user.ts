/**
 * Renames a user's display name (the name shown on the leaderboard/UI).
 *
 * The login `username` is unchanged — you still sign in with the same username
 * and password. Only `profiles.display_name` is updated.
 *
 * Usage:
 *   npm run users:rename -- omar "New Name"
 *
 * Requires DATABASE_URL in the environment.
 */
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Missing env. Need DATABASE_URL.");
  process.exit(1);
}

const argv = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const [rawUsername, ...nameParts] = argv;
const username = rawUsername?.trim().toLowerCase();
const displayName = nameParts.join(" ").trim();

if (!username || !displayName) {
  console.error('Usage: npm run users:rename -- <username> "<New Display Name>"');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

async function main() {
  const updated = await sql<{ username: string; display_name: string }[]>`
    update profiles
    set display_name = ${displayName}
    where username = ${username}
    returning username, display_name
  `;

  if (updated.length === 0) {
    console.error(`No user found with username "${username}".`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Renamed "${updated[0].username}" → display name is now "${updated[0].display_name}".`,
  );
}

main()
  .then(() => sql.end())
  .catch(async (err) => {
    console.error(err);
    await sql.end();
    process.exit(1);
  });
