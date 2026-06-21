"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, summaryComments } from "@/db/schema";
import { requireProfile } from "@/lib/auth/session";
import { MAX_COMMENT_CHARS, type SummaryComment } from "@/lib/summary/comments";

/** All comments on a summary (oldest first), with author display info. */
export async function listComments(summaryId: string): Promise<SummaryComment[]> {
  return db
    .select({
      userId: summaryComments.userId,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
      body: summaryComments.body,
    })
    .from(summaryComments)
    .innerJoin(profiles, eq(profiles.id, summaryComments.userId))
    .where(eq(summaryComments.summaryId, summaryId))
    .orderBy(asc(summaryComments.createdAt));
}

/**
 * Add or replace the current user's one comment on a summary (140 char max).
 * Returns the refreshed comment list, or an error.
 */
export async function submitComment(
  summaryId: string,
  body: string,
): Promise<{ ok: boolean; error?: string; comments?: SummaryComment[] }> {
  const profile = await requireProfile();
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Say something first." };
  if (trimmed.length > MAX_COMMENT_CHARS) {
    return { ok: false, error: `Keep it under ${MAX_COMMENT_CHARS} characters.` };
  }

  await db
    .insert(summaryComments)
    .values({ summaryId, userId: profile.id, body: trimmed })
    .onConflictDoUpdate({
      target: [summaryComments.summaryId, summaryComments.userId],
      set: { body: trimmed },
    });

  revalidatePath("/dashboard");
  return { ok: true, comments: await listComments(summaryId) };
}

/** The current user's existing comment body on a summary, if any. */
export async function getMyComment(summaryId: string): Promise<string | null> {
  const profile = await requireProfile();
  const [row] = await db
    .select({ body: summaryComments.body })
    .from(summaryComments)
    .where(
      and(
        eq(summaryComments.summaryId, summaryId),
        eq(summaryComments.userId, profile.id),
      ),
    )
    .limit(1);
  return row?.body ?? null;
}
