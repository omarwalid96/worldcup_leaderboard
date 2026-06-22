import { NextResponse } from "next/server";
import { teamCodeOf } from "@/lib/football/team-ids";

/**
 * Goals + cards timeline for one match, from ESPN's summary endpoint.
 *
 * Two-step (both cached 60s server-side, so all viewers share one fetch each):
 *   1. scoreboard → find the ESPN event id by FIFA team code (?home=&away=)
 *   2. summary?event=<id> → pull keyEvents (goals, yellow/red cards)
 *
 * No DB: events are fetched live from ESPN on demand. Works for live + recent
 * matches (while on the scoreboard ~24-48h); an old match that's aged off the
 * scoreboard returns []. Undocumented, so it fails SOFT (returns []). Display
 * only; never grades.
 */
const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

export interface MatchEvent {
  minute: string; // "4'", "45'+2'"
  kind: "goal" | "own-goal" | "penalty-goal" | "yellow" | "red";
  team: string;
  player: string;
  assist: string | null;
}

export const revalidate = 60;

type EspnAthlete = { athlete?: { displayName?: string } };
type EspnKeyEvent = {
  type?: { type?: string };
  text?: string;
  clock?: { displayValue?: string };
  team?: { displayName?: string };
  participants?: EspnAthlete[];
};

function classify(e: EspnKeyEvent): MatchEvent["kind"] | null {
  const t = e.type?.type ?? "";
  const text = (e.text ?? "").toLowerCase();
  if (t === "yellow-card") return "yellow";
  if (t === "red-card") return "red";
  if (t === "goal" || e.type?.type === "goal") {
    if (text.includes("own goal")) return "own-goal";
    if (text.includes("penalty")) return "penalty-goal";
    return "goal";
  }
  return null;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`espn ${res.status}`);
  return res.json();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wantHome = teamCodeOf(searchParams.get("home") ?? "");
  const wantAway = teamCodeOf(searchParams.get("away") ?? "");
  if (!wantHome || !wantAway) return NextResponse.json({ events: [] });

  try {
    const sb = (await getJson(`${BASE}/scoreboard`)) as {
      events?: Array<{
        id?: string;
        competitions?: Array<{
          competitors?: Array<{ homeAway: string; team?: { displayName?: string } }>;
        }>;
      }>;
    };

    let eventId: string | undefined;
    for (const e of sb.events ?? []) {
      const c = e.competitions?.[0]?.competitors ?? [];
      const h = c.find((x) => x.homeAway === "home")?.team?.displayName;
      const a = c.find((x) => x.homeAway === "away")?.team?.displayName;
      if (teamCodeOf(h ?? "") === wantHome && teamCodeOf(a ?? "") === wantAway) {
        eventId = e.id;
        break;
      }
    }
    if (!eventId) return NextResponse.json({ events: [] }); // aged off scoreboard

    const sum = (await getJson(`${BASE}/summary?event=${eventId}`)) as {
      keyEvents?: EspnKeyEvent[];
    };

    const events: MatchEvent[] = [];
    for (const e of sum.keyEvents ?? []) {
      const kind = classify(e);
      if (!kind) continue;
      const players = (e.participants ?? [])
        .map((p) => p.athlete?.displayName)
        .filter((n): n is string => Boolean(n));
      if (players.length === 0) continue;
      const isGoal = kind === "goal" || kind === "own-goal" || kind === "penalty-goal";
      events.push({
        minute: e.clock?.displayValue ?? "",
        kind,
        team: e.team?.displayName ?? "",
        player: players[0],
        assist: isGoal && players[1] ? players[1] : null,
      });
    }
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ events: [] });
  }
}
