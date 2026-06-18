"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gameMatches, gameResults, profiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/notifications/send";
import { getGameDefinition } from "./registry";
import { getMatch } from "./queries";
import type { GameMatch, GameType, PlayerSlot, ReduceContext } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface CreateChallengeResult extends ActionResult {
  id?: string;
}

export interface MatchResult extends ActionResult {
  match?: GameMatch;
}

/**
 * Create a pending challenge from the current user to an opponent. Fires a push
 * to the opponent. Returns the new match id.
 */
export async function createChallenge(input: {
  gameType: string;
  opponentId: string;
}): Promise<CreateChallengeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const def = getGameDefinition(input.gameType);
  if (!def || def.comingSoon) return { ok: false, error: "Unknown game." };
  if (input.opponentId === user.id)
    return { ok: false, error: "You can't challenge yourself." };

  const [opponent] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, input.opponentId))
    .limit(1);
  if (!opponent) return { ok: false, error: "Opponent not found." };

  const ctx: ReduceContext = {
    actorId: user.id,
    player1Id: user.id,
    player2Id: input.opponentId,
  };

  const initialState = def.createInitialState(ctx);

  const [row] = await db
    .insert(gameMatches)
    .values({
      gameType: def.type,
      status: "pending",
      player1Id: user.id,
      player2Id: input.opponentId,
      turn: user.id, // player1 acts first once accepted
      state: initialState as object,
    })
    .returning({ id: gameMatches.id });

  // Notify the opponent (respects their gameChallenge pref).
  const [challenger] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  await sendPushToUser(
    input.opponentId,
    {
      title: `${def.emoji} ${def.title} challenge`,
      body: `${challenger?.displayName ?? "Someone"} challenged you to ${def.title}!`,
      url: `/games/${row.id}`,
    },
    "gameChallenge",
  );

  revalidatePath("/games");
  return { ok: true, id: row.id };
}

/** Accept or decline a pending challenge (player2 only). */
export async function respondToChallenge(
  matchId: string,
  accept: boolean,
): Promise<MatchResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const [row] = await db
    .select()
    .from(gameMatches)
    .where(eq(gameMatches.id, matchId))
    .limit(1);
  if (!row) return { ok: false, error: "Match not found." };
  if (row.player2Id !== user.id)
    return { ok: false, error: "This challenge isn't yours to answer." };
  if (row.status !== "pending")
    return { ok: false, error: "This challenge is no longer pending." };

  await db
    .update(gameMatches)
    .set({
      status: accept ? "active" : "declined",
      updatedAt: new Date(),
    })
    .where(eq(gameMatches.id, matchId));

  // Tell the challenger.
  const [responder] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  const def = getGameDefinition(row.gameType);
  await sendPushToUser(
    row.player1Id,
    {
      title: accept ? "Challenge accepted!" : "Challenge declined",
      body: `${responder?.displayName ?? "Your opponent"} ${
        accept ? "accepted" : "declined"
      } your ${def?.title ?? "game"} challenge.`,
      url: `/games/${matchId}`,
    },
    "gameChallenge",
  );

  revalidatePath("/games");
  const match = await getMatch(matchId);
  return { ok: true, match: match ?? undefined };
}

function slotToUserId(
  slot: PlayerSlot | null | undefined,
  row: { player1Id: string; player2Id: string | null },
): string | null {
  if (slot == null) return null;
  if (slot === "p1") return row.player1Id;
  return row.player2Id;
}

/**
 * Generic move dispatcher. Loads the match, runs the game's PURE reducer with a
 * trusted context (the server decides the slot mapping, never the client), and
 * persists the new state/turn/status/winner. On finish, bumps game_results.
 */
