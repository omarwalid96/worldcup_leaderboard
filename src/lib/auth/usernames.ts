/**
 * Username ↔ synthetic-email mapping.
 *
 * Friends log in with a plain username + password. Supabase Auth requires an
 * email, so we map each username to a deterministic synthetic address. The
 * username is the source of truth and is also stored on profiles.username.
 */

export const SYNTHETIC_EMAIL_DOMAIN = "groupstage.local";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_RE.test(normalizeUsername(raw));
}

export function usernameToEmail(rawUsername: string): string {
  const username = normalizeUsername(rawUsername);
  return `${username}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export function emailToUsername(email: string): string {
  return email.split("@")[0]?.toLowerCase() ?? email;
}
