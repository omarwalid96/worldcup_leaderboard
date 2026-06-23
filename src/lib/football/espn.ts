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
    return eventsFromKeyEvents(sum.keyEvents ?? [], wantHome, wantAway);
  } catch {
    return null;
  }
}

/** Map ESPN keyEvents → our goal/card timeline. Shared by events + gamecast. */
function eventsFromKeyEvents(
  keyEvents: EspnKeyEvent[],
  wantHome: string,
  wantAway: string,
): MatchEvent[] {
  const events: MatchEvent[] = [];
  for (const e of keyEvents) {
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
}

/** One row of the head-to-head Team Stats tab: home vs away for one metric. */
export interface TeamStatRow {
  label: string;
  home: string;
  away: string;
}

/** One labelled per-player stat (e.g. {label:"Goals", value:"1"}). */
export interface PlayerStat {
  label: string;
  value: string;
}

/** One player in a formation/lineup. side = which team. */
export interface LineupPlayer {
  name: string;
  jersey: string;
  position: string; // abbreviation: G/D/M/F
  starter: boolean;
  subbedOut: boolean;
  subbedIn: boolean;
  /** 1..11 ordinal within the formation (GK=1); null for bench. */
  formationPlace: number | null;
  /** Live ESPN jersey image URL (not stored as a file; URL only). */
  jerseyHref: string | null;
  /** This player's match stat line (curated; empty if none). */
  stats: PlayerStat[];
}

/** One "star performer" — a team leader in some stat category. */
export interface MatchLeader {
  category: string; // "Total Shots"
  player: string;
  value: string;
}

export interface TeamLeaders {
  side: "home" | "away";
  team: string;
  leaders: MatchLeader[];
}

export interface TeamLineup {
  side: "home" | "away";
  team: string;
  formation: string | null;
  players: LineupPlayer[]; // starters first, then bench, in roster order
}

/** Everything the match-detail extra tabs need, from ONE summary fetch. */
export interface MatchGamecast {
  events: MatchEvent[];
  teamStats: TeamStatRow[];
  lineups: TeamLineup[];
  leaders: TeamLeaders[];
}

// The Team Stats tab — curated subset of boxscore stats in display order. We
// only surface the ones worth comparing (ESPN ships ~28, many are noise).
const STAT_ORDER = [
  "possessionPct",
  "totalShots",
  "shotsOnTarget",
  "wonCorners",
  "foulsCommitted",
  "yellowCards",
  "redCards",
  "offsides",
  "saves",
  "accuratePasses",
  "totalPasses",
] as const;

type EspnBoxTeam = {
  homeAway?: string;
  statistics?: Array<{ name?: string; displayValue?: string; label?: string }>;
};
type EspnRoster = {
  homeAway?: string;
  formation?: string;
  team?: { displayName?: string };
  roster?: Array<{
    starter?: boolean;
    subbedOut?: boolean;
    subbedIn?: boolean;
    jersey?: string;
    formationPlace?: string;
    position?: { abbreviation?: string };
    stats?: Array<{ name?: string; displayValue?: string }>;
    athlete?: {
      displayName?: string;
      shortName?: string;
      jerseyImages?: Array<{ href?: string; rel?: string[] }>;
    };
  }>;
};

// Per-player stats worth showing, name → label, in display order. Zero-value
// rows are dropped per player so a defender doesn't show "0 Saves".
const PLAYER_STATS: Array<[string, string]> = [
  ["totalGoals", "Goals"],
  ["goalAssists", "Assists"],
  ["totalShots", "Shots"],
  ["shotsOnTarget", "On target"],
  ["foulsCommitted", "Fouls"],
  ["foulsSuffered", "Fouled"],
  ["offsides", "Offsides"],
  ["yellowCards", "Yellow"],
  ["redCards", "Red"],
  ["saves", "Saves"],
  ["goalsConceded", "Conceded"],
];

function parsePlayerStats(
  stats: Array<{ name?: string; displayValue?: string }> | undefined,
): PlayerStat[] {
  if (!stats) return [];
  const by = new Map(stats.map((s) => [s.name, s.displayValue]));
  const out: PlayerStat[] = [];
  for (const [name, label] of PLAYER_STATS) {
    const v = by.get(name);
    if (v == null) continue;
    // Drop zero rows except goals/assists (a "0 Goals" line is just noise).
    if (v === "0" && name !== "totalGoals" && name !== "goalAssists") continue;
    out.push({ label, value: v });
  }
  return out;
}

type EspnLeaderGroup = {
  team?: { id?: string; displayName?: string };
  leaders?: Array<{
    displayName?: string;
    leaders?: Array<{ displayValue?: string; athlete?: { shortName?: string } }>;
  }>;
};

/**
 * Leaders groups carry no homeAway, but ESPN orders them home-first (same as
 * rosters). We resolve the side by matching the leaders' team displayName to the
 * rosters' (already side-tagged); fall back to array order if names don't match.
 */
function parseLeaders(
  groups: EspnLeaderGroup[],
  sideByTeam: Map<string, "home" | "away">,
): TeamLeaders[] {
  const out: TeamLeaders[] = [];
  groups.forEach((g, i) => {
    const team = g.team?.displayName ?? "";
    const side = sideByTeam.get(team) ?? (i === 0 ? "home" : "away");
    const leaders: MatchLeader[] = [];
    for (const cat of g.leaders ?? []) {
      const top = cat.leaders?.[0];
      const player = top?.athlete?.shortName;
      if (!player || top?.displayValue == null) continue;
      leaders.push({
        category: cat.displayName ?? "",
        player,
        value: top.displayValue,
      });
    }
    if (leaders.length) out.push({ side, team, leaders });
  });
  return out;
}

function parseTeamStats(teams: EspnBoxTeam[]): TeamStatRow[] {
  const home = teams.find((t) => t.homeAway === "home");
  const away = teams.find((t) => t.homeAway === "away");
  if (!home || !away) return [];
  const pick = (t: EspnBoxTeam, name: string) =>
    t.statistics?.find((s) => s.name === name);
  const rows: TeamStatRow[] = [];
  for (const name of STAT_ORDER) {
    const h = pick(home, name);
    const a = pick(away, name);
    if (!h && !a) continue;
    rows.push({
      label: h?.label ?? a?.label ?? name,
      home: h?.displayValue ?? "0",
      away: a?.displayValue ?? "0",
    });
  }
  return rows;
}

function parseLineups(rosters: EspnRoster[]): TeamLineup[] {
  const out: TeamLineup[] = [];
  for (const side of ["home", "away"] as const) {
    const r = rosters.find((x) => x.homeAway === side);
    if (!r) continue;
    const players: LineupPlayer[] = (r.roster ?? [])
      .map((p) => {
        const place = Number(p.formationPlace);
        const jersey = p.athlete?.jerseyImages?.find((j) =>
          (j.rel ?? []).includes("default"),
        );
        return {
          name: p.athlete?.shortName ?? p.athlete?.displayName ?? "",
          jersey: p.jersey ?? "",
          position: p.position?.abbreviation ?? "",
          starter: Boolean(p.starter),
          subbedOut: Boolean(p.subbedOut),
          subbedIn: Boolean(p.subbedIn),
          formationPlace: Number.isFinite(place) && place > 0 ? place : null,
          jerseyHref: jersey?.href ?? p.athlete?.jerseyImages?.[0]?.href ?? null,
          stats: parsePlayerStats(p.stats),
        };
      })
      .filter((p) => p.name)
      // starters first, then bench; ESPN's order is already sensible within each
      .sort((a, b) => Number(b.starter) - Number(a.starter));
    out.push({
      side,
      team: r.team?.displayName ?? "",
      formation: r.formation ?? null,
      players,
    });
  }
  return out;
}

/**
 * Full gamecast (timeline + team stats + lineups) for one match, from ONE ESPN
 * summary fetch. Same scoreboard→eventId→summary lookup as fetchMatchEvents,
 * keyed by FIFA team code. Returns null if ESPN can't serve it (aged off /
 * down / reshaped). Display only — never grades.
 */
export async function fetchMatchGamecast(
  home: string,
  away: string,
): Promise<MatchGamecast | null> {
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
    if (!eventId) return null;

    const sum = (await getJson(`${SUMMARY_BASE}/summary?event=${eventId}`)) as {
      keyEvents?: EspnKeyEvent[];
      boxscore?: { teams?: EspnBoxTeam[] };
      rosters?: EspnRoster[];
      leaders?: EspnLeaderGroup[];
    };

    const lineups = parseLineups(sum.rosters ?? []);
    const sideByTeam = new Map(lineups.map((l) => [l.team, l.side]));
    return {
      events: eventsFromKeyEvents(sum.keyEvents ?? [], wantHome, wantAway),
      teamStats: parseTeamStats(sum.boxscore?.teams ?? []),
      lineups,
      leaders: parseLeaders(sum.leaders ?? [], sideByTeam),
    };
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
