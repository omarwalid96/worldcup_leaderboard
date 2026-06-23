"use client";

import { Capacitor } from "@capacitor/core";

/**
 * Native app niceties — only active inside the Capacitor shell.
 *
 * - Android hardware back button: navigate history back; exit at root.
 */
export async function initNativeApp(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // Dynamic import keeps @capacitor/app out of the web bundle.
  const { App } = await import("@capacitor/app");

  // Android hardware back button: go back in WebView history; exit at root.
  App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      // At the root — exit the app (standard Android UX).
      App.exitApp();
    }
  });
}
