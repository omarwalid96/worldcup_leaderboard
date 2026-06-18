"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Radio, Trophy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { celebrateSave, haptic } from "@/lib/celebrate";
import { useGameRoom } from "@/components/games/use-game-room";
import { applyMove } from "@/lib/games/actions";
import type { GameComponentProps, PlayerInfo } from "@/lib/games/types";
import {
  actorSlot,
  type Dir,
  type PenaltyState,
} from "@/lib/games/penalty/reducer";

const DIRS: { dir: Dir; label: string; align: string }[] = [
  { dir: "L", label: "Left", align: "items-start" },
  { dir: "M", label: "Middle", align: "items-center" },
  { dir: "R", label: "Right", align: "items-end" },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function PlayerTag({
  player,
  score,
  active,
  you,
}: {
  player?: PlayerInfo | null;
  score: number;
  active: boolean;
  you: boolean;
}) {
  const name = player?.displayName ?? "Opponent";
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-colors",
        active && "bg-gold/10 ring-1 ring-gold/40",
      )}
    >
      <Avatar className="size-12 border border-border/60">
        {player?.avatarUrl && <AvatarImage src={player.avatarUrl} alt={name} />}
        <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="max-w-[6rem] truncate text-xs font-medium">
        {name}
        {you && <span className="ml-1 text-gold">(you)</span>}
      </span>
      <span className="font-numeric text-2xl leading-none">{score}</span>
    </div>
  );
}

