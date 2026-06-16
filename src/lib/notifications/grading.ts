import "server-only";
import { lt } from "drizzle-orm";
import { db } from "@/db";
import { standings } from "@/db/schema";
import { sendPushToUser, sendPushToUsers } from "./send";

/**
 * Sends post-grading push notifications:
 *  - Exact score hit alert to exactHitUserIds (scoreHit pref).
 *  - Rank climbed alert to affectedUserIds whose rank improved (rankClimb pref).
 *
 * Wrapped in try/catch — push failures NEVER break the grading pipeline.
 */
export async function sendGradingNotifications(
  exactHitUserIds: string[],
  affectedUserIds: string[],
): Promise<void> {
  try {
    // (b) Exact score hit notifications.
    if (exactHitUserIds.length > 0) {
      await sendPushToUsers(
        exactHitUserIds,
        {
          title: "Exact score! ⚽",
          body: "You nailed the scoreline. Points are in.",
          icon: "/icon.png",
          url: "/leaderboard",
        },
        "scoreHit",
      );
    }
  } catch (err) {
    console.warn("[notify] scoreHit batch failed:", err);
  }

  try {
    // (c) Rank climb notifications — only for affected users whose rank improved.
    if (affectedUserIds.length > 0) {
      // Find users in affectedUserIds whose rank < previousRank (i.e. climbed).
      const climbers = await db
        .select({ userId: standings.userId, rank: standings.rank })
        .from(standings)
        // rank < previousRank means they moved up (lower number = better rank).
        .where(lt(standings.rank, standings.previousRank));

      const affectedSet = new Set(affectedUserIds);
      const rankClimbers = climbers.filter((c) => affectedSet.has(c.userId));

      await Promise.all(
        rankClimbers.map((c) =>
          sendPushToUser(
            c.userId,
            {
              title: "You climbed the table!",
              body: `You're now ranked #${c.rank}. Keep it up!`,
              icon: "/icon.png",
              url: "/leaderboard",
            },
            "rankClimb",
          ),
        ),
      );
    }
  } catch (err) {
    console.warn("[notify] rankClimb batch failed:", err);
  }
}
