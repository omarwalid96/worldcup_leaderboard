"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameRoom } from "@/components/games/use-game-room";
import { applyMove, respondToChallenge } from "@/lib/games/actions";
import { haptic, celebrateSave } from "@/lib/celebrate";
import type { GameComponentProps } from "@/lib/games/types";
import {
  FIELD_W,
  FIELD_H,
  HALF_W,
  HALF_H,
  GOAL_HALF,
  PLAYER_RADIUS,
  BALL_RADIUS,
  DT,
  PLAYER_SPEED,
  PLAYER_ACCEL_LERP,
  PLAYER_DAMPING,
  type Snap,
} from "@/lib/games/haxball/world";
import { GOAL_CAP } from "@/lib/games/haxball/reducer";

const SERVER_URL = process.env.NEXT_PUBLIC_HAXBALL_WS; // wss://haxball-eznii.fly.dev
const INPUT_HZ_MS = 33;        // send input ~30Hz (server runs its own 60Hz planck sim)
const RENDER_DELAY_MS = 100;   // render BALL + OPPONENT this far in the past (smooth interpolation)
const JOY_DEADZONE = 0.18;     // ignore tiny thumb wobble near the joystick centre
const RECONCILE = 0.18;        // pull my predicted paddle toward server truth each snapshot (0..1)

// drivePlayer() constants come straight from world.ts (single source of truth)
// so client prediction can never drift from the server sim.
const PLAYER_DAMP_PER_TICK = Math.exp(-PLAYER_DAMPING * DT); // linearDamping → per-tick factor

const CANVAS_W = 840;          // render resolution; 1 metre = CANVAS_W / FIELD_W px
const CANVAS_H = CANVAS_W * (FIELD_H / FIELD_W);

interface XY { x: number; y: number }

/**
 * Real-time 1v1 HaxBall on a planck.js (Box2D) authoritative server.
 * The server runs the ONE 60Hz physics sim and broadcasts compact snapshots;
 * this client sends input and renders.
 *
 * Netcode: predict-self + interpolate-rest.
 *  - MY paddle is integrated locally each tick with the exact drivePlayer model
 *    from world.ts, so it tracks my thumb with zero latency; each snapshot
 *    softly reconciles it (RECONCILE) so contacts don't drift.
 *  - BALL + OPPONENT render RENDER_DELAY_MS in the past, lerped between two real
 *    snapshots — real momentum, no rubber-band.
 */
