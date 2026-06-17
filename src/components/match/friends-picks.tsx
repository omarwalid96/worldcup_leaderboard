import Link from "next/link";
import { Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
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

/** Everyone's picks for a match (always visible in this league). */
export function FriendsPicks({
  picks,
  currentUserId,
  graded,
  live = false,
  liveHome = null,
  liveAway = null,
  isKnockout = false,
}: {
  picks: FriendPick[];
  currentUserId: string;
  graded: boolean;
  /** Match is live — show provisional points from the current score. */
  live?: boolean;
  liveHome?: number | null;
  liveAway?: number | null;
  isKnockout?: boolean;
}) {
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

  if (picks.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/40 p-4 text-center text-sm text-muted-foreground">
        No picks yet. Be the first.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Users className="size-4" /> League picks
      </div>
      <ul className="flex flex-col divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card/50">
        {picks.map((p) => {
          const isMe = p.userId === currentUserId;
          return (
            <li
              key={p.userId}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                isMe && "bg-gold/5",
              )}
            >
              <Link href={`/u/${p.username}`} tabIndex={-1} aria-hidden>
                <Avatar className="size-7 border border-border/60">
                  {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt={p.displayName} />}
                  <AvatarFallback className="bg-secondary text-[10px] font-semibold">
                    {initials(p.displayName)}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <Link
                href={`/u/${p.username}`}
                className="flex-1 truncate text-sm hover:underline"
              >
                {p.displayName}
                {isMe && (
                  <span className="ml-1.5 rounded bg-gold/20 px-1 py-0.5 text-[10px] font-bold uppercase text-gold">
                    You
                  </span>
                )}
              </Link>
              {/* Double-down disabled for now (kept for future use):
              {p.isDoubleDown && <Zap className="size-3.5 text-gold" aria-label="Double down" />} */}
              <span className="font-numeric text-xl tabular-nums">
                {p.homePick}–{p.awayPick}
              </span>
              {graded && p.pointsAwarded != null ? (
                <span
                  className={cn(
                    "w-12 rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums",
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
                        "w-12 rounded-full px-2 py-0.5 text-center text-xs font-bold italic tabular-nums",
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
          );
        })}
      </ul>
    </div>
  );
}
