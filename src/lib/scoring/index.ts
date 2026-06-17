/**
 * Pure scoring functions. No I/O — deterministic and unit-testable.
 *
 * Rules:
 *   - Exact scoreline:                3 pts
 *   - Correct outcome only (W/D/L):   1 pt   (right winner, or both drew)
 *   - Wrong outcome:                  0 pts
 *   - Double-down: that match's points are doubled (exact → 6, outcome → 2)
 *
 * Knockout extras (a knockout always has a winner):
 *   - Exact DRAW (e.g. predicted 0–0, actual 0–0 → pens): 2 pts (not 3)
 *   - Penalty shootout (only when the match went to pens, NOT doubled):
 *       correct shootout winner: +1 ; exact shootout score (e.g. 5–4): +1 more
 *   So a perfect knockout-draw call = 2 + 1 + 1 = 4.
 */

export const SCORING = {
  exact: 3,
  // Knockouts always have a winner, so an exact DRAW (which sends it to pens) is
  // worth less than an exact decisive score — the winner is decided on pens.
  exactKnockoutDraw: 2,
  resultOnly: 1,
  wrong: 0,
  streakBonusPerDay: 1,
  streakBonusCap: 5,
  // Penalty shootout bonuses (knockout only, on top of the scoreline points).
  pensWinner: 1, // correct team advances on pens
  pensExact: 1, // also nailed the exact shootout score (e.g. 5–4)
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
 * actually went to pens. Winner correct = +1; exact shootout score = +2 more.
 * Double-down does NOT apply to the pens bonus.
 */
export function scorePens(input: PensInput): number {
  if (!input.pickWinner) return 0;
  const actualWinner: "home" | "away" =
    input.actualHome > input.actualAway ? "home" : "away";
  if (input.pickWinner !== actualWinner) return 0;

  let pts = SCORING.pensWinner;
  if (
    input.pickHome != null &&
    input.pickAway != null &&
    input.pickHome === input.actualHome &&
    input.pickAway === input.actualAway
  ) {
    pts += SCORING.pensExact;
  }
  return pts;
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
  const { homePick, awayPick, homeActual, awayActual, isKnockout } = input;

  // Exact scoreline.
  if (homePick === homeActual && awayPick === awayActual) {
    // In knockouts an exact DRAW is worth less (the winner is decided on pens).
    if (isKnockout && homeActual === awayActual) return SCORING.exactKnockoutDraw;
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
