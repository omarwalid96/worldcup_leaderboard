"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { refetchMatch } from "@/lib/games/actions";
import type { GameMatch } from "@/lib/games/types";

export interface UseGameRoom {
  /** Live match row (source of truth), re-fetched on any postgres_changes. */
  match: GameMatch;
  /** Whether the realtime channel is subscribed. */
  connected: boolean;
  /** UserIds currently present in the room (from presence). */
  present: string[];
  /** True once BOTH players are present together. */
  bothPresent: boolean;
  /** Broadcast an ephemeral event for instant feedback (not persisted). */
  broadcast: (event: string, payload: unknown) => void;
  /** Subscribe to a broadcast event. Returns an unsubscribe fn. */
  onBroadcast: (event: string, cb: (payload: unknown) => void) => () => void;
}

/**
 * The shared realtime room every game UI uses. Subscribes to
 * `channel('game:'+matchId)` with:
 *  - postgres_changes on game_matches (id=eq.matchId) → re-fetch the row
 *    (server-authoritative state survives refresh — see realtime-leaderboard).
 *  - presence → who's in the room right now (for "waiting for opponent…").
 *  - broadcast → ephemeral move/tap echoes for instant feel.
 *
 * Modeled on src/components/leaderboard/realtime-leaderboard.tsx.
 */
export function useGameRoom(
  matchId: string,
  initialMatch: GameMatch,
  currentUserId: string,
): UseGameRoom {
  const [match, setMatch] = useState<GameMatch>(initialMatch);
  const [connected, setConnected] = useState(false);
  const [present, setPresent] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Registered broadcast listeners, keyed by event name.
  const listenersRef = useRef<Map<string, Set<(p: unknown) => void>>>(new Map());

  useEffect(() => {
    let supabase;
    try {
      supabase = createClient();
    } catch {
      return; // Supabase not configured — keep the static initial match.
    }

    const channel = supabase.channel(`game:${matchId}`, {
      config: { presence: { key: currentUserId } },
    });
    channelRef.current = channel;

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_matches",
          filter: `id=eq.${matchId}`,
        },
        () => {
          void (async () => {
            const fresh = await refetchMatch(matchId);
            if (fresh) setMatch(fresh);
          })();
        },
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setPresent(Object.keys(state));
      })
      .on("broadcast", { event: "*" }, (msg) => {
        const event = (msg as { event?: string }).event;
        const payload = (msg as { payload?: unknown }).payload;
        if (!event) return;
        const set = listenersRef.current.get(event);
        set?.forEach((cb) => cb(payload));
      })
      .subscribe((status) => {
        const ok = status === "SUBSCRIBED";
        setConnected(ok);
        if (ok) {
          void channel.track({ userId: currentUserId, at: Date.now() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [matchId, currentUserId]);

  const broadcast = useCallback((event: string, payload: unknown) => {
    channelRef.current?.send({ type: "broadcast", event, payload });
  }, []);

  const onBroadcast = useCallback(
    (event: string, cb: (payload: unknown) => void) => {
      const map = listenersRef.current;
      if (!map.has(event)) map.set(event, new Set());
      map.get(event)!.add(cb);
      return () => {
        map.get(event)?.delete(cb);
      };
    },
    [],
  );

  const bothPresent =
    match.player2Id != null &&
    present.includes(match.player1Id) &&
    present.includes(match.player2Id);

  return { match, connected, present, bothPresent, broadcast, onBroadcast };
}
