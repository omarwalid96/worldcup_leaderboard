"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";

const TRACK_WIDTH = 920; // matches the bracket track's min-width
const MIN = 0.4;
const MAX = 1.5;
const STEP = 0.15;

/**
 * Pan + zoom shell for the knockout bracket. The bracket (children) is a fixed
 * 920px-wide track; we scale it with a CSS transform and let the wrapper scroll
 * for panning. "Fit" sets the scale so the whole track fits the container width.
 */
export function BracketZoom({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [natHeight, setNatHeight] = useState(0);
  // Pinch state: distance between the two fingers + the scale when it started.
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  // Mirror of `scale` so the once-mounted touch listener reads the live value.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const fitScale = () => {
    const w = wrapRef.current?.clientWidth ?? TRACK_WIDTH;
    return Math.min(1, Math.max(MIN, w / TRACK_WIDTH));
  };

  // Measure the track's natural height once and fit to the viewport on mount.
  useLayoutEffect(() => {
    setNatHeight(trackRef.current?.offsetHeight ?? 0);
    setScale(fitScale());
    // ponytail: measure + fit once on mount; no resize listener — tap Fit again after rotate.
  }, []);

  const clamp = (s: number) => Math.min(MAX, Math.max(MIN, Math.round(s * 100) / 100));

  // Two-finger pinch → drive the same scale as the buttons. One finger falls
  // through to native scroll (panning). The move listener must be non-passive
  // so preventDefault() can stop the wrapper scrolling mid-pinch, so it's wired
  // imperatively (React's onTouchMove is passive).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const start = (e: TouchEvent) => {
      if (e.touches.length === 2)
        pinch.current = { dist: dist(e.touches), scale: scaleRef.current };
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinch.current) {
        e.preventDefault();
        setScale(clamp((pinch.current.scale * dist(e.touches)) / pinch.current.dist));
      }
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.current = null;
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 self-end">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setScale((s) => clamp(s - STEP))}
          className="grid size-8 place-items-center rounded-md border border-border/60 bg-card/60 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setScale((s) => clamp(s + STEP))}
          className="grid size-8 place-items-center rounded-md border border-border/60 bg-card/60 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setScale(fitScale())}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 bg-card/60 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Maximize2 className="size-3.5" /> Fit
        </button>
      </div>

      <div ref={wrapRef} className="overflow-auto pb-2" style={{ touchAction: "pan-x pan-y" }}>
        {/* Outer box takes the SCALED footprint so the wrapper scrolls correctly;
            the inner track is scaled from its top-left corner. */}
        <div
          style={{
            width: TRACK_WIDTH * scale,
            height: natHeight ? natHeight * scale : undefined,
          }}
        >
          <div
            ref={trackRef}
            style={{ width: TRACK_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
