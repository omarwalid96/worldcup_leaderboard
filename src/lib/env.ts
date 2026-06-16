/**
 * Centralized env access. We intentionally do NOT hard-throw at import time for
 * optional/server-only vars, because some surfaces (e.g. the public landing page)
 * render fine without Supabase configured. Helpers throw lazily when a feature
 * that genuinely needs a var is invoked.
 */

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  databaseUrl: process.env.DATABASE_URL,
  // "worldcup26" (near-live, default) or "openfootball" (final results only).
  footballProvider: process.env.FOOTBALL_PROVIDER ?? "worldcup26",
  footballLiveApiKey: process.env.FOOTBALL_LIVE_API_KEY,
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  vapidSubject: process.env.VAPID_SUBJECT,
  cronSecret: process.env.CRON_SECRET,
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
} as const;

/** Whether the public Supabase client can be constructed at all. */
export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabaseAnonKey,
);

export function requireEnv<K extends keyof typeof env>(key: K): string {
  const value = env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable for "${String(key)}". ` +
        `Check .env.local against .env.example.`,
    );
  }
  return value as string;
}
