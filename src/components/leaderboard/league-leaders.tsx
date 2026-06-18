"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { Crown } from "lucide-react";
import { ZoomableAvatar } from "@/components/avatar/zoomable-avatar";
import type { LeagueLeaders } from "@/lib/leaderboard/queries";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const GOLD = ["#F2D27A", "#E2B64B", "#C8A24B", "#FFFFFF"];

/** Three middle-finger emoji at varied angles, for one corner of the spotlight. */
function CornerFingers({
  position,
}: {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}) {
  const posClass = {
    "top-left": "top-1 left-1",
    "top-right": "top-1 right-1",
    "bottom-left": "bottom-1 left-1",
    "bottom-right": "bottom-1 right-1",
  }[position];

  // Three emoji with slightly different rotations per corner
  const rotations: Record<typeof position, [number, number, number]> = {
    "top-left": [-20, 5, 25],
    "top-right": [20, -5, -25],
    "bottom-left": [-15, 10, 30],
    "bottom-right": [15, -10, -30],
  };

  const angles = rotations[position];

  return (
    <div
      className={`pointer-events-none absolute ${posClass} z-0 flex gap-0.5`}
      aria-hidden
    >
      {angles.map((deg, i) => (
        <span
          key={i}
          className="text-[10px] opacity-20"
          style={{ transform: `rotate(${deg}deg)`, display: "inline-block" }}
        >
          🖕
        </span>
      ))}
    </div>
  );
}

/**
 * Home-page spotlight for the current Main League leader(s) — crowned avatar(s).
 * Compact for mobile. Fires a small gold confetti burst from each side of the
 * box on mount (respects reduced-motion). Handles ties (rank 1 can be shared).
 */
export function LeagueLeaders({ data }: { data: LeagueLeaders }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const el = boxRef.current;
    if (!el) return;

    // Confetti origins anchored to the box's left & right edges.
    const r = el.getBoundingClientRect();
    const yMid = (r.top + r.height * 0.5) / window.innerHeight;
    const leftX = r.left / window.innerWidth;
    const rightX = r.right / window.innerWidth;

    const common = { particleCount: 22, spread: 50, startVelocity: 28, colors: GOLD, scalar: 0.7, ticks: 90 } as const;
    confetti({ ...common, angle: 60, origin: { x: leftX, y: yMid } });
    confetti({ ...common, angle: 120, origin: { x: rightX, y: yMid } });
  }, []);

  const multiple = data.leaders.length > 1;

  return (
    <section
      ref={boxRef}
      className="relative overflow-hidden rounded-2xl border border-gold/30 bg-card/70 px-4 py-3"
    >
      {/* Decorative middle-finger corner clusters */}
      <CornerFingers position="top-left" />
      <CornerFingers position="top-right" />
      <CornerFingers position="bottom-left" />
      <CornerFingers position="bottom-right" />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_90%_at_50%_0%,oklch(0.796_0.133_86.3/0.12),transparent)]" />
      <div className="relative flex flex-col items-center gap-2 text-center">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gold">
          {data.leagueName} {multiple ? "leaders" : "leader"}
          <span className="ml-1.5 font-numeric text-sm text-gold">
            {data.points}
            <span className="ml-0.5 font-sans text-[10px] text-muted-foreground">pts</span>
          </span>
        </span>

        <div className="flex flex-wrap items-start justify-center gap-x-5 gap-y-2">
          {data.leaders.map((l) => (
            <div key={l.userId} className="flex flex-col items-center gap-1">
              <div className="relative">
                <Crown
                  className="pointer-events-none absolute -top-2.5 left-1/2 z-10 size-3.5 -translate-x-1/2 fill-gold text-gold drop-shadow"
                  aria-hidden
                />
                {/* Tap the avatar to zoom; tap the name to open the profile. */}
                <ZoomableAvatar
                  src={l.avatarUrl}
                  alt={l.displayName}
                  fallback={initials(l.displayName)}
                  className="size-11 border-2 border-gold shadow-md shadow-gold/30"
                  fallbackClassName="bg-gold/15 text-sm font-semibold text-gold"
                />
              </div>
              <Link
                href={`/u/${l.username}`}
                className="max-w-20 truncate text-xs font-medium hover:underline"
              >
                {l.displayName}
              </Link>
              {l.quote && (
                <p className="max-w-[8rem] text-center text-[10px] italic leading-tight text-muted-foreground">
                  &ldquo;{l.quote}&rdquo;
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
