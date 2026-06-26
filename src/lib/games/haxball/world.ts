/**
 * HaxBall 1v1 physics — built on planck.js (Box2D port).
 *
 * Why a real engine: the hand-rolled integrator gave floaty, inconsistent
 * control and a ball that wouldn't carry momentum. Box2D solves disc-disc
 * collision, restitution, friction and continuous collision (no tunneling)
 * correctly, so the ball behaves like a ball and the player like a player.
 *
 * Control model: the PLAYER is velocity-driven (we set its linearVelocity toward
 * the joystick each tick) — this is what makes steering crisp and predictable,
 * unlike accelerate-and-hope. The BALL is a free dynamic body that only reacts
 * to contacts/kicks, so it keeps its speed and rolls.
 *
 * Determinism: fixed 60Hz step, fixed solver iterations, no Math.random/Date.
 * Same world + same inputs ⇒ same next state. Server is authoritative; the
 * client runs the SAME module to predict its own paddle (one source of truth).
 *
 * Units are METRES (Box2D's sweet spot). The renderer scales metres→pixels.
 */
import {
  World,
  Vec2,
  Circle,
  Edge,
  type Body,
} from "planck";

// ── Field geometry (metres). 42×20 m ≈ the Classic 420×200 feel at 1m=10px. ──
export const FIELD_W = 42;
export const FIELD_H = 20;
export const HALF_W = FIELD_W / 2;
export const HALF_H = FIELD_H / 2;
export const GOAL_H = 7;                 // goal mouth height
export const GOAL_HALF = GOAL_H / 2;

export const PLAYER_RADIUS = 1.5;
export const BALL_RADIUS = 1.0;

// Tuning — these are the knobs that decide "feel".
// PLAYER_SPEED / PLAYER_ACCEL_LERP / PLAYER_DAMPING are EXPORTED because the
// client mirrors drivePlayer() for prediction — single source of truth, no drift.
export const PLAYER_SPEED = 13;        // m/s the paddle moves at full joystick (crisp top speed)
export const PLAYER_ACCEL_LERP = 0.45; // 0..1: how fast velocity reaches the target (snappier)
export const PLAYER_DAMPING = 7;       // high damping so the paddle stops when you release (no drift)
const KICK_IMPULSE = 16;        // ball speed kick adds along aim — fast, snappy shots
const BALL_DAMPING = 0.25;      // lower damping → ball keeps its pace longer (faster feel)
const BALL_RESTITUTION = 0.78;  // bouncy: lively rebounds off walls and players

// Player must massively out-mass the ball so a contact always shoves the ball
// OUT cleanly instead of the disc sinking into / overlapping it. With POS_ITERS
// high, Box2D fully resolves the overlap each tick → you collide, never overlay.
const PLAYER_DENSITY = 20;
const BALL_DENSITY = 1;
const PLAYER_BALL_RESTITUTION = 0.45; // a running shoulder-barge still pops the ball

const VEL_ITERS = 10;          // Box2D solver iterations (fixed for determinism)
const POS_ITERS = 8;           // high → overlap is pushed out fully each tick (no sink-in)
export const DT = 1 / 60;

// ── Wire snapshot — compact, JSON/jsonb friendly, what the server broadcasts ──
export interface Snap {
  /** [x,y] metres for player A, player B, ball. */
  pa: [number, number];
  pb: [number, number];
  ball: [number, number];
  /** velocities (for client-side smoothing / debugging). */
  va: [number, number];
  vb: [number, number];
  vball: [number, number];
  ka: boolean;   // A kicking (ring highlight)
  kb: boolean;
  scoreA: number;
  scoreB: number;
  goal: "A" | "B" | null;  // set for one tick after a goal
}

export interface Input {
  x: number;     // joystick, -1..1
  y: number;
  kick: boolean;
}

export interface Sim {
  world: World;
  pa: Body;
  pb: Body;
  ball: Body;
  scoreA: number;
  scoreB: number;
  kickedA: boolean;  // edge-trigger: fired this contact
  kickedB: boolean;
}

const ZERO: Input = { x: 0, y: 0, kick: false };

