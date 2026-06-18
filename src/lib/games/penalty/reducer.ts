/**
 * Penalty Shootout Duel — PURE reducer.
 *
 * Alternating-rounds, best-of-5, live duel. Each ROUND has two halves:
 *   1. the current shooter picks a direction (L/M/R)
 *   2. the current keeper picks a dive (L/M/R)
 * It's a GOAL unless the keeper's dive matches the shooter's direction.
 * After both players have shot once (one round = p1 shoots + p2 shoots), the
 * round counter advances. Best of 5 rounds; if level after 5, sudden death.
 *
 * Determinism: the reducer NEVER calls Date.now()/Math.random(). All inputs come
 * from `state`, `move`, and `ctx` — so replaying the same moves always yields the
 * same result (safe for resume + server re-validation). No rng is needed here:
 * goal/save is decided purely by comparing direction vs dive.
 */
import type {
  GameReducer,
  PlayerSlot,
  ReduceContext,
  ReduceResult,
} from "../types";

export type Dir = "L" | "M" | "R";

/** Who is currently acting within a round-half. */
export type Phase = "shoot" | "keep";

export interface Kick {
  /** The shooting player slot. */
  shooter: "p1" | "p2";
  dir: Dir;
  dive: Dir;
  goal: boolean;
}

export interface PenaltyState {
  /** 1-based round number (a round = each player shoots once). */
  round: number;
  /** Which slot shoots in the current half. p1 always shoots first each round. */
  shooter: "p1" | "p2";
  /** 'shoot' = waiting for the shooter's dir; 'keep' = waiting for keeper's dive. */
  phase: Phase;
  /** Pending shot direction, set once the shooter has chosen, before the keeper dives. */
  pendingDir: Dir | null;
  /** Completed kicks, in order. */
  kicks: Kick[];
  scoreP1: number;
  scoreP2: number;
}

export type PenaltyMove =
  | { kind: "shoot"; dir: Dir }
  | { kind: "dive"; dir: Dir };

export const BEST_OF = 5;

export function createInitialPenaltyState(): PenaltyState {
  return {
    round: 1,
    shooter: "p1",
    phase: "shoot",
    pendingDir: null,
    kicks: [],
    scoreP1: 0,
    scoreP2: 0,
  };
}

/** Which slot should act next given the state. */
export function actorSlot(state: PenaltyState): PlayerSlot {
  // In 'shoot' phase the shooter acts; in 'keep' phase the OTHER player acts.
  if (state.phase === "shoot") return state.shooter;
  return state.shooter === "p1" ? "p2" : "p1";
}

/** The userId of the slot that should act next, given state + ctx. */
export function actorForState(state: PenaltyState, ctx: ReduceContext): string {
  return actorSlot(state) === "p1" ? ctx.player1Id : ctx.player2Id;
}

/**
 * Decide whether the duel is over given the kicks taken so far.
 * Returns the winner slot ('p1'|'p2'), 'draw' is impossible (sudden death runs
 * until a round is decisive), or null if play continues.
 *
 * Best-of-5: after each COMPLETED round (both players shot), if one player's
 * score is unreachable by the other in the remaining regulation rounds, end.
 * After 5 completed rounds: higher score wins, else sudden death — end the
 * round only when scores differ.
 */
function evaluateWinner(state: PenaltyState): "p1" | "p2" | null {
  const completedRounds = Math.floor(state.kicks.length / 2);
  const midRound = state.kicks.length % 2 === 1; // p1 shot, p2 hasn't this round

  // Only evaluate at round boundaries (both players have shot this round)…
  if (midRound) {
    // …but allow an EARLY clinch mid-round during regulation: if p1 just shot
    // and even a p2 goal + p2 winning all remaining can't catch p1 (or vice
    // versa). Keep it simple & correct: only early-clinch in regulation.
    if (completedRounds >= BEST_OF) return null; // sudden death never clinches mid-round
    const roundsLeftAfterThis = BEST_OF - completedRounds - 1; // full rounds still to play after current
    // p2 still gets this round's kick + roundsLeftAfterThis more.
    const p2Remaining = 1 + roundsLeftAfterThis;
    const p1Remaining = roundsLeftAfterThis;
    if (state.scoreP1 - state.scoreP2 > p2Remaining) return "p1";
    if (state.scoreP2 - state.scoreP1 > p1Remaining) return "p2";
    return null;
  }

  // End of a completed round.
  if (completedRounds < BEST_OF) {
    // Early clinch in regulation: lead exceeds what the trailer can still score.
    const roundsLeft = BEST_OF - completedRounds;
    if (state.scoreP1 - state.scoreP2 > roundsLeft) return "p1";
    if (state.scoreP2 - state.scoreP1 > roundsLeft) return "p2";
    return null;
  }

  // After regulation (>=5 completed rounds): decisive when scores differ.
  if (state.scoreP1 !== state.scoreP2) {
    return state.scoreP1 > state.scoreP2 ? "p1" : "p2";
  }
  return null; // tied → another sudden-death round
}

export const penaltyReducer: GameReducer<PenaltyState, PenaltyMove> = (
  state,
  move,
): ReduceResult<PenaltyState> => {
  // Phase 1: shooter picks a direction.
  if (move.kind === "shoot") {
    if (state.phase !== "shoot") return { state, turn: actorSlot(state) }; // ignore out-of-phase
    const next: PenaltyState = {
      ...state,
      phase: "keep",
      pendingDir: move.dir,
    };
    return { state: next, turn: actorSlot(next) };
  }

  // Phase 2: keeper dives → resolve the kick.
  if (state.phase !== "keep" || state.pendingDir == null) {
    return { state, turn: actorSlot(state) };
  }

  const dir = state.pendingDir;
  const dive = move.dir;
  const goal = dive !== dir;

  const kick: Kick = { shooter: state.shooter, dir, dive, goal };
  let scoreP1 = state.scoreP1;
  let scoreP2 = state.scoreP2;
  if (goal) {
    if (state.shooter === "p1") scoreP1 += 1;
    else scoreP2 += 1;
  }

  // Advance: if p1 just shot, p2 shoots next (same round). If p2 just shot, the
  // round is complete → next round, p1 shoots again.
  const p2JustShot = state.shooter === "p2";
  const nextShooter: "p1" | "p2" = p2JustShot ? "p1" : "p2";
  const nextRound = p2JustShot ? state.round + 1 : state.round;

  const resolved: PenaltyState = {
    ...state,
    shooter: nextShooter,
    round: nextRound,
    phase: "shoot",
    pendingDir: null,
    kicks: [...state.kicks, kick],
    scoreP1,
    scoreP2,
  };

  const winner = evaluateWinner(resolved);
  if (winner) {
    return {
      state: resolved,
      status: "finished",
      winner, // 'p1' | 'p2' slot — dispatcher maps to a real userId
      turn: null,
      score: { p1: scoreP1, p2: scoreP2 },
    };
  }

  return {
    state: resolved,
    turn: actorSlot(resolved),
    score: { p1: scoreP1, p2: scoreP2 },
  };
};

/**
 * Helper for the Server Action: given a finished state, return the winning slot
 * so the action can map it to a real userId. Returns 'p1' | 'p2' | null (draw,
 * which penalty never produces but kept for the generic contract).
 */
export function winnerSlot(state: PenaltyState): "p1" | "p2" | null {
  return evaluateWinner(state);
}
