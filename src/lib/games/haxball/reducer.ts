/**
 * HaxBall duel reducer. The match is REAL-TIME — per-tick physics runs on the
 * host's client and is broadcast over Supabase Realtime (never through here, far
 * too fast for the DB). The reducer's only job is to commit the FINAL result
 * when a player's client reports the game over (first to GOAL_CAP).
 *
 * ponytail: realtime games don't fit the turn-based reducer; the only persisted
 * move is "finish". The stored `state` is just the final score for display.
 */
import type { GameReducer, ReduceResult } from "../types";

export const GOAL_CAP = 3; // first to 3 wins

export interface HaxResultState {
  scoreA: number; // player1's goals
  scoreB: number; // player2's goals
}

export type HaxMove = { kind: "finish"; scoreA: number; scoreB: number };

export function createInitialHaxState(): HaxResultState {
  return { scoreA: 0, scoreB: 0 };
}

export const haxballReducer: GameReducer<HaxResultState, HaxMove> = (
  state,
  move,
): ReduceResult<HaxResultState> => {
  if (move.kind !== "finish") return { state };
  const { scoreA, scoreB } = move;
  // p1 = team A, p2 = team B. Winner is whoever has more; cap reach implies a winner.
  const winner = scoreA === scoreB ? null : scoreA > scoreB ? "p1" : "p2";
  return {
    state: { scoreA, scoreB },
    status: "finished",
    winner,
    turn: null,
    score: { p1: scoreA, p2: scoreB },
  };
};

// ── self-check ───────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const ctx = { actorId: "x", player1Id: "x", player2Id: "y" };
  const a = haxballReducer(createInitialHaxState(), { kind: "finish", scoreA: 3, scoreB: 1 }, ctx);
  console.assert(a.status === "finished" && a.winner === "p1", "p1 wins 3-1");
  const b = haxballReducer(createInitialHaxState(), { kind: "finish", scoreA: 2, scoreB: 3 }, ctx);
  console.assert(b.winner === "p2", "p2 wins 3-2");
  console.log("haxball reducer self-check ok");
}
