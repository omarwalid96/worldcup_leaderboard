-- Rank history table: captures each user's rank per matchday per league.
-- Populated (upserted) by recomputeLeagueStandings after each grading run.

CREATE TABLE IF NOT EXISTS "rank_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
	"league_id" uuid NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
	"matchday" integer NOT NULL,
	"rank" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "rank_history_user_league_matchday_unique"
  ON "rank_history" ("user_id", "league_id", "matchday");

CREATE INDEX IF NOT EXISTS "rank_history_user_idx"
  ON "rank_history" ("user_id");
