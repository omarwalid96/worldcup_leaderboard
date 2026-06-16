/**
 * Pure scoring functions. No I/O — deterministic and unit-testable.
 *
 * Rules:
 *   - Exact scoreline:                3 pts
 *   - Correct outcome only (W/D/L):   1 pt   (right winner, or both drew)
 *   - Wrong outcome:                  0 pts
 *   - Double-down: that match's points are doubled (exact → 6, outcome → 2)
 */

export const SCORING = {
  exact: 3,
  resultOnly: 1,
  wrong: 0,
  streakBonusPerDay: 1,
  streakBonusCap: 5,
} as const;

export type Outcome = "home" | "draw" | "away";

export function outcome(home: number, away: number): Outcome {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

export interface ScoreInput {
  homePick: number;
  awayPick: number;
  homeActual: number;
  awayActual: number;
  isDoubleDown: boolean;
}

/** Base points for a single prediction before the double-down multiplier. */
export function basePoints(input: Omit<ScoreInput, "isDoubleDown">): number {
  const { homePick, awayPick, homeActual, awayActual } = input;

  // Exact scoreline.
  if (homePick === homeActual && awayPick === awayActual) {
    return SCORING.exact;
  }

  // Correct outcome (same winner, or both predicted+actual are draws).
  if (outcome(homePick, awayPick) === outcome(homeActual, awayActual)) {
    return SCORING.resultOnly;
  }

  return SCORING.wrong;
}

/** Final points for a prediction, applying the double-down multiplier. */
export function scorePrediction(input: ScoreInput): number {
  const base = basePoints(input);
  return input.isDoubleDown ? base * 2 : base;
}

export function isExactHit(input: Omit<ScoreInput, "isDoubleDown">): boolean {
  return (
    input.homePick === input.homeActual && input.awayPick === input.awayActual
  );
}

export function isCorrectResult(
  input: Omit<ScoreInput, "isDoubleDown">,
): boolean {
  return (
    outcome(input.homePick, input.awayPick) ===
    outcome(input.homeActual, input.awayActual)
  );
}

/** Streak bonus given a run of consecutive matchdays with >=1 correct result. */
export function streakBonus(consecutiveDays: number): number {
  return Math.min(
    consecutiveDays * SCORING.streakBonusPerDay,
    SCORING.streakBonusCap,
  );
}
