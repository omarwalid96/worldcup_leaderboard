/**
 * Client-side push subscription helpers.
 * Safe to import from client components — no server-only imports.
 */

/** Converts a VAPID base64url string to a Uint8Array for PushManager. */
export function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

/** Whether the browser supports push notifications. */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Requests notification permission and subscribes to push.
 * Returns the PushSubscription JSON, or null on failure/denial.
 */
export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<PushSubscriptionJSON | null> {
  if (!isPushSupported()) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.ready;
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  return sub.toJSON();
}

/**
 * Unsubscribes from push and returns the subscription JSON that was cleared
 * (so the server action can remove it), or null if there was no subscription.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return false;

  return existing.unsubscribe();
}
