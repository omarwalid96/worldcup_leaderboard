-- Snapshot of a match's full gamecast (MatchGamecast: team stats + lineups +
-- timeline) from ESPN, so old matches keep stats/lineups after aging off ESPN's
-- scoreboard. Nullable additive column — touches no existing rows. Display only.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS gamecast jsonb;
