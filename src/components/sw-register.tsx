"use client";

import { useEffect } from "react";

/**
 * Registers the service worker once on mount. Silent no-op when SW is
 * unsupported (e.g. iOS Safari without PWA installed).
 */
export function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        console.warn("[SW] registration failed:", err);
      });
  }, []);

  return null;
}
