/**
 * Generates a large, FACT-CHECKED World Cup trivia bank into
 * src/lib/games/trivia/questions.generated.ts from openfootball history
 * (the same public-domain source the app already uses for fixtures).
 *
 *   npm run trivia:gen
 *
 * Why a build-time generator (not a runtime fetch): World Cup history never
 * changes, so we bake verified questions into the bundle — gameplay stays fast
 * and offline, no API dependency. Re-run anytime to refresh/extend.
 *
 * IMPORTANT correctness notes (these are how naive generation goes WRONG):
 *  - Penalty finals (1994/2006/2022): score.ft is the a.e.t. DRAW and the winner
 *    is in score.p. We resolve the winner from `p` when present, never from ft.
 *  - 1950 had no single "Final" — it was a round-robin "Final Round". We skip
 *    auto-deriving its final-match questions (a curated 1950 Q lives in the
 *    hand-written bank instead).
 *  - Distractors are drawn from real WC finalist nations, never random strings.
 *
 * The generated file is COMMITTED (so Vercel builds without network). Output is
 * merged with the curated "flavor" bank in questions.ts at import time.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://raw.githubusercontent.com/openfootball/worldcup.json/master";
// Tournament years with openfootball history. (Qatar 2022 newest.)
const YEARS = [
  1930, 1934, 1938, 1954, 1958, 1962, 1966, 1970, 1974, 1978, 1982, 1986,
  1990, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022,
]; // 1950 intentionally excluded (round-robin, no single final).

interface OFMatch {
  round: string;
  team1: string;
  team2: string;
  // ft = 90 min, et = after extra time (a.e.t.), p = penalty shootout.
  score?: { ft?: [number, number]; et?: [number, number]; p?: [number, number] };
  goals1?: { name: string }[];
  goals2?: { name: string }[];
  ground?: string;
}
interface OFData {
  name: string;
  matches: OFMatch[];
}

interface Q {
  id: string;
  q: string;
  choices: string[];
  answerIndex: number;
  category: string;
}

const isFinal = (round: string) => {
  const r = round.trim().toLowerCase();
  return (
    r === "final" ||
    r === "final replay" ||
    (r.includes("final") &&
      !r.includes("semi") &&
      !r.includes("quarter") &&
      !r.includes("third") &&
      !r.includes("round")) // excludes 1950 "Final Round"
  );
};

/**
 * Winner/loser of a match, handling all decider types:
 *  - ft (90 min) decisive → use it
 *  - else et (after extra time) decisive → use it (the result score is the et)
 *  - else p (penalty shootout) → winner from pens, score label is the draw
 * Returns null only on a genuinely unresolvable row.
 */
function resolve(m: OFMatch): { winner: string; loser: string; scoreLabel: string; pens: boolean } | null {
  const ft = m.score?.ft;
  const et = m.score?.et;
  const p = m.score?.p;
  if (!ft) return null;
  const pens = Array.isArray(p) && p[0] !== p[1];

  // Score labels are normalized WINNER-FIRST (higher score first) so they read
  // conventionally, e.g. "1-0" not "0-1", regardless of team1/team2 order.
  const hi = (s: [number, number]) => `${Math.max(s[0], s[1])}-${Math.min(s[0], s[1])}`;
  let winnerIs1: boolean;
  let scoreLabel: string;
  if (ft[0] !== ft[1]) {
    winnerIs1 = ft[0] > ft[1];
    scoreLabel = hi(ft);
  } else if (et && et[0] !== et[1]) {
    // Decided in extra time — the real result is the a.e.t. score.
    winnerIs1 = et[0] > et[1];
    scoreLabel = hi(et);
  } else if (pens) {
    winnerIs1 = p![0] > p![1];
    scoreLabel = `${ft[0]}-${ft[1]}`; // the draw that sent it to pens (symmetric)
  } else {
    return null;
  }
  return {
    winner: winnerIs1 ? m.team1 : m.team2,
    loser: winnerIs1 ? m.team2 : m.team1,
    scoreLabel,
    pens,
  };
}

/** Pick 3 distractors from `pool` excluding `correct` (deterministic order). */
function distractors(correct: string, pool: string[], n = 3): string[] {
  const uniq = [...new Set(pool)].filter((t) => t && t !== correct);
  return uniq.slice(0, n);
}

/** Shuffle-in the correct answer at a stable index derived from the id. */
function makeChoices(correct: string, pool: string[], seedKey: string): { choices: string[]; answerIndex: number } {
  const ds = distractors(correct, pool);
  if (ds.length < 3) return { choices: [], answerIndex: -1 }; // skip if not enough distractors
  const idx = seedKey.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 4;
  const choices = [...ds];
  choices.splice(idx, 0, correct);
  return { choices: choices.slice(0, 4), answerIndex: choices.indexOf(correct) };
}

