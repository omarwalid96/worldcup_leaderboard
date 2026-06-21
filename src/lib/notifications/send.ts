import "server-only";
import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireEnv } from "@/lib/env";

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

interface StoredSub {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface NotifPrefs {
  lockReminder?: boolean;
  scoreHit?: boolean;
  rankClimb?: boolean;
  gameChallenge?: boolean;
  nudge?: boolean;
}

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  const publicKey = requireEnv("vapidPublicKey");
  const privateKey = requireEnv("vapidPrivateKey");
  const subject = requireEnv("vapidSubject");
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

/**
 * Sends a push notification to a single user.
 * - Reads the stored PushSubscription from the profiles table.
 * - Respects the user's notifPrefs for the given pref key.
 * - On 404/410 from the push service, clears the dead subscription.
 * - Throws are swallowed so a push failure never breaks the caller.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  prefKey?: keyof NotifPrefs,
): Promise<void> {
  try {
    ensureVapid();

    const [profile] = await db
      .select({ pushSubscription: profiles.pushSubscription, notifPrefs: profiles.notifPrefs })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    if (!profile?.pushSubscription) return;

    // Check preference gate if a key was provided.
    if (prefKey) {
      const prefs = (profile.notifPrefs ?? {}) as NotifPrefs;
      // Default true when the pref is missing.
      const enabled = prefs[prefKey] !== false;
      if (!enabled) return;
    }

    const sub = profile.pushSubscription as unknown as StoredSub;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return;

    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon ?? "/icon.png",
        url: payload.url ?? "/dashboard",
      }),
    );
  } catch (err: unknown) {
    // Clear dead subscriptions (410 Gone / 404 Not Found).
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 410 || status === 404) {
      try {
        await db
          .update(profiles)
          .set({ pushSubscription: null })
          .where(eq(profiles.id, userId));
      } catch {
        // ignore cleanup failure
      }
    } else {
      console.warn(`[push] failed for user ${userId}:`, err);
    }
  }
}

/**
 * Fan-out push to multiple users in parallel.
 * Errors from individual sends are already swallowed by sendPushToUser.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
  prefKey?: keyof NotifPrefs,
): Promise<void> {
  if (userIds.length === 0) return;
  await Promise.all(userIds.map((id) => sendPushToUser(id, payload, prefKey)));
}
