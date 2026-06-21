"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Radio } from "lucide-react";
import { motion, useAnimationControls } from "motion/react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  fetchLeaderboardRows,
  sendNudge,
  getMyUnseenNudge,
  markNudgesSeen,
  type NudgePayload,
} from "@/lib/leaderboard/actions";
import { LeaderboardTable } from "./leaderboard-table";
import { NudgeAnimation } from "./nudge-animation";
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
  const [sinkUserId, setSinkUserId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sinkTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shake = useAnimationControls();
  const broadcastRef = useRef<((p: NudgePayload) => void) | null>(null);

  // Shake the table, show the whack overlay, and sink the target's row to the
  // bottom from impact (~0.4s in) until the overlay clears (~2s). Used for both
  // live + replayed nudges.
  const playNudge = useCallback(
    (payload: NudgePayload) => {
      setNudge(payload);
      void shake.start({
        x: [0, -12, 12, -8, 8, -4, 4, 0],
        transition: { duration: 0.6, delay: 0.35 },
      });
      sinkTimers.current.forEach(clearTimeout);
      sinkTimers.current = [
        setTimeout(() => setSinkUserId(payload.toUserId), 400),
        setTimeout(() => setSinkUserId(null), 2000),
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
        if (payload && payload.toUserId === currentUserId) playNudge(payload);
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
      try {
        const payload = await sendNudge(leagueId, toUserId);
        broadcastRef.current?.(payload);
        const targetName =
          rows.find((r) => r.userId === toUserId)?.displayName ?? "them";
        toast.success(`👊 Whacked ${targetName}!`);
        // The sender sees the animation too, themed as their own hit.
        playNudge({ ...payload, fromName: "You" });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't nudge.");
      }
    },
    [leagueId, rows, playNudge],
  );

  return (
    <div className="flex flex-col gap-3">
      {nudge && (
        <NudgeAnimation
          fromName={nudge.fromName}
          onDone={() => {
            setNudge(null);
            void markNudgesSeen(leagueId);
          }}
        />
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
