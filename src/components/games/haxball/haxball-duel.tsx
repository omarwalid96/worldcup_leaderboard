"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameRoom } from "@/components/games/use-game-room";
import { applyMove, respondToChallenge } from "@/lib/games/actions";
import { haptic, celebrateSave } from "@/lib/celebrate";
import type { GameComponentProps } from "@/lib/games/types";
import {
  step,
  createInitialState,
  TICK_MS,
  FIELD_W,
  FIELD_H,
  GOAL_HALF,
  PLAYER_RADIUS,
  BALL_RADIUS,
  type HaxState,
  type InputMap,
  type Vec2,
} from "@/lib/games/haxball/physics";
import { GOAL_CAP } from "@/lib/games/haxball/reducer";

const BROADCAST_EVERY = 3; // host broadcasts state every 3rd tick (~20Hz)

/**
 * Real-time 1v1 HaxBall duel. Host-authoritative over Supabase Realtime:
 *  - P1 (host) runs the physics loop and broadcasts HaxState ~20Hz.
 *  - P2 (guest) renders the received state and broadcasts its input.
 *  - When the host hits the goal cap it commits the result via applyMove.
 * No new infra — reuses useGameRoom's broadcast/presence. ponytail: host phone
 * is the sim authority (laggable/cheatable); fine for friends, not ranked.
 */