export function PenaltyDuel({
  matchId,
  initialMatch,
  currentUserId,
}: GameComponentProps) {
  const { match, connected, present, broadcast, onBroadcast, setMatch } =
    useGameRoom(matchId, initialMatch, currentUserId);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The shot direction the keeper just saw the ball fly (for animation).
  const [lastShot, setLastShot] = useState<Dir | null>(null);

  const state = match.state as PenaltyState;
  const isP1 = match.player1Id === currentUserId;
  const mySlot = isP1 ? "p1" : "p2";
  const me = isP1 ? match.player1 : match.player2;
  const opp = isP1 ? match.player2 : match.player1;
  const scoreMine = isP1 ? state.scoreP1 : state.scoreP2;
  const scoreOpp = isP1 ? state.scoreP2 : state.scoreP1;

  const finished = match.status === "finished";
  const declined = match.status === "declined";
  const pending = match.status === "pending";

  // Whose move is it right now?
  const turnSlot = actorSlot(state);
  const myTurn = !finished && turnSlot === mySlot;
  const iAmShooter = state.phase === "shoot";
  const iShootRole = state.shooter === mySlot;

  // Animate the ball when the opponent shoots (broadcast for instant feel).
  useEffect(() => {
    return onBroadcast("shot", (payload) => {
      const dir = (payload as { dir?: Dir })?.dir;
      if (dir) setLastShot(dir);
    });
  }, [onBroadcast]);

  // Confetti when I win.
  useEffect(() => {
    if (finished && match.winnerId === currentUserId) {
      celebrateSave();
    }
  }, [finished, match.winnerId, currentUserId]);

  function send(move: { kind: "shoot"; dir: Dir } | { kind: "dive"; dir: Dir }) {
    if (isPending) return;
    haptic();
    if (move.kind === "shoot") {
      setLastShot(move.dir);
      broadcast("shot", { dir: move.dir });
    }
    setError(null);
    startTransition(async () => {
      const res = await applyMove(matchId, move);
      if (!res.ok) {
        setError(res.error ?? "Move failed.");
        return;
      }
      // Advance my own screen instantly from the authoritative result…
      if (res.match) setMatch(res.match);
      // …and tell the opponent to re-fetch the row immediately (broadcast isn't
      // RLS-gated, unlike postgres_changes on game_matches).
      broadcast("sync", { at: Date.now() });
    });
  }

  // ── Render states ──────────────────────────────────────────────────────────

  if (declined) {
    return (
      <Centered>
        <p className="text-sm text-muted-foreground">
          This challenge was declined.
        </p>
      </Centered>
    );
  }

  if (pending) {
    return (
      <Centered>
        <p className="text-sm text-muted-foreground">
          Waiting for the challenge to be accepted…
        </p>
      </Centered>
    );
  }

  if (finished) {
    const iWon = match.winnerId === currentUserId;
    return (
      <Centered>
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-3"
        >
          {iWon ? (
            <Trophy className="size-12 text-gold" />
          ) : (
            <span className="text-4xl">🧤</span>
          )}
          <h2 className="font-display text-2xl">
            {iWon ? "You won!" : "You lost"}
          </h2>
          <p className="font-numeric text-3xl">
            {scoreMine} <span className="text-muted-foreground">–</span> {scoreOpp}
          </p>
          <Button variant="outline" onClick={() => history.back()}>
            Back to games
          </Button>
        </motion.div>
      </Centered>
    );
  }

  // Async-friendly, live-preferred: NEVER block your own turn waiting for the
  // opponent. You can always act when it's your move; if it's their move and
  // they're not here, show a soft "waiting for their turn" hint (they got a
  // push and can play whenever). When both are present it stays instant via
  // broadcast. So we only fall through to a waiting screen when it's genuinely
  // the opponent's turn — handled inline by the prompt below, not a hard gate.

  const roleLabel = iShootRole ? "You shoot" : "You keep";
  const prompt = myTurn
    ? iAmShooter
      ? iShootRole
        ? "Pick your shot direction"
        : "Opponent is shooting…"
      : iShootRole
        ? "Opponent is diving…"
        : "Pick your dive"
    : iAmShooter
      ? "Opponent is picking a shot…"
      : "Opponent is diving…";

  return (
    <div className="flex flex-col gap-5">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Round {state.round} · {roleLabel}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[11px] font-medium",
            connected ? "text-success" : "text-muted-foreground/50",
          )}
        >
          <Radio className={cn("size-3", connected && "text-success")} />
          {connected ? "Live" : "Offline"}
        </span>
      </div>

      {/* Scoreboard */}
      <div className="flex items-center justify-center gap-4">
        <PlayerTag player={me} score={scoreMine} active={myTurn} you />
        <span className="font-display text-xl text-muted-foreground">vs</span>
        <PlayerTag player={opp} score={scoreOpp} active={!myTurn} you={false} />
      </div>

      {/* Goal + pitch */}
      <Card className="border-border/60 bg-card/70">
        <CardContent className="p-4">
          <Goal lastShot={lastShot} />
        </CardContent>
      </Card>

      {/* Prompt + action buttons */}
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm font-medium">{prompt}</p>
        {myTurn ? (
          <div className="grid w-full max-w-sm grid-cols-3 gap-2">
            {DIRS.map((d) => (
              <Button
                key={d.dir}
                size="lg"
                variant="outline"
                disabled={isPending}
                onClick={() =>
                  send(
                    iAmShooter
                      ? { kind: "shoot", dir: d.dir }
                      : { kind: "dive", dir: d.dir },
                  )
                }
                className="h-14 flex-col gap-1 text-base"
              >
                <span className="text-lg">{iAmShooter ? "⚽" : "🧤"}</span>
                {d.label}
              </Button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">
                {opp?.displayName ?? "Opponent"}&apos;s move…
              </span>
            </div>
            {opp?.id && !present.includes(opp.id) && (
              <span className="text-xs text-muted-foreground/60">
                They&apos;ve been notified — you can leave; it&apos;ll update when they play.
              </span>
            )}
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

/** The goal mouth with an animated ball flying to the last shot direction. */
function Goal({ lastShot }: { lastShot: Dir | null }) {
  const x = lastShot === "L" ? -90 : lastShot === "R" ? 90 : 0;
  return (
    <div className="relative mx-auto h-40 w-full max-w-sm">
      {/* Net */}
      <div className="absolute inset-x-4 top-2 h-28 rounded-t-md border-4 border-b-0 border-foreground/30 bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,var(--border)_8px,var(--border)_9px)]" />
      {/* Grass */}
      <div className="absolute inset-x-0 bottom-0 h-10 rounded-md bg-success/20" />
      {/* Ball */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${lastShot}`}
          initial={{ y: 60, x: 0, scale: 1, opacity: 0 }}
          animate={{ y: lastShot ? -10 : 60, x, scale: lastShot ? 0.7 : 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
          className="absolute bottom-2 left-1/2 -ml-3 text-2xl"
        >
          ⚽
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
      {children}
    </div>
  );
}