export async function applyMove(
  matchId: string,
  move: unknown,
): Promise<MatchResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const [row] = await db
    .select()
    .from(gameMatches)
    .where(eq(gameMatches.id, matchId))
    .limit(1);
  if (!row) return { ok: false, error: "Match not found." };

  const isParticipant =
    row.player1Id === user.id || row.player2Id === user.id;
  if (!isParticipant) return { ok: false, error: "Not your match." };
  if (row.status !== "active")
    return { ok: false, error: "This match isn't active." };
  if (!row.player2Id) return { ok: false, error: "No opponent yet." };

  const def = getGameDefinition(row.gameType);
  if (!def) return { ok: false, error: "Unknown game." };

  // Turn enforcement for turn-based games: only the player whose turn it is may
  // move. Never trust the client clock/turn — the DB row is the source of truth.
  if (def.mode === "turn" && row.turn && row.turn !== user.id) {
    return { ok: false, error: "It's not your turn." };
  }

  const ctx: ReduceContext = {
    actorId: user.id,
    player1Id: row.player1Id,
    player2Id: row.player2Id,
  };

  const result = def.reducer(row.state, move, ctx);

  const nextTurn =
    result.turn === undefined
      ? row.turn
      : slotToUserId(result.turn, row);
  const nextStatus = result.status ?? row.status;
  const nextWinnerId =
    result.winner === undefined
      ? row.winnerId
      : slotToUserId(result.winner, row);

  await db
    .update(gameMatches)
    .set({
      state: result.state as object,
      turn: nextTurn,
      status: nextStatus,
      winnerId: nextWinnerId,
      score: result.score ?? row.score,
      updatedAt: new Date(),
    })
    .where(eq(gameMatches.id, matchId));

  // On finish, record W/L/D for both players. `row.status` was guaranteed
  // 'active' above, so reaching 'finished' here is always a fresh transition.
  if (nextStatus === "finished") {
    await recordResult(
      row.gameType as GameType,
      row.player1Id,
      row.player2Id,
      nextWinnerId,
    );
  } else if (nextTurn && nextTurn !== user.id) {
    // Async-friendly: ping the player whose turn it now is so they don't have to
    // be glued to the room. (Live sync still happens instantly via broadcast if
    // they're already present; the push just covers the away case.)
    await sendPushToUser(
      nextTurn,
      {
        title: `Your move — ${def.title}`,
        body: "It's your turn. Tap to play.",
        url: `/games/${matchId}`,
      },
      "gameChallenge",
    );
  }

  revalidatePath(`/games/${matchId}`);
  const match = await getMatch(matchId);
  return { ok: true, match: match ?? undefined };
}

/** Upsert-bump game_results for both players given the winner (null = draw). */
async function recordResult(
  gameType: GameType,
  p1: string,
  p2: string,
  winnerId: string | null,
): Promise<void> {
  const p1Outcome =
    winnerId == null ? "draw" : winnerId === p1 ? "win" : "loss";
  const p2Outcome =
    winnerId == null ? "draw" : winnerId === p2 ? "win" : "loss";

  await Promise.all([
    bump(p1, gameType, p1Outcome),
    bump(p2, gameType, p2Outcome),
  ]);
}

async function bump(
  userId: string,
  gameType: GameType,
  outcome: "win" | "loss" | "draw",
): Promise<void> {
  await db
    .insert(gameResults)
    .values({
      userId,
      gameType,
      wins: outcome === "win" ? 1 : 0,
      losses: outcome === "loss" ? 1 : 0,
      draws: outcome === "draw" ? 1 : 0,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [gameResults.userId, gameResults.gameType],
      set: {
        wins: sql`${gameResults.wins} + ${outcome === "win" ? 1 : 0}`,
        losses: sql`${gameResults.losses} + ${outcome === "loss" ? 1 : 0}`,
        draws: sql`${gameResults.draws} + ${outcome === "draw" ? 1 : 0}`,
        updatedAt: new Date(),
      },
    });
}

/** Lightweight refetch used by the realtime room hook on postgres_changes. */
export async function refetchMatch(matchId: string): Promise<GameMatch | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const match = await getMatch(matchId);
  if (!match) return null;
  if (match.player1Id !== user.id && match.player2Id !== user.id) return null;
  return match;
}
