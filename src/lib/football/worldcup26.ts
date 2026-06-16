import type {
  FootballProvider,
  ProviderFixture,
  ProviderResult,
  ProviderStage,
  ProviderMatchStatus,
} from "./types";
import { teamCode } from "./teams";
import { fromZonedTime } from "date-fns-tz";
import { stadiumInfo } from "./stadiums";

/**
 * worldcup26.ir (rezarahiminia/worldcup2026) — the near-live source.
 *
 * It is the SINGLE fixture source so live scores reconcile 1:1 with our
 * schedule. No API key. The server is occasionally flaky, so every fetch uses
 * retry + backoff; the cron persists results to the DB, and users always read
 * the DB (last-known scores survive an outage).
 */
const BASE = "https://worldcup26.ir";

interface RezaGame {
  id: string;
  home_score: string | null;
  away_score: string | null;
  group: string | null;
  matchday: string;
  local_date: string; // "MM/DD/YYYY HH:mm" in venue-local time
  stadium_id: string;
  finished: string; // "TRUE" | "FALSE"
  time_elapsed: string; // "notstarted" | "live" | "finished" | minute
  type: string; // group | r32 | r16 | qf | sf | third | final
  // Blank/undefined for knockout fixtures until the bracket is decided.
  home_team_name_en: string | null;
  away_team_name_en: string | null;
}

const STAGE_BY_TYPE: Record<string, ProviderStage> = {
  group: "group",
  r32: "round_of_32",
  r16: "round_of_16",
  qf: "quarter_final",
  sf: "semi_final",
  third: "third_place",
  final: "final",
};

const KNOCKOUT_MATCHDAY: Record<ProviderStage, number> = {
  group: 0,
  round_of_32: 18,
  round_of_16: 19,
  quarter_final: 20,
  semi_final: 21,
  third_place: 22,
  final: 23,
};

function parseScore(v: string | null): number | null {
  if (v == null || v === "" || v === "null") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function statusOf(g: RezaGame): ProviderMatchStatus {
  if (g.finished === "TRUE" || g.time_elapsed === "finished") return "finished";
  if (g.time_elapsed === "live") return "live";
  return "scheduled";
}

/** "MM/DD/YYYY HH:mm" in the venue timezone → true UTC ISO. */
function toUtcIso(localDate: string, tz: string): string {
  const m = localDate.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return new Date(localDate).toISOString();
  const [, mm, dd, yyyy, hh, min] = m;
  // Build a tz-naive wall-clock string and interpret it in the venue tz.
  const naive = `${yyyy}-${mm}-${dd}T${hh.padStart(2, "0")}:${min}:00`;
  return fromZonedTime(naive, tz).toISOString();
}

function mapGame(g: RezaGame): ProviderFixture {
  const stage = STAGE_BY_TYPE[g.type] ?? "group";
  const { city, tz } = stadiumInfo(g.stadium_id);
  const matchday =
    stage === "group" ? Number(g.matchday) || 1 : KNOCKOUT_MATCHDAY[stage];
  // Knockout fixtures have no teams yet; show a TBD placeholder (no flag).
  const home = g.home_team_name_en?.trim() || "TBD";
  const away = g.away_team_name_en?.trim() || "TBD";
  return {
    externalId: `wc26-${g.id}`,
    stage,
    groupName: stage === "group" ? (g.group ?? null) : null,
    matchday,
    homeTeam: home,
    awayTeam: away,
    homeCode: teamCode(home),
    awayCode: teamCode(away),
    venue: city,
    kickoffUtc: toUtcIso(g.local_date, tz),
    status: statusOf(g),
    homeScore: parseScore(g.home_score),
    awayScore: parseScore(g.away_score),
  };
}

/** Fetch games with retry + exponential backoff. Throws if all retries fail. */
async function fetchGames(): Promise<RezaGame[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/get/games`, {
        next: { revalidate: 30 },
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`worldcup26.ir ${res.status}`);
      const data = (await res.json()) as { games?: RezaGame[] };
      // Keep ALL games, including knockout fixtures whose teams are still TBD
      // (their team names are blank until the bracket is decided).
      return data.games ?? [];
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("worldcup26.ir failed");
}

export const worldcup26Provider: FootballProvider = {
  name: "worldcup26",

  async getFixtures(): Promise<ProviderFixture[]> {
    const games = await fetchGames();
    return games.map(mapGame);
  },

  async getLiveMatches(): Promise<ProviderResult[]> {
    const games = await fetchGames();
    return games
      .map(mapGame)
      .filter((f) => f.status === "live")
      .map((f) => ({
        externalId: f.externalId,
        status: f.status,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
      }));
  },

  async getResult(externalId: string): Promise<ProviderResult | null> {
    const games = await fetchGames();
    const f = games.map(mapGame).find((x) => x.externalId === externalId);
    if (!f) return null;
    return {
      externalId: f.externalId,
      status: f.status,
      homeScore: f.homeScore,
      awayScore: f.awayScore,
    };
  },
};

/** All current results (live + finished + scheduled) for sync reconciliation. */
export async function worldcup26AllResults(): Promise<ProviderResult[]> {
  const games = await fetchGames();
  return games.map(mapGame).map((f) => ({
    externalId: f.externalId,
    status: f.status,
    homeScore: f.homeScore,
    awayScore: f.awayScore,
  }));
}
