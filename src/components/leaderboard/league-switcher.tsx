"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

interface LeagueOption {
  id: string;
  name: string;
}

/** Dropdown to switch the leaderboard between the leagues the user is in. */
export function LeagueSwitcher({
  leagues,
  currentId,
}: {
  leagues: LeagueOption[];
  currentId: string;
}) {
  const router = useRouter();
  if (leagues.length <= 1) return null;

  return (
    <div className="relative">
      <select
        value={currentId}
        onChange={(e) => router.push(`/leaderboard?league=${e.target.value}`)}
        aria-label="Switch league"
        className="h-9 appearance-none rounded-lg border border-border/60 bg-card/60 pl-3 pr-8 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {leagues.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
