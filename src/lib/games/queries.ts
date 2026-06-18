import "server-only";
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { gameMatches, gameResults, profiles } from "@/db/schema";
import { getGameDefinition } from "./registry";
import type { GameMatch, GameType, PlayerInfo } from "./types";

function toScore(raw: unknown): { p1: number; p2: number } | null {
  if (raw && typeof raw === "object" && "p1" in raw && "p2" in raw) {
    const r = raw as { p1: unknown; p2: unknown };
    if (typeof r.p1 === "number" && typeof r.p2 === "number") {
      return { p1: r.p1, p2: r.p2 };
    }
  }
  return null;
}

/** Normalize a raw game_matches row (+ joined players) into a GameMatch. */
function normalize(
  row: typeof gameMatches.$inferSelect,
  p1?: PlayerInfo,
  p2?: PlayerInfo | null,
): GameMatch {
  return {
    id: row.id,
    gameType: row.gameType as GameType,
    status: row.status as GameMatch["status"],
    player1Id: row.player1Id,
    player2Id: row.player2Id,
    turn: row.turn,
    state: row.state,
    winnerId: row.winnerId,
    score: toScore(row.score),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    player1: p1,
    player2: p2 ?? null,
  };
}

async function fetchPlayers(ids: string[]): Promise<Map<string, PlayerInfo>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(profiles)
    .where(or(...unique.map((id) => eq(profiles.id, id))));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Load a single match (with player display info). Null if it doesn't exist. */
export async function getMatch(matchId: string): Promise<GameMatch | null> {
  const [row] = await db
    .select()
    .from(gameMatches)
    .where(eq(gameMatches.id, matchId))
    .limit(1);
  if (!row) return null;
  const players = await fetchPlayers([row.player1Id, row.player2Id ?? ""]);
  return normalize(
    row,
    players.get(row.player1Id),
    row.player2Id ? players.get(row.player2Id) : null,
  );
}

/** Matches the user is involved in (newest first), excluding old finished ones. */
export async function listMyMatches(userId: string): Promise<GameMatch[]> {
  const rows = await db
    .select()
    .from(gameMatches)
    .where(
      or(eq(gameMatches.player1Id, userId), eq(gameMatches.player2Id, userId)),
    )
    .orderBy(desc(gameMatches.updatedAt))
    .limit(50);

  const ids = rows.flatMap((r) => [r.player1Id, r.player2Id ?? ""]);
  const players = await fetchPlayers(ids);
  return rows.map((r) =>
    normalize(
      r,
      players.get(r.player1Id),
      r.player2Id ? players.get(r.player2Id) : null,
    ),
  );
}

export interface GameRecordRow {
  gameType: GameType;
  title: string;
  emoji: string;
  wins: number;
  losses: number;
  draws: number;
}

/** Aggregate W/L/D per game for a user (for the profile card). */
export async function getGameRecord(userId: string): Promise<GameRecordRow[]> {
  const rows = await db
    .select()
    .from(gameResults)
    .where(eq(gameResults.userId, userId));

  return rows
    .map((r) => {
      const def = getGameDefinition(r.gameType);
      return {
        gameType: r.gameType as GameType,
        title: def?.title ?? r.gameType,
        emoji: def?.emoji ?? "🎮",
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
      };
    })
    .filter((r) => r.wins + r.losses + r.draws > 0);
}

/** Members the user can challenge (everyone but themselves). */
export async function listOpponents(userId: string): Promise<PlayerInfo[]> {
  const rows = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(profiles)
    .where(ne(profiles.id, userId))
    .orderBy(profiles.displayName);
  return rows;
}

/** Count of pending incoming challenges (for the nav badge / hub). */
export async function countIncomingChallenges(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gameMatches)
    .where(
      and(eq(gameMatches.player2Id, userId), eq(gameMatches.status, "pending")),
    );
  return row?.n ?? 0;
}
