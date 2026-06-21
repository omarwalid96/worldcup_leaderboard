"use client";

import { useEffect, useState } from "react";

/**
 * Live score + match clock for the match page, sourced from /api/live (ESPN).
 *
 * Polls every 60s while the tab is visible. The /api/live route caches ESPN
 * server-side for 60s, so 100 viewers still cause ≤1 upstream fetch/min.
 *
 * Renders NOTHING unless ESPN reports this exact match live — so if ESPN is
 * down, reshapes its JSON, or the match isn't live there, the page is
 * unchanged (DB scores stand). Display only; never grades.
 */
interface LiveMatch {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  clock: string;
  period: number;
  completed: boolean;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

export function LiveOverlay({
  homeTeam,
  awayTeam,
}: {
  homeTeam: string;
  awayTeam: string;
}) {
  const [m, setM] = useState<LiveMatch | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/live");
        const data: { matches?: LiveMatch[] } = await res.json();
        // Match by team names — ESPN ids don't match our externalIds.
        const hit = (data.matches ?? []).find(
          (x) =>
            norm(x.home) === norm(homeTeam) && norm(x.away) === norm(awayTeam),
        );
        if (alive) setM(hit ?? null);
      } catch {
        /* fail soft: keep last value / show nothing */
      }
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [homeTeam, awayTeam]);

  if (!m) return null;

  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-live/40 bg-live/5 py-3">
      <div className="flex items-center gap-2 font-numeric text-3xl tabular-nums">
        <span>{m.homeScore}</span>
        <span className="text-muted-foreground">–</span>
        <span>{m.awayScore}</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-live">
        <span className="size-1.5 animate-pulse rounded-full bg-live" />
        {m.clock || "Live"}
      </div>
    </div>
  );
}
