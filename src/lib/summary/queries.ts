import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { aiSummaries } from "@/db/schema";

export interface AiSummary {
  body: string;
  createdAt: string;
}

/** The most recent AI Summary recap, or null if none has been published yet. */
export async function getLatestSummary(): Promise<AiSummary | null> {
  const [row] = await db
    .select({ body: aiSummaries.body, createdAt: aiSummaries.createdAt })
    .from(aiSummaries)
    .orderBy(desc(aiSummaries.createdAt))
    .limit(1);
  if (!row) return null;
  return { body: row.body, createdAt: row.createdAt.toISOString() };
}
