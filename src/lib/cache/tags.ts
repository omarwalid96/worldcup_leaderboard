/**
 * Cache tags for `unstable_cache`'d reads, busted by the cron when live data
 * changes (scores/statuses/grading). Keep tag names here so the read side and
 * the cron's revalidate side can never drift.
 *
 * Only SHARED, non-user-specific slow reads are cached (next kickoff, today's
 * team match, the default league). Per-user reads (a user's picks/standings)
 * are left to read through — caching those per-user risks staleness or leaking
 * one user's data to another, for little gain on small indexed tables.
 */
export const LIVE_TAG = "live-matches"; // scores/statuses/grading — busted by cron
