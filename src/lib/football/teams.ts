/**
 * Team name → ISO 3166-1 alpha-2 country code (lowercase), for flag CDN lookups.
 * Names match openfootball's `team1`/`team2` strings exactly.
 *
 * Flags are served from flagcdn.com, e.g. https://flagcdn.com/<code>.svg
 * England/Scotland use GB sub-nation codes that flagcdn supports (gb-eng, gb-sct).
 */
export const TEAM_ISO: Record<string, string> = {
  Algeria: "dz",
  Argentina: "ar",
  Australia: "au",
  Austria: "at",
  Belgium: "be",
  "Bosnia & Herzegovina": "ba",
  Brazil: "br",
  Canada: "ca",
  "Cape Verde": "cv",
  Colombia: "co",
  Croatia: "hr",
  Curaçao: "cw",
  "Czech Republic": "cz",
  "DR Congo": "cd",
  Ecuador: "ec",
  Egypt: "eg",
  England: "gb-eng",
  France: "fr",
  Germany: "de",
  Ghana: "gh",
  Haiti: "ht",
  Iran: "ir",
  Iraq: "iq",
  "Ivory Coast": "ci",
  Japan: "jp",
  Jordan: "jo",
  Mexico: "mx",
  Morocco: "ma",
  Netherlands: "nl",
  "New Zealand": "nz",
  Norway: "no",
  Panama: "pa",
  Paraguay: "py",
  Portugal: "pt",
  Qatar: "qa",
  "Saudi Arabia": "sa",
  Scotland: "gb-sct",
  Senegal: "sn",
  "South Africa": "za",
  "South Korea": "kr",
  Spain: "es",
  Sweden: "se",
  Switzerland: "ch",
  Tunisia: "tn",
  Turkey: "tr",
  USA: "us",
  Uruguay: "uy",
  Uzbekistan: "uz",
};

// Extra spellings other providers (e.g. API-Football) use, keyed by teamKey().
const EXTRA_ISO: Record<string, string> = {
  usa: "us",
  "south korea": "kr",
  "ivory coast": "ci",
  "cote d ivoire": "ci",
  "dr congo": "cd",
  "bosnia herzegovina": "ba",
  "cape verde": "cv",
  turkey: "tr",
  curacao: "cw",
};

/** Normalized name → ISO, built lazily (avoids module-eval ordering issues). */
let isoByKey: Record<string, string> | null = null;
function isoByKeyMap(): Record<string, string> {
  if (!isoByKey) {
    isoByKey = {};
    for (const [name, code] of Object.entries(TEAM_ISO)) {
      isoByKey[teamKey(name)] = code;
    }
    Object.assign(isoByKey, EXTRA_ISO);
  }
  return isoByKey;
}

/**
 * ISO code for a team name, or null for TBD/placeholder slots (e.g. "W95").
 * Falls back to a normalized lookup so flags resolve regardless of provider
 * spelling ("United States"/"USA", "Korea Republic"/"South Korea").
 */
export function teamCode(name: string): string | null {
  return TEAM_ISO[name] ?? isoByKeyMap()[teamKey(name)] ?? null;
}

/**
 * Canonical team-name key for matching across data providers that spell names
 * differently (e.g. "DR Congo" vs "Democratic Republic of the Congo").
 * Lowercased, punctuation-stripped, with known aliases folded together.
 */
const NAME_ALIASES: Record<string, string> = {
  "bosnia and herzegovina": "bosnia herzegovina",
  "bosnia & herzegovina": "bosnia herzegovina",
  "democratic republic of the congo": "dr congo",
  "dr congo": "dr congo",
  "united states": "usa",
  usa: "usa",
  "united states of america": "usa",
  "republic of korea": "south korea",
  "korea republic": "south korea",
  türkiye: "turkey",
  turkiye: "turkey",
};

export function teamKey(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return NAME_ALIASES[cleaned] ?? cleaned;
}

/** Stable cross-provider key for a fixture: teams + matchday. */
export function matchKey(home: string, away: string, matchday: number): string {
  return `${teamKey(home)}|${teamKey(away)}|${matchday}`;
}

/** Flag image URL for an ISO code (flagcdn). */
export function flagUrl(code: string | null, width: 40 | 80 | 160 = 80): string | null {
  if (!code) return null;
  return `https://flagcdn.com/w${width}/${code}.png`;
}
