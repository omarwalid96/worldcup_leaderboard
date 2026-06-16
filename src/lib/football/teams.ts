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

/** ISO code for a team name, or null for TBD/placeholder slots (e.g. "W95"). */
export function teamCode(name: string): string | null {
  return TEAM_ISO[name] ?? null;
}

/** Flag image URL for an ISO code (flagcdn). */
export function flagUrl(code: string | null, width: 40 | 80 | 160 = 80): string | null {
  if (!code) return null;
  return `https://flagcdn.com/w${width}/${code}.png`;
}
