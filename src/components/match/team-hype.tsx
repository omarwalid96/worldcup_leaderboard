"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import { X } from "lucide-react";
import { haptic } from "@/lib/celebrate";
import type { HypeCountry, TeamHypeMatch } from "@/lib/matches/team-hype";

interface CountryTheme {
  flag: string;
  /** confetti palette */
  colors: string[];
  /** tailwind classes for the banner gradient — win vs default */
  bgWin: string;
  bgDefault: string;
  borderWin: string;
  borderDefault: string;
  copy: {
    win: (opp: string, score: string) => React.ReactNode;
    draw: (opp: string, score: string) => React.ReactNode;
    loss: (opp: string, score: string) => React.ReactNode;
    live: React.ReactNode;
    upcoming: (opp: string) => React.ReactNode;
    fullTimeWin: string;
  };
}

const THEMES: Record<HypeCountry, CountryTheme> = {
  egypt: {
    flag: "🇪🇬",
    colors: ["#CE1126", "#FFFFFF", "#000000", "#C09300"], // red, white, black, gold eagle
    bgWin: "bg-gradient-to-r from-[#C09300] via-[#CE1126] to-black",
    bgDefault: "bg-gradient-to-r from-[#CE1126] via-[#7a0a16] to-black",
    borderWin: "border-[#C09300]/60",
    borderDefault: "border-[#C09300]/40",
    copy: {
      win: (opp, score) => <>🏆 MASR! Egypt beat {opp} {score} — yalla ya Pharaohs! 🦅🇪🇬</>,
      draw: (opp, score) => <>Egypt held {opp} {score} — keep believing! 🦅</>,
      loss: (opp, score) => <>Egypt {score} vs {opp} — heads up, Pharaohs. 🦅</>,
      live: <>Egypt is playing — yalla ya Pharaohs! 🦅</>,
      upcoming: (opp) => <>Egypt vs {opp} — yalla ya Pharaohs! 🦅</>,
      fullTimeWin: "FULL TIME · A win for EGYPT 🎉",
    },
  },
  brazil: {
    flag: "🇧🇷",
    colors: ["#009C3B", "#FFDF00", "#002776", "#FFFFFF"], // green, yellow, blue, white
    bgWin: "bg-gradient-to-r from-[#FFDF00] via-[#009C3B] to-[#002776]",
    bgDefault: "bg-gradient-to-r from-[#009C3B] via-[#0a5a2a] to-[#002776]",
    borderWin: "border-[#FFDF00]/60",
    borderDefault: "border-[#FFDF00]/40",
    copy: {
      win: (opp, score) => <>🏆 BRASIL! Brazil beat {opp} {score} — vai Brasil! 💛💚</>,
      draw: (opp, score) => <>Brazil drew {opp} {score} — segura a Seleção! 💛</>,
      loss: (opp, score) => <>Brazil {score} vs {opp} — força, Seleção. 💛</>,
      live: <>Brazil is playing — vai Brasil! 💛💚</>,
      upcoming: (opp) => <>Brazil vs {opp} — vai Brasil! 💛💚</>,
      fullTimeWin: "FULL TIME · A win for BRASIL 🎉",
    },
  },
};

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "KICKOFF!";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/**
 * Match-day hype banner for a "home crowd" country (Egypt, Brazil, …). Shown
 * only when there's a match for that country within the day window (server-
 * gated). Pulsing flag, a live countdown to kickoff, and a flag-coloured
 * confetti burst on first open. Dismissible per session. Theme + copy come from
 * THEMES[match.country]. Pure motion + canvas-confetti — no assets, no new deps.
 */
export function TeamHype({ match }: { match: TeamHypeMatch }) {
  const theme = THEMES[match.country];
  const [left, setLeft] = useState<number | null>(null);
  const [show, setShow] = useState(true);
  const fired = useRef(false);

  // Result, once the match is finished and scored.
  const won =
    match.status === "finished" &&
    match.teamScore != null &&
    match.oppScore != null &&
    match.teamScore > match.oppScore;

  useEffect(() => {
    // Per-result dismiss key, scoped to the country so two banners are
    // independent and a fresh win re-shows even if an earlier state was
    // dismissed this session.
    const key = `team-hype-${match.country}-dismissed-${match.status}-${won ? "W" : ""}`;
    if (sessionStorage.getItem(key)) {
      setShow(false);
      return;
    }
    const kickoff = new Date(match.kickoffUtc).getTime();
    const tick = () => setLeft(kickoff - Date.now());
    tick();
    const id = setInterval(tick, 1000);

    // Celebratory flag burst on open — bigger and repeating for a WIN.
    if (!fired.current) {
      fired.current = true;
      haptic(won ? [30, 50, 30, 50, 60] : [20, 40, 20]);
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!reduced) {
        const burst = (origin: { x: number; y: number }, n = 70) =>
          confetti({ particleCount: n, spread: 80, startVelocity: 45, origin, colors: theme.colors });
        burst({ x: 0.2, y: 0.3 });
        setTimeout(() => burst({ x: 0.8, y: 0.3 }), 200);
        setTimeout(() => burst({ x: 0.5, y: 0.25 }), 400);
        if (won) {
          setTimeout(() => burst({ x: 0.5, y: 0.2 }, 140), 700);
          setTimeout(() => burst({ x: 0.3, y: 0.25 }, 120), 1100);
          setTimeout(() => burst({ x: 0.7, y: 0.25 }, 120), 1300);
        }
      }
    }
    return () => clearInterval(id);
  }, [match.kickoffUtc, match.status, match.country, won, theme.colors]);

  if (!show) return null;

  const opponent = match.isHome ? match.awayTeam : match.homeTeam;
  const finished = match.status === "finished";
  const live = !finished && left !== null && left <= 0;
  const score =
    match.teamScore != null && match.oppScore != null
      ? `${match.teamScore}–${match.oppScore}`
      : null;
  const drew = match.teamScore != null && match.teamScore === match.oppScore;
  const dismissKey = `team-hype-${match.country}-dismissed-${match.status}-${won ? "W" : ""}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden border-b ${
        won ? `${theme.borderWin} ${theme.bgWin}` : `${theme.borderDefault} ${theme.bgDefault}`
      }`}
    >
      {/* moving shimmer */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
        animate={{ x: ["-100%", "200%"] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
      />
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
        <motion.span
          className="text-2xl leading-none"
          animate={{ rotate: [0, -12, 12, -8, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.6 }}
          aria-hidden
        >
          {theme.flag}
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">
            {finished ? (
              won ? (
                theme.copy.win(opponent, score ?? "")
              ) : score && drew ? (
                theme.copy.draw(opponent, score)
              ) : (
                theme.copy.loss(opponent, score ?? "")
              )
            ) : live ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 animate-pulse rounded-full bg-white" />
                {theme.copy.live}
              </span>
            ) : (
              theme.copy.upcoming(opponent)
            )}
          </p>
          <p className="text-[11px] font-medium text-white/80">
            {finished ? (
              won ? (
                theme.copy.fullTimeWin
              ) : (
                "FULL TIME"
              )
            ) : (
              <>
                {live ? "LIVE NOW" : `Kickoff in ${left !== null ? fmtCountdown(left) : "…"}`}
                {" · "}
                <Link href="/matches" className="underline underline-offset-2">
                  Make your prediction
                </Link>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem(dismissKey, "1");
            setShow(false);
          }}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>
    </motion.div>
  );
}
