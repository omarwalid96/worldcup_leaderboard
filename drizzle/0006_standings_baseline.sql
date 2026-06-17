-- Manual starting points per standing row. total_points = baseline_points +
-- sum(graded prediction points). Lets an admin set a starting score that
-- survives re-grading. Idempotent.
ALTER TABLE "standings"
  ADD COLUMN IF NOT EXISTS "baseline_points" integer NOT NULL DEFAULT 0;
