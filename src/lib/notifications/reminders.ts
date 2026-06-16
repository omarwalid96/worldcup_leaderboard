import "server-only";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { matches, predictions, leagueMembers } from "@/db/schema";
import { sendPushToUser } from "./send";

/**
 * Sends "lock your pick" reminders for matches kicking off in 45–60 minutes
 * where the user has NOT yet submitted a prediction.
 *
 * The 45–60min window is the dedupe mechanism: a cron running every ~15min
 * will deliver exactly one reminder per user per match. Running it more
 * frequently than every 45 min would send duplicate reminders.
 */
export async function sendLockReminders(): Promise<{
  matchesChecked: number;
  remindersQueued: number;
}> {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 45 * 60 * 1000); // +45min
  const windowEnd = new Date(now.getTime() + 60 * 60 * 1000); // +60min

  // Matches kicking off in the 45–60min window that are still scheduled.
  const upcoming = await db
    .select({
      id: matches.id,
      homeTeam: matches.homeTeam,
      awayTeam: matches.awayTeam,
      kickoffUtc: matches.kickoffUtc,
    })
    .from(matches)
    .where(
      and(
        eq(matches.status, "scheduled"),
        gte(matches.kickoffUtc, windowStart),
        lte(matches.kickoffUtc, windowEnd),
      ),
    );

  if (upcoming.length === 0) return { matchesChecked: 0, remindersQueued: 0 };

  // All league members (users who are in any league).
  const members = await db
    .selectDistinct({ userId: leagueMembers.userId })
    .from(leagueMembers);

  const allUserIds = members.map((m) => m.userId);
  if (allUserIds.length === 0)
    return { matchesChecked: upcoming.length, remindersQueued: 0 };

  let remindersQueued = 0;

  for (const match of upcoming) {
    // Find users who do NOT have a prediction for this match yet.
    const withPrediction = await db
      .select({ userId: predictions.userId })
      .from(predictions)
      .where(eq(predictions.matchId, match.id));

    const withPredSet = new Set(withPrediction.map((p) => p.userId));
    const unpickedUsers = allUserIds.filter((id) => !withPredSet.has(id));

    // Kick off reminders in parallel, each swallowing its own errors.
    await Promise.all(
      unpickedUsers.map(async (userId) => {
        await sendPushToUser(
          userId,
          {
            title: "Lock your pick!",
            body: `${match.homeTeam} vs ${match.awayTeam} kicks off in under an hour.`,
            icon: "/icon.png",
            url: "/matches",
          },
          "lockReminder",
        );
        remindersQueued++;
      }),
    );
  }

  return { matchesChecked: upcoming.length, remindersQueued };
}
