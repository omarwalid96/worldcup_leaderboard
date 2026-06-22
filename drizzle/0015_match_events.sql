-- Snapshot of a match's goals + cards timeline (MatchEvent[]) from ESPN, so old
-- matches keep their timeline after aging off ESPN's scoreboard. Nullable
-- additive column — touches no existing rows. Display only.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS events jsonb;