export function HaxballDuel({ matchId, initialMatch, currentUserId }: GameComponentProps) {
  const { match, setMatch } = useGameRoom(matchId, initialMatch, currentUserId);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [hud, setHud] = useState({ a: 0, b: 0 });

  const isP1 = match.player1Id === currentUserId; // p1 = team A (red) = slot p0
  const isInvitee = match.player2Id === currentUserId;
  const pending = match.status === "pending";
  const declined = match.status === "declined";
  const finished = match.status === "finished";
  const me = isP1 ? match.player1 : match.player2;
  const opp = isP1 ? match.player2 : match.player1;
  const playable = !pending && !declined && !finished;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<{ x: number; y: number; kick: boolean }>({ x: 0, y: 0, kick: false });
  // Snapshot buffer for render interpolation.
  const buffer = useRef<{ at: number; s: Snap }[]>([]);
  // My locally-predicted paddle (metres), integrated from my own input.
  const myPaddle = useRef<{ pos: XY; vel: XY }>({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } });
  const myInit = useRef(false);
  const finishedRef = useRef(false);

  // ── Connect: send input, fill the snapshot buffer ──────────────────────────
  useEffect(() => {
    if (!playable) return;
    if (!SERVER_URL) { setError("Game server not configured."); return; }
    const ws = new WebSocket(SERVER_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ t: "join", matchId, userId: currentUserId }));
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      let m: { t: string; s?: Snap };
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t !== "state" || !m.s) return;
      const s = m.s;
      const buf = buffer.current;
      buf.push({ at: performance.now(), s });
      if (buf.length > 64) buf.shift();
      if (s.scoreA !== hud.a || s.scoreB !== hud.b) setHud({ a: s.scoreA, b: s.scoreB });

      // Reconcile my predicted paddle toward server truth for my slot.
      const mine = isP1 ? s.pa : s.pb;
      const mineV = isP1 ? s.va : s.vb;
      const mp = myPaddle.current;
      if (!myInit.current || s.goal != null) {
        mp.pos = { x: mine[0], y: mine[1] };
        mp.vel = { x: mineV[0], y: mineV[1] };
        myInit.current = true;
      } else {
        mp.pos.x += (mine[0] - mp.pos.x) * RECONCILE;
        mp.pos.y += (mine[1] - mp.pos.y) * RECONCILE;
        mp.vel = { x: mineV[0], y: mineV[1] };
      }

      if (!finishedRef.current && (s.scoreA >= GOAL_CAP || s.scoreB >= GOAL_CAP)) {
        finishedRef.current = true;
        startTransition(async () => {
          const res = await applyMove(matchId, { kind: "finish", scoreA: s.scoreA, scoreB: s.scoreB });
          if (res.ok && res.match) setMatch(res.match);
        });
      }
    };

    return () => { ws.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playable, matchId, currentUserId, isP1]);

  // ── Send input at a fixed cadence ──────────────────────────────────────────
  useEffect(() => {
    if (!playable) return;
    const id = setInterval(() => {
      const ws = wsRef.current;
      if (ws?.readyState !== WebSocket.OPEN) return;
      const i = inputRef.current;
      ws.send(JSON.stringify({ t: "input", move: { x: i.x, y: i.y, kick: i.kick } }));
    }, INPUT_HZ_MS);
    return () => clearInterval(id);
  }, [playable]);

  // ── Render loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playable) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let lastTime = performance.now();
    let acc = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const buf = buffer.current;

      // Integrate MY paddle at a fixed 60Hz step (matches world.ts drivePlayer).
      const now = performance.now();
      let dt = now - lastTime;
      lastTime = now;
      if (dt > 250) dt = 250;
      acc += dt;
      const mp = myPaddle.current;
      const i = inputRef.current;
      const TICK_MS = DT * 1000;
      while (acc >= TICK_MS) {
        const mag = Math.hypot(i.x, i.y);
        const tx = mag > 0.01 ? (i.x / Math.max(mag, 1)) * PLAYER_SPEED : 0;
        const ty = mag > 0.01 ? (i.y / Math.max(mag, 1)) * PLAYER_SPEED : 0;
        // velocity-lerp toward target, then damping, then integrate (metres)
        mp.vel.x = (mp.vel.x + (tx - mp.vel.x) * PLAYER_ACCEL_LERP) * PLAYER_DAMP_PER_TICK;
        mp.vel.y = (mp.vel.y + (ty - mp.vel.y) * PLAYER_ACCEL_LERP) * PLAYER_DAMP_PER_TICK;
        mp.pos.x += mp.vel.x * DT;
        mp.pos.y += mp.vel.y * DT;
        acc -= TICK_MS;
      }
      // Clamp to pitch (server is authoritative on real walls).
      mp.pos.x = clamp(mp.pos.x, -HALF_W + PLAYER_RADIUS, HALF_W - PLAYER_RADIUS);
      mp.pos.y = clamp(mp.pos.y, -HALF_H + PLAYER_RADIUS, HALF_H - PLAYER_RADIUS);

      // Interpolate ball + opponent RENDER_DELAY_MS in the past.
      if (buf.length === 0) { return; }
      const renderAt = buf[buf.length - 1].at - RENDER_DELAY_MS;
      let a = buf[0], b = buf[buf.length - 1];
      for (let k = 0; k < buf.length - 1; k++) {
        if (buf[k].at <= renderAt && buf[k + 1].at >= renderAt) { a = buf[k]; b = buf[k + 1]; break; }
      }
      const span = b.at - a.at;
      const t = span > 0 ? clamp((renderAt - a.at) / span, 0, 1) : 1;
      const goalNow = b.s.goal != null;

      // Opponent + ball positions (interpolated); my paddle = predicted.
      const oppA = isP1 ? a.s.pb : a.s.pa;
      const oppB = isP1 ? b.s.pb : b.s.pa;
      const oppKick = isP1 ? b.s.kb : b.s.ka;
      const oppPos = goalNow ? xy(oppB) : lerpXY(xy(oppA), xy(oppB), t);
      const ballPos = goalNow ? xy(b.s.ball) : lerpXY(xy(a.s.ball), xy(b.s.ball), t);
      const myKick = i.kick;

      draw(ctx, {
        mine: { pos: { ...mp.pos }, color: isP1 ? "#e2483d" : "#3d6de2", kick: myKick },
        opp: { pos: oppPos, color: isP1 ? "#3d6de2" : "#e2483d", kick: oppKick },
        ball: ballPos,
      });
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playable, isP1]);

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
        width={CANVAS_W}
        height={CANVAS_H}
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

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function xy(p: [number, number]): XY { return { x: p[0], y: p[1] }; }
function lerpXY(a: XY, b: XY, t: number): XY { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }

