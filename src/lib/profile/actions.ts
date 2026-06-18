"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/supabase/server";

export interface UpdateNameResult {
  ok: boolean;
  error?: string;
}

export interface UpdateQuoteResult {
  ok: boolean;
  error?: string;
}

const nameSchema = z
  .string()
  .trim()
  .min(2, "At least 2 characters.")
  .max(30, "Keep it under 30 characters.");

const quoteSchema = z.string().trim().max(120, "Keep it under 120 characters.");

/**
 * Update the current user's display name (the name shown on the leaderboard,
 * profile, picks, etc.). The @username/login handle is unchanged.
 */
export async function updateDisplayName(name: string): Promise<UpdateNameResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name." };
  }

  await db
    .update(profiles)
    .set({ displayName: parsed.data })
    .where(eq(profiles.id, user.id));

  // Name shows across the whole app — revalidate everything.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Update the current user's quote (shown on the home leader spotlight when
 * they hold the #1 rank). Empty/whitespace clears the quote (stored as null).
 */
export async function updateQuote(quote: string): Promise<UpdateQuoteResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const parsed = quoteSchema.safeParse(quote);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid quote." };
  }

  // Treat blank/whitespace as null to clear the field.
  const value = parsed.data.length > 0 ? parsed.data : null;

  await db
    .update(profiles)
    .set({ quote: value })
    .where(eq(profiles.id, user.id));

  revalidatePath("/", "layout");
  return { ok: true };
}
