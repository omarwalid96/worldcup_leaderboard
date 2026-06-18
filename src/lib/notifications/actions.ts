"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireProfile } from "@/lib/auth/session";

export interface NotifPrefs {
  lockReminder: boolean;
  scoreHit: boolean;
  rankClimb: boolean;
  gameChallenge: boolean;
}

/**
 * Persists a PushSubscription JSON for the current user.
 * Called by the client after the user grants Notification permission.
 */
export async function savePushSubscription(
  sub: PushSubscriptionJSON,
): Promise<void> {
  const profile = await requireProfile();
  await db
    .update(profiles)
    .set({ pushSubscription: sub as Record<string, unknown> })
    .where(eq(profiles.id, profile.id));
}

/**
 * Clears the push subscription for the current user (unsubscribe path).
 */
export async function removePushSubscription(): Promise<void> {
  const profile = await requireProfile();
  await db
    .update(profiles)
    .set({ pushSubscription: null })
    .where(eq(profiles.id, profile.id));
}

/**
 * Updates notification preferences for the current user.
 */
export async function updateNotifPrefs(prefs: NotifPrefs): Promise<void> {
  const profile = await requireProfile();
  await db
    .update(profiles)
    .set({ notifPrefs: prefs as unknown as Record<string, unknown> })
    .where(eq(profiles.id, profile.id));
}