export function HaxballDuel({ matchId, initialMatch, currentUserId }: GameComponentProps) {
  const { match, connected, present, broadcast, onBroadcast, setMatch } = useGameRoom(
    matchId,
    initialMatch,
    currentUserId,
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isHost = match.player1Id === currentUserId; // P1 = host = team A
  const isInvitee = match.player2Id === currentUserId;
  const pending = match.status === "pending";
  const declined = match.status === "declined";
  const finished = match.status === "finished";
  const me = isHost ? match.player1 : match.player2;
  const opp = isHost ? match.player2 : match.player1;
  const bothHere =
    match.player2Id != null &&
    present.includes(match.player1Id) &&
    present.includes(match.player2Id);

  // Live score for the HUD (driven by the rendered state).
  const [hud, setHud] = useState({ a: 0, b: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Mutable refs the loop reads without re-subscribing.
  const stateRef = useRef<HaxState>(createInitialState());
  const myInputRef = useRef<Vec2 & { kick: boolean }>({ x: 0, y: 0, kick: false });
  const oppInputRef = useRef<{ x: number; y: number; kick: boolean }>({ x: 0, y: 0, kick: false });
  const finishedRef = useRef(false);

  // Guest: receive authoritative state from host.
  useEffect(() => {
    if (isHost) return;
    return onBroadcast("hax_state", (p) => {
      const s = p as HaxState;
      stateRef.current = s;
      setHud({ a: s.scoreA, b: s.scoreB });
    });
  }, [isHost, onBroadcast]);

  // Host: receive guest's input.
  useEffect(() => {
    if (!isHost) return;
    return onBroadcast("hax_input", (p) => {
      oppInputRef.current = p as { x: number; y: number; kick: boolean };
    });
  }, [isHost, onBroadcast]);

  // The game loop. Host simulates + broadcasts; guest broadcasts input + renders.
  useEffect(() => {
    if (pending || declined || finished || !bothHere) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let acc = 0;
    let last = performance.now();
    let tick = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      acc += now - last;
      last = now;

      while (acc >= TICK_MS) {
        acc -= TICK_MS;
        if (isHost) {
          // step() keys inputs by player index: p0 = host (team A), p1 = guest.
          const inputs: InputMap = {
            p0: { move: { x: myInputRef.current.x, y: myInputRef.current.y }, kick: myInputRef.current.kick },
            p1: { move: { x: oppInputRef.current.x, y: oppInputRef.current.y }, kick: oppInputRef.current.kick },
          };
          // step() expects dt in SECONDS (matches physics.ts self-check DT).
          stateRef.current = step(stateRef.current, inputs, TICK_MS / 1000);
          const s = stateRef.current;
          if ((s.scoreA !== hud.a || s.scoreB !== hud.b)) setHud({ a: s.scoreA, b: s.scoreB });
          if (++tick % BROADCAST_EVERY === 0) broadcast("hax_state", s);

          // Win condition → commit once.
          if (!finishedRef.current && (s.scoreA >= GOAL_CAP || s.scoreB >= GOAL_CAP)) {
            finishedRef.current = true;
            broadcast("hax_state", s); // make sure guest sees the final score
            startTransition(async () => {
              const res = await applyMove(matchId, { kind: "finish", scoreA: s.scoreA, scoreB: s.scoreB });
              if (res.ok && res.match) setMatch(res.match);
              else broadcast("sync", {});
            });
          }
        } else {
          // Guest just keeps shipping its input; rendering uses received state.
          if (++tick % BROADCAST_EVERY === 0) broadcast("hax_input", myInputRef.current);
        }
      }
      draw(ctx, stateRef.current);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // hud.a/hud.b intentionally omitted — read via closure, not a re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, pending, declined, finished, bothHere, broadcast, matchId, setMatch]);

  function respond(accept: boolean) {
    if (isPending) return;
    haptic();
    startTransition(async () => {
      const res = await respondToChallenge(matchId, accept);
      if (!res.ok) setError(res.error ?? "Couldn't respond.");
      else if (res.match) setMatch(res.match);
      broadcast("sync", {});
    });
  }

  // Confetti on win.
  useEffect(() => {
    if (finished && match.winnerId === currentUserId) celebrateSave();
  }, [finished, match.winnerId, currentUserId]);

  // ── Render states ────────────────────────────────────────────────────────
  if (declined)
    return <Centered><p className="text-sm text-muted-foreground">Challenge declined.</p></Centered>;

  if (pending)
    return isInvitee ? (
      <Centered>
        <span className="text-3xl">⚽</span>
        <p className="mt-2 text-sm font-medium">
          {opp?.displayName ?? "Someone"} challenged you to HaxBall
        </p>
        <div className="mt-4 flex gap-3">
          <Button onClick={() => respond(true)} disabled={isPending} className="h-11">
            {isPending ? <Loader2 className="animate-spin" /> : "Accept"}
          </Button>
          <Button variant="outline" onClick={() => respond(false)} disabled={isPending} className="h-11">
            Decline
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </Centered>
    ) : (
      <Centered>
        <Loader2 className="size-7 animate-spin text-gold" />
        <p className="mt-3 text-sm text-muted-foreground">
          Waiting for {opp?.displayName ?? "your opponent"} to accept…
        </p>
      </Centered>
    );

  if (finished) {
    const iWon = match.winnerId === currentUserId;
    const myScore = isHost ? (match.score?.p1 ?? 0) : (match.score?.p2 ?? 0);
    const oppScore = isHost ? (match.score?.p2 ?? 0) : (match.score?.p1 ?? 0);
    return (
      <Centered>
        {iWon ? <Trophy className="size-12 text-gold" /> : <span className="text-4xl">😞</span>}
        <h2 className="font-display mt-2 text-2xl">{iWon ? "You won!" : "You lost"}</h2>
        <p className="font-numeric text-3xl">{myScore} – {oppScore}</p>
        <Button variant="outline" onClick={() => history.back()} className="mt-2">Back to games</Button>
      </Centered>
    );
  }

  if (!bothHere)
    return (
      <Centered>
        <Loader2 className="size-8 animate-spin text-gold" />
        <p className="mt-3 text-sm text-muted-foreground">
          Waiting for {opp?.displayName ?? "opponent"} to enter the pitch…
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">Both must be here to kick off.</p>
      </Centered>
    );

  // Live match.
  const myScore = isHost ? hud.a : hud.b;
  const oppScore = isHost ? hud.b : hud.a;
  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div className="flex w-full max-w-md items-center justify-between text-sm">
        <span className="font-medium">{me?.displayName ?? "You"} <b className="text-gold">{myScore}</b></span>
        <span className="text-[11px] text-muted-foreground/70">first to {GOAL_CAP}{connected ? "" : " · offline"}</span>
        <span className="font-medium"><b className="text-gold">{oppScore}</b> {opp?.displayName ?? "Opp"}</span>
      </div>

      {/* Pitch — fixed aspect, scales to width. */}
      <canvas
        ref={canvasRef}
        width={FIELD_W * 2}
        height={FIELD_H * 2}
        className="w-full max-w-md rounded-xl border border-border/60"
        style={{ aspectRatio: `${FIELD_W} / ${FIELD_H}`, touchAction: "none" }}
      />

      <Controls
        onMove={(v) => { myInputRef.current.x = v.x; myInputRef.current.y = v.y; }}
        onKick={(k) => { myInputRef.current.kick = k; if (k) haptic(10); }}
      />
    </div>
  );
}

/** Draw the pitch + discs. ponytail: both players see the same orientation
 *  (no per-side mirroring) — simpler, and fine for a shared-pitch duel. */
function draw(ctx: CanvasRenderingContext2D, s: HaxState) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const sx = W / FIELD_W, sy = H / FIELD_H;
  const tx = (x: number) => (x + FIELD_W / 2) * sx;
  const ty = (y: number) => (y + FIELD_H / 2) * sy;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0a3d12";
  ctx.fillRect(0, 0, W, H);
  // center line + circle
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 40 * sx, 0, Math.PI * 2); ctx.stroke();
  // goals (gaps): draw gold posts on each end
  ctx.strokeStyle = "#F2D27A";
  ctx.lineWidth = 4;
  for (const gx of [0, W]) {
    ctx.beginPath();
    ctx.moveTo(gx, ty(-GOAL_HALF)); ctx.lineTo(gx, ty(GOAL_HALF));
    ctx.stroke();
  }

  for (const p of s.players) {
    ctx.beginPath();
    ctx.arc(tx(p.pos.x), ty(p.pos.y), PLAYER_RADIUS * sx, 0, Math.PI * 2);
    ctx.fillStyle = p.team === "A" ? "#e2483d" : "#3d6de2";
    ctx.fill();
    ctx.lineWidth = p.kicking ? 4 : 2;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.stroke();
  }
  // ball
  ctx.beginPath();
  ctx.arc(tx(s.ball.pos.x), ty(s.ball.pos.y), BALL_RADIUS * sx, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
}

/** Touch joystick (left) + kick (right). Mouse works too for desktop testing. */
function Controls({ onMove, onKick }: { onMove: (v: Vec2) => void; onKick: (k: boolean) => void }) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 44;

  function handle(e: React.PointerEvent) {
    const base = baseRef.current;
    if (!base) return;
    const r = base.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(d, R);
    dx = (dx / d) * clamped; dy = (dy / d) * clamped;
    setKnob({ x: dx, y: dy });
    onMove({ x: dx / R, y: dy / R }); // unit-ish, magnitude 0..1
  }
  function reset() { setKnob({ x: 0, y: 0 }); onMove({ x: 0, y: 0 }); }

  return (
    <div className="flex w-full max-w-md items-center justify-between px-2">
      <div
        ref={baseRef}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); handle(e); }}
        onPointerMove={(e) => { if (e.buttons || e.pressure) handle(e); }}
        onPointerUp={reset}
        onPointerCancel={reset}
        className="relative grid size-28 place-items-center rounded-full border border-border/60 bg-card/60"
        style={{ touchAction: "none" }}
        aria-label="Move"
      >
        <span
          className="size-12 rounded-full bg-gold/70"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>
      <button
        type="button"
        onPointerDown={() => onKick(true)}
        onPointerUp={() => onKick(false)}
        onPointerCancel={() => onKick(false)}
        className="grid size-20 place-items-center rounded-full border-2 border-gold/60 bg-gold/15 text-sm font-bold text-gold active:bg-gold/30"
        style={{ touchAction: "none" }}
      >
        KICK
      </button>
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
