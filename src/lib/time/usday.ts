import { formatInTimeZone } from "date-fns-tz";

/**
 * The tournament is US-anchored. A prediction "day" is the calendar day in US
 * Eastern Time — NOT the user's local day. So a user at 1am local (already the
 * "next day" for them) still predicts the matches on the current ET day.
 */
export const US_TIMEZONE = "America/New_York";

/** The current ET calendar date as "yyyy-MM-dd". */
export function currentUsDate(now: Date = new Date()): string {
  return formatInTimeZone(now, US_TIMEZONE, "yyyy-MM-dd");
}

/** The ET calendar date ("yyyy-MM-dd") for a given instant. */
export function usDateOf(instant: Date | string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return formatInTimeZone(d, US_TIMEZONE, "yyyy-MM-dd");
}

/**
 * True if `kickoffUtc` falls on the same ET calendar day as `now`.
 * This is the "predictable today" gate (kickoff-lock still applies on top).
 */
export function isUsToday(kickoffUtc: Date | string, now: Date = new Date()): boolean {
  return usDateOf(kickoffUtc) === currentUsDate(now);
}
