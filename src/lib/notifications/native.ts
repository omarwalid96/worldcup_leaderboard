"use client";

/**
 * Native push notification handler — only active inside the Capacitor shell.
 *
 * On the web, the existing service-worker path (public/sw.js + notifications/client.ts)
 * handles push; this module is a strict no-op there.
 *
 * Call initNativePush() once from the authenticated app layout client boundary.
 */

import { Capacitor } from "@capacitor/core";

export async function initNativePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // Dynamic import so the bundle never pulls PushNotifications on web.
  const { PushNotifications } = await import("@capacitor/push-notifications");

  // 1. Request permission.
  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== "granted") {
    console.info("[native-push] permission not granted:", receive);
    return;
  }

  // 2. Register with APNs / FCM.
  await PushNotifications.register();

  // 3. Handle token.
  PushNotifications.addListener("registration", (token) => {
    // ponytail: token registration stubbed — wire to a native_push_tokens table
    // when going live. Steps:
    //   a. Create table: native_push_tokens(id, user_id, token, platform, created_at)
    //   b. Add POST /api/push/native-register server route that upserts the token
    //      (keyed by user_id + platform) and returns 200.
    //   c. Replace console.info below with:
    //      fetch("/api/push/native-register", { method:"POST",
    //        headers:{"Content-Type":"application/json"},
    //        body: JSON.stringify({ token: token.value,
    //          platform: Capacitor.getPlatform() }) })
    //   d. In send.ts, branch on token type: web subscriptions → web-push VAPID;
    //      native tokens → FCM HTTP v1 (covers both iOS APNs and Android FCM).
    console.info(
      "[native-push] device token (not yet registered to server):",
      token.value,
    );
  });

  // 4. Handle registration errors.
  PushNotifications.addListener("registrationError", (err) => {
    console.error("[native-push] registration error:", err);
  });

  // 5. Foreground notification display — show it as an alert.
  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.info("[native-push] foreground notification:", notification.title);
    // No-op: Capacitor shows the native banner automatically when
    // presentationOptions includes "alert" (configured in capacitor.config.ts).
  });

  // 6. Notification tap → navigate the WebView to the payload url.
  PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action) => {
      const url: string | undefined = action.notification.data?.url;
      if (url) {
        // Navigate the WebView — same pattern as the SW's notificationclick handler.
        // Relative paths work because the WebView loads the prod origin.
        window.location.href = url;
      }
    },
  );
}
