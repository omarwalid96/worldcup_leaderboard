import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, type Profile } from "@/db/schema";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Returns the current user's profile row, or null if signed out / no profile.
 * Cached per-request so multiple components don't re-query.
 */
export const getSessionProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  return profile ?? null;
});

/** Like getSessionProfile but redirects to /login when unauthenticated. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  return profile;
}
