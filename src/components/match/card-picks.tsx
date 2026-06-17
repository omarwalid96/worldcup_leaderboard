"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Users, Zap, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { fetchMatchPicks } from "@/lib/predictions/picks-action";
import type { FriendPick } from "@/lib/predictions/queries";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Inline, tap-to-expand list of every league member's pick for a match.
 * Picks are fetched on demand (so the match list doesn't N+1 query). Shows
 * earned points when the match is graded.
 */
export function CardPicks({ matchId, graded }: { matchId: string; graded: boolean }) {
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<FriendPick[] | null>(null);
  const [pending, startTransition] = useTransition();

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
                <ul className="flex flex-col gap-1.5">
                  {picks.map((p) => (
                    <li key={p.userId} className="flex items-center gap-2">
                      <Avatar className="size-6 border border-border/60">
                        {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt={p.displayName} />}
                        <AvatarFallback className="bg-secondary text-[9px] font-semibold">
                          {initials(p.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 truncate text-xs">{p.displayName}</span>
                      {p.isDoubleDown && <Zap className="size-3 text-gold" aria-label="Double down" />}
                      <span className="font-numeric text-base tabular-nums">
                        {p.homePick}–{p.awayPick}
                      </span>
                      {graded && p.pointsAwarded != null && (
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
                      )}
                    </li>
                  ))}
                </ul>
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
