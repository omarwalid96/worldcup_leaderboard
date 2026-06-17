"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { matches, profiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/supabase/server";

export interface AdminResult {
  ok: boolean;
  error?: string;
}

async function requireAdmin(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const [me] = await db
    .select({ isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  return me?.isAdmin ? user.id : null;
}

const pensSchema = z.object({
  matchId: z.string().uuid(),
  pensHome: z.number().int().min(0).max(30),
  pensAway: z.number().int().min(0).max(30),
});

/**
 * Admin records a knockout's penalty-shootout result. The data source can't
 * report shootouts, so this is the truth source for the pens bonus. Grading
 * picks it up on the next run. Admin-only.
 */
export async function setPensResult(input: {
  matchId: string;
  pensHome: number;
  pensAway: number;
}): Promise<AdminResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "Admin only." };

  const parsed = pensSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid shootout score." };
  if (parsed.data.pensHome === parsed.data.pensAway) {
    return { ok: false, error: "A shootout can't be a draw." };
  }

  await db
    .update(matches)
    .set({
      wentToPens: true,
      pensHome: parsed.data.pensHome,
      pensAway: parsed.data.pensAway,
    })
    .where(eq(matches.id, parsed.data.matchId));

  revalidatePath(`/matches/${parsed.data.matchId}`);
  revalidatePath("/matches");
  return { ok: true };
}

/** Clear a recorded pens result (admin correction). */
export async function clearPensResult(matchId: string): Promise<AdminResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "Admin only." };

  await db
    .update(matches)
    .set({ wentToPens: false, pensHome: null, pensAway: null })
    .where(eq(matches.id, matchId));

  revalidatePath(`/matches/${matchId}`);
  return { ok: true };
}

const scoreSchema = z.object({
  matchId: z.string().uuid(),
  homeScore: z.number().int().min(0).max(30),
  awayScore: z.number().int().min(0).max(30),
});

/**
 * Admin override for a match's final scoreline — a safety valve when the data
 * source reports a result wrong (e.g. folds a shootout into the score). Sets the
 * match finished with the given score. Admin-only. (Grading re-reads on its run;
 * to re-grade an already-graded match, clear points via regrade — which itself
 * requires a fresh backup.)
 */
export async function setMatchScore(input: {
  matchId: string;
  homeScore: number;
  awayScore: number;
}): Promise<AdminResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "Admin only." };

  const parsed = scoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid score." };

  await db
    .update(matches)
    .set({
      homeScore: parsed.data.homeScore,
      awayScore: parsed.data.awayScore,
      status: "finished",
      lastSyncedAt: new Date(),
    })
    .where(eq(matches.id, parsed.data.matchId));

  revalidatePath(`/matches/${parsed.data.matchId}`);
  revalidatePath("/matches");
  return { ok: true };
}
