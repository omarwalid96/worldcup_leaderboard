import type {
  GameReducer,
  PlayerSlot,
  ReduceResult,
} from "../types";
import { TRIVIA_QUESTIONS } from "./questions";

export interface Answer {
  qid: string;
  choice: number;
  correct: boolean;
  ms: number;
}

export interface TriviaState {
  seed: number;
  questionIds: string[];
  answers: {
    p1: Answer[];
    p2: Answer[];
  };
  scoreP1: number;
  scoreP2: number;
}

export type TriviaMove = {
  kind: "answer";
  qid: string;
  choice: number;
  ms: number;
};

export const QUESTIONS_PER_MATCH = 5;

// Simple deterministic RNG based on seed
function sfc32(a: number, b: number, c: number, d: number) {
  return function() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; 
    let t = (a + b) | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    d = d + 1 | 0;
    t = t + d | 0;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  }
}

export function createInitialTriviaState(): TriviaState {
  // Use current time to generate a random seed, but store it so it's deterministic hereafter
  const seed = Date.now();
  const rand = sfc32(0x9E3779B9, 0x243F6A88, 0xB7E15162, seed);
  
  const allIds = TRIVIA_QUESTIONS.map(q => q.id);
  // Fisher-Yates shuffle with our seeded RNG
  for (let i = allIds.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [allIds[i], allIds[j]] = [allIds[j], allIds[i]];
  }
  
  return {
    seed,
    questionIds: allIds.slice(0, QUESTIONS_PER_MATCH),
    answers: { p1: [], p2: [] },
    scoreP1: 0,
    scoreP2: 0,
  };
}

export const triviaReducer: GameReducer<TriviaState, TriviaMove> = (
  state,
  move,
  ctx
): ReduceResult<TriviaState> => {
  if (move.kind !== "answer") return { state };

  const actorSlot = ctx.actorId === ctx.player1Id ? "p1" : "p2";
  
  // Prevent duplicate answers
  if (state.answers[actorSlot].some(a => a.qid === move.qid)) {
    return { state };
  }

  // Validate question exists and check answer
  const q = TRIVIA_QUESTIONS.find(q => q.id === move.qid);
  if (!q) return { state };

  const correct = move.choice === q.answerIndex;
  const answer: Answer = {
    qid: move.qid,
    choice: move.choice,
    correct,
    ms: move.ms,
  };

  const nextAnswers = {
    ...state.answers,
    [actorSlot]: [...state.answers[actorSlot], answer],
  };

  const nextState: TriviaState = {
    ...state,
    answers: nextAnswers,
  };

  // Check if finished
  const p1Finished = nextState.answers.p1.length === QUESTIONS_PER_MATCH;
  const p2Finished = nextState.answers.p2.length === QUESTIONS_PER_MATCH;

  if (p1Finished && p2Finished) {
    // Tally scores
    let scoreP1 = 0;
    let scoreP2 = 0;

    for (const qid of state.questionIds) {
      const a1 = nextState.answers.p1.find(a => a.qid === qid);
      const a2 = nextState.answers.p2.find(a => a.qid === qid);

      if (a1?.correct && !a2?.correct) scoreP1++;
      else if (!a1?.correct && a2?.correct) scoreP2++;
      else if (a1?.correct && a2?.correct) {
        // Tie-breaker by speed
        if (a1.ms < a2.ms) scoreP1++;
        else if (a2.ms < a1.ms) scoreP2++;
      }
    }

    nextState.scoreP1 = scoreP1;
    nextState.scoreP2 = scoreP2;

    let winner: PlayerSlot | null = null;
    if (scoreP1 > scoreP2) winner = "p1";
    if (scoreP2 > scoreP1) winner = "p2";

    return {
      state: nextState,
      status: "finished",
      winner,
      score: { p1: scoreP1, p2: scoreP2 },
    };
  }

  return { state: nextState };
};
