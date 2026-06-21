"use server";

import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { nudges, leagueMembers, profiles } from "@/db/schema";
import { requireProfile } from "@/lib/auth/session";
import { sendPushToUser } from "@/lib/notifications/send";
import { getLeaderboard, type LeaderboardRow } from "./queries";

/** Re-fetch standings rows for a league (called by the Realtime client on change). */
export async function fetchLeaderboardRows(
  leagueId: string,
): Promise<LeaderboardRow[]> {
  const data = await getLeaderboard(leagueId);
  return data?.rows ?? [];
}

export interface NudgePayload {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
}

const NUDGE_WINDOW_MS = 3 * 60 * 1000; // one nudge per 3 minutes per sender

export type NudgeResult =
  | { ok: true; payload: NudgePayload }
  | { ok: false; reason: string };

/**
 * Send a nudge: rate-limit (one/hour/sender, server-enforced), persist it (so
 * the target replays on next open), push-notify, and return the payload for the
 * client to broadcast. Returns {ok:false, reason} for expected failures
 * (rate-limited / not a member) — we never throw, so a blocked nudge is normal
 * control flow, not a Server Components render error.
 */
export async function sendNudge(
  leagueId: string,
  toUserId: string,
): Promise<NudgeResult> {
  const me = await requireProfile();
  if (toUserId === me.id) return { ok: false, reason: "You can't nudge yourself." };

  // Both must belong to the league (cheap guard; the table is league-scoped).
  const members = await db
    .select({ userId: leagueMembers.userId })
    .from(leagueMembers)
    .where(eq(leagueMembers.leagueId, leagueId));
  const ids = new Set(members.map((m) => m.userId));
  if (!ids.has(me.id) || !ids.has(toUserId)) {
    return { ok: false, reason: "Not a member of this league." };
  }

  // Rate limit: reject if I've nudged anyone in the last hour.
  const cutoff = new Date(Date.now() - NUDGE_WINDOW_MS);
  const [recent] = await db
    .select({ createdAt: nudges.createdAt })
    .from(nudges)
    .where(and(eq(nudges.fromUserId, me.id), gt(nudges.createdAt, cutoff)))
    .orderBy(desc(nudges.createdAt))
    .limit(1);
  if (recent) {
    const secs = Math.ceil(
      (NUDGE_WINDOW_MS - (Date.now() - recent.createdAt.getTime())) / 1000,
    );
    const wait = secs >= 60 ? `${Math.ceil(secs / 60)} min` : `${secs}s`;
    return { ok: false, reason: `Cool down — you can nudge again in ${wait}.` };
  }

  const [row] = await db
    .insert(nudges)
    .values({ leagueId, fromUserId: me.id, toUserId })
    .returning({ id: nudges.id });

  // Push (best-effort; swallowed on failure). Respects the `nudge` pref.
  void sendPushToUser(
    toUserId,
    {
      title: "👊 You got nudged!",
      body: `${me.displayName} knocked you down the table. Open the leaderboard…`,
      url: "/leaderboard",
    },
    "nudge",
  );

  return {
    ok: true,
    payload: { id: row.id, fromUserId: me.id, fromName: me.displayName, toUserId },
  };
}

/** The latest unseen nudge aimed at me in this league (for replay on open). */
export async function getMyUnseenNudge(
  leagueId: string,
): Promise<NudgePayload | null> {
  const me = await requireProfile();
  const [row] = await db
    .select({
      id: nudges.id,
      fromUserId: nudges.fromUserId,
      fromName: profiles.displayName,
    })
    .from(nudges)
    .innerJoin(profiles, eq(profiles.id, nudges.fromUserId))
    .where(
      and(
        eq(nudges.leagueId, leagueId),
        eq(nudges.toUserId, me.id),
        eq(nudges.seen, false),
      ),
    )
    .orderBy(desc(nudges.createdAt))
    .limit(1);
  if (!row) return null;
  return { ...row, toUserId: me.id };
}

/** Who whacked me recently (last 24h) in this league — for the persistent
 *  banner above the table. Names, newest first. Independent of the `seen`
 *  flag so it survives the one-shot replay animation. */
export async function getMyRecentNudgers(
  leagueId: string,
): Promise<string[]> {
  const me = await requireProfile();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ fromName: profiles.displayName, createdAt: nudges.createdAt })
    .from(nudges)
    .innerJoin(profiles, eq(profiles.id, nudges.fromUserId))
    .where(
      and(
        eq(nudges.leagueId, leagueId),
        eq(nudges.toUserId, me.id),
        gt(nudges.createdAt, cutoff),
      ),
    )
    .orderBy(desc(nudges.createdAt));
  return rows.map((r) => r.fromName);
}

/** Mark all my unseen nudges in this league as seen (called after replay). */
export async function markNudgesSeen(leagueId: string): Promise<void> {
  const me = await requireProfile();
  await db
    .update(nudges)
    .set({ seen: true })
    .where(
      and(
        eq(nudges.leagueId, leagueId),
        eq(nudges.toUserId, me.id),
        eq(nudges.seen, false),
      ),
    );
}
