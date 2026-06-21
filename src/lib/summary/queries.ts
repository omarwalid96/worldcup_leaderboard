import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { aiSummaries } from "@/db/schema";

export interface AiSummary {
  id: string;
  body: string;
  createdAt: string;
}

/** The most recent AI Summary recap, or null if none has been published yet. */
export async function getLatestSummary(): Promise<AiSummary | null> {
  const [row] = await db
    .select({ id: aiSummaries.id, body: aiSummaries.body, createdAt: aiSummaries.createdAt })
    .from(aiSummaries)
    .orderBy(desc(aiSummaries.createdAt))
    .limit(1);
  if (!row) return null;
  return { id: row.id, body: row.body, createdAt: row.createdAt.toISOString() };
}
