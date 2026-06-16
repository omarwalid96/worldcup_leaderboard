"use client";

import { useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";

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

/** A short relative "in 2h" / "kicks off soon" hint. */
export function KickoffCountdown({
  kickoffUtc,
  className,
}: {
  kickoffUtc: string | Date;
  className?: string;
}) {
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    const target = (typeof kickoffUtc === "string" ? new Date(kickoffUtc) : kickoffUtc).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setLabel("");
        return;
      }
      const mins = Math.floor(diff / 60000);
      if (mins < 60) setLabel(`in ${mins}m`);
      else if (mins < 60 * 24) setLabel(`in ${Math.floor(mins / 60)}h`);
      else setLabel(`in ${Math.floor(mins / (60 * 24))}d`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [kickoffUtc]);

  if (!label) return null;
  return <span className={className}>{label}</span>;
}
