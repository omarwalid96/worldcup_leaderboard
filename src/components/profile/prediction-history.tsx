"use client";

import { useMemo, useState } from "react";
import { Zap, Search, X } from "lucide-react";
import { TeamFlag } from "@/components/match/team-flag";
import { KickoffTime } from "@/components/match/kickoff-time";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PredictionHistoryRow } from "@/lib/predictions/history";

type StatusFilter = "all" | "finished" | "upcoming";

function PointsPill({ points }: { points: number | null }) {
  if (points === null) return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
        points > 0
          ? "bg-success/15 text-success"
          : "bg-muted text-muted-foreground",
      )}
    >
      {points > 0 ? `+${points}` : "0"}
    </span>
  );
}

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "finished", label: "Played" },
  { key: "upcoming", label: "Upcoming" },
];

export function PredictionHistory({
  rows,
  fallbackTz,
}: {
  rows: PredictionHistoryRow[];
  fallbackTz: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "finished" && r.status !== "finished") return false;
      if (status === "upcoming" && r.status === "finished") return false;
      if (!q) return true;
      // Filter by country/team name (home or away).
      return (
        r.homeTeam.toLowerCase().includes(q) ||
        r.awayTeam.toLowerCase().includes(q)
      );
    });
  }, [rows, query, status]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No picks yet. Lock in your first prediction.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filters: search by country/team + status */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by country…"
            className="h-9 pl-9 pr-8"
            aria-label="Filter picks by country"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="inline-flex rounded-lg border border-border/60 bg-card/40 p-0.5">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatus(t.key)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                status === t.key
                  ? "bg-gold/20 text-gold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-card/40 py-6 text-center text-sm text-muted-foreground">
          No picks match your filter.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card/40">
          {filtered.map((row) => {
        const isFinished = row.status === "finished";
        return (
          <li
            key={row.matchId}
            className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
          >
            {/* Teams + flags */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <TeamFlag code={row.homeCode} alt={row.homeTeam} size={22} />
              <span className="truncate text-sm font-medium">{row.homeTeam}</span>
              <span className="text-xs text-muted-foreground">vs</span>
              <TeamFlag code={row.awayCode} alt={row.awayTeam} size={22} />
              <span className="truncate text-sm font-medium">{row.awayTeam}</span>
            </div>

            {/* Date */}
            <KickoffTime
              kickoffUtc={row.kickoffUtc}
              fallbackTz={fallbackTz}
              format="d MMM"
              className="shrink-0 text-xs text-muted-foreground"
            />

            {/* Pick */}
            <div className="flex items-center gap-1.5">
              {row.isDoubleDown && (
                <Zap className="size-3.5 shrink-0 text-gold" aria-label="Double down" />
              )}
              <span className="font-numeric text-base tabular-nums">
                {row.homePick}–{row.awayPick}
              </span>
            </div>

            {/* Actual result */}
            {isFinished && row.homeScore != null && row.awayScore != null ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                ({row.homeScore}–{row.awayScore})
              </span>
            ) : (
              <span className="shrink-0 w-[48px]" />
            )}

            {/* Points pill */}
            <PointsPill points={isFinished ? row.pointsAwarded : null} />
          </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
