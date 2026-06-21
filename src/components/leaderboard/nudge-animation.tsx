"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import confetti from "canvas-confetti";
import { haptic } from "@/lib/celebrate";

/**
 * Full-screen "you got whacked" overlay. A cartoon hammer swings in and slams
 * the screen, a bomb burst + dark smoke puff fills it for ~2s, then it clears.
 * Motion (already used everywhere) + canvas-confetti — no anime.js, no assets.
 *
 * The actual leaderboard shake is driven by the parent toggling a CSS class;
 * this component owns the overlay theatre and calls onDone after ~2s.
 */
export function NudgeAnimation({
  fromName,
  onDone,
}: {
  fromName: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    haptic([20, 60, 120]); // thwack

    // Dark "explosion" burst at impact (~when the hammer lands, 400ms in).
    const burst = reduced
      ? null
      : setTimeout(() => {
          confetti({
            particleCount: 120,
            spread: 180,
            startVelocity: 45,
            gravity: 1.4,
            scalar: 1.2,
            origin: { y: 0.45 },
            colors: ["#3a3a3a", "#555", "#222", "#777"],
          });
        }, 380);

    const done = setTimeout(onDone, 2000);
    return () => {
      if (burst) clearTimeout(burst);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {/* Hammer swings in from top-right and slams down to center. */}
      <motion.div
        className="absolute right-1/4 top-0 origin-bottom-right text-[120px] leading-none drop-shadow-2xl"
        initial={{ rotate: -120, x: 200, y: -120, opacity: 0 }}
        animate={{
          rotate: [-120, 25, 0, 25],
          x: [200, 0, 0, 0],
          y: [-120, 0, 0, 0],
          opacity: [0, 1, 1, 1],
        }}
        transition={{ duration: 0.6, times: [0, 0.55, 0.7, 1], ease: "easeIn" }}
        aria-hidden
      >
        🔨
      </motion.div>

      {/* Smoke puff: grows and fades over the 2s. */}
      <AnimatePresence>
        <motion.div
          className="absolute inset-0 grid place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.9, 0.9, 0] }}
          transition={{ duration: 1.6, delay: 0.4, times: [0, 0.15, 0.7, 1] }}
          aria-hidden
        >
          <span className="select-none text-[260px] leading-none">💨</span>
        </motion.div>
      </AnimatePresence>

      {/* "Nudged by …" banner. */}
      <motion.div
        className="absolute inset-x-0 top-1/3 flex justify-center"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: [0.5, 1.2, 1, 1], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.8, delay: 0.45, times: [0, 0.2, 0.4, 1] }}
        aria-hidden
      >
        <span className="rounded-2xl bg-background/80 px-5 py-3 font-display text-2xl font-bold text-gold shadow-2xl backdrop-blur">
          💥 {fromName} whacked you!
        </span>
      </motion.div>
    </div>
  );
}
