/**
 * Pure scoring functions. No I/O — deterministic and unit-testable.
 *
 * Rules:
 *   - Exact scoreline:                3 pts   (same in group and knockout)
 *   - Correct outcome only (W/D/L):   1 pt   (right winner, or both drew)
 *   - Wrong outcome:                  0 pts
 *   - Double-down: that match's points are doubled (exact → 6, outcome → 2)
 *
 * Knockout extra (only when the 90'+ET result is a DRAW and it goes to pens):
 *   - Correct shootout winner: +1 (on top of the scoreline points, NOT doubled).
 *   So a perfect knockout-draw call = 3 (exact draw) + 1 (pens winner) = 4.
 *   (The exact-shootout-score +1 is disabled for now — see scorePens.)
 */

export const SCORING = {
  exact: 3,
  resultOnly: 1,
  wrong: 0,
  streakBonusPerDay: 1,
  streakBonusCap: 5,
  // Penalty shootout bonus (knockout only, on top of the scoreline points).
  pensWinner: 1, // correct team advances on pens
  pensExact: 1, // exact shootout score — disabled for now, kept for later
} as const;

export interface PensInput {
  /** User's pick: which team they think wins the shootout. */
  pickWinner: "home" | "away" | null;
  pickHome: number | null;
  pickAway: number | null;
  /** Actual shootout result (admin-entered). */
  actualHome: number;
  actualAway: number;
}

/**
 * Bonus points for a penalty-shootout prediction. Only call this when the match
 * actually went to pens. Correct shootout winner = +1. Double-down does NOT
 * apply to the pens bonus.
 * ponytail: the exact-shootout-score +1 is disabled for now (input is hidden);
 * the branch is kept commented out to restore alongside the UI.
 */
export function scorePens(input: PensInput): number {
  if (!input.pickWinner) return 0;
  const actualWinner: "home" | "away" =
    input.actualHome > input.actualAway ? "home" : "away";
  if (input.pickWinner !== actualWinner) return 0;

  // Exact shootout score bonus — disabled for now, restore with the UI input.
  // if (
  //   input.pickHome != null &&
  //   input.pickAway != null &&
  //   input.pickHome === input.actualHome &&
  //   input.pickAway === input.actualAway
  // ) {
  //   return SCORING.pensWinner + SCORING.pensExact;
  // }
  return SCORING.pensWinner;
}

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
  /** Knockout matches score an exact DRAW at 2 (not 3) — winner decided on pens. */
  isKnockout?: boolean;
}

/** Base points for a single prediction before the double-down multiplier. */
export function basePoints(input: Omit<ScoreInput, "isDoubleDown">): number {
  const { homePick, awayPick, homeActual, awayActual } = input;

  // Exact scoreline — 3 in both group and knockout (an exact knockout draw is
  // no longer discounted; the pens winner bonus is handled separately).
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