interface DrawDisc { pos: XY; color: string; kick: boolean }
/** Draw the pitch + discs (metres → pixels). Ball is drawn LAST = always on top. */
function draw(
  ctx: CanvasRenderingContext2D,
  s: { mine: DrawDisc; opp: DrawDisc; ball: XY },
) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const sx = W / FIELD_W, sy = H / FIELD_H;
  const tx = (x: number) => (x + HALF_W) * sx;
  const ty = (y: number) => (y + HALF_H) * sy;

  // Pitch
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0a3d12";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 4 * sx, 0, Math.PI * 2); ctx.stroke();
  // Goals
  ctx.strokeStyle = "#F2D27A";
  ctx.lineWidth = 5;
  for (const gx of [0, W]) {
    ctx.beginPath();
    ctx.moveTo(gx, ty(-GOAL_HALF)); ctx.lineTo(gx, ty(GOAL_HALF));
    ctx.stroke();
  }

  const disc = (p: XY, r: number, fill: string, ring: boolean) => {
    ctx.beginPath();
    ctx.arc(tx(p.x), ty(p.y), r * sx, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = ring ? 5 : 2.5;
    ctx.strokeStyle = ring ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.35)";
    ctx.stroke();
  };

  // Players first…
  disc(s.opp.pos, PLAYER_RADIUS, s.opp.color, s.opp.kick);
  disc(s.mine.pos, PLAYER_RADIUS, s.mine.color, s.mine.kick);
  // …ball last → always visible on top.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 6 * sx / 10;
  disc(s.ball, BALL_RADIUS, "#ffffff", false);
  ctx.restore();
}

/** Touch joystick (left) + kick (right). Mouse works for desktop testing. */
function Controls({ onMove, onKick }: { onMove: (v: XY) => void; onKick: (k: boolean) => void }) {
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
    let nx = dx / R, ny = dy / R;
    const mag = Math.hypot(nx, ny);
    if (mag < JOY_DEADZONE) { nx = 0; ny = 0; }
    else {
      const scaled = (mag - JOY_DEADZONE) / (1 - JOY_DEADZONE) / mag;
      nx *= scaled; ny *= scaled;
    }
    onMove({ x: nx, y: ny });
  }
  function reset() { setKnob({ x: 0, y: 0 }); onMove({ x: 0, y: 0 }); }

  return (
    <div className="flex w-full max-w-md items-center justify-between px-2">
      <div
        ref={baseRef}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); handle(e); }}
        onPointerMove={(e) => { if (e.pressure > 0 || e.buttons > 0 || e.pointerType === "touch") handle(e); }}
        onPointerUp={reset}
        onPointerCancel={reset}
        className="relative grid size-28 touch-none place-items-center rounded-full border border-border/60 bg-card/60"
        aria-label="Move"
      >
        <span
          className="size-12 rounded-full bg-gold/70"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); onKick(true); }}
        onPointerUp={() => onKick(false)}
        onPointerLeave={() => onKick(false)}
        onPointerCancel={() => onKick(false)}
        className="grid size-20 touch-none place-items-center rounded-full border-2 border-gold/60 bg-gold/15 text-sm font-bold text-gold active:bg-gold/30"
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
