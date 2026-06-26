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
  GOAL_HALF,
  PLAYER_RADIUS,
  BALL_RADIUS,
  type HaxState,
  type Vec2,
} from "@/lib/games/haxball/physics";
import { GOAL_CAP } from "@/lib/games/haxball/reducer";

const SERVER_URL = process.env.NEXT_PUBLIC_HAXBALL_WS; // wss://haxball-eznii.fly.dev
const INPUT_HZ_MS = 33;        // send input ~30Hz (server runs its own 60Hz sim regardless)
const RENDER_DELAY_MS = 100;   // render this far in the past so we always interpolate between two real snapshots
const JOY_DEADZONE = 0.18;     // ignore tiny thumb wobble near the joystick centre

/**
 * Real-time 1v1 HaxBall. A dedicated WS server (server/haxball) runs the ONE
 * authoritative 60Hz physics sim; this client only sends input and renders the
 * snapshots it pushes.
 *
 * Netcode: pure snapshot interpolation, no client-side prediction. We buffer
 * incoming snapshots and render `RENDER_DELAY_MS` in the past, lerping between
 * the two snapshots that straddle that render time. Everything — your paddle,
 * the opponent, the ball — comes from the same server clock, so nothing
 * rubber-bands. Tradeoff: your own input shows the round-trip latency; that's
 * the standard, jitter-free HaxBall-clone model and is fine on normal pings.
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
  // Snapshot buffer for render interpolation: { at, s } sorted by arrival.
  const buffer = useRef<{ at: number; s: HaxState }[]>([]);
  // Clock offset: client perf-clock time that maps to "now" on the server stream.
  // We render at (latest packet arrival) - RENDER_DELAY_MS.
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
      let m: { t: string; s?: HaxState };
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t !== "state" || !m.s) return;
      const s = m.s;
      const buf = buffer.current;
      buf.push({ at: performance.now(), s });
      // Keep ~1s of history; drop the rest.
      if (buf.length > 64) buf.shift();
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

    return () => { ws.close(); };
    // hud read via closure; matchId/currentUserId/playable are the real deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playable, matchId, currentUserId]);

  // ── Send input at a fixed cadence (decoupled from render) ──────────────────
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

  // ── Render loop: draw the interpolated past ────────────────────────────────
  useEffect(() => {
    if (!playable) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const buf = buffer.current;
      if (buf.length === 0) return;

      // Render RENDER_DELAY_MS behind the newest packet so we sit between two
      // real snapshots and never extrapolate into the unknown.
      const renderAt = buf[buf.length - 1].at - RENDER_DELAY_MS;

      // Find the pair (a,b) straddling renderAt.
      let a = buf[0], b = buf[buf.length - 1];
      for (let k = 0; k < buf.length - 1; k++) {
        if (buf[k].at <= renderAt && buf[k + 1].at >= renderAt) {
          a = buf[k];
          b = buf[k + 1];
          break;
        }
      }
      const span = b.at - a.at;
      const t = span > 0 ? Math.max(0, Math.min(1, (renderAt - a.at) / span)) : 1;
      // A goal resets positions discontinuously; don't lerp across that.
      const snap = b.s.goalEvent != null ? b.s : lerpState(a.s, b.s, t);
      draw(ctx, snap);
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

/** Lerp positions between two snapshots (vel/scores from `b`). */
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
    // Deadzone: zero out tiny wobble, then rescale so the live range stays full 0..1.
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
        // Capture the pointer on this element so its moves keep firing even when
        // the thumb slides outside the circle. Track by buttons OR active touch.
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
