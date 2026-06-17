"use client";

import { useState } from "react";
import { Search, X, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { MatchList } from "./match-list";
import type { MatchWithPrediction } from "@/lib/matches/queries";

const STAGE_LABEL: Record<string, string> = {
  group: "group",
  round_of_32: "round of 32",
  round_of_16: "round of 16",
  quarter_final: "quarter-final quarter final",
  semi_final: "semi-final semi final",
  third_place: "third place",
  final: "final",
};

function filterMatches(matches: MatchWithPrediction[], query: string): MatchWithPrediction[] {
  const q = query.toLowerCase().trim();
  if (!q) return matches;
  return matches.filter((m) => {
    const stageText = STAGE_LABEL[m.stage] ?? m.stage;
    const groupText = m.groupName ? `group ${m.groupName.toLowerCase()}` : "";
    const haystack = [
      m.homeTeam,
      m.awayTeam,
      groupText,
      stageText,
      m.venue ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function MatchSearch({
  allMatches,
  userTz,
  children,
}: {
  allMatches: MatchWithPrediction[];
  userTz: string;
  /** Normal tab UI rendered when search is empty. */
  children: React.ReactNode;
}) {
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const isSearching = trimmed.length > 0;
  const results = isSearching ? filterMatches(allMatches, trimmed) : [];

  return (
    <div className="flex flex-col gap-5">
      {/* Search box */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search teams, groups, stages, venues…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 pl-9 pr-9 text-sm"
          aria-label="Search matches"
        />
        {isSearching && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Content */}
      {isSearching ? (
        <div>
          <p className="mb-4 text-xs font-medium text-muted-foreground">
            {results.length > 0
              ? `${results.length} match${results.length === 1 ? "" : "es"} for "${trimmed}"`
              : null}
          </p>
          {results.length > 0 ? (
            <MatchList matches={results} userTz={userTz} />
          ) : (
            <Card className="border-dashed border-border/60 bg-card/40">
              <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                <CalendarDays className="size-8 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  No matches found for &ldquo;{trimmed}&rdquo;
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
