-- Performance indexes (idempotent, additive — no data changes).

-- Leaderboard is queried by league_id and ordered by rank (getLeaderboard),
-- and awardBadges() scans WHERE rank = 1. The (league_id, user_id) PK can't
-- serve the rank ordering/filter, so add a (league_id, rank) btree.
CREATE INDEX IF NOT EXISTS standings_league_rank_idx ON standings (league_id, rank);

-- Per-user graded aggregates and the grading filter touch predictions by
-- user_id together with points_awarded (e.g. ungraded vs graded picks).
CREATE INDEX IF NOT EXISTS predictions_user_points_idx ON predictions (user_id, points_awarded);
