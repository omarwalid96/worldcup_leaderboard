import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { fetchMatchGamecast } from "@/lib/football/espn";

/**
 * Team stats + lineups + timeline for one match (?home=&away= team names),
 * for the extra tabs on the match detail page.
 *
 * DB first: a finished match has its gamecast snapshotted in `matches.gamecast`
 * (filled by the cron once it finishes), so old matches render with NO ESPN
 * call. Falls back to a live ESPN fetch only when nothing's stored yet (live or
 * just-finished before the cron snapshot). Display only — never grades.
 */
export const revalidate = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const home = searchParams.get("home") ?? "";
  const away = searchParams.get("away") ?? "";
  const empty = { events: [], teamStats: [], lineups: [], leaders: [] };
  if (!home || !away) return NextResponse.json(empty);

  const [row] = await db
    .select({ gamecast: matches.gamecast })
    .from(matches)
    .where(and(eq(matches.homeTeam, home), eq(matches.awayTeam, away)))
    .limit(1);

  if (row?.gamecast) return NextResponse.json(row.gamecast);

  const live = await fetchMatchGamecast(home, away);
  return NextResponse.json(live ?? empty);
}
