/**
 * Pure scoring functions. No I/O — deterministic and unit-testable.
 *
 * Default rules (configurable per league later):
 *   - Exact scoreline:                       5 pts
 *   - Correct result + correct goal diff:    3 pts  (e.g. predicted 2–1, actual 3–2)
 *   - Correct result only (W/D/L):           1 pt
 *   - Wrong result:                          0 pts
 *   - Double-down: that match's points are doubled
 */

export const SCORING = {
  exact: 5,
  resultAndGoalDiff: 3,
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

  if (homePick === homeActual && awayPick === awayActual) {
    return SCORING.exact;
  }

  const predicted = outcome(homePick, awayPick);
  const actual = outcome(homeActual, awayActual);
  if (predicted !== actual) return SCORING.wrong;

  // Same result — does the goal difference also match?
  const predictedDiff = homePick - awayPick;
  const actualDiff = homeActual - awayActual;
  if (predictedDiff === actualDiff) return SCORING.resultAndGoalDiff;

  return SCORING.resultOnly;
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
