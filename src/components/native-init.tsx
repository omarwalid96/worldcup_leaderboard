"use client";

/**
 * Mounts once in the authenticated layout; initialises native-only capabilities
 * (push registration, hardware back button, haptics upgrade).
 *
 * Completely inert on web — all paths are guarded by Capacitor.isNativePlatform().
 * Using a dynamic import inside each function so the native Capacitor plugins are
 * never bundled into the web JS output at all.
 */

import { useEffect } from "react";
import { initNativePush } from "@/lib/notifications/native";
import { initNativeApp } from "@/lib/native/app";

export function NativeInit() {
  useEffect(() => {
    // Fire once on mount (auth is already confirmed by the server layout guard).
    void initNativePush();
    void initNativeApp();
  }, []);

  return null; // renders nothing
}
