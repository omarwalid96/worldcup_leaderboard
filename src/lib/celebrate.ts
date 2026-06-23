"use client";

import confetti from "canvas-confetti";
import { Capacitor } from "@capacitor/core";

/** Whether the user prefers reduced motion. */
function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Light haptic tap (mobile).
 * On native: uses @capacitor/haptics (richer, no "blocked until tap" warning).
 * On web: falls back to navigator.vibrate.
 * Both paths no-op where unsupported.
 */
export function haptic(pattern: number | number[] = 15) {
  if (Capacitor.isNativePlatform()) {
    // ponytail: fire-and-forget; import is cheap (cached after first call).
    void import("@capacitor/haptics").then(({ Haptics, ImpactStyle }) => {
      void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    });
    return;
  }
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

/** Short celebratory chime via WebAudio (no asset needed). */
export function playChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5 arpeggio
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* ignore */
  }
}

const GOLD = ["#F2D27A", "#E2B64B", "#C8A24B", "#FFFFFF"];

/** Big gold confetti burst — for an exact-score hit. */
export function celebrateExact() {
  haptic([10, 40, 10]);
  if (reducedMotion()) return;
  playChime();
  const end = Date.now() + 700;
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0 }, colors: GOLD });
    confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1 }, colors: GOLD });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 }, colors: GOLD });
}

/**
 * Saved/updated pick: three quick pulses (synced to the three floating logos
 * that pop on save) + a small gold confetti burst.
 */
export function celebrateSave() {
  haptic([35, 90, 35, 90, 35]); // buzz, gap, buzz, gap, buzz → 3 pulses ~125ms apart
  if (reducedMotion()) return;
  confetti({ particleCount: 40, spread: 55, origin: { y: 0.7 }, colors: GOLD, scalar: 0.8 });
}

/** Upward gold streamers — for climbing the leaderboard. */
export function celebrateClimb() {
  haptic([10, 30, 10, 30]);
  if (reducedMotion()) return;
  playChime();
  confetti({
    particleCount: 70,
    angle: 90,
    spread: 45,
    startVelocity: 55,
    origin: { y: 0.9 },
    colors: GOLD,
  });
}
