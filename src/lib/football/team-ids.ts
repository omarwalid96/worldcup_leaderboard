/**
 * Cross-provider team identity. The stable key is the FIFA 3-letter code; each
 * provider spells country names differently, so we resolve any provider's name
 * to that code and match across sources by code instead of by fuzzy name.
 *
 * Why this exists: a normalize-the-name approach silently fails on 4 of the 48
 * teams — "Czech Republic" vs "Czechia", "Turkey" vs "Türkiye", "Bosnia and
 * Herzegovina" vs "Bosnia-Herzegovina", "Democratic Republic of the Congo" vs
 * "Congo DR" don't normalize to the same string. A wrong/absent match isn't
 * data-corrupting (the overlay just doesn't apply), but it silently loses ESPN
 * for that match — exactly the live coverage we added ESPN for.
 *
 * `aliases` lists every spelling we've seen from wc26.ir and ESPN. To add a
 * provider, add its spelling to the right team's alias list. Run
 * scripts-style check (see team-ids self-check) after editing.
 */
export interface TeamId {
  code: string; // FIFA 3-letter, the cross-provider key
  /** Every provider spelling, normalized-comparable. First entry is canonical. */
  aliases: string[];
}

export const TEAMS: TeamId[] = [
  { code: "ALG", aliases: ["Algeria"] },
  { code: "ARG", aliases: ["Argentina"] },
  { code: "AUS", aliases: ["Australia"] },
  { code: "AUT", aliases: ["Austria"] },
  { code: "BEL", aliases: ["Belgium"] },
  { code: "BIH", aliases: ["Bosnia and Herzegovina", "Bosnia-Herzegovina"] },
  { code: "BRA", aliases: ["Brazil"] },
  { code: "CAN", aliases: ["Canada"] },
  { code: "CPV", aliases: ["Cape Verde"] },
  { code: "COL", aliases: ["Colombia"] },
  { code: "CRO", aliases: ["Croatia"] },
  { code: "CUW", aliases: ["Curaçao"] },
  { code: "CZE", aliases: ["Czech Republic", "Czechia"] },
  { code: "COD", aliases: ["Democratic Republic of the Congo", "Congo DR"] },
  { code: "ECU", aliases: ["Ecuador"] },
  { code: "EGY", aliases: ["Egypt"] },
  { code: "ENG", aliases: ["England"] },
  { code: "FRA", aliases: ["France"] },
  { code: "GER", aliases: ["Germany"] },
  { code: "GHA", aliases: ["Ghana"] },
  { code: "HAI", aliases: ["Haiti"] },
  { code: "IRN", aliases: ["Iran"] },
  { code: "IRQ", aliases: ["Iraq"] },
  { code: "CIV", aliases: ["Ivory Coast", "Côte d'Ivoire"] },
  { code: "JPN", aliases: ["Japan"] },
  { code: "JOR", aliases: ["Jordan"] },
  { code: "MEX", aliases: ["Mexico"] },
  { code: "MAR", aliases: ["Morocco"] },
  { code: "NED", aliases: ["Netherlands"] },
  { code: "NZL", aliases: ["New Zealand"] },
  { code: "NOR", aliases: ["Norway"] },
  { code: "PAN", aliases: ["Panama"] },
  { code: "PAR", aliases: ["Paraguay"] },
  { code: "POR", aliases: ["Portugal"] },
  { code: "QAT", aliases: ["Qatar"] },
  { code: "KSA", aliases: ["Saudi Arabia"] },
  { code: "SCO", aliases: ["Scotland"] },
  { code: "SEN", aliases: ["Senegal"] },
  { code: "RSA", aliases: ["South Africa"] },
  { code: "KOR", aliases: ["South Korea", "Korea Republic"] },
  { code: "ESP", aliases: ["Spain"] },
  { code: "SWE", aliases: ["Sweden"] },
  { code: "SUI", aliases: ["Switzerland"] },
  { code: "TUN", aliases: ["Tunisia"] },
  { code: "TUR", aliases: ["Turkey", "Türkiye"] },
  { code: "USA", aliases: ["United States", "USA"] },
  { code: "URU", aliases: ["Uruguay"] },
  { code: "UZB", aliases: ["Uzbekistan"] },
];

/** Letters-only lowercase, accents stripped — for alias comparison. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

const CODE_BY_ALIAS: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const t of TEAMS) for (const a of t.aliases) m.set(norm(a), t.code);
  return m;
})();

/**
 * Resolve any provider's team name to its FIFA code, or null if unknown.
 * Falls back to normalized comparison so an unseen-but-identical spelling still
 * resolves; only genuinely different spellings need an alias entry.
 */
export function teamCodeOf(name: string): string | null {
  return CODE_BY_ALIAS.get(norm(name)) ?? null;
}
