"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameRoom } from "@/components/games/use-game-room";
import { applyMove, respondToChallenge } from "@/lib/games/actions";
import { haptic, celebrateSave } from "@/lib/celebrate";
import type { GameComponentProps } from "@/lib/games/types";
import {
  createInitialState,
  TICK_MS,
  FIELD_W,
  FIELD_H,
  GOAL_HALF,
  PLAYER_RADIUS,
  BALL_RADIUS,
  type HaxState,
  type Vec2,
} from "@/lib/games/haxball/physics";
import { GOAL_CAP } from "@/lib/games/haxball/reducer";

const SERVER_URL = process.env.NEXT_PUBLIC_HAXBALL_WS; // wss://haxball-eznii.fly.dev
const INPUT_HZ_MS = 33; // send input ~30Hz
const MIN_INTERP_MS = TICK_MS;      // floor so a fast burst doesn't render instantly
const MAX_EXTRAP = 1.6;             // allow ~60% coast past B when a packet is late (vs freezing)

/**
 * Real-time 1v1 HaxBall. A dedicated WS server (server/haxball) runs the
 * authoritative physics; this client just sends input and renders the state it
 * pushes — no client-side sim, no host/guest split. Both players are equal.
 * The match still finishes via applyMove when someone reaches the cap.
 */
