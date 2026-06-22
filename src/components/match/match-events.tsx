"use client";

import { useEffect, useState } from "react";

/**
 * Goals + cards timeline for the match detail page, from /api/match-events
 * (ESPN summary). Polls every 60s while `live` so new events appear; one fetch
 * after full time otherwise. Renders nothing if ESPN has no events for this
 * match (old match aged off the scoreboard, or ESPN down). Display only.
 */
interface MatchEvent {
  minute: string;
  kind: "goal" | "own-goal" | "penalty-goal" | "yellow" | "red";
  team: string;
  player: string;
  assist: string | null;
}

const MARK: Record<MatchEvent["kind"], string> = {
  goal: "⚽",
  "own-goal": "⚽",
  "penalty-goal": "⚽",
  yellow: "🟨",
  red: "🟥",
};

export function MatchEvents({
  homeTeam,
  awayTeam,
  live = false,
}: {
  homeTeam: string;
  awayTeam: string;
  live?: boolean;
}) {
  const [events, setEvents] = useState<MatchEvent[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(
          `/api/match-events?home=${encodeURIComponent(homeTeam)}&away=${encodeURIComponent(awayTeam)}&t=${Math.floor(Date.now() / 30_000)}`,
          { cache: "no-store" },
        );
        const data: { events?: MatchEvent[] } = await res.json();
        if (alive) setEvents(data.events ?? []);
      } catch {
        /* fail soft */
      }
    };
    load();
    if (!live) return;
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [homeTeam, awayTeam, live]);

  if (!events || events.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-card/50 p-4">
      <span className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Match events
      </span>
      {events.map((e, i) => {
        const suffix =
          e.kind === "own-goal" ? " (OG)" : e.kind === "penalty-goal" ? " (pen)" : "";
        return (
          <div key={i} className="flex items-baseline gap-2.5 text-sm">
            <span className="w-12 shrink-0 text-right font-numeric tabular-nums text-muted-foreground">
              {e.minute}
            </span>
            <span className="shrink-0">{MARK[e.kind]}</span>
            <span className="min-w-0">
              <span className="font-medium">
                {e.player}
                {suffix}
              </span>
              {e.assist && (
                <span className="text-muted-foreground"> · assist {e.assist}</span>
              )}
              <span className="text-xs text-muted-foreground"> — {e.team}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
