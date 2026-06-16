"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchLeaderboardRows } from "@/lib/leaderboard/actions";
import { LeaderboardTable } from "./leaderboard-table";
import type { LeaderboardRow } from "@/lib/leaderboard/queries";
import { cn } from "@/lib/utils";
import { celebrateClimb } from "@/lib/celebrate";

/**
 * Holds the leaderboard rows in client state and subscribes to Supabase
 * Realtime changes on the `standings` table for this league. On any change the
 * rows are re-fetched (already re-ranked server-side) and the table animates to
 * the new order via Motion layout animations.
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
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      supabase.removeChannel(channel);
    };
  }, [leagueId, currentUserId]);

  return (
    <div className="flex flex-col gap-3">
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
      <LeaderboardTable rows={rows} currentUserId={currentUserId} />
    </div>
  );
}
