/**
 * Game registry — the single source of truth for which games exist and how to
 * render/resolve them. The hub reads this to list games; the match shell uses it
 * to render the right component; the generic `applyMove` uses each game's pure
 * reducer to resolve moves.
 *
 * Game agents append ONE entry here. Keep entries tiny and on their own lines.
 */
import type { GameDefinition, GameType } from "./types";
import {
  penaltyReducer,
  createInitialPenaltyState,
} from "./penalty/reducer";
import { PenaltyDuel } from "@/components/games/penalty/penalty-duel";
import { triviaReducer, createInitialTriviaState } from "./trivia/reducer";
import { TriviaDuel } from "@/components/games/trivia/trivia-duel";
import { haxballReducer, createInitialHaxState } from "./haxball/reducer";
import { HaxballDuel } from "@/components/games/haxball/haxball-duel";

export const GAME_REGISTRY: Record<GameType, GameDefinition> = {
  penalty_duel: {
    type: "penalty_duel",
    title: "Penalty Shootout",
    emoji: "⚽",
    blurb: "Best-of-5 live duel. Aim, dive, and out-guess your friend.",
    mode: "turn",
    minPlayers: 2,
    reducer: penaltyReducer as GameDefinition["reducer"],
    createInitialState: () => createInitialPenaltyState(),
    component: PenaltyDuel,
  },
  trivia_duel: {
    type: "trivia_duel",
    title: "Trivia Duel",
    emoji: "🧠",
    blurb: "Five World Cup questions, head to head.",
    mode: "simultaneous",
    minPlayers: 2,
    reducer: triviaReducer as GameDefinition["reducer"],
    createInitialState: () => createInitialTriviaState(),
    component: TriviaDuel,
  },
  haxball_duel: {
    type: "haxball_duel",
    title: "HaxBall",
    emoji: "🥅",
    blurb: "Real-time 1v1. Move, kick, score. First to 3.",
    mode: "simultaneous",
    minPlayers: 2,
    reducer: haxballReducer as GameDefinition["reducer"],
    createInitialState: () => createInitialHaxState(),
    component: HaxballDuel,
  },
};

export function getGameDefinition(type: string): GameDefinition | undefined {
  return GAME_REGISTRY[type as GameType];
}

/** All playable games (excludes comingSoon) for the hub's challenge list. */
export function playableGames(): GameDefinition[] {
  return Object.values(GAME_REGISTRY).filter((g) => !g.comingSoon);
}

/** All registered games, including coming-soon teasers. */
export function allGames(): GameDefinition[] {
  return Object.values(GAME_REGISTRY);
}