// ── Build a fresh world ──────────────────────────────────────────────────────
export function createSim(): Sim {
  const world = new World({ gravity: new Vec2(0, 0) });

  // Static walls as edges; goal mouths left open for the ball.
  const wall = (x1: number, y1: number, x2: number, y2: number) => {
    const b = world.createBody();
    b.createFixture({ shape: new Edge(new Vec2(x1, y1), new Vec2(x2, y2)), restitution: 0.5, friction: 0 });
    return b;
  };
  // Top & bottom (full width)
  wall(-HALF_W, -HALF_H, HALF_W, -HALF_H);
  wall(-HALF_W, HALF_H, HALF_W, HALF_H);
  // Left wall, split around the goal gap
  wall(-HALF_W, -HALF_H, -HALF_W, -GOAL_HALF);
  wall(-HALF_W, GOAL_HALF, -HALF_W, HALF_H);
  // Right wall, split around the goal gap
  wall(HALF_W, -HALF_H, HALF_W, -GOAL_HALF);
  wall(HALF_W, GOAL_HALF, HALF_W, HALF_H);

  // Player-only barriers across each goal mouth (group index -1 so the BALL,
  // also -1? no — we use a dedicated category). Simpler: give these a filter that
  // collides with players only. We tag player bodies and these barriers in one
  // category, ball in another.
  const goalBar = (x: number) => {
    const b = world.createBody();
    b.createFixture({
      shape: new Edge(new Vec2(x, -GOAL_HALF), new Vec2(x, GOAL_HALF)),
      restitution: 0.3,
      friction: 0,
      filterCategoryBits: CAT_GOALBAR,
      filterMaskBits: CAT_PLAYER, // only players hit it; ball passes through to score
    });
    return b;
  };
  goalBar(-HALF_W);
  goalBar(HALF_W);

  const pa = makePlayer(world, -HALF_W * 0.4, 0);
  const pb = makePlayer(world, HALF_W * 0.4, 0);
  const ball = makeBall(world);

  return { world, pa, pb, ball, scoreA: 0, scoreB: 0, kickedA: false, kickedB: false };
}

// Collision categories so the goal-mouth barrier blocks players but not the ball.
const CAT_PLAYER = 0x0002;
const CAT_BALL = 0x0004;
const CAT_GOALBAR = 0x0008;
const CAT_WALL = 0x0001;

function makePlayer(world: World, x: number, y: number): Body {
  const b = world.createDynamicBody({ position: new Vec2(x, y), linearDamping: PLAYER_DAMPING, fixedRotation: true });
  b.createFixture({
    shape: new Circle(PLAYER_RADIUS),
    density: PLAYER_DENSITY,   // massively heavier than the ball → clean shove, no overlap
    restitution: PLAYER_BALL_RESTITUTION,
    friction: 0,
    filterCategoryBits: CAT_PLAYER,
    filterMaskBits: CAT_WALL | CAT_BALL | CAT_GOALBAR | CAT_PLAYER,
  });
  return b;
}

function makeBall(world: World): Body {
  // bullet=true → continuous collision: the fast ball can't tunnel into the
  // player or sink past a wall in a single tick. This is what keeps "collide,
  // never overlay" true even at high kick speeds.
  const b = world.createDynamicBody({ position: new Vec2(0, 0), linearDamping: BALL_DAMPING, fixedRotation: true, bullet: true });
  b.createFixture({
    shape: new Circle(BALL_RADIUS),
    density: BALL_DENSITY,
    restitution: BALL_RESTITUTION,
    friction: 0,
    filterCategoryBits: CAT_BALL,
    filterMaskBits: CAT_WALL | CAT_PLAYER, // NOT the goal barrier → can enter the goal
  });
  return b;
}

// ── Advance one fixed tick ───────────────────────────────────────────────────
/** Returns the goal scored this tick ("A"/"B") or null. Mutates the sim. */
export function step(sim: Sim, ia: Input, ib: Input): "A" | "B" | null {
  drivePlayer(sim.pa, ia);
  drivePlayer(sim.pb, ib);

  // Kick: impulse on the ball when touching + kick held, once per contact.
  sim.kickedA = applyKick(sim.pa, sim.ball, ia, sim.kickedA);
  sim.kickedB = applyKick(sim.pb, sim.ball, ib, sim.kickedB);

  sim.world.step(DT, VEL_ITERS, POS_ITERS);

  // Goal detection: ball centre past a goal line, within the mouth height.
  const bp = sim.ball.getPosition();
  let goal: "A" | "B" | null = null;
  if (Math.abs(bp.y) <= GOAL_HALF) {
    if (bp.x - BALL_RADIUS > HALF_W) goal = "A";      // into right goal → A scores
    else if (bp.x + BALL_RADIUS < -HALF_W) goal = "B"; // into left goal → B scores
  }
  if (goal) {
    if (goal === "A") sim.scoreA++; else sim.scoreB++;
    kickoff(sim, goal);
  }
  return goal;
}

