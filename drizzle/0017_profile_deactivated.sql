-- Self-service account deactivation. Nullable timestamp: null = active, set =
-- deactivated at that time. No data is deleted; a deactivated user is hidden
-- from other members (leaderboard, public profile, challenge pickers) and, once
-- logged in, sees only a reactivate screen. Reactivating clears the column.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;
