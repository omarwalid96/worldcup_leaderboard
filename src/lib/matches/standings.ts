import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { matches, type Match } from "@/db/schema";

// --- Group standings -------------------------------------------------------

export interface TeamRow {
  team: string;
  code: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export interface GroupTable {
  group: string; // "A".."L"
  rows: TeamRow[]; // sorted best-first
}

/** Sort by points, then goal difference, then goals scored (simple FIFA-ish). */
function rank(a: TeamRow, b: TeamRow): number {
  return b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team);
}

function emptyRow(team: string, code: string | null): TeamRow {
  return { team, code, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
}

/** Build group tables from finished group matches in our DB. */
export function computeGroupTables(groupMatches: Match[]): GroupTable[] {
  const byGroup = new Map<string, Map<string, TeamRow>>();

  const ensure = (group: string, team: string, code: string | null) => {
    let g = byGroup.get(group);
    if (!g) byGroup.set(group, (g = new Map()));
    let row = g.get(team);
    if (!row) g.set(team, (row = emptyRow(team, code)));
    if (!row.code && code) row.code = code; // fill code if it shows up later
    return row;
  };

  for (const m of groupMatches) {
    const group = m.groupName;
    if (!group) continue;
    // Register both teams even if the match hasn't finished, so the table lists
    // all four teams from the start.
    const home = ensure(group, m.homeTeam, m.homeCode);
    const away = ensure(group, m.awayTeam, m.awayCode);
    if (m.status !== "finished" || m.homeScore == null || m.awayScore == null) continue;

    home.played++;
    away.played++;
    home.gf += m.homeScore;
    home.ga += m.awayScore;
    away.gf += m.awayScore;
    away.ga += m.homeScore;
    if (m.homeScore > m.awayScore) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (m.homeScore < m.awayScore) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points++;
      away.points++;
    }
  }

  return [...byGroup.entries()]
    .map(([group, rows]) => {
      const list = [...rows.values()].map((r) => ({ ...r, gd: r.gf - r.ga })).sort(rank);
      return { group, rows: list };
    })
    .sort((a, b) => a.group.localeCompare(b.group));
}

// --- Bracket projection ----------------------------------------------------

// Official WC2026 Round-of-32 slotting by FIFA match number (externalId
// `wc26-NN`). "1X"=winner of group X, "2X"=runner-up, "3*"=a best-third slot.
// Source: 2026 FIFA World Cup knockout stage (Wikipedia). Third-place slots are
// filled greedily from the 8 best third-placed teams (best → earliest slot);
// FIFA's exact thirds lookup table isn't modelled — close enough for a preview.
// ponytail: greedy thirds assignment; swap in FIFA's 15-combo lookup table if exact ordering matters.
const R32: Record<number, [string, string]> = {
  73: ["2A", "2B"],
  74: ["1E", "3*"],
  75: ["1F", "2C"],
  76: ["1C", "2F"],
  77: ["1I", "3*"],
  78: ["2E", "2I"],
  79: ["1A", "3*"],
  80: ["1L", "3*"],
  81: ["1D", "3*"],
  82: ["1G", "3*"],
  83: ["2K", "2L"],
  84: ["1H", "2J"],
  85: ["1B", "3*"],
  86: ["1J", "2H"],
  87: ["1K", "3*"],
  88: ["2D", "2G"],
};

// Later rounds: winners of prior match numbers.
const KO: Record<number, [number, number]> = {
  89: [74, 77], 90: [73, 75], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100],
  104: [101, 102],
};

// Bracket column order, derived by DFS from the final so feeders sit directly
// left of the match they feed (the classic stacked-bracket layout). Each entry
// is the ordered list of match numbers for one round, top-to-bottom.
// Index 0 = R32, last = Final. Third place (103) is shown separately.
export const BRACKET_COLUMNS: number[][] = (() => {
  const order: number[][] = [[], [], [], [], []]; // R32, R16, QF, SF, Final
  // col: 4=Final, 3=SF, 2=QF, 1=R16, 0=R32. In-order DFS so each round's list
  // comes out top-to-bottom matching its feeders.
  const walk = (no: number, col: number) => {
    if (KO[no] && col > 0) {
      const [a, b] = KO[no];
      walk(a, col - 1);
      order[col].push(no);
      walk(b, col - 1);
    } else {
      order[col].push(no); // R32 leaf
    }
  };
  walk(104, 4);
  return order;
})();

