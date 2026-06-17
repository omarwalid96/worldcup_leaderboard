"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refreshes the current server-rendered page on an interval so live scores
 * appear without a manual reload. Mount it ONLY when a live match is on screen.
 *
 * Cost note: router.refresh() re-runs the page's SERVER query (reads our DB) —
 * it does NOT call the football API (only the cron does). So this adds no load
 * to the data source. We poll every 5 min (matching the cron cadence; faster is
 * pointless), and only while the tab is visible — so it's near-zero when idle.
 */
export function LiveRefresher({ intervalMs = 300_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      // Only refresh when the tab is visible — no point polling in the background.
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
