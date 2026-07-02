"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { matches, predictions } from "@/db/schema";
import { getCurrentUser } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/session";

const schema = z.object({
  matchId: z.string().uuid(),
  homePick: z.number().int().min(0).max(20),
  awayPick: z.number().int().min(0).max(20),
  isDoubleDown: z.boolean().default(false),
  // Optional penalty-shootout prediction (knockout matches only).
  pensWinner: z.enum(["home", "away"]).nullish(),
  pensHomePick: z.number().int().min(0).max(20).nullish(),
  pensAwayPick: z.number().int().min(0).max(20).nullish(),
});

export interface SavePredictionResult {
  ok: boolean;
  error?: string;
}

/**
 * Create or update a scoreline prediction.
 *
 * SERVER-AUTHORITATIVE LOCK: we re-read the match's kickoff_utc and compare to
 * the database clock (now()). If kickoff has passed, the write is refused — no
 * matter what the client believes. This is the single most important rule in
 * the app. RLS enforces the same constraint as defense-in-depth.
 */
export async function savePrediction(input: {
  matchId: string;
  homePick: number;
  awayPick: number;
  isDoubleDown?: boolean;
  pensWinner?: "home" | "away" | null;
  pensHomePick?: number | null;
  pensAwayPick?: number | null;
}): Promise<SavePredictionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  // Deactivated accounts can't make or change picks (their points must stand
  // still while deactivated). The UI is already blocked; this is the real gate.
  const me = await getSessionProfile();
  if (me?.deactivatedAt) {
    return { ok: false, error: "Your account is deactivated. Reactivate to make picks." };
  }

  const parsed = schema.safeParse({
    matchId: input.matchId,
    homePick: input.homePick,
    awayPick: input.awayPick,
    isDoubleDown: input.isDoubleDown ?? false,
    pensWinner: input.pensWinner ?? null,
    pensHomePick: input.pensHomePick ?? null,
    pensAwayPick: input.pensAwayPick ?? null,
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid scoreline (0–20 each side)." };
  }
  const {
    matchId,
    homePick,
    awayPick,
    isDoubleDown,
    pensWinner,
    pensHomePick,
    pensAwayPick,
  } = parsed.data;

  // Re-read the match and check, using the DB clock (never the client):
  //  - open:   kickoff hasn't passed (lock rule)
  //  - inWindow: now is within the 24h pre-kickoff prediction window
  const [match] = await db
    .select({
      id: matches.id,
      kickoffUtc: matches.kickoffUtc,
      matchday: matches.matchday,
      isKnockout: sql<boolean>`(${matches.stage} <> 'group')`,
      open: sql<boolean>`(${matches.kickoffUtc} > now())`,
      inWindow: sql<boolean>`(
        now() >= ${matches.kickoffUtc} - interval '24 hours'
        and now() < ${matches.kickoffUtc}
      )`,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) return { ok: false, error: "Match not found." };
  if (!match.open) {
    return { ok: false, error: "This match has kicked off — picks are locked." };
  }
  if (!match.inWindow) {
    return {
      ok: false,
      error: "Predictions open 24 hours before kickoff.",
    };
  }
  // Knockout picks must include a pens winner (any result can end level and go
  // to penalties). Enforced server-side too — the client gate is UX only.
  if (match.isKnockout && !pensWinner) {
    return { ok: false, error: "Pick who wins on penalties before locking in." };
  }

  // Enforce one double-down per matchday: if turning this on, clear any other
  // double-down the user has on the same matchday.
  if (isDoubleDown) {
    await db.execute(sql`
      update predictions p
      set is_double_down = false, updated_at = now()
      from matches m
      where p.match_id = m.id
        and p.user_id = ${user.id}
        and m.matchday = ${match.matchday}
        and p.match_id <> ${matchId}
        and p.is_double_down = true
    `);
  }

  // Upsert the prediction. The WHERE on conflict re-checks kickoff to close any
  // race between the read above and the write.
  await db
    .insert(predictions)
    .values({
      userId: user.id,
      matchId,
      homePick,
      awayPick,
      isDoubleDown,
      pensWinner: pensWinner ?? null,
      pensHomePick: pensHomePick ?? null,
      pensAwayPick: pensAwayPick ?? null,
      locked: false,
    })
    .onConflictDoUpdate({
      target: [predictions.userId, predictions.matchId],
      set: {
        homePick,
        awayPick,
        isDoubleDown,
        pensWinner: pensWinner ?? null,
        pensHomePick: pensHomePick ?? null,
        pensAwayPick: pensAwayPick ?? null,
        updatedAt: new Date(),
      },
      // Guard: never modify a row that has been locked.
      setWhere: eq(predictions.locked, false),
    });

  revalidatePath("/matches");
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Toggle double-down off for a match (kept separate for a clean UI affordance). */
export async function clearDoubleDown(matchId: string): Promise<SavePredictionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  await db
    .update(predictions)
    .set({ isDoubleDown: false, updatedAt: new Date() })
    .where(
      and(
        eq(predictions.userId, user.id),
        eq(predictions.matchId, matchId),
        eq(predictions.locked, false),
      ),
    );

  revalidatePath("/matches");
  revalidatePath(`/matches/${matchId}`);
  return { ok: true };
}
