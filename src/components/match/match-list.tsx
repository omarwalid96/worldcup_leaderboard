import { MatchCard } from "./match-card";
import { KickoffTime } from "./kickoff-time";
import type { MatchWithPrediction } from "@/lib/matches/queries";
import { isUsToday } from "@/lib/time/usday";

/** Groups matches into day buckets (by UTC date) and renders a card grid per day. */
export function MatchList({
  matches,
  userTz,
}: {
  matches: MatchWithPrediction[];
  userTz: string;
}) {
  // Bucket by UTC calendar date; headers render in the user's tz.
  const buckets = new Map<string, MatchWithPrediction[]>();
  for (const m of matches) {
    const key = new Date(m.kickoffUtc).toISOString().slice(0, 10);
    const arr = buckets.get(key);
    if (arr) arr.push(m);
    else buckets.set(key, [m]);
  }

  return (
    <div className="flex flex-col gap-8">
      {[...buckets.entries()].map(([day, dayMatches]) => (
        <section key={day}>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            <KickoffTime
              kickoffUtc={`${day}T12:00:00Z`}
              fallbackTz={userTz}
              format="EEEE, d MMMM"
            />
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {dayMatches.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                userTz={userTz}
                predictable={isUsToday(m.kickoffUtc)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
