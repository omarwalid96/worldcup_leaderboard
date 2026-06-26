import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { env, requireEnv } from "@/lib/env";

/**
 * Server Supabase client bound to the request's cookies. Use in Server
 * Components, Server Actions, and route handlers for the *current user*.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    requireEnv("supabaseUrl"),
    requireEnv("supabaseAnonKey"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component where cookies are read-only;
            // middleware refreshes the session so this is safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Service-role client that BYPASSES RLS. Server-only, never request-bound.
 * Use exclusively for trusted admin work: seeding, cron grading, push fan-out.
 */
export function createSupabaseAdminClient() {
  return createAdminClient(
    requireEnv("supabaseUrl"),
    requireEnv("supabaseServiceRoleKey"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Returns the authenticated user (verified against Supabase) or null. */
/**
 * Authoritative current user — calls Supabase Auth to validate the token over
 * the network. Use this in MUTATIONS (server actions) where we must not trust a
 * possibly-tampered cookie before writing.
 */
export async function getCurrentUser() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Fast current-user id for READ paths (page render). Verifies the session JWT
 * LOCALLY via getClaims() (signature-checked against cached JWKS — no Auth
 * round-trip in the common case), so every page nav doesn't pay a second
 * network call on top of the one the middleware already made this request.
 * Reads only — never use before a write; mutations use getCurrentUser().
 */
export async function getCurrentUserId(): Promise<string | null> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}
