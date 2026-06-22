import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { fetchMatchEvents } from "@/lib/football/espn";

/**
 * Goals + cards timeline for one match (?home=&away= team names).
 *
 * DB first: a finished match has its timeline snapshotted in `matches.events`
 * (filled by the cron once it finishes), so old matches render with NO ESPN
 * call. Falls back to a live ESPN fetch only when nothing's stored yet (live or
 * just-finished match before the cron snapshot). Display only; never grades.
 */
export const revalidate = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const home = searchParams.get("home") ?? "";
  const away = searchParams.get("away") ?? "";
  if (!home || !away) return NextResponse.json({ events: [] });

  const [row] = await db
    .select({ events: matches.events })
    .from(matches)
    .where(and(eq(matches.homeTeam, home), eq(matches.awayTeam, away)))
    .limit(1);

  if (row?.events) return NextResponse.json({ events: row.events });

  const live = await fetchMatchEvents(home, away);
  return NextResponse.json({ events: live ?? [] });
}
