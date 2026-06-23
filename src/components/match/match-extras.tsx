"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Stats / Lineups / Timeline tabs on the match detail page, from one
 * /api/match-gamecast (ESPN summary) fetch. Polls every 20s while `live`.
 * Renders nothing until there's at least one populated tab. Display only.
 */
interface MatchEvent {
  minute: string;
  kind: "goal" | "own-goal" | "penalty-goal" | "yellow" | "red";
  side: "home" | "away";
  player: string;
  assist: string | null;
}
interface TeamStatRow {
  label: string;
  home: string;
  away: string;
}
interface LineupPlayer {
  name: string;
  jersey: string;
  position: string;
  starter: boolean;
  subbedOut: boolean;
}
interface TeamLineup {
  side: "home" | "away";
  team: string;
  formation: string | null;
  players: LineupPlayer[];
}
interface Gamecast {
  events: MatchEvent[];
  teamStats: TeamStatRow[];
  lineups: TeamLineup[];
}

const MARK: Record<MatchEvent["kind"], string> = {
  goal: "⚽",
  "own-goal": "⚽",
  "penalty-goal": "⚽",
  yellow: "🟨",
  red: "🟥",
};

export function MatchExtras({
  homeTeam,
  awayTeam,
  live = false,
}: {
  homeTeam: string;
  awayTeam: string;
  live?: boolean;
}) {
  const [data, setData] = useState<Gamecast | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(
          `/api/match-gamecast?home=${encodeURIComponent(homeTeam)}&away=${encodeURIComponent(awayTeam)}&t=${Math.floor(Date.now() / 20_000)}`,
          { cache: "no-store" },
        );
        const d: Gamecast = await res.json();
        if (alive) setData(d);
      } catch {
        /* fail soft */
      }
    };
    load();
    if (!live) return;
    const id = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [homeTeam, awayTeam, live]);

  if (!data) return null;
  const hasStats = data.teamStats.length > 0;
  const hasLineups = data.lineups.some((l) => l.players.length > 0);
  const hasEvents = data.events.length > 0;
  if (!hasStats && !hasLineups && !hasEvents) return null;

  const first = hasEvents ? "timeline" : hasStats ? "stats" : "lineups";

  return (
    <Tabs defaultValue={first} className="rounded-xl border border-border/60 bg-card/50 p-4">
      <TabsList className="w-full">
        {hasEvents && <TabsTrigger value="timeline">Timeline</TabsTrigger>}
        {hasStats && <TabsTrigger value="stats">Stats</TabsTrigger>}
        {hasLineups && <TabsTrigger value="lineups">Lineups</TabsTrigger>}
      </TabsList>

      {hasEvents && (
        <TabsContent value="timeline" className="pt-3">
          <Timeline events={data.events} homeTeam={homeTeam} awayTeam={awayTeam} />
        </TabsContent>
      )}
      {hasStats && (
        <TabsContent value="stats" className="pt-3">
          <TeamStats rows={data.teamStats} homeTeam={homeTeam} awayTeam={awayTeam} />
        </TabsContent>
      )}
      {hasLineups && (
        <TabsContent value="lineups" className="pt-3">
          <Lineups lineups={data.lineups} />
        </TabsContent>
      )}
    </Tabs>
  );
}

function Timeline({
  events,
  homeTeam,
  awayTeam,
}: {
  events: MatchEvent[];
  homeTeam: string;
  awayTeam: string;
}) {
  return (
    <div>
      <div className="mb-2 grid grid-cols-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>{homeTeam}</span>
        <span className="text-right">{awayTeam}</span>
      </div>
      <div className="flex flex-col gap-2">
        {/* Newest first. */}
        {[...events].reverse().map((e, i) => {
          const suffix =
            e.kind === "own-goal" ? " (OG)" : e.kind === "penalty-goal" ? " (pen)" : "";
          const row = (
            <div
              className={cn(
                "flex items-baseline gap-2",
                e.side === "away" && "flex-row-reverse text-right",
              )}
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
          return (
            <div key={i} className="grid grid-cols-2 gap-2">
              <div>{e.side === "home" && row}</div>
              <div>{e.side === "away" && row}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamStats({
  rows,
  homeTeam,
  awayTeam,
}: {
  rows: TeamStatRow[];
  homeTeam: string;
  awayTeam: string;
}) {
  const num = (s: string) => parseFloat(s.replace("%", "")) || 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>{homeTeam}</span>
        <span className="text-center">&nbsp;</span>
        <span className="text-right">{awayTeam}</span>
      </div>
      {rows.map((r) => {
        const h = num(r.home);
        const a = num(r.away);
        const total = h + a || 1;
        return (
          <div key={r.label} className="flex flex-col gap-1">
            <div className="grid grid-cols-3 items-center text-sm">
              <span className="font-numeric tabular-nums font-semibold">{r.home}</span>
              <span className="text-center text-[11px] text-muted-foreground">
                {r.label}
              </span>
              <span className="text-right font-numeric tabular-nums font-semibold">
                {r.away}
              </span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="bg-gold/70" style={{ width: `${(h / total) * 100}%` }} />
              <div className="bg-info/60" style={{ width: `${(a / total) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Lineups({ lineups }: { lineups: TeamLineup[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {lineups.map((l) => (
        <div key={l.side} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">{l.team}</span>
            {l.formation && (
              <span className="font-numeric text-xs text-muted-foreground">
                {l.formation}
              </span>
            )}
          </div>
          <ul className="flex flex-col gap-0.5">
            {l.players.map((p, i) => (
              <li
                key={`${p.jersey}-${i}`}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  !p.starter && "text-muted-foreground",
                )}
              >
                <span className="w-5 shrink-0 text-right font-numeric tabular-nums text-xs text-muted-foreground">
                  {p.jersey}
                </span>
                <span className="truncate">{p.name}</span>
                {p.position && (
                  <span className="ml-auto shrink-0 text-[10px] uppercase text-muted-foreground/70">
                    {p.position}
                  </span>
                )}
                {p.subbedOut && <span className="shrink-0 text-[10px]">🔻</span>}
                {!p.starter && (
                  <span className="shrink-0 text-[10px] text-muted-foreground/60">
                    bench
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