async function main() {
  const years: { year: number; data: OFData }[] = [];
  for (const y of YEARS) {
    const res = await fetch(`${BASE}/${y}/worldcup.json`);
    if (!res.ok) {
      console.warn(`  skip ${y}: HTTP ${res.status}`);
      continue;
    }
    years.push({ year: y, data: (await res.json()) as OFData });
  }
  console.log(`Fetched ${years.length} tournaments.`);

  // Collect the set of finalist nations across all years → realistic distractors.
  const finalistPool: string[] = [];
  const finals: { year: number; m: OFMatch; r: NonNullable<ReturnType<typeof resolve>> }[] = [];
  for (const { year, data } of years) {
    const fm = data.matches.find((m) => isFinal(m.round));
    if (!fm) {
      console.warn(`  no final found for ${year}`);
      continue;
    }
    const r = resolve(fm);
    if (!r) {
      console.warn(`  could not resolve winner for ${year}`);
      continue;
    }
    finals.push({ year, m: fm, r });
    finalistPool.push(r.winner, r.loser);
  }

  const out: Q[] = [];
  let bad = 0;
  for (const { year, m, r } of finals) {
    // Winner
    {
      const { choices, answerIndex } = makeChoices(r.winner, finalistPool, `w${year}`);
      if (answerIndex >= 0)
        out.push({ id: `g_${year}_w`, q: `Who won the ${year} FIFA World Cup?`, choices, answerIndex, category: "Winners" });
      else bad++;
    }
    // Runner-up
    {
      const { choices, answerIndex } = makeChoices(r.loser, finalistPool, `r${year}`);
      if (answerIndex >= 0)
        out.push({ id: `g_${year}_r`, q: `Which country did ${r.winner} beat in the ${year} World Cup Final?`, choices, answerIndex, category: "Finals" });
      else bad++;
    }
    // Final score (or "decided on penalties")
    if (r.pens) {
      out.push({
        id: `g_${year}_pen`,
        q: `How was the ${year} World Cup Final decided (it finished ${r.scoreLabel})?`,
        choices: ["Golden goal", "Penalty shootout", "Replay", "Coin toss"],
        answerIndex: 1,
        category: "Finals",
      });
    } else {
      // Build score distractors from common scorelines.
      const pool = ["1-0", "2-1", "3-1", "2-0", "3-2", "4-2", "1-1", "5-2"];
      const { choices, answerIndex } = makeChoices(r.scoreLabel, pool, `s${year}`);
      if (answerIndex >= 0)
        out.push({ id: `g_${year}_s`, q: `What was the final score of the ${year} World Cup Final?`, choices, answerIndex, category: "Finals" });
      else bad++;
    }
    // Venue city of the final
    if (m.ground) {
      const city = m.ground.split(",").pop()?.trim();
      if (city) {
        const cityPool = finals.map((f) => f.m.ground?.split(",").pop()?.trim()).filter(Boolean) as string[];
        const { choices, answerIndex } = makeChoices(city, cityPool, `c${year}`);
        if (answerIndex >= 0)
          out.push({ id: `g_${year}_c`, q: `In which city was the ${year} World Cup Final played?`, choices, answerIndex, category: "Venues" });
      }
    }
    // A scorer in the final (winner's side), distractors from the LOSER's scorers + others.
    const winnerGoals = (r.winner === m.team1 ? m.goals1 : m.goals2) ?? [];
    if (winnerGoals.length > 0) {
      const scorer = winnerGoals[0].name;
      // distractors: other finals' winning scorers (different people).
      const scorerPool = finals
        .flatMap((f) => ((f.r.winner === f.m.team1 ? f.m.goals1 : f.m.goals2) ?? []).map((g) => g.name))
        .filter((n) => n !== scorer);
      const { choices, answerIndex } = makeChoices(scorer, scorerPool, `p${year}`);
      if (answerIndex >= 0)
        out.push({ id: `g_${year}_scorer`, q: `Who scored for ${r.winner} in the ${year} World Cup Final?`, choices, answerIndex, category: "Players" });
    }
  }

  // Validate.
  const ids = new Set<string>();
  for (const q of out) {
    if (ids.has(q.id)) throw new Error(`dup id ${q.id}`);
    ids.add(q.id);
    if (q.choices.length !== 4) throw new Error(`bad choices ${q.id}`);
    if (q.answerIndex < 0 || q.answerIndex > 3) throw new Error(`bad answerIndex ${q.id}`);
    if (new Set(q.choices).size !== 4) throw new Error(`dup choice ${q.id}: ${q.choices}`);
  }

  const header = `/**
 * AUTO-GENERATED by scripts/gen-trivia.ts from openfootball World Cup history.
 * Do NOT edit by hand — re-run \`npm run trivia:gen\`. Penalty-aware winner
 * resolution; 1950 (round-robin) is handled by the curated bank instead.
 */
import type { TriviaQuestion } from "./questions";

export const GENERATED_QUESTIONS: TriviaQuestion[] = ${JSON.stringify(out, null, 2)};
`;
  const path = join(process.cwd(), "src/lib/games/trivia/questions.generated.ts");
  writeFileSync(path, header);
  console.log(`Wrote ${out.length} generated questions (${bad} skipped for too few distractors) → ${path}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
