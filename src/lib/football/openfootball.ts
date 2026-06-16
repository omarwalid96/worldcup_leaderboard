import type {
  FootballProvider,
  ProviderFixture,
  ProviderResult,
  ProviderStage,
} from "./types";
import { teamCode } from "./teams";

const SOURCE_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

// ── openfootball JSON shapes ─────────────────────────────────────────────────
interface OFMatch {
  round: string; // "Matchday 1".."Matchday 17" | "Round of 32" | "Round of 16" | "Quarter-final" | "Semi-final" | "Match for third place" | "Final"
  num?: number;
  date: string; // "2026-06-11"
  time: string; // "13:00 UTC-6"
  team1: string;
  team2: string;
  group?: string; // "Group A"
  ground?: string; // venue city
  score?: { ft?: [number, number]; ht?: [number, number] };
}
interface OFData {
  name: string;
  matches: OFMatch[];
}

const STAGE_BY_ROUND: Record<string, ProviderStage> = {
  "Round of 32": "round_of_32",
  "Round of 16": "round_of_16",
  "Quarter-final": "quarter_final",
  "Semi-final": "semi_final",
  "Match for third place": "third_place",
  Final: "final",
};

function stageFor(round: string): ProviderStage {
  return STAGE_BY_ROUND[round] ?? "group";
}

/**
 * Tournament-day index used for streaks / double-down grouping.
 * Group stage: "Matchday N" → N. Knockout rounds continue the sequence so each
 * later round is its own matchday.
 */
function matchdayFor(round: string): number {
  const md = round.match(/^Matchday (\d+)$/);
  if (md) return Number(md[1]);
  // Group stage runs Matchday 1..17 in this dataset; knockouts follow.
  switch (round) {
    case "Round of 32":
      return 18;
    case "Round of 16":
      return 19;
    case "Quarter-final":
      return 20;
    case "Semi-final":
      return 21;
    case "Match for third place":
      return 22;
    case "Final":
      return 23;
    default:
      return 99;
  }
}

/**
 * Parse openfootball date + time ("2026-06-11", "13:00 UTC-6") into a UTC ISO
 * string. The offset is the venue's local offset, so UTC = local - offset.
 */
function toUtcIso(date: string, time: string): string {
  const m = time.match(/^(\d{1,2}):(\d{2})\s*UTC([+-]\d{1,2})(?::?(\d{2}))?$/);
  if (!m) {
    // Fallback: treat as midnight UTC of that date.
    return new Date(`${date}T00:00:00Z`).toISOString();
  }
  const [, hh, mm, offH, offM] = m;
  const localHour = Number(hh);
  const localMin = Number(mm);
  const offsetHours = Number(offH);
  const offsetMins = (offsetHours < 0 ? -1 : 1) * Number(offM ?? "0");

  // Build the instant: the wall-clock time is local; subtract the offset to get UTC.
  const [y, mo, d] = date.split("-").map(Number);
  const utcMs = Date.UTC(y, mo - 1, d, localHour, localMin) - (offsetHours * 60 + offsetMins) * 60_000;
  return new Date(utcMs).toISOString();
}

function groupName(group: string | undefined): string | null {
  if (!group) return null;
  return group.replace(/^Group\s+/, "");
}

function mapMatch(m: OFMatch, index: number): ProviderFixture {
  const ft = m.score?.ft;
  const hasScore = Array.isArray(ft) && ft.length === 2;
  const kickoffUtc = toUtcIso(m.date, m.time);

  // Status: provider data only tells us scheduled vs finished (it has final
  // scores or it doesn't). "live" is determined by the live adapter / cron.
  const status: ProviderFixture["status"] = hasScore ? "finished" : "scheduled";

  return {
    // Stable id: prefer the dataset's match number, else a deterministic index.
    externalId: `wc2026-${m.num ?? index + 1}`,
    stage: stageFor(m.round),
    groupName: groupName(m.group),
    matchday: matchdayFor(m.round),
    homeTeam: m.team1,
    awayTeam: m.team2,
    homeCode: teamCode(m.team1),
    awayCode: teamCode(m.team2),
    venue: m.ground ?? null,
    kickoffUtc,
    status,
    homeScore: hasScore ? ft![0] : null,
    awayScore: hasScore ? ft![1] : null,
  };
}

async function fetchData(): Promise<OFData> {
  const res = await fetch(SOURCE_URL, {
    // Revalidate periodically; the seed/sync controls freshness explicitly.
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(`openfootball fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as OFData;
}

/**
 * openfootball adapter. Provides fixtures + final results (public domain, no key).
 * It is NOT a live in-play source — getLiveMatches() returns []; wire a keyed
 * live provider for in-play scores and the cron will merge them.
 */
export const openfootballProvider: FootballProvider = {
  name: "openfootball",

  async getFixtures(): Promise<ProviderFixture[]> {
    const data = await fetchData();
    return data.matches.map(mapMatch);
  },

  async getLiveMatches(): Promise<ProviderResult[]> {
    // openfootball is schedule/results only — no in-play feed.
    return [];
  },

  async getResult(externalId: string): Promise<ProviderResult | null> {
    const data = await fetchData();
    const idx = data.matches.findIndex(
      (m, i) => `wc2026-${m.num ?? i + 1}` === externalId,
    );
    if (idx === -1) return null;
    const f = mapMatch(data.matches[idx], idx);
    return {
      externalId: f.externalId,
      status: f.status,
      homeScore: f.homeScore,
      awayScore: f.awayScore,
    };
  },
};