function drivePlayer(body: Body, i: Input): void {
  // Target velocity = joystick direction × top speed. Lerp current→target so it
  // feels responsive but not robotic. Damping handles the stop on release.
  const mag = Math.hypot(i.x, i.y);
  const tx = mag > 0.01 ? (i.x / Math.max(mag, 1)) * PLAYER_SPEED : 0;
  const ty = mag > 0.01 ? (i.y / Math.max(mag, 1)) * PLAYER_SPEED : 0;
  const v = body.getLinearVelocity();
  body.setLinearVelocity(new Vec2(
    v.x + (tx - v.x) * PLAYER_ACCEL_LERP,
    v.y + (ty - v.y) * PLAYER_ACCEL_LERP,
  ));
}

function applyKick(player: Body, ball: Body, i: Input, kicked: boolean): boolean {
  if (!i.kick) return false;
  const pp = player.getPosition(), bp = ball.getPosition();
  const dx = bp.x - pp.x, dy = bp.y - pp.y;
  const dist = Math.hypot(dx, dy);
  const touching = dist < PLAYER_RADIUS + BALL_RADIUS + 0.3;
  if (touching && !kicked) {
    // Aim toward joystick if pushed, else away from the player.
    const am = Math.hypot(i.x, i.y);
    const nx = am > 0.1 ? i.x / am : dist > 1e-6 ? dx / dist : 1;
    const ny = am > 0.1 ? i.y / am : dist > 1e-6 ? dy / dist : 0;
    const v = ball.getLinearVelocity();
    ball.setLinearVelocity(new Vec2(v.x + nx * KICK_IMPULSE, v.y + ny * KICK_IMPULSE));
    return true;
  }
  return touching ? kicked : false;
}

export function kickoff(sim: Sim, scoringTeam: "A" | "B"): void {
  sim.ball.setPosition(new Vec2(0, 0));
  sim.ball.setLinearVelocity(new Vec2(0, 0));
  sim.pa.setPosition(new Vec2(-HALF_W * (scoringTeam === "A" ? 0.4 : 0.5), 0));
  sim.pa.setLinearVelocity(new Vec2(0, 0));
  sim.pb.setPosition(new Vec2(HALF_W * (scoringTeam === "B" ? 0.4 : 0.5), 0));
  sim.pb.setLinearVelocity(new Vec2(0, 0));
  sim.kickedA = false;
  sim.kickedB = false;
}

// ── (De)serialize for the wire ───────────────────────────────────────────────
export function snapshot(sim: Sim, ia: Input, ib: Input, goal: "A" | "B" | null): Snap {
  const xy = (b: Body): [number, number] => { const p = b.getPosition(); return [p.x, p.y]; };
  const vxy = (b: Body): [number, number] => { const v = b.getLinearVelocity(); return [v.x, v.y]; };
  return {
    pa: xy(sim.pa), pb: xy(sim.pb), ball: xy(sim.ball),
    va: vxy(sim.pa), vb: vxy(sim.pb), vball: vxy(sim.ball),
    ka: ia.kick, kb: ib.kick,
    scoreA: sim.scoreA, scoreB: sim.scoreB, goal,
  };
}

/** Apply a server snapshot onto a local sim (client reconciliation). */
export function applySnap(sim: Sim, s: Snap): void {
  sim.pa.setPosition(new Vec2(s.pa[0], s.pa[1]));
  sim.pb.setPosition(new Vec2(s.pb[0], s.pb[1]));
  sim.ball.setPosition(new Vec2(s.ball[0], s.ball[1]));
  sim.pa.setLinearVelocity(new Vec2(s.va[0], s.va[1]));
  sim.pb.setLinearVelocity(new Vec2(s.vb[0], s.vb[1]));
  sim.ball.setLinearVelocity(new Vec2(s.vball[0], s.vball[1]));
  sim.scoreA = s.scoreA;
  sim.scoreB = s.scoreB;
}

export const _internal = { ZERO, PLAYER_SPEED, KICK_IMPULSE };
