"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import { X } from "lucide-react";
import { haptic } from "@/lib/celebrate";
import type { EgyptMatch } from "@/lib/matches/egypt";

// Egyptian flag colours for the confetti.
const FLAG = ["#CE1126", "#FFFFFF", "#000000", "#C09300"]; // red, white, black, gold eagle

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
 * Egypt match-day hype banner. Shown only when there's an Egypt match within
 * the day window (server-gated). Pulsing flags, a live countdown to kickoff,
 * and an Egyptian-flag confetti burst on first open. Dismissible per session.
 * Pure motion + canvas-confetti — no assets, no new deps.
 */
export function EgyptHype({ match }: { match: EgyptMatch }) {
  const [left, setLeft] = useState<number | null>(null);
  const [show, setShow] = useState(true);
  const fired = useRef(false);

  useEffect(() => {
    if (sessionStorage.getItem("egypt-hype-dismissed")) {
      setShow(false);
      return;
    }
    const kickoff = new Date(match.kickoffUtc).getTime();
    const tick = () => setLeft(kickoff - Date.now());
    tick();
    const id = setInterval(tick, 1000);

    // One celebratory flag burst on open.
    if (!fired.current) {
      fired.current = true;
      haptic([20, 40, 20]);
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!reduced) {
        const burst = (origin: { x: number; y: number }) =>
          confetti({ particleCount: 70, spread: 80, startVelocity: 45, origin, colors: FLAG });
        burst({ x: 0.2, y: 0.3 });
        setTimeout(() => burst({ x: 0.8, y: 0.3 }), 200);
        setTimeout(() => burst({ x: 0.5, y: 0.25 }), 400);
      }
    }
    return () => clearInterval(id);
  }, [match.kickoffUtc]);

  if (!show) return null;

  const opponent = match.isHome ? match.awayTeam : match.homeTeam;
  const live = left !== null && left <= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden border-b border-[#C09300]/40 bg-gradient-to-r from-[#CE1126] via-[#7a0a16] to-black"
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
          🇪🇬
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">
            {live ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 animate-pulse rounded-full bg-white" />
                Egypt is playing — yalla ya Pharaohs! 🦅
              </span>
            ) : (
              <>Egypt vs {opponent} — yalla ya Pharaohs! 🦅</>
            )}
          </p>
          <p className="text-[11px] font-medium text-white/80">
            {live ? "LIVE NOW" : `Kickoff in ${left !== null ? fmtCountdown(left) : "…"}`}
            {" · "}
            <Link href="/matches" className="underline underline-offset-2">
              Make your prediction
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem("egypt-hype-dismissed", "1");
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
