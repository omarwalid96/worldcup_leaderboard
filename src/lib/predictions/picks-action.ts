"use server";

import { getCurrentUser } from "@/lib/supabase/server";
import { getMatchPredictions, type FriendPick } from "./queries";

/**
 * Fetch all league members' predictions for a match, on demand (used when a
 * user expands a match card). Auth-gated — picks are visible within the league.
 */
export async function fetchMatchPicks(matchId: string): Promise<FriendPick[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return getMatchPredictions(matchId);
}
