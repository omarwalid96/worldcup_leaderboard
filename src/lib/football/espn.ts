import type { ProviderMatchStatus } from "./types";
import { teamCodeOf } from "./team-ids";

/**
 * ESPN hidden API (site.api.espn.com) — secondary live source, ESPN-preferred.
 *
 * No key, CDN-backed (cache-control max-age=6), built for heavy polling. It
 * reports a true match status (`pre`/`in`/`post` + `completed`) AND a ticking
 * clock — things worldcup26.ir doesn't give us.
 *
 * It's UNDOCUMENTED: the JSON shape can change with no warning. So every read
 * fails SOFT (returns []), and we use it only to OVERLAY live status/score onto
 * the worldcup26.ir schedule — never as the source of truth (ESPN ids don't
 * match our externalIds, so we reconcile by normalized team names).
 */
const ESPN =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

export interface EspnLive {
  /** "HOMECODE|AWAYCODE" (FIFA codes) for reconciliation against our fixtures. */
  matchKey: string;
  status: ProviderMatchStatus;
  homeScore: number | null;
  awayScore: number | null;
}

/** Cross-provider match key from FIFA team codes, or null if either is unknown. */
export function espnMatchKey(home: string, away: string): string | null {
  const h = teamCodeOf(home);
  const a = teamCodeOf(away);
  return h && a ? `${h}|${a}` : null;
}

/** ESPN state → our status. `completed` is the authoritative full-time flag. */
function statusOf(state: string, completed: boolean): ProviderMatchStatus {
  if (completed || state === "post") return "finished";
  if (state === "in") return "live";
  return "scheduled";
}

const SUMMARY_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

/** One goal/card row of a match's timeline. Stored as-is in matches.events. */
export interface MatchEvent {
  minute: string; // "4'", "45'+2'"
  kind: "goal" | "own-goal" | "penalty-goal" | "yellow" | "red";
  team: string;
  side: "home" | "away"; // which side of the UI to render on
  player: string;
  assist: string | null;
}

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
  // ESPN tags goals as "goal", "goal---header", "goal---penalty", etc. — match
  // the prefix so headers/volleys aren't dropped. Text decides og/pen.
  if (t.startsWith("goal")) {
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

/**
 * Goals + cards timeline for one match from ESPN's summary endpoint, keyed by
 * FIFA team code. Two-step: scoreboard → event id, then summary?event=<id>.
 * Returns null if ESPN can't serve it (aged off scoreboard, down, reshaped) so
 * the caller can fall back; returns [] for a real match with no events.
 * Display only — never grades.
 */
export async function fetchMatchEvents(
  home: string,
  away: string,
): Promise<MatchEvent[] | null> {
  const wantHome = teamCodeOf(home);
  const wantAway = teamCodeOf(away);
  if (!wantHome || !wantAway) return null;

  try {
    const sb = (await getJson(`${SUMMARY_BASE}/scoreboard`)) as {
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
    if (!eventId) return null; // aged off scoreboard — caller may have it stored

    const sum = (await getJson(`${SUMMARY_BASE}/summary?event=${eventId}`)) as {
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
      // Place the event on the side whose code matches the event's team. An
      // own goal counts for the OTHER side's score, so flip it.
      const eventCode = teamCodeOf(e.team?.displayName ?? "");
      if (eventCode !== wantHome && eventCode !== wantAway) continue; // unknown
      let side: "home" | "away" = eventCode === wantHome ? "home" : "away";
      if (kind === "own-goal") side = side === "home" ? "away" : "home";
      const isGoal =
        kind === "goal" || kind === "own-goal" || kind === "penalty-goal";
      events.push({
        minute: e.clock?.displayValue ?? "",
        kind,
        team: e.team?.displayName ?? "",
        side,
        player: players[0],
        assist: isGoal && players[1] ? players[1] : null,
      });
    }
    return events;
  } catch {
    return null;
  }
}

/**
 * Current ESPN scoreboard as live overlays keyed by team names. Returns [] on
 * any failure (down, timeout, reshaped JSON) so callers degrade to wc26.
 */
export async function espnLiveResults(): Promise<EspnLive[]> {
  try {
    const res = await fetch(ESPN, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`espn ${res.status}`);
    const data = await res.json();
    const out: EspnLive[] = [];
    for (const e of data?.events ?? []) {
      const st = e?.status;
      const comp = e?.competitions?.[0];
      const c = comp?.competitors ?? [];
      const home = c.find((x: { homeAway: string }) => x.homeAway === "home");
      const away = c.find((x: { homeAway: string }) => x.homeAway === "away");
      if (!home || !away) continue;
      const homeName = home.team?.displayName;
      const awayName = away.team?.displayName;
      if (!homeName || !awayName) continue;
      const matchKey = espnMatchKey(homeName, awayName);
      if (!matchKey) continue; // unknown team spelling → skip (wc26 stands)
      out.push({
        matchKey,
        status: statusOf(st?.type?.state ?? "", Boolean(st?.type?.completed)),
        homeScore: home.score == null ? null : Number(home.score),
        awayScore: away.score == null ? null : Number(away.score),
      });
    }
    return out;
  } catch {
    return [];
  }
}
