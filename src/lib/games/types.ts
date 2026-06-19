/**
 * Shared types for the games section.
 *
 * Games are a SEPARATE world from the prediction league — these types never
 * reference standings/predictions. A game is one `game_matches` row whose
 * `state` jsonb is shaped by the per-game reducer.
 */
import type { ComponentType } from "react";

export type GameType = "penalty_duel" | "trivia_duel" | "haxball_duel";

export type GameStatus =
  | "pending"
  | "active"
  | "finished"
  | "declined"
  | "expired";

export type GameMode = "turn" | "simultaneous";

/** A game_matches row, normalized for client/server use. */
export interface GameMatch {
  id: string;
  gameType: GameType;
  status: GameStatus;
  player1Id: string;
  player2Id: string | null;
  turn: string | null;
  state: unknown; // per-game blob; each game narrows it
  winnerId: string | null;
  score: { p1: number; p2: number } | null;
  createdAt: string;
  updatedAt: string;
  // Denormalized opponent/challenger display info (filled by queries).
  player1?: PlayerInfo;
  player2?: PlayerInfo | null;
}

export interface PlayerInfo {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/** A player slot, mapped to a real userId by the dispatcher. */
export type PlayerSlot = "p1" | "p2";

/**
 * Result of a reducer step. Undefined fields mean "unchanged".
 *
 * `winner` is a SLOT ('p1'|'p2'|null) — the reducer is pure and never sees real
 * userIds for the result, so the generic dispatcher maps the slot to a userId.
 * `turn` is also expressed as a slot for the same reason.
 */
export interface ReduceResult<S = unknown> {
  state: S;
  turn?: PlayerSlot | null;
  status?: GameStatus;
  winner?: PlayerSlot | null;
  score?: { p1: number; p2: number } | null;
}

/**
 * Context passed to a pure reducer. Any non-determinism (rng seed, the acting
 * user id, the two player ids) is passed IN — the reducer never calls
 * Date.now()/Math.random() itself, so it's deterministic and resume-safe.
 */
export interface ReduceContext {
  actorId: string; // the user making this move
  player1Id: string;
  player2Id: string;
}

export type GameReducer<S = unknown, M = unknown> = (
  state: S,
  move: M,
  ctx: ReduceContext,
) => ReduceResult<S>;

/** Props every game UI component receives from the match shell. */
export interface GameComponentProps {
  matchId: string;
  initialMatch: GameMatch;
  currentUserId: string;
}

/** Static metadata + wiring for a single game, read by the hub + match shell. */
export interface GameDefinition {
  type: GameType;
  title: string;
  emoji: string;
  blurb: string;
  mode: GameMode;
  minPlayers: number;
  /** Pure reducer that resolves a move into new state (turn games only run it server-side). */
  reducer: GameReducer;
  /** Initial `state` blob for a freshly-created match. */
  createInitialState: (ctx: ReduceContext) => unknown;
  /** The client component rendered in /games/[matchId]. */
  component: ComponentType<GameComponentProps>;
  /** Hide from the hub's "challenge" list while still routable (used for not-yet-built games). */
  comingSoon?: boolean;
}
