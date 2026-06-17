"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { leagues, leagueMembers, standings, profiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/supabase/server";

export interface LeagueActionResult {
  ok: boolean;
  error?: string;
  inviteCode?: string;
}

const nameSchema = z.string().trim().min(2).max(40);

function genInviteCode(): string {
  return randomBytes(4).toString("hex").toUpperCase(); // 8 hex chars
}

/** Create a league (ADMIN ONLY). Owner is auto-added as the first member. */
export async function createLeague(name: string): Promise<LeagueActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const [me] = await db
    .select({ isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (!me?.isAdmin) {
    return { ok: false, error: "Only an admin can create leagues." };
  }

  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: "Enter a name (2–40 chars)." };

  const inviteCode = genInviteCode();
  const [league] = await db
    .insert(leagues)
    .values({ name: parsed.data, inviteCode, ownerId: user.id, isDefault: false })
    .returning({ id: leagues.id, inviteCode: leagues.inviteCode });

  // Owner joins + gets a standings row so they show on the table immediately.
  await db
    .insert(leagueMembers)
    .values({ leagueId: league.id, userId: user.id })
    .onConflictDoNothing();
  await db
    .insert(standings)
    .values({ leagueId: league.id, userId: user.id })
    .onConflictDoNothing();

  revalidatePath("/leagues");
  revalidatePath("/leaderboard");
  return { ok: true, inviteCode: league.inviteCode };
}

/** Join a league by invite code. */
export async function joinLeague(code: string): Promise<LeagueActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const clean = code.trim().toUpperCase();
  if (!clean) return { ok: false, error: "Enter an invite code." };

  const [league] = await db
    .select({ id: leagues.id, name: leagues.name })
    .from(leagues)
    .where(eq(leagues.inviteCode, clean))
    .limit(1);
  if (!league) return { ok: false, error: "No league found for that code." };

  // Already a member?
  const [existing] = await db
    .select({ userId: leagueMembers.userId })
    .from(leagueMembers)
    .where(
      and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, user.id)),
    )
    .limit(1);
  if (existing) return { ok: false, error: `You're already in ${league.name}.` };

  await db.insert(leagueMembers).values({ leagueId: league.id, userId: user.id });
  // Seed an empty standings row so the user appears on this league's table.
  // (Each league is its own competition — points accrue from grading here on.)
  await db
    .insert(standings)
    .values({ leagueId: league.id, userId: user.id })
    .onConflictDoNothing();

  revalidatePath("/leagues");
  revalidatePath("/leaderboard");
  return { ok: true };
}

/** Leave a league (cannot leave the default Main League). */
export async function leaveLeague(leagueId: string): Promise<LeagueActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const [league] = await db
    .select({ isDefault: leagues.isDefault })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);
  if (league?.isDefault) {
    return { ok: false, error: "You can't leave the Main League." };
  }

  await db
    .delete(leagueMembers)
    .where(
      and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, user.id)),
    );
  await db
    .delete(standings)
    .where(and(eq(standings.leagueId, leagueId), eq(standings.userId, user.id)));

  revalidatePath("/leagues");
  revalidatePath("/leaderboard");
  return { ok: true };
}
