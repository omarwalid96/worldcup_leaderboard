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
import { applyMove, respondToChallenge } from "@/lib/games/actions";
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

/** A 5v5-style row of kick markers: ✓ green = scored, ✗ red = missed/saved. */
function ShootoutRow({ label, results }: { label: string; results: boolean[] }) {
  // Show at least 5 slots (standard shootout), more if it went to sudden death.
  const slots = Math.max(5, results.length);
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 truncate text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: slots }).map((_, i) => {
          const taken = i < results.length;
          const scored = results[i];
          return (
            <span
              key={i}
              className={cn(
                "grid size-4 place-items-center rounded-full text-[9px] font-bold",
                !taken
                  ? "border border-border/50 bg-transparent text-transparent"
                  : scored
                    ? "bg-success/80 text-background"
                    : "bg-destructive/80 text-background",
              )}
            >
              {taken ? (scored ? "✓" : "✗") : "•"}
            </span>
          );
        })}
      </div>
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
  // The resolved kick's shot direction (ball) + keeper's dive — for animation.
  // Both reset to null after the verdict fades so the next kick animates fresh.
  const [lastShot, setLastShot] = useState<Dir | null>(null);
  const [lastDive, setLastDive] = useState<Dir | null>(null);
  // Transient GOAL!/SAVED! verdict shown after each kick resolves.
  const [verdict, setVerdict] = useState<{ goal: boolean; key: number } | null>(null);

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

  // When the opponent has taken their shot, re-fetch so the keeper sees it's
  // their turn to dive — but NEVER the direction (that would defeat the guess).
  // The actual direction is revealed only when the kick resolves (kicks[] below).
  useEffect(() => {
    return onBroadcast("sync", () => {
      /* handled by useGameRoom's resync; nothing leaked here */
    });
  }, [onBroadcast]);

  // When a new kick resolves (the kicks array grows), show GOAL!/SAVED! and
  // animate the ball to where it actually went. Drives off the authoritative
  // state so BOTH players see the verdict regardless of who acted.
  const kickCount = state.kicks.length;
  useEffect(() => {
    if (kickCount === 0) return;
    const last = state.kicks[kickCount - 1];
    setLastShot(last.dir);
    setLastDive(last.dive);
    setVerdict({ goal: last.goal, key: kickCount });
    haptic(last.goal ? 30 : 15);
    // After the verdict fades, reset the pitch to neutral so the NEXT kick
    // animates fresh — otherwise the ball/keeper linger on the previous kick's
    // position (the "shows previous shootout" bug).
    const t = setTimeout(() => {
      setVerdict(null);
      setLastShot(null);
      setLastDive(null);
    }, 1600);
    return () => clearTimeout(t);
    // Only when a NEW kick lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kickCount]);

  // Confetti when I win.
  useEffect(() => {
    if (finished && match.winnerId === currentUserId) {
      celebrateSave();
    }
  }, [finished, match.winnerId, currentUserId]);

  function send(move: { kind: "shoot"; dir: Dir } | { kind: "dive"; dir: Dir }) {
    if (isPending) return;
    haptic();
    // NOTE: never broadcast the shot DIRECTION — the keeper must guess. The
    // direction is revealed to both only when the kick resolves (kicks[] state).
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

  // Invitee (player2) accepts/declines the challenge from the match page itself,
  // so tapping the push notification lands them on a working Accept screen.
  const isInvitee = match.player2Id === currentUserId;
  function respond(accept: boolean) {
    if (isPending) return;
    haptic();
    setError(null);
    startTransition(async () => {
      const res = await respondToChallenge(matchId, accept);
      if (!res.ok) {
        setError(res.error ?? "Couldn't respond.");
        return;
      }
      if (res.match) setMatch(res.match);
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
    // Invitee sees Accept/Decline right here; challenger sees "waiting".
    if (isInvitee) {
      return (
        <Centered>
          <span className="text-3xl">⚽</span>
          <p className="mt-2 text-sm font-medium">
            {opp?.displayName ?? "Someone"} challenged you to a Penalty Shootout
          </p>
          <div className="mt-4 flex gap-3">
            <Button onClick={() => respond(true)} disabled={isPending} className="h-11">
              {isPending ? <Loader2 className="animate-spin" /> : "Accept"}
            </Button>
            <Button
              variant="outline"
              onClick={() => respond(false)}
              disabled={isPending}
              className="h-11"
            >
              Decline
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </Centered>
      );
    }
    return (
      <Centered>
        <Loader2 className="size-7 animate-spin text-gold" />
        <p className="mt-3 text-sm text-muted-foreground">
          Waiting for {opp?.displayName ?? "your opponent"} to accept…
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

      {/* Shootout tally — like a real 5v5: a dot per kick, green=scored, red=missed. */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-border/40 bg-card/40 px-3 py-2">
        <ShootoutRow
          label={me?.displayName ?? "You"}
          results={state.kicks.filter((k) => k.shooter === mySlot).map((k) => k.goal)}
        />
        <ShootoutRow
          label={opp?.displayName ?? "Opponent"}
          results={state.kicks
            .filter((k) => k.shooter !== mySlot)
            .map((k) => k.goal)}
        />
      </div>

      {/* Goal + pitch */}
      <Card className="border-border/60 bg-card/70">
        <CardContent className="p-4">
          <Goal lastShot={lastShot} lastDive={lastDive} verdict={verdict} />
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

/**
 * The goal mouth with an animated ball flying to the last shot direction, the
 * keeper diving, and a GOAL!/SAVED! verdict banner once a kick resolves.
 */
function Goal({
  lastShot,
  lastDive,
  verdict,
}: {
  lastShot: Dir | null;
  lastDive: Dir | null;
  verdict: { goal: boolean; key: number } | null;
}) {
  const x = lastShot === "L" ? -90 : lastShot === "R" ? 90 : 0;
  const diveX = lastDive === "L" ? -90 : lastDive === "R" ? 90 : 0;
  return (
    <div className="relative mx-auto h-40 w-full max-w-sm overflow-hidden">
      {/* Net */}
      <div className="absolute inset-x-4 top-2 h-28 rounded-t-md border-4 border-b-0 border-foreground/30 bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,var(--border)_8px,var(--border)_9px)]" />
      {/* Grass */}
      <div className="absolute inset-x-0 bottom-0 h-10 rounded-md bg-success/20" />

      {/* Keeper — dives to where they chose once a kick has resolved. */}
      <motion.div
        key={`keeper-${verdict?.key ?? "idle"}`}
        initial={{ x: 0, y: 0, rotate: 0 }}
        animate={
          verdict
            ? { x: diveX * 0.6, y: -6, rotate: lastDive === "M" ? 0 : diveX < 0 ? -35 : 35 }
            : { x: 0, y: 0, rotate: 0 }
        }
        transition={{ type: "spring", stiffness: 200, damping: 16 }}
        className="absolute bottom-9 left-1/2 -ml-3 text-2xl"
      >
        🧤
      </motion.div>

      {/* Ball — on a GOAL it sails into the net; on a SAVE it's stopped short at
          the keeper (a little kick-back), so the verdict reads visually. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${lastShot}-${verdict?.key ?? 0}`}
          initial={{ y: 60, x: 0, scale: 1, opacity: 0 }}
          animate={{
            // Goal flies up into the net; save is caught lower (less travel).
            y: lastShot ? (verdict?.goal ? -28 : 6) : 60,
            x: verdict && !verdict.goal ? diveX * 0.6 : x,
            scale: lastShot ? (verdict?.goal ? 0.65 : 0.8) : 1,
            opacity: 1,
          }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
          className="absolute bottom-2 left-1/2 -ml-3 text-2xl"
        >
          ⚽
        </motion.div>
      </AnimatePresence>

      {/* GOAL! / SAVED! verdict */}
      <AnimatePresence>
        {verdict && (
          <motion.div
            key={`verdict-${verdict.key}`}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <span
              className={cn(
                "font-display text-3xl tracking-wide drop-shadow",
                verdict.goal ? "text-success" : "text-destructive",
              )}
            >
              {verdict.goal ? "GOAL! ⚽" : "SAVED! 🧤"}
            </span>
          </motion.div>
        )}
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
