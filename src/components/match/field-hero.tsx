"use client";

import { TeamFlag } from "./team-flag";
import { useLiveMatch, livePhaseLabel } from "./use-live-match";

/**
 * Football-pitch hero for the match detail page: a CSS-drawn green field
 * (no image asset) behind the two flags and the score/clock. Used for live and
 * finished matches in place of the old flat dark score box.
 *
 * For live matches it reads the ESPN score/clock via useLiveMatch and falls
 * back to the DB score when ESPN has nothing. Display only; never grades.
 */
export function FieldHero({
  homeTeam,
  awayTeam,
  homeCode,
  awayCode,
  dbHome,
  dbAway,
  status,
  clockLabel,
}: {
  homeTeam: string;
  awayTeam: string;
  homeCode: string | null;
  awayCode: string | null;
  dbHome: number | null;
  dbAway: number | null;
  status: "live" | "finished";
  /** Optional static label (e.g. "Full time") when not live. */
  clockLabel?: string;
}) {
  const live = useLiveMatch(homeTeam, awayTeam);
  const isLive = status === "live" && live ? !live.completed : false;

  const homeScore = live?.homeScore ?? dbHome ?? 0;
  const awayScore = live?.awayScore ?? dbAway ?? 0;
  const label = isLive && live ? livePhaseLabel(live) : (clockLabel ?? "Full time");
  // Shootout score under the main score. Show it whenever ESPN reports one, NOT
  // only while isLive — ESPN flips completed:true on the deciding kick, which
  // would otherwise hide the score at the climax of the shootout.
  const pens =
    live?.shootoutHome != null && live?.shootoutAway != null
      ? `${live.shootoutHome}–${live.shootoutAway}`
      : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-success/25 px-6 py-6 text-white shadow-[inset_0_1px_0_oklch(1_0_0/0.06)]">
      {/* CSS football pitch: deep-green gradient + center line + circle. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, oklch(0.42 0.1 152), oklch(0.27 0.07 152) 70%, oklch(0.2 0.05 152))",
        }}
      />
      {/* mowing stripes */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-40"
        style={{
          background:
            "repeating-linear-gradient(90deg, transparent 0 11%, oklch(1 0 0 / 0.05) 11% 22%)",
        }}
      />
      {/* center line + center circle + spot */}
      <div
        aria-hidden
        className="absolute left-1/2 top-0 -z-10 h-full w-px -translate-x-1/2 bg-white/15"
      />
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -z-10 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15"
      />
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -z-10 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25"
      />

      {/* left penalty box + goal arc (D), anchored off-screen left */}
      <div
        aria-hidden
        className="absolute left-0 top-1/2 -z-10 h-32 w-12 -translate-x-1/2 -translate-y-1/2 rounded-r-md border border-l-0 border-white/15"
      />
      <div
        aria-hidden
        className="absolute left-12 top-1/2 -z-10 size-10 -translate-y-1/2 rounded-full border border-white/15"
        style={{ clipPath: "inset(0 0 0 50%)" }}
      />
      {/* right penalty box + goal arc */}
      <div
        aria-hidden
        className="absolute right-0 top-1/2 -z-10 h-32 w-12 translate-x-1/2 -translate-y-1/2 rounded-l-md border border-r-0 border-white/15"
      />
      <div
        aria-hidden
        className="absolute right-12 top-1/2 -z-10 size-10 -translate-y-1/2 rounded-full border border-white/15"
        style={{ clipPath: "inset(0 50% 0 0)" }}
      />

      {/* corner arcs */}
      <div
        aria-hidden
        className="absolute left-0 top-0 -z-10 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15"
      />
      <div
        aria-hidden
        className="absolute right-0 top-0 -z-10 size-5 translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15"
      />
      <div
        aria-hidden
        className="absolute bottom-0 left-0 -z-10 size-5 -translate-x-1/2 translate-y-1/2 rounded-full border border-white/15"
      />
      <div
        aria-hidden
        className="absolute bottom-0 right-0 -z-10 size-5 translate-x-1/2 translate-y-1/2 rounded-full border border-white/15"
      />

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex flex-col items-center gap-2 text-center">
          <TeamFlag code={homeCode} alt={homeTeam} size={44} />
          <span className="text-sm font-semibold drop-shadow">{homeTeam}</span>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2 font-numeric text-5xl font-bold tabular-nums drop-shadow">
            <span>{homeScore}</span>
            <span className="text-white/50">–</span>
            <span>{awayScore}</span>
          </div>
          {pens && (
            <div className="font-numeric text-sm font-bold tabular-nums text-live drop-shadow">
              🥅 Pens {pens}
            </div>
          )}
          {isLive ? (
            <div className="flex items-center gap-1.5 rounded-full border border-live/40 bg-background/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-live backdrop-blur-sm">
              <span className="size-1.5 animate-pulse rounded-full bg-live" />
              {label}
            </div>
          ) : (
            <div className="rounded-full border border-white/15 bg-background/40 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/80 backdrop-blur-sm">
              {label}
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <TeamFlag code={awayCode} alt={awayTeam} size={44} />
          <span className="text-sm font-semibold drop-shadow">{awayTeam}</span>
        </div>
      </div>
    </div>
  );
}
