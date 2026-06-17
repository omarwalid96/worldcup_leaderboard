-- Penalty shootout support (knockout matches). All additive + nullable; the
-- data source can't report shootouts, so an admin sets the actual result.
-- Idempotent.

-- Actual shootout result (admin-entered post-match). wentToPens gates scoring.
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "went_to_pens" boolean NOT NULL DEFAULT false;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "pens_home" integer;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "pens_away" integer;

-- User's shootout prediction (saved upfront with their scoreline pick).
ALTER TABLE "predictions" ADD COLUMN IF NOT EXISTS "pens_winner" text;       -- 'home' | 'away'
ALTER TABLE "predictions" ADD COLUMN IF NOT EXISTS "pens_home_pick" integer; -- optional exact guess
ALTER TABLE "predictions" ADD COLUMN IF NOT EXISTS "pens_away_pick" integer;
