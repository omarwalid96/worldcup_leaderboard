"use server";

import { getLeaderboard, type LeaderboardRow } from "./queries";

/** Re-fetch standings rows for a league (called by the Realtime client on change). */
export async function fetchLeaderboardRows(
  leagueId: string,
): Promise<LeaderboardRow[]> {
  const data = await getLeaderboard(leagueId);
  return data?.rows ?? [];
}
