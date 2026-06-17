import { formatInTimeZone } from "date-fns-tz";

/**
 * Prediction window: a pick can be created/edited starting 12 hours before
 * kickoff and locks at kickoff. "12h before kickoff" is a fixed UTC instant
 * (the same moment for everyone) — a user's timezone only affects how that
 * open-time is displayed, not when it opens.
 */
export const PREDICTION_WINDOW_HOURS = 12;
const WINDOW_MS = PREDICTION_WINDOW_HOURS * 60 * 60 * 1000;

/**
 * App release: participation/engagement only counts matches from here onward
 * (earlier matches happened before anyone could use the app). Midnight US
 * Eastern on 2026-06-17 = 04:00 UTC (EDT, UTC-4).
 */
export const RELEASE_DATE_UTC = "2026-06-17T04:00:00Z";

/** The instant predictions open for a match (kickoff − 12h). */
export function predictionOpensAt(kickoffUtc: Date | string): Date {
  const k = typeof kickoffUtc === "string" ? new Date(kickoffUtc) : kickoffUtc;
  return new Date(k.getTime() - WINDOW_MS);
}

/**
 * True when a match is currently predictable: within the 12h pre-kickoff window
 * and not yet kicked off. Server-authoritative (uses the passed `now`, default
 * the server clock). The kickoff lock still applies as the upper bound.
 */
export function isPredictable(
  kickoffUtc: Date | string,
  now: Date = new Date(),
): boolean {
  const k = typeof kickoffUtc === "string" ? new Date(kickoffUtc) : kickoffUtc;
  const opens = k.getTime() - WINDOW_MS;
  const t = now.getTime();
  return t >= opens && t < k.getTime();
}

/** Display the open-time in the user's timezone (e.g. "Wed 17 · 09:00"). */
export function formatOpensAt(
  kickoffUtc: Date | string,
  tz: string,
  fmt = "EEE d · HH:mm",
): string {
  return formatInTimeZone(predictionOpensAt(kickoffUtc), tz, fmt);
}
