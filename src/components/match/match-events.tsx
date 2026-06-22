"use client";

import { useEffect, useState } from "react";

/**
 * Goals + cards timeline for the match detail page, from /api/match-events
 * (ESPN summary). Two columns — home events on the left, away on the right —
 * each row anchored to its team's side. Polls every 60s while `live` so new
 * events appear; one fetch after full time otherwise. Renders nothing if ESPN
 * has no events for this match. Display only.
 */
interface MatchEvent {
  minute: string;
  kind: "goal" | "own-goal" | "penalty-goal" | "yellow" | "red";
  team: string;
  side: "home" | "away";
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

function Row({ e, align }: { e: MatchEvent; align: "left" | "right" }) {
  const suffix =
    e.kind === "own-goal" ? " (OG)" : e.kind === "penalty-goal" ? " (pen)" : "";
  return (
    <div
      className={
        align === "right"
          ? "flex flex-row-reverse items-baseline gap-2 text-right"
          : "flex items-baseline gap-2"
      }
    >
      <span className="shrink-0 font-numeric tabular-nums text-xs text-muted-foreground">
        {e.minute}
      </span>
      <span className="shrink-0">{MARK[e.kind]}</span>
      <span className="min-w-0">
        <span className="text-sm font-medium">
          {e.player}
          {suffix}
        </span>
        {e.assist && (
          <span className="block text-[11px] text-muted-foreground">
            assist {e.assist}
          </span>
        )}
      </span>
    </div>
  );
}

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
    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="mb-2 grid grid-cols-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>{homeTeam}</span>
        <span className="text-right">{awayTeam}</span>
      </div>
      <div className="flex flex-col gap-2">
        {/* Newest first — latest minute at the top. */}
        {[...events].reverse().map((e, i) => (
          <div key={i} className="grid grid-cols-2 gap-2">
            <div>{e.side === "home" && <Row e={e} align="left" />}</div>
            <div>{e.side === "away" && <Row e={e} align="right" />}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
