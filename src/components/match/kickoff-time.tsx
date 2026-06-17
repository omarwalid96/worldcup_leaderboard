"use client";

import { useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";

/**
 * Renders a kickoff instant in the viewer's own timezone.
 *
 * SSR uses `fallbackTz` (the user's stored profile tz) to avoid a hydration
 * mismatch; on mount we switch to the browser's actual resolved timezone so a
 * traveling user always sees their real local time.
 */
export function KickoffTime({
  kickoffUtc,
  fallbackTz,
  format = "EEE d MMM · HH:mm",
  className,
}: {
  kickoffUtc: string | Date;
  fallbackTz: string;
  format?: string;
  className?: string;
}) {
  const [tz, setTz] = useState(fallbackTz);

  useEffect(() => {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (resolved) setTz(resolved);
    } catch {
      // keep fallback
    }
  }, []);

  const date = typeof kickoffUtc === "string" ? new Date(kickoffUtc) : kickoffUtc;
  return (
    <time dateTime={date.toISOString()} className={className} suppressHydrationWarning>
      {formatInTimeZone(date, tz, format)}
    </time>
  );
}

/** Minutes before kickoff that the live mm:ss + urgent pulse kick in. */
const URGENT_MINUTES = 10;

/**
 * Prediction countdown to the lock (kickoff). Coarse ("in 2h"/"in 30m") until
 * the final 10 minutes, then a live ticking mm:ss with an urgent red pulse —
 * the "about to close" heartbeat. Renders nothing once locked.
 */
export function PredictionCountdown({
  kickoffUtc,
  className,
  withLabel = false,
}: {
  kickoffUtc: string | Date;
  className?: string;
  /** Prefix with "Closes " (for the predict page). Cards omit it. */
  withLabel?: boolean;
}) {
  const [diff, setDiff] = useState<number | null>(null);

  useEffect(() => {
    const target = (typeof kickoffUtc === "string" ? new Date(kickoffUtc) : kickoffUtc).getTime();
    const tick = () => setDiff(target - Date.now());
    tick();
    // Tick every second inside the urgent window, else every 30s.
    const id = setInterval(() => {
      const d = target - Date.now();
      setDiff(d);
    }, 1000);
    return () => clearInterval(id);
  }, [kickoffUtc]);

  if (diff == null || diff <= 0) return null;

  const totalSec = Math.floor(diff / 1000);
  const mins = Math.floor(totalSec / 60);
  const urgent = mins < URGENT_MINUTES;

  let text: string;
  if (urgent) {
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    text = `${mm}:${ss.toString().padStart(2, "0")}`;
  } else if (mins < 60) {
    text = `${mins}m`;
  } else if (mins < 60 * 24) {
    text = `${Math.floor(mins / 60)}h`;
  } else {
    text = `${Math.floor(mins / (60 * 24))}d`;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tabular-nums transition-colors",
        urgent ? "font-semibold text-live" : "text-primary",
        className,
      )}
    >
      {urgent && (
        <span className="size-1.5 rounded-full bg-live animate-live-pulse" aria-hidden />
      )}
      {withLabel ? "Closes " : ""}
      {text}
    </span>
  );
}
