/**
 * Sets a new password for a user via the Supabase Admin API.
 *
 * The password lives on the auth user, not in the `profiles` table. We resolve
 * the username to its auth user via the synthetic email (username@groupstage.local),
 * then update the password.
 *
 * Usage:
 *   npm run users:password -- omar "new-password"   # set this password
 *   npm run users:password -- omar                  # generate a random password
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment.
 */
import { randomBytes } from "node:crypto";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";

// supabase-js initializes a Realtime client which needs a WebSocket. Node < 22
// has no native one, so polyfill with `ws` for this CLI script.
// @ts-expect-error - assigning to the global for the supabase realtime client
globalThis.WebSocket ??= ws;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOMAIN = "groupstage.local";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const argv = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const [rawUsername, rawPassword] = argv;
const username = rawUsername?.trim().toLowerCase();

if (!username) {
  console.error('Usage: npm run users:password -- <username> ["<new-password>"]');
  process.exit(1);
}

function genPassword(): string {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

const password = rawPassword?.trim() || genPassword();

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserIdByEmail(email: string): Promise<string | null> {
  // Page through admin.listUsers until we find the matching email.
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) break; // last page
  }
  return null;
}

async function main() {
  const email = `${username}@${DOMAIN}`;
  const userId = await findUserIdByEmail(email);

  if (!userId) {
    console.error(`No auth user found for username "${username}" (${email}).`);
    process.exitCode = 1;
    return;
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    console.error(`Failed to set password: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log("\n┌─ New credentials ───────────────────────────");
  console.log(`│ ${username.padEnd(14)} ${password}`);
  console.log("└─────────────────────────────────────────────");
  console.log("Log in at /login with the username + password above.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
