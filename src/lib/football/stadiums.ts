/**
 * worldcup26.ir stadium_id → IANA timezone + display city.
 * The API gives match times as wall-clock "local_date" with NO timezone, so we
 * resolve the venue's timezone here to convert to true UTC.
 *
 * Stadium ids + cities confirmed from GET /get/stadiums.
 */
export interface StadiumInfo {
  city: string;
  tz: string;
}

export const STADIUMS: Record<string, StadiumInfo> = {
  "1": { city: "Mexico City", tz: "America/Mexico_City" },
  "2": { city: "Guadalajara", tz: "America/Mexico_City" },
  "3": { city: "Monterrey", tz: "America/Monterrey" },
  "4": { city: "Dallas", tz: "America/Chicago" },
  "5": { city: "Houston", tz: "America/Chicago" },
  "6": { city: "Kansas City", tz: "America/Chicago" },
  "7": { city: "Atlanta", tz: "America/New_York" },
  "8": { city: "Miami", tz: "America/New_York" },
  "9": { city: "Boston (Foxborough)", tz: "America/New_York" },
  "10": { city: "Philadelphia", tz: "America/New_York" },
  "11": { city: "New York/New Jersey", tz: "America/New_York" },
  "12": { city: "Toronto", tz: "America/Toronto" },
  "13": { city: "Vancouver", tz: "America/Vancouver" },
  "14": { city: "Seattle", tz: "America/Los_Angeles" },
  "15": { city: "San Francisco Bay Area", tz: "America/Los_Angeles" },
  "16": { city: "Los Angeles", tz: "America/Los_Angeles" },
};

export function stadiumInfo(stadiumId: string | null | undefined): StadiumInfo {
  return (stadiumId && STADIUMS[stadiumId]) || { city: "TBD", tz: "America/New_York" };
}