export interface BracketTeam {
  team: string;
  code: string | null;
  /** false once it's only a projection (group stage not done / thirds guessed). */
  predicted: boolean;
}

export interface BracketMatch {
  matchNo: number;
  stage: Match["stage"];
  kickoffUtc: Date;
  venue: string | null;
  home: BracketTeam | null;
  away: BracketTeam | null;
  // Real teams from the DB once the slot is no longer TBD.
  real: boolean;
}

function teamOf(row: TeamRow | undefined, predicted: boolean): BracketTeam | null {
  return row ? { team: row.team, code: row.code, predicted } : null;
}

/**
 * Project the knockout bracket from current group tables. Where a knockout match
 * row in the DB already has real (non-TBD) teams, those win. Otherwise we slot
 * in the projected qualifiers. The winner of each projected match is taken as
 * the higher-seeded side (group winner > runner-up > third) — we don't predict
 * actual knockout scorelines, just who reaches each round structurally.
 */
export function projectBracket(tables: GroupTable[], koMatches: Match[]): BracketMatch[] {
  const winner = (g: string) => tables.find((t) => t.group === g)?.rows[0];
  const runnerUp = (g: string) => tables.find((t) => t.group === g)?.rows[1];

  // 8 best third-placed teams, ranked, for the greedy thirds slots.
  const thirds = tables
    .map((t) => t.rows[2])
    .filter((r): r is TeamRow => !!r)
    .sort(rank)
    .slice(0, 8);
  let thirdIdx = 0;

  const slot = (token: string): BracketTeam | null => {
    if (token === "3*") return teamOf(thirds[thirdIdx++], true);
    const g = token[1];
    return teamOf(token[0] === "1" ? winner(g) : runnerUp(g), true);
  };

  const byNo = new Map<number, Match>();
  for (const m of koMatches) {
    const no = Number(m.externalId.replace("wc26-", ""));
    if (!Number.isNaN(no)) byNo.set(no, m);
  }

  // Resolve each match's projected pair, memoised so later rounds can read winners.
  const resolved = new Map<number, { pair: [BracketTeam | null, BracketTeam | null]; real: boolean }>();

  const resolve = (no: number): { pair: [BracketTeam | null, BracketTeam | null]; real: boolean } => {
    const cached = resolved.get(no);
    if (cached) return cached;
    const m = byNo.get(no);
    const realPair =
      m && m.homeTeam !== "TBD" && m.awayTeam !== "TBD"
        ? ([
            { team: m.homeTeam, code: m.homeCode, predicted: false },
            { team: m.awayTeam, code: m.awayCode, predicted: false },
          ] as [BracketTeam, BracketTeam])
        : null;

    // Only R32 is projected from group standings. Later rounds (R16+) stay TBD
    // until the real teams are known — we don't predict knockout results.
    let out: { pair: [BracketTeam | null, BracketTeam | null]; real: boolean };
    if (realPair) {
      out = { pair: realPair, real: true };
    } else if (R32[no]) {
      out = { pair: [slot(R32[no][0]), slot(R32[no][1])], real: false };
    } else {
      out = { pair: [null, null], real: false };
    }
    resolved.set(no, out);
    return out;
  };

  const out: BracketMatch[] = [];
  for (const m of koMatches) {
    const no = Number(m.externalId.replace("wc26-", ""));
    const { pair, real } = resolve(no);
    out.push({
      matchNo: no,
      stage: m.stage,
      kickoffUtc: m.kickoffUtc,
      venue: m.venue,
      home: pair[0],
      away: pair[1],
      real,
    });
  }
  return out.sort((a, b) => a.kickoffUtc.getTime() - b.kickoffUtc.getTime());
}

/** Fetch matches and build both views in one go. */
export async function getStandingsAndBracket(): Promise<{
  groups: GroupTable[];
  bracket: BracketMatch[];
}> {
  const rows = await db.select().from(matches).orderBy(asc(matches.kickoffUtc));
  const groupMatches = rows.filter((m) => m.stage === "group");
  const koMatches = rows.filter((m) => m.stage !== "group");
  const groups = computeGroupTables(groupMatches);
  const bracket = projectBracket(groups, koMatches);
  return { groups, bracket };
}
