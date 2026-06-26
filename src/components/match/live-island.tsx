"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

/**
 * Google-Sports-style live island: a compact pill pinned under the header that
 * shows any in-play match (score + ticking minute) and links to the matches
 * list. Polls the existing /api/live (ESPN, server-cached, fails soft) every
 * 20s while the tab is visible. Renders nothing when nothing's live or the user
 * dismissed it this session. Display only — never grades.
 * ponytail: text-only (no flags) — /api/live has names, not ISO codes.
 */
interface Live {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  clock: string;
  completed: boolean;
  matchId: string | null;
}

export function LiveIsland({
  nextKickoffMs,
}: {
  /** Kickoff (epoch ms) of the next non-finished match, or null. */
  nextKickoffMs: number | null;
}) {
  const pathname = usePathname();
  const [matches, setMatches] = useState<Live[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    // Fast (20s) whenever a match is in play OR kickoff is imminent — so the
    // island appears the instant a match starts and gives snappy live feedback.
    // Slow (5min) only when the next match is still far off, so we're not
    // pinging ESPN round-the-clock off-matchday. A live result or an approaching
    // kickoff pulls the cadence back to 20s on the next tick.
    const LIVE_MS = 20_000;
    const IDLE_MS = 300_000;
    // Go fast from 5 min before kickoff; once past it, the live check takes over.
    const kickoffNear = () =>
      nextKickoffMs != null && Date.now() >= nextKickoffMs - 300_000;
    const poll = async () => {
      if (document.visibilityState !== "visible") {
        timer = setTimeout(poll, LIVE_MS); // re-check soon once tab is back
        return;
      }
      let live = false;
      try {
        const res = await fetch(`/api/live?t=${Math.floor(Date.now() / 15_000)}`, {
          cache: "no-store",
        });
        const data: { matches?: Live[] } = await res.json();
        // Only truly in-play matches (drop ESPN's just-completed entries).
        const inPlay = (data.matches ?? []).filter((m) => !m.completed);
        live = inPlay.length > 0;
        if (alive) setMatches(inPlay);
      } catch {
        /* fail soft */
      }
      if (alive)
        timer = setTimeout(poll, live || kickoffNear() ? LIVE_MS : IDLE_MS);
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [nextKickoffMs]);

  // Don't double up with the per-match overlay on a match detail page.
  const onMatchPage = pathname?.startsWith("/matches/");
  const show = !dismissed && !onMatchPage && matches.length > 0;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          className="sticky top-14 z-30 mx-auto flex max-w-5xl flex-col gap-1.5 px-4 pt-2"
        >
          {matches.map((m) => (
            <Link
              key={`${m.home}-${m.away}`}
              href={m.matchId ? `/matches/${m.matchId}` : "/matches"}
              className="group flex items-center gap-3 rounded-full border border-live/40 bg-background/90 px-3 py-1.5 shadow-sm backdrop-blur-lg transition-colors hover:border-live"
            >
              <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-live">
                <span className="size-1.5 animate-pulse rounded-full bg-live" />
                {m.clock || "Live"}
              </span>
              <span className="flex min-w-0 flex-1 items-center justify-center gap-2 text-sm">
                <span className="truncate font-medium">{m.home}</span>
                <span className="font-numeric tabular-nums font-bold">
                  {m.homeScore}–{m.awayScore}
                </span>
                <span className="truncate font-medium">{m.away}</span>
              </span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={(e) => {
                  e.preventDefault();
                  setDismissed(true);
                }}
                className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </Link>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
