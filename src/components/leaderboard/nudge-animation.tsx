"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import { haptic } from "@/lib/celebrate";

/** Total time the whack theatre is on screen (ms). Shared with the parent so
 *  the row "sink" and the overlay stay in sync. */
export const NUDGE_DURATION_MS = 4000;

const D = NUDGE_DURATION_MS / 1000; // seconds

/**
 * Full-screen "you got whacked" overlay. A cartoon hammer swings in and slams
 * the screen (twice), a dark bomb burst + smoke puff fills it, the banner holds,
 * then it clears after NUDGE_DURATION_MS. Motion + canvas-confetti — no anime.js,
 * no assets. The leaderboard shake + row-sink are driven by the parent.
 */
export function NudgeAnimation({
  fromName,
  toName,
  onDone,
}: {
  fromName: string;
  /** Set when *you* are the whacker → banner reads "You whacked {toName}!". */
  toName?: string;
  onDone: () => void;
}) {
  const banner = toName
    ? `💥 You whacked ${toName}!`
    : `💥 ${fromName} whacked you!`;
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    haptic([20, 60, 120, 60, 120]); // thwack-thwack

    const smoke = ["#3a3a3a", "#555", "#222", "#777"];
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (!reduced) {
      // Two bursts: first at impact, second on the rebound bop.
      timers.push(
        setTimeout(() => {
          confetti({
            particleCount: 140,
            spread: 200,
            startVelocity: 50,
            gravity: 1.3,
            scalar: 1.3,
            origin: { y: 0.45 },
            colors: smoke,
          });
        }, 500),
        setTimeout(() => {
          confetti({
            particleCount: 80,
            spread: 160,
            startVelocity: 35,
            gravity: 1.5,
            scalar: 1.1,
            origin: { y: 0.5 },
            colors: smoke,
          });
        }, 1300),
      );
    }

    const done = setTimeout(onDone, NUDGE_DURATION_MS);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {/* Hammer swings in, slams, rebounds, slams again, then lifts away. */}
      <motion.div
        className="absolute right-1/4 top-0 origin-bottom-right text-[120px] leading-none drop-shadow-2xl"
        initial={{ rotate: -120, x: 200, y: -160, opacity: 0 }}
        animate={{
          rotate: [-120, 20, -40, 15, -40, 110],
          x: [200, 0, 0, 0, 0, 120],
          y: [-160, 0, -40, 0, -40, -200],
          opacity: [0, 1, 1, 1, 1, 0],
        }}
        transition={{ duration: D, times: [0, 0.13, 0.25, 0.34, 0.46, 1], ease: "easeInOut" }}
        aria-hidden
      >
        🔨
      </motion.div>

      {/* Smoke puff: billows and lingers most of the duration. */}
      <motion.div
        className="absolute inset-0 grid place-items-center"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 0.95, 0.95, 0], scale: [0.6, 1.1, 1.2, 1.3] }}
        transition={{ duration: D, delay: 0, times: [0, 0.18, 0.7, 1] }}
        aria-hidden
      >
        <span className="select-none text-[280px] leading-none">💨</span>
      </motion.div>

      {/* "… whacked you!" banner — pops, holds, fades. */}
      <motion.div
        className="absolute inset-x-0 top-1/3 flex justify-center px-4"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: [0.5, 1.25, 1, 1, 0.9], opacity: [0, 1, 1, 1, 0] }}
        transition={{ duration: D, delay: 0.4, times: [0, 0.12, 0.2, 0.8, 1] }}
        aria-hidden
      >
        <span className="rounded-2xl bg-background/80 px-5 py-3 text-center font-display text-2xl font-bold text-gold shadow-2xl backdrop-blur">
          {banner}
        </span>
      </motion.div>
    </div>
  );
}
