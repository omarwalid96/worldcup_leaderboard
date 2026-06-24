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
interface PlayerStat {
  label: string;
  value: string;
}
interface LineupPlayer {
  name: string;
  jersey: string;
  position: string;
  starter: boolean;
  subbedOut: boolean;
  subbedIn: boolean;
  formationPlace: number | null;
  jerseyHref: string | null;
  stats: PlayerStat[];
  rating: number | null;
}
interface TeamLineup {
  side: "home" | "away";
  team: string;
  formation: string | null;
  players: LineupPlayer[];
}
interface MatchLeader {
  category: string;
  player: string;
  value: string;
}
interface TeamLeaders {
  side: "home" | "away";
  team: string;
  leaders: MatchLeader[];
}
interface Gamecast {
  events: MatchEvent[];
  teamStats: TeamStatRow[];
  lineups: TeamLineup[];
  leaders: TeamLeaders[];
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
  show = ["timeline", "stats", "lineups", "players"],
}: {
  homeTeam: string;
  awayTeam: string;
  live?: boolean;
  /** Which tabs to render. The detail page shows only the timeline; the stats
   *  page shows stats + lineups + star players. */
  show?: Array<"timeline" | "stats" | "lineups" | "players">;
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
  const hasStats = show.includes("stats") && data.teamStats.length > 0;
  const hasLineups =
    show.includes("lineups") && data.lineups.some((l) => l.players.length > 0);
  const hasEvents = show.includes("timeline") && data.events.length > 0;
  const hasPlayers = show.includes("players") && data.leaders.length > 0;
  if (!hasStats && !hasLineups && !hasEvents && !hasPlayers) return null;

  const first = hasEvents
    ? "timeline"
    : hasLineups
      ? "lineups"
      : hasStats
        ? "stats"
        : "players";

  return (
    <Tabs defaultValue={first} className="rounded-xl border border-border/60 bg-card/50 p-4">
      <TabsList className="w-full">
        {hasEvents && <TabsTrigger value="timeline">Timeline</TabsTrigger>}
        {hasLineups && <TabsTrigger value="lineups">Lineups</TabsTrigger>}
        {hasStats && <TabsTrigger value="stats">Stats</TabsTrigger>}
        {hasPlayers && <TabsTrigger value="players">Top players</TabsTrigger>}
      </TabsList>

      {hasEvents && (
        <TabsContent value="timeline" className="pt-3">
          <Timeline events={data.events} homeTeam={homeTeam} awayTeam={awayTeam} />
        </TabsContent>
      )}
      {hasLineups && (
        <TabsContent value="lineups" className="pt-3">
          <Lineups lineups={data.lineups} />
        </TabsContent>
      )}
      {hasStats && (
        <TabsContent value="stats" className="pt-3">
          <TeamStats rows={data.teamStats} homeTeam={homeTeam} awayTeam={awayTeam} />
        </TabsContent>
      )}
      {hasPlayers && (
        <TabsContent value="players" className="pt-3">
          <TopPlayers lineups={data.lineups} leaders={data.leaders} />
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

/** Colour for a rating chip: green ≥7.5, gold ≥6.5, neutral ≥5.5, red below. */
function ratingClass(r: number): string {
  if (r >= 7.5) return "bg-success/20 text-success";
  if (r >= 6.5) return "bg-gold/20 text-gold";
  if (r >= 5.5) return "bg-muted text-foreground";
  return "bg-destructive/15 text-destructive";
}

function RatingChip({ rating, className }: { rating: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.1rem] items-center justify-center rounded-md px-1 py-0.5 font-numeric text-xs font-bold tabular-nums",
        ratingClass(rating),
        className,
      )}
      title="Estimated match rating"
    >
      {rating.toFixed(1)}
    </span>
  );
}

/**
 * "Top players" tab: the highest-rated XI per team (by our estimated rating) plus
 * ESPN's category leaders. Ratings are an estimate from limited stats (labelled),
 * not an official ESPN figure.
 */
function TopPlayers({
  lineups,
  leaders,
}: {
  lineups: TeamLineup[];
  leaders: TeamLeaders[];
}) {
  const leadersBySide = new Map(leaders.map((l) => [l.side, l]));
  return (
    <div className="flex flex-col gap-5">
      {lineups.map((l) => {
        const rated = l.players
          .filter((p) => p.rating != null)
          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
          .slice(0, 5);
        const lead = leadersBySide.get(l.side);
        return (
          <div key={l.side} className="flex flex-col gap-2">
            <span className="text-sm font-semibold">{l.team}</span>

            {rated.length > 0 && (
              <ul className="flex flex-col gap-1">
                {rated.map((p, i) => (
                  <li
                    key={`${p.jersey}-${i}`}
                    className="flex items-center gap-2.5 rounded-lg bg-card/60 px-2.5 py-1.5"
                  >
                    <span className="w-5 shrink-0 text-right font-numeric tabular-nums text-xs text-muted-foreground">
                      {p.jersey}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium">
                      {p.name}
                    </span>
                    {p.position && (
                      <span className="shrink-0 text-[10px] uppercase text-muted-foreground/70">
                        {p.position}
                      </span>
                    )}
                    <RatingChip rating={p.rating as number} />
                  </li>
                ))}
              </ul>
            )}

            {lead && lead.leaders.length > 0 && (
              <div className="flex flex-col gap-1 rounded-lg border border-border/50 bg-card/30 p-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Match leaders
                </span>
                {lead.leaders.map((x) => (
                  <div
                    key={x.category}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-muted-foreground">{x.category}</span>
                    <span className="truncate text-right">
                      {x.player}{" "}
                      <span className="font-numeric tabular-nums font-bold text-gold">
                        {x.value}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[10px] text-muted-foreground/70">
        Ratings are an estimate from match stats, not an official figure.
      </p>
    </div>
  );
}

function Lineups({ lineups }: { lineups: TeamLineup[] }) {
  // Per-team tabs (like ESPN): pick a side, see its pitch + bench. Tapping a
  // player reveals their stat line in a panel below.
  const first = lineups[0]?.side ?? "home";
  const [selected, setSelected] = useState<LineupPlayer | null>(null);
  return (
    <Tabs
      defaultValue={first}
      className="gap-3"
      onValueChange={() => setSelected(null)}
    >
      <TabsList className="w-full">
        {lineups.map((l) => (
          <TabsTrigger key={l.side} value={l.side}>
            {l.team}
            {l.formation && (
              <span className="ml-1.5 font-numeric text-xs text-muted-foreground">
                {l.formation}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {lineups.map((l) => (
        <TabsContent key={l.side} value={l.side} className="flex flex-col gap-3">
          <Pitch
            formation={l.formation}
            players={l.players.filter((p) => p.starter)}
            onSelect={setSelected}
          />
          {selected && (
            <PlayerStatCard player={selected} onClose={() => setSelected(null)} />
          )}
          <Bench
            players={l.players.filter((p) => !p.starter)}
            onSelect={setSelected}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function PlayerStatCard({
  player,
  onClose,
}: {
  player: LineupPlayer;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-gold/30 bg-gold/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold">
          <span className="font-numeric tabular-nums text-muted-foreground">
            #{player.jersey}
          </span>{" "}
          {player.name}
          {player.position && (
            <span className="ml-1.5 text-[10px] uppercase text-muted-foreground/70">
              {player.position}
            </span>
          )}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {player.rating != null && <RatingChip rating={player.rating} />}
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>
      {player.stats.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {player.stats.map((s) => (
            <div key={s.label} className="flex flex-col">
              <span className="font-numeric tabular-nums text-base font-bold">
                {s.value}
              </span>
              <span className="text-[10px] uppercase text-muted-foreground">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No stats recorded.</p>
      )}
    </div>
  );
}

/**
 * Rows of formationPlace ordinals, GK first then defense→attack, from a
 * formation string. "4-3-3" → [[1],[2,3,4,5],[6,7,8],[9,10,11]]. Falls back to
 * an even split of the outfielders if the string is missing/unparseable, so any
 * shape still renders (a wing may sit a row off, but the bench list is exact).
 */
function formationRows(formation: string | null, count: number): number[][] {
  const parts = (formation ?? "")
    .split("-")
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const rows: number[][] = [[1]]; // GK = place 1
  const sum = parts.reduce((a, b) => a + b, 0);
  if (parts.length > 0 && sum + 1 === count) {
    let place = 2;
    for (const n of parts) rows.push(Array.from({ length: n }, () => place++));
  } else {
    // Unknown/short formation → even split of the outfielders into ~3 lines.
    const outfield = Array.from({ length: count - 1 }, (_, i) => i + 2);
    const per = Math.ceil(outfield.length / 3);
    for (let i = 0; i < outfield.length; i += per)
      rows.push(outfield.slice(i, i + per));
  }
  return rows;
}

function Pitch({
  formation,
  players,
  onSelect,
}: {
  formation: string | null;
  players: LineupPlayer[];
  onSelect: (p: LineupPlayer) => void;
}) {
  // Older snapshots predate formationPlace — fall back to the players' order
  // (ESPN lists starters GK-first), so the pitch still fills instead of showing
  // empty slots.
  const haveAllPlaces = players.every((p) => p.formationPlace != null);
  const byPlace = new Map(
    players.map((p, i) => [haveAllPlaces ? p.formationPlace : i + 1, p]),
  );
  // Defense→attack from formationRows; render attack at the TOP of the pitch, so
  // reverse to put the GK row at the bottom.
  const rows = [...formationRows(formation, players.length)].reverse();

  return (
    <div className="relative overflow-hidden rounded-xl border border-success/30 bg-gradient-to-b from-success/15 to-success/5 p-3">
      {/* simple pitch markings */}
      <div className="pointer-events-none absolute inset-x-6 top-1/2 h-px -translate-y-1/2 bg-white/15" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
      <div className="relative flex flex-col gap-4 py-2">
        {rows.map((row, ri) => (
          <div key={ri} className="flex justify-around gap-2">
            {row.map((place) => {
              const p = byPlace.get(place);
              if (!p) return <div key={place} className="w-14" />;
              return <PitchPlayer key={place} p={p} onSelect={onSelect} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function PitchPlayer({
  p,
  onSelect,
}: {
  p: LineupPlayer;
  onSelect: (p: LineupPlayer) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(p)}
      className="flex w-16 flex-col items-center gap-0.5 text-center transition-transform hover:scale-105 focus-visible:outline-1 focus-visible:outline-ring"
    >
      <div className="relative">
        {p.jerseyHref ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.jerseyHref}
            alt=""
            className="size-11 object-contain drop-shadow"
            loading="lazy"
          />
        ) : (
          <div className="flex size-11 items-center justify-center rounded-full border-2 border-white/70 bg-card font-numeric text-sm font-bold tabular-nums">
            {p.jersey}
          </div>
        )}
        {/* jersey number badge — keeps the pitch readable even with shirt images */}
        <span className="absolute -bottom-1 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-background/90 px-1 font-numeric text-[9px] font-bold tabular-nums text-foreground ring-1 ring-border">
          {p.jersey}
        </span>
        {p.rating != null && (
          <RatingChip
            rating={p.rating}
            className="absolute -right-2 -top-1.5 min-w-0 px-1 py-0 text-[10px] ring-1 ring-background"
          />
        )}
        {p.subbedOut && (
          <span
            className="absolute -bottom-1 right-0 text-[10px]"
            title="Substituted off"
          >
            🔻
          </span>
        )}
      </div>
      <span className="max-w-full truncate text-[11px] font-medium leading-tight">
        {p.name}
      </span>
    </button>
  );
}

function Bench({
  players,
  onSelect,
}: {
  players: LineupPlayer[];
  onSelect: (p: LineupPlayer) => void;
}) {
  if (players.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Bench
      </span>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {players.map((p, i) => (
          <li key={`${p.jersey}-${i}`}>
            <button
              type="button"
              onClick={() => onSelect(p)}
              className="flex w-full items-center gap-2 text-left text-sm text-muted-foreground hover:text-foreground"
            >
              <span className="w-5 shrink-0 text-right font-numeric tabular-nums text-xs">
                {p.jersey}
              </span>
              <span className="flex-1 truncate">{p.name}</span>
              {p.subbedIn && (
                <span className="shrink-0 text-[10px]" title="Came on">
                  🔺
                </span>
              )}
              {p.rating != null && (
                <RatingChip
                  rating={p.rating}
                  className="min-w-0 px-1 py-0 text-[10px]"
                />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
