"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Users, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { fetchMatchPicks } from "@/lib/predictions/picks-action";
import type { FriendPick } from "@/lib/predictions/queries";
import { basePoints } from "@/lib/scoring";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ponytail: group H/D/A only once scores are visible (homePick < 0 = redacted
// pre-kickoff). Within each group, sort scorelines ascending (home, then away).
function groupPicks(picks: FriendPick[]): { label: string; items: FriendPick[] }[] {
  if (picks.some((p) => p.homePick < 0)) return [{ label: "", items: picks }];
  const byScoreline = (a: FriendPick, b: FriendPick) =>
    a.homePick - b.homePick || a.awayPick - b.awayPick;
  return (
    [
      { label: "Home", items: picks.filter((p) => p.homePick > p.awayPick) },
      { label: "Draw", items: picks.filter((p) => p.homePick === p.awayPick) },
      { label: "Away", items: picks.filter((p) => p.homePick < p.awayPick) },
    ] as const
  )
    .map((g) => ({ ...g, items: [...g.items].sort(byScoreline) }))
    .filter((g) => g.items.length > 0);
}

/**
 * Inline, tap-to-expand list of every league member's pick for a match.
 * Picks are fetched on demand (so the match list doesn't N+1 query).
 *
 * Points pill beside each pick:
 *   - finished/graded → the real awarded points (`pointsAwarded`)
 *   - live → PROVISIONAL points computed from the current live score (updates as
 *     the score changes via LiveRefresher); styled dimmer to flag it's not final.
 */
export function CardPicks({
  matchId,
  graded,
  live = false,
  liveHome = null,
  liveAway = null,
  isKnockout = false,
}: {
  matchId: string;
  graded: boolean;
  /** Match is live — show provisional points from the current score. */
  live?: boolean;
  liveHome?: number | null;
  liveAway?: number | null;
  isKnockout?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<FriendPick[] | null>(null);
  const [pending, startTransition] = useTransition();

  // Provisional points if the match ended right now at the current live score.
  const canLiveScore = live && liveHome != null && liveAway != null;
  function liveProvisional(p: FriendPick): number {
    return basePoints({
      homePick: p.homePick,
      awayPick: p.awayPick,
      homeActual: liveHome as number,
      awayActual: liveAway as number,
      isKnockout,
    });
  }

  function toggle(e: React.MouseEvent) {
    // Don't trigger a parent card link/animation.
    e.preventDefault();
    e.stopPropagation();
    const next = !open;
    setOpen(next);
    if (next && picks === null) {
      startTransition(async () => {
        setPicks(await fetchMatchPicks(matchId));
      });
    }
  }

  return (
    <div className="mt-2 border-t border-border/50 pt-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-3.5" /> League picks
        </span>
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-2">
              {pending && picks === null ? (
                <div className="flex justify-center py-3 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              ) : picks && picks.length > 0 ? (
                groupPicks(picks).map((group) => (
                <div key={group.label} className="flex flex-col gap-1">
                  {group.label && (
                    <div className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      {group.label}
                    </div>
                  )}
                  <ul className="flex flex-col gap-1.5">
                  {group.items.map((p) => (
                    <li key={p.userId} className="flex items-center gap-2">
                      <Avatar className="size-6 border border-border/60">
                        {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt={p.displayName} />}
                        <AvatarFallback className="bg-secondary text-[9px] font-semibold">
                          {initials(p.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 truncate text-xs">{p.displayName}</span>
                      {/* Double-down disabled for now (kept for future use):
                      {p.isDoubleDown && <Zap className="size-3 text-gold" aria-label="Double down" />} */}
                      <span className="font-numeric text-base tabular-nums">
                        {p.homePick < 0 ? (
                          <span className="text-muted-foreground/60" title="Hidden until kickoff">
                            ·–·
                          </span>
                        ) : (
                          `${p.homePick}–${p.awayPick}`
                        )}
                      </span>
                      {graded && p.pointsAwarded != null ? (
                        <span
                          className={cn(
                            "w-9 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums",
                            p.pointsAwarded > 0
                              ? "bg-success/15 text-success"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {p.pointsAwarded > 0 ? `+${p.pointsAwarded}` : "0"}
                        </span>
                      ) : canLiveScore ? (
                        (() => {
                          const pts = liveProvisional(p);
                          return (
                            <span
                              title="Points if the match ended now"
                              className={cn(
                                "w-9 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold italic tabular-nums",
                                pts > 0
                                  ? "bg-success/10 text-success/80"
                                  : "bg-muted/60 text-muted-foreground/70",
                              )}
                            >
                              {pts > 0 ? `+${pts}` : "0"}
                            </span>
                          );
                        })()
                      ) : null}
                    </li>
                  ))}
                  </ul>
                </div>
                ))
              ) : (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  No picks for this match.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
