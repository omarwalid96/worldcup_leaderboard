"use client";

import Link from "next/link";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { useState } from "react";
import { Crown, Medal, ArrowUp, ArrowDown, Minus, Flame, Target, Hand } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { CountUp } from "./count-up";
import type { LeaderboardRow } from "@/lib/leaderboard/queries";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="grid size-8 place-items-center rounded-full bg-gold-gradient text-background shadow-lg shadow-gold/30">
        <Crown className="size-4" strokeWidth={2.5} />
      </span>
    );
  if (rank === 2)
    return (
      <span className="grid size-8 place-items-center rounded-full bg-silver/90 text-background">
        <Medal className="size-4" strokeWidth={2.5} />
      </span>
    );
  if (rank === 3)
    return (
      <span className="grid size-8 place-items-center rounded-full bg-bronze text-background">
        <Medal className="size-4" strokeWidth={2.5} />
      </span>
    );
  return (
    <span className="grid size-8 place-items-center font-numeric text-xl font-semibold tabular-nums text-muted-foreground">
      {rank}
    </span>
  );
}

function Trend({ rank, previousRank }: { rank: number; previousRank: number }) {
  // Lower rank number = better. previous > current means climbed.
  const delta = previousRank > 0 ? previousRank - rank : 0;
  if (delta === 0)
    return <Minus className="size-3.5 text-muted-foreground/50" aria-label="No change" />;
  const climbed = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-bold tabular-nums",
        climbed ? "text-success" : "text-destructive",
      )}
      aria-label={climbed ? `Up ${delta} places` : `Down ${Math.abs(delta)} places`}
    >
      {climbed ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
      {Math.abs(delta)}
    </span>
  );
}

/** Small 👊 button to whack another user. Disables itself while the send is in flight. */
function NudgeButton({ onNudge }: { onNudge: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-label="Nudge"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onNudge();
        } finally {
          setBusy(false);
        }
      }}
      className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
      title="Nudge — whack them down the table (once/hour)"
    >
      <Hand className="size-4" />
    </button>
  );
}

export function LeaderboardTable({
  rows,
  currentUserId,
  onNudge,
  sinkUserId,
}: {
  rows: LeaderboardRow[];
  currentUserId: string;
  onNudge?: (toUserId: string) => Promise<void>;
  /** When set, that user's row is visually pushed to the bottom (nudge effect). */
  sinkUserId?: string | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 py-16 text-center text-sm text-muted-foreground">
        No standings yet. The table fills in as matches are graded.
      </div>
    );
  }

  // Derive the displayed rank from points using DENSE ranking (no gaps after
  // ties): 7,7,6,5,4,4,4,0,0 → 1,1,2,3,4,4,4,5,5. Rows are ordered by points,
  // so rank increments once per distinct points value. The stored `rank` can be
  // 0/stale for a newly-added member, so we never trust it for display.
  let dense = 0;
  const ranked = rows.map((row, i) => {
    if (i === 0 || row.totalPoints !== rows[i - 1].totalPoints) dense += 1;
    return { row, rank: dense };
  });

  // Render order: real order, but a sunk user is pushed to the bottom. Their
  // real rank still shows (knocked down, not zeroed). Motion's layoutId keys on
  // userId, so reordering animates the slide down (and back when cleared).
  const ordered = sinkUserId
    ? [
        ...ranked.filter((r) => r.row.userId !== sinkUserId),
        ...ranked.filter((r) => r.row.userId === sinkUserId),
      ]
    : ranked;

  return (
    <LayoutGroup>
      <motion.ol className="flex flex-col gap-2" layout>
        <AnimatePresence initial={false}>
          {ordered.map(({ row, rank }) => {
            const isMe = row.userId === currentUserId;
            const isPodium = rank <= 3;
            return (
              <motion.li
                key={row.userId}
                layout
                layoutId={row.userId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                className={cn(
                  // No backdrop-blur: rows sit on the opaque pitch bg, so the
                  // blur cost (re-rasterized every frame during the re-rank
                  // layout animation) bought no visible effect. Opaque bg keeps
                  // the look. ponytail: blur is for glass-over-content, not lists.
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                  isMe
                    ? "border-gold/50 bg-gold/10 ring-1 ring-gold/30"
                    : isPodium
                      ? "border-border/60 bg-card"
                      : "border-border/50 bg-card",
                )}
              >
                <RankBadge rank={rank} />

                <Link
                  href={`/u/${row.username}`}
                  className="flex min-w-0 shrink-0 items-center gap-3"
                  tabIndex={-1}
                  aria-hidden
                >
                  <Avatar className="size-9 border border-border/60">
                    {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt={row.displayName} />}
                    <AvatarFallback
                      className={cn(
                        "text-xs font-semibold",
                        rank === 1 ? "bg-gold/20 text-gold" : "bg-secondary text-foreground",
                      )}
                    >
                      {initials(row.displayName)}
                    </AvatarFallback>
                  </Avatar>
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    href={`/u/${row.username}`}
                    className="flex items-center gap-1.5 truncate text-sm font-semibold hover:underline"
                  >
                    {row.displayName}
                    {isMe && (
                      <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">
                        You
                      </span>
                    )}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {row.exactHits > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <Target className="size-3" /> {row.exactHits}
                      </span>
                    )}
                    {row.streak > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-destructive/80">
                        <Flame className="size-3" /> {row.streak}
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {onNudge && !isMe && (
                    <NudgeButton onNudge={() => onNudge(row.userId)} />
                  )}
                  <Trend rank={rank} previousRank={row.previousRank} />
                  <div className="text-right">
                    <CountUp
                      value={row.totalPoints}
                      className={cn(
                        "font-numeric text-2xl font-semibold leading-none tabular-nums",
                        rank === 1 ? "text-gold" : "text-foreground",
                      )}
                    />
                    <span className="ml-0.5 text-[11px] text-muted-foreground">pts</span>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </motion.ol>
    </LayoutGroup>
  );
}
