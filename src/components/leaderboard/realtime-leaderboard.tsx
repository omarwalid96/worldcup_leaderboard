"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Radio, X } from "lucide-react";
import { motion, useAnimationControls } from "motion/react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  fetchLeaderboardRows,
  sendNudge,
  getMyUnseenNudge,
  getMyRecentNudgers,
  markNudgesSeen,
  type NudgePayload,
} from "@/lib/leaderboard/actions";
import { LeaderboardTable } from "./leaderboard-table";
import { NudgeAnimation, NUDGE_DURATION_MS } from "./nudge-animation";
import type { LeaderboardRow } from "@/lib/leaderboard/queries";
import { cn } from "@/lib/utils";
import { celebrateClimb } from "@/lib/celebrate";

/**
 * Holds the leaderboard rows in client state and subscribes to Supabase
 * Realtime changes on the `standings` table for this league. On any change the
 * rows are re-fetched (already re-ranked server-side) and the table animates to
 * the new order via Motion layout animations.
 *
 * Also carries "nudges": a member whacks another with a cartoon hammer. The
 * target sees the animation live (broadcast) if they're here, AND replays it on
 * next open (persisted, server-fetched). See src/lib/leaderboard/actions.ts.
 */
export function RealtimeLeaderboard({
  leagueId,
  initialRows,
  currentUserId,
}: {
  leagueId: string;
  initialRows: LeaderboardRow[];
  currentUserId: string;
}) {
  const [rows, setRows] = useState<LeaderboardRow[]>(initialRows);
  const [, startTransition] = useTransition();
  const [connected, setConnected] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const [nudge, setNudge] = useState<NudgePayload | null>(null);
  const [nudgers, setNudgers] = useState<string[]>([]);
  const [sinkUserId, setSinkUserId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sinkTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shake = useAnimationControls();
  const broadcastRef = useRef<((p: NudgePayload) => void) | null>(null);

  // Shake the table, show the whack overlay, and sink the target's row to the
  // bottom from impact (~0.5s in) until the overlay clears. Used for both live
  // + replayed nudges.
  const playNudge = useCallback(
    (payload: NudgePayload) => {
      setNudge(payload);
      void shake.start({
        x: [0, -14, 14, -10, 10, -6, 6, 0],
        transition: { duration: 0.7, delay: 0.45, repeat: 1 },
      });
      sinkTimers.current.forEach(clearTimeout);
      sinkTimers.current = [
        setTimeout(() => setSinkUserId(payload.toUserId), 500),
        setTimeout(() => setSinkUserId(null), NUDGE_DURATION_MS - 300),
      ];
    },
    [shake],
  );

  useEffect(() => {
    let supabase;
    try {
      supabase = createClient();
    } catch {
      return; // Supabase not configured — keep static rows.
    }

    const channel = supabase
      .channel(`standings:${leagueId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "standings",
          filter: `league_id=eq.${leagueId}`,
        },
        () => {
          startTransition(async () => {
            const fresh = await fetchLeaderboardRows(leagueId);
            // Celebrate if the current user climbed the table.
            setRows((prev) => {
              const before = prev.find((r) => r.userId === currentUserId)?.rank;
              const after = fresh.find((r) => r.userId === currentUserId)?.rank;
              if (before != null && after != null && after < before) {
                celebrateClimb();
              }
              return fresh;
            });
            setJustUpdated(true);
            if (flashTimer.current) clearTimeout(flashTimer.current);
            flashTimer.current = setTimeout(() => setJustUpdated(false), 1500);
          });
        },
      )
      // A nudge aimed at me → play it live (not RLS-gated, always arrives).
      .on("broadcast", { event: "nudge" }, (msg) => {
        const payload = (msg as { payload?: NudgePayload }).payload;
        if (payload && payload.toUserId === currentUserId) {
          playNudge(payload);
          setNudgers((prev) => [payload.fromName, ...prev]);
        }
      })
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    broadcastRef.current = (payload) =>
      channel.send({ type: "broadcast", event: "nudge", payload });

    // Replay any nudge that landed while I was away.
    void getMyUnseenNudge(leagueId).then((unseen) => {
      if (unseen) playNudge(unseen);
    });
    // Persistent "who whacked you" banner — survives the one-shot replay.
    void getMyRecentNudgers(leagueId).then(setNudgers);

    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      sinkTimers.current.forEach(clearTimeout);
      broadcastRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [leagueId, currentUserId, playNudge]);

  // Send a nudge: server gates it (rate limit), then we broadcast + self-replay.
  const handleNudge = useCallback(
    async (toUserId: string) => {
      const res = await sendNudge(leagueId, toUserId);
      if (!res.ok) {
        toast.error(res.reason);
        return;
      }
      broadcastRef.current?.(res.payload);
      const targetName =
        rows.find((r) => r.userId === toUserId)?.displayName ?? "them";
      toast.success(`👊 Whacked ${targetName}!`);
      // The sender sees the animation too, themed as their own hit.
      playNudge({ ...res.payload, fromName: "You" });
    },
    [leagueId, rows, playNudge],
  );

  return (
    <div className="flex flex-col gap-3">
      {nudge && (
        <NudgeAnimation
          fromName={nudge.fromName}
          // When *I* threw the whack, name the target instead of saying "you".
          toName={
            nudge.fromUserId === currentUserId
              ? (rows.find((r) => r.userId === nudge.toUserId)?.displayName ??
                "them")
              : undefined
          }
          onDone={() => {
            setNudge(null);
            void markNudgesSeen(leagueId);
          }}
        />
      )}
      {nudgers.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm">
          <span className="text-base leading-none">🔨</span>
          <p className="min-w-0 flex-1 text-foreground">
            {/* Show who whacked you; dedupe + count repeats. */}
            <span className="font-semibold text-gold">
              {[...new Set(nudgers)].join(", ")}
            </span>{" "}
            whacked you{nudgers.length > 1 ? ` (${nudgers.length}×)` : ""}!
          </p>
          <button
            type="button"
            onClick={() => setNudgers([])}
            aria-label="Dismiss"
            className="shrink-0 text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      <div className="flex items-center justify-end">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors",
            justUpdated
              ? "text-success"
              : connected
                ? "text-muted-foreground"
                : "text-muted-foreground/50",
          )}
        >
          <Radio className={cn("size-3", connected && "text-success")} />
          {justUpdated ? "Updated" : connected ? "Live" : "Offline"}
        </span>
      </div>
      <motion.div animate={shake}>
        <LeaderboardTable
          rows={rows}
          currentUserId={currentUserId}
          onNudge={handleNudge}
          sinkUserId={sinkUserId}
        />
      </motion.div>
    </div>
  );
}