export function HaxballDuel({ matchId, initialMatch, currentUserId }: GameComponentProps) {
  const { match, setMatch } = useGameRoom(matchId, initialMatch, currentUserId);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [hud, setHud] = useState({ a: 0, b: 0 });

  const isP1 = match.player1Id === currentUserId; // p1 = team A (red)
  const isInvitee = match.player2Id === currentUserId;
  const pending = match.status === "pending";
  const declined = match.status === "declined";
  const finished = match.status === "finished";
  const me = isP1 ? match.player1 : match.player2;
  const opp = isP1 ? match.player2 : match.player1;
  const playable = !pending && !declined && !finished;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<Vec2 & { kick: boolean }>({ x: 0, y: 0, kick: false });
  // Two latest server snapshots for render interpolation.
  const snapA = useRef<HaxState>(createInitialState());
  const snapB = useRef<HaxState>(createInitialState());
  const snapBAt = useRef(0);
  const interpMs = useRef(TICK_MS); // measured gap between the last two packets (smoothed)
  const finishedRef = useRef(false);

  // Connect to the authoritative server; render whatever it pushes.
  useEffect(() => {
    if (!playable) return;
    if (!SERVER_URL) { setError("Game server not configured."); return; }
    const ws = new WebSocket(SERVER_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log("[hax] ws open → join", { matchId, userId: currentUserId });
      ws.send(JSON.stringify({ t: "join", matchId, userId: currentUserId }));
    };
    ws.onclose = (e) => { setConnected(false); console.log("[hax] ws close", e.code, e.reason); };
    ws.onerror = (e) => { setConnected(false); console.log("[hax] ws error", e); };
    ws.onmessage = (ev) => {
      let m: { t: string; s?: HaxState; slot?: string };
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === "joined") { console.log("[hax] joined as", m.slot); return; }
      if (m.t !== "state" || !m.s) return;
      const s = m.s;
      const now = performance.now();
      // Smooth the measured inter-packet gap so render speed tracks actual
      // delivery rate (rides jitter instead of freezing-then-snapping).
      const gap = Math.max(MIN_INTERP_MS, now - snapBAt.current);
      interpMs.current = interpMs.current * 0.8 + gap * 0.2;
      snapA.current = snapB.current;
      snapB.current = s;
      snapBAt.current = now;
      if (s.scoreA !== hud.a || s.scoreB !== hud.b) setHud({ a: s.scoreA, b: s.scoreB });

      // Either client commits the finished result once (idempotent server-side).
      if (!finishedRef.current && (s.scoreA >= GOAL_CAP || s.scoreB >= GOAL_CAP)) {
        finishedRef.current = true;
        startTransition(async () => {
          const res = await applyMove(matchId, { kind: "finish", scoreA: s.scoreA, scoreB: s.scoreB });
          if (res.ok && res.match) setMatch(res.match);
        });
      }
    };

    // Push input ~20Hz. Flat { x, y, kick } — server normInput reads it.
    const send = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: "input", move: inputRef.current }));
      }
    }, INPUT_HZ_MS);

    return () => { clearInterval(send); ws.close(); };
    // hud read via closure; matchId/currentUserId/playable are the real deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playable, matchId, currentUserId]);

  // Render loop: interpolate the two latest snapshots to 60fps.
  useEffect(() => {
    if (!playable) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const goalSnap = snapB.current.goalEvent != null;
      // t in [0, MAX_EXTRAP]: <1 interpolates A→B, >1 briefly coasts past B so a
      // late packet keeps motion smooth instead of stalling. Snap on goals.
      const t = goalSnap
        ? 1
        : Math.min(MAX_EXTRAP, (performance.now() - snapBAt.current) / interpMs.current);
      draw(ctx, lerpState(snapA.current, snapB.current, t));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playable]);

  function respond(accept: boolean) {
    if (isPending) return;
    haptic();
    startTransition(async () => {
      const res = await respondToChallenge(matchId, accept);
      if (!res.ok) setError(res.error ?? "Couldn't respond.");
      else if (res.match) setMatch(res.match);
    });
  }

  useEffect(() => {
    if (finished && match.winnerId === currentUserId) celebrateSave();
  }, [finished, match.winnerId, currentUserId]);

  // ── Render states ──────────────────────────────────────────────────────────
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
    const myScore = isP1 ? (match.score?.p1 ?? 0) : (match.score?.p2 ?? 0);
    const oppScore = isP1 ? (match.score?.p2 ?? 0) : (match.score?.p1 ?? 0);
    return (
      <Centered>
        {iWon ? <Trophy className="size-12 text-gold" /> : <span className="text-4xl">😞</span>}
        <h2 className="font-display mt-2 text-2xl">{iWon ? "You won!" : "You lost"}</h2>
        <p className="font-numeric text-3xl">{myScore} – {oppScore}</p>
        <Button variant="outline" onClick={() => history.back()} className="mt-2">Back to games</Button>
      </Centered>
    );
  }

  // Live match. P1 = team A = red, P2 = team B = blue.
  const myScore = isP1 ? hud.a : hud.b;
  const oppScore = isP1 ? hud.b : hud.a;
  const myColor = isP1 ? "#e2483d" : "#3d6de2";
  const oppColor = isP1 ? "#3d6de2" : "#e2483d";
  const Dot = ({ c }: { c: string }) => (
    <span className="inline-block size-2.5 rounded-full align-middle" style={{ backgroundColor: c }} />
  );
  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div className="flex w-full max-w-md items-center justify-between text-sm">
        <span className="font-medium"><Dot c={myColor} /> {me?.displayName ?? "You"} <b className="text-gold">{myScore}</b></span>
        <span className="text-[11px] text-muted-foreground/70">
          first to {GOAL_CAP}{connected ? "" : " · connecting…"}
        </span>
        <span className="font-medium"><b className="text-gold">{oppScore}</b> {opp?.displayName ?? "Opp"} <Dot c={oppColor} /></span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        You are the <b style={{ color: myColor }}>{isP1 ? "red" : "blue"}</b> player
      </p>

      <canvas
        ref={canvasRef}
        width={FIELD_W * 2}
        height={FIELD_H * 2}
        className="w-full max-w-md rounded-xl border border-border/60"
        style={{ aspectRatio: `${FIELD_W} / ${FIELD_H}`, touchAction: "none" }}
      />

      <Controls
        onMove={(v) => { inputRef.current.x = v.x; inputRef.current.y = v.y; }}
        onKick={(k) => { inputRef.current.kick = k; if (k) haptic(10); }}
      />
    </div>
  );
}

/** Lerp positions between two snapshots (vel/scores from `b`). 20Hz → 60fps. */
function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
function lerpState(a: HaxState, b: HaxState, t: number): HaxState {
  return {
    ...b,
    ball: { ...b.ball, pos: lerpVec(a.ball.pos, b.ball.pos, t) },
    players: b.players.map((pb, i) => ({
      ...pb,
      pos: lerpVec(a.players[i]?.pos ?? pb.pos, pb.pos, t),
    })),
  };
}

/** Draw the pitch + discs. Both players see the same orientation. */
function draw(ctx: CanvasRenderingContext2D, s: HaxState) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const sx = W / FIELD_W;
  const tx = (x: number) => (x + FIELD_W / 2) * sx;
  const ty = (y: number) => (y + FIELD_H / 2) * (H / FIELD_H);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0a3d12";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 40 * sx, 0, Math.PI * 2); ctx.stroke();
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
  ctx.beginPath();
  ctx.arc(tx(s.ball.pos.x), ty(s.ball.pos.y), BALL_RADIUS * sx, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
}

/** Touch joystick (left) + kick (right). Mouse works for desktop testing. */
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
    onMove({ x: dx / R, y: dy / R });
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
