/**
 * HaxBall-style 1v1 physics core — pure, deterministic, framework-free.
 *
 * Design choices:
 *  - Fixed-timestep: caller drives the loop at TICK_MS; step() trusts dt.
 *  - No Math.random, no Date.now — same state+inputs+dt always yields the
 *    same next state. Safe to replay on clients for prediction.
 *  - Plain serializable objects throughout (JSON-broadcastable, fits a jsonb col).
 *  - Collision: elastic disc-disc (bCoef + invMass weighted), per-segment wall
 *    AABB with goal gaps cut out of the end walls.
 *  - Kick mechanic mirrors HaxBall: while kick=true AND the player is touching
 *    the ball, impart kickStrength along the contact normal each tick (capped so
 *    it fires once per contact window — see `kicked` flag on PlayerDisc).
 *
 * References:
 *  - HaxBall room physics defaults: haxball-issues #508, #480
 *  - HaxBall "Classic" stadium (420×200 field, 64-unit goal)
 *  - Elastic collision with coefficient of restitution:
 *      Δv = (1 + bCoef) * (relVel · n̂) / (invMassA + invMassB)
 */

// ---------------------------------------------------------------------------
// Tunable Constants
// ---------------------------------------------------------------------------

/** Fixed timestep the caller should use. All tuning values below assume 60 Hz. */
export const TICK_MS = 1000 / 60; // ~16.67 ms

// Field geometry (logical units — scale to canvas in the renderer, not here)
export const FIELD_W = 420;    // total field width  (goal line to goal line)
export const FIELD_H = 200;    // total field height (top to bottom wall)
export const GOAL_H  =  64;    // gap in the end wall — raised from Classic's 60 for mobile feel

// Derived geometry — computed once, immutable
export const HALF_W  = FIELD_W / 2;   // 210
export const HALF_H  = FIELD_H / 2;   // 100
export const GOAL_HALF = GOAL_H / 2;  // 32

// Player physics (HaxBall Classic defaults, slightly more forgiving for touch)
export const PLAYER_RADIUS          = 15;
export const PLAYER_INV_MASS        = 0.5;
export const PLAYER_BCOEF           = 0.5;
export const PLAYER_DAMPING         = 0.96;
export const PLAYER_ACCELERATION    = 0.10;  // raise → snappier; lower → floatier
export const PLAYER_KICK_ACCEL      = 0.07;  // lower accel while kick held (mirrors HaxBall)
export const PLAYER_KICK_STRENGTH   = 5.0;   // impulse on ball contact while kick held

// Ball physics
export const BALL_RADIUS    = 10;
export const BALL_INV_MASS  = 1.0;
export const BALL_BCOEF     = 0.5;
export const BALL_DAMPING   = 0.985;  // raise → livelier; lower → more friction. 0.99 rolled forever; 0.985 stops in ~3s at typical kick speed

// Velocity threshold below which a disc is considered "at rest" for sleep purposes
const SLEEP_THRESHOLD = 0.005;

// ---------------------------------------------------------------------------
// Types — plain serializable objects (no methods, no classes)
// ---------------------------------------------------------------------------

export interface Vec2 {
  x: number;
  y: number;
}

export interface Disc {
  pos:     Vec2;
  vel:     Vec2;
  radius:  number;
  invMass: number;  // 0 = immovable wall segment proxy
  bCoef:   number;  // coefficient of restitution [0..1]
  damping: number;  // velocity multiplier per tick [0..1]
}

export interface PlayerDisc extends Disc {
  team:    "A" | "B";
  kicking: boolean;  // input state — true while kick button held
  kicked:  boolean;  // true after kick impulse fired this contact; resets when contact ends
}

export interface HaxState {
  players: PlayerDisc[];      // index 0 = team A, index 1 = team B (1v1)
  ball:    Disc;
  scoreA:  number;
  scoreB:  number;
  tick:    number;
  /** Set for exactly one tick after a goal is scored; null otherwise. */
  goalEvent: "A" | "B" | null;
}

export interface PlayerInput {
  /** Unit-ish direction from joystick; magnitude 0..1 (zero = no input). */
  move: Vec2;
  kick: boolean;
}

export type InputMap = Record<string, PlayerInput>;

// ---------------------------------------------------------------------------
// Vec2 helpers — boring math, intentionally inline
// ---------------------------------------------------------------------------

function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
function scale(v: Vec2, s: number): Vec2 { return { x: v.x * s, y: v.y * s }; }
function dot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y; }
function len(v: Vec2): number { return Math.sqrt(v.x * v.x + v.y * v.y); }
function norm(v: Vec2): Vec2 {
  const l = len(v);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
}
function clampMag(v: Vec2, maxLen: number): Vec2 {
  const l = len(v);
  return l > maxLen ? scale(v, maxLen / l) : v;
}

// ---------------------------------------------------------------------------
// Deep clone — keeps step() pure (no mutation of input state)
// ---------------------------------------------------------------------------

function cloneState(s: HaxState): HaxState {
  return {
    players:    s.players.map(p => ({ ...p, pos: { ...p.pos }, vel: { ...p.vel } })),
    ball:       { ...s.ball, pos: { ...s.ball.pos }, vel: { ...s.ball.vel } },
    scoreA:     s.scoreA,
    scoreB:     s.scoreB,
    tick:       s.tick,
    goalEvent:  s.goalEvent,
  };
}

// ---------------------------------------------------------------------------
// Wall segments — the field boundary minus goal gaps
//
// The field is axis-aligned:
//   Top wall:    y = -HALF_H  (full width)
//   Bottom wall: y = +HALF_H  (full width)
//   Left wall:   x = -HALF_W  (split into two segments with goal gap at y=0)
//   Right wall:  x = +HALF_W  (same)
//
// We resolve disc-wall collisions by finding the closest point on each segment
// and applying an elastic response along the contact normal.
// ---------------------------------------------------------------------------

interface Segment {
  /** Start and end of segment (in field space, origin = center). */
  a: Vec2;
  b: Vec2;
  /** Normal pointing inward (into the playable area). */
  normal: Vec2;
  bCoef: number;
}

// HaxBall Classic: walls have zero restitution (absorb, don't bounce).
// bCoef=0.5 here caused the ball to ping/buzz against walls at rest; 0.0 = dead stop.
const WALL_BCOEF = 0.0;

// Top wall (normal points down = +y inward from -HALF_H boundary)
// Bottom wall (normal points up = -y inward from +HALF_H boundary)
// Left wall top piece and bottom piece (normal points right = +x)
// Right wall top piece and bottom piece (normal points left = -x)
const WALL_SEGMENTS: Segment[] = [
  // Top wall
  { a: { x: -HALF_W, y: -HALF_H }, b: { x: HALF_W, y: -HALF_H }, normal: { x:  0, y:  1 }, bCoef: WALL_BCOEF },
  // Bottom wall
  { a: { x:  HALF_W, y:  HALF_H }, b: { x: -HALF_W, y: HALF_H }, normal: { x:  0, y: -1 }, bCoef: WALL_BCOEF },
  // Left wall — top piece (above goal)
  { a: { x: -HALF_W, y: -HALF_H }, b: { x: -HALF_W, y: -GOAL_HALF }, normal: { x:  1, y:  0 }, bCoef: WALL_BCOEF },
  // Left wall — bottom piece (below goal)
  { a: { x: -HALF_W, y:  GOAL_HALF }, b: { x: -HALF_W, y: HALF_H },  normal: { x:  1, y:  0 }, bCoef: WALL_BCOEF },
  // Right wall — top piece
  { a: { x:  HALF_W, y: -HALF_H }, b: { x: HALF_W, y: -GOAL_HALF },  normal: { x: -1, y:  0 }, bCoef: WALL_BCOEF },
  // Right wall — bottom piece
  { a: { x:  HALF_W, y:  GOAL_HALF }, b: { x: HALF_W, y: HALF_H },   normal: { x: -1, y:  0 }, bCoef: WALL_BCOEF },
];

/**
 * Closest point on segment [a,b] to point p.
 * Returns the point and the parameter t in [0,1].
 */
function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): { pt: Vec2; t: number } {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const lenSq = dot(ab, ab);
  if (lenSq < 1e-9) return { pt: a, t: 0 };
  const t = Math.max(0, Math.min(1, dot(ap, ab) / lenSq));
  return { pt: add(a, scale(ab, t)), t };
}

// ---------------------------------------------------------------------------
// Collision resolution
// ---------------------------------------------------------------------------

/**
 * Resolve elastic disc-disc collision in place.
 * Uses the standard coefficient-of-restitution impulse formula:
 *   combined bCoef = sqrt(bCoefA * bCoefB)  (HaxBall's approach)
 *   impulse j = (1 + e) * (relVel · n̂) / (invMassA + invMassB)
 *   then applie -j*n̂ to A and +j*n̂ to B
 */
function resolveDiscDisc(a: Disc, b: Disc): void {
  const delta = sub(b.pos, a.pos);
  const dist  = len(delta);
  const minDist = a.radius + b.radius;
  if (dist >= minDist || dist < 1e-9) return;

  const n = norm(delta);
  // Separate (positional correction) — split by invMass ratio
  const overlap = minDist - dist;
  const totalInvMass = a.invMass + b.invMass;
  if (totalInvMass > 0) {
    a.pos = sub(a.pos, scale(n, overlap * (a.invMass / totalInvMass)));
    b.pos = add(b.pos, scale(n, overlap * (b.invMass / totalInvMass)));
  }

  // Velocity response
  const relVel = dot(sub(b.vel, a.vel), n);
  if (relVel >= 0) return; // already separating
  const e = Math.sqrt(a.bCoef * b.bCoef); // combined restitution
  const j = (1 + e) * relVel / totalInvMass;
  a.vel = add(a.vel, scale(n, j * a.invMass));
  b.vel = sub(b.vel, scale(n, j * b.invMass));
}

/**
 * Resolve disc against a wall segment in place.
 * Wall has infinite mass (invMass = 0 effectively).
 */
function resolveDiscWall(d: Disc, seg: Segment): void {
  const { pt, t } = closestPointOnSegment(d.pos, seg.a, seg.b);
  const delta = sub(d.pos, pt);
  const dist  = len(delta);
  if (dist >= d.radius || dist < 1e-9) return;

  // At a corner the closest point is a segment endpoint (t≈0 or t≈1). Using the
  // segment's axis normal there pushes the disc along one axis only, trapping it
  // against the adjacent wall (ball sticks in corners with WALL_BCOEF=0). Use the
  // true vertex→disc direction instead so the disc is shoved out diagonally.
  const atCorner = t < 1e-6 || t > 1 - 1e-6;
  const n = atCorner ? norm(delta) : seg.normal;
  if (len(n) < 1e-9) return;

  // Positional correction — push disc out along the contact normal
  const overlap = d.radius - dist;
  d.pos = add(d.pos, scale(n, overlap));

  // Velocity response — reflect along normal
  const relVel = dot(d.vel, n);
  if (relVel >= 0) return; // already moving away
  const e = Math.sqrt(d.bCoef * seg.bCoef);
  d.vel = sub(d.vel, scale(n, (1 + e) * relVel));
}

// ---------------------------------------------------------------------------
// Goal detection
// ---------------------------------------------------------------------------

/**
 * Returns 'A' if team A scored (ball fully inside right goal x > HALF_W),
 * 'B' if team B scored (ball fully inside left goal x < -HALF_W), else null.
 * Ball must be fully through the goal line (center + radius), vertically within
 * the goal gap.
 */
function detectGoal(ball: Disc): "A" | "B" | null {
  const inGoalY = Math.abs(ball.pos.y) <= GOAL_HALF; // vertically in goal mouth
  if (!inGoalY) return null;
  if (ball.pos.x - ball.radius >  HALF_W) return "A"; // ball fully past right → A scores
  if (ball.pos.x + ball.radius < -HALF_W) return "B"; // ball fully past left  → B scores
  return null;
}

// ---------------------------------------------------------------------------
// Initial/reset state
// ---------------------------------------------------------------------------

export function createInitialState(): HaxState {
  // ponytail: team size expansion — add more PlayerDiscs here and update spawn logic
  return {
    players: [
      {
        pos:     { x: -80, y: 0 },
        vel:     { x:   0, y: 0 },
        radius:  PLAYER_RADIUS,
        invMass: PLAYER_INV_MASS,
        bCoef:   PLAYER_BCOEF,
        damping: PLAYER_DAMPING,
        team:    "A",
        kicking: false,
        kicked:  false,
      },
      {
        pos:     { x:  80, y: 0 },
        vel:     { x:   0, y: 0 },
        radius:  PLAYER_RADIUS,
        invMass: PLAYER_INV_MASS,
        bCoef:   PLAYER_BCOEF,
        damping: PLAYER_DAMPING,
        team:    "B",
        kicking: false,
        kicked:  false,
      },
    ],
    ball: {
      pos:     { x: 0, y: 0 },
      vel:     { x: 0, y: 0 },
      radius:  BALL_RADIUS,
      invMass: BALL_INV_MASS,
      bCoef:   BALL_BCOEF,
      damping: BALL_DAMPING,
    },
    scoreA:    0,
    scoreB:    0,
    tick:      0,
    goalEvent: null,
  };
}

export function resetKickoff(state: HaxState, scoringTeam: "A" | "B"): HaxState {
  const next = cloneState(state);
  // Ball back to centre
  next.ball.pos = { x: 0, y: 0 };
  next.ball.vel = { x: 0, y: 0 };
  // Players back to kickoff positions; conceding team starts with ball
  // (scoring team kicks off in real football, mirroring that here)
  next.players[0].pos = { x: scoringTeam === "A" ? -80 : -100, y: 0 };
  next.players[0].vel = { x: 0, y: 0 };
  next.players[0].kicked = false;
  next.players[1].pos = { x: scoringTeam === "B" ?  80 :  100, y: 0 };
  next.players[1].vel = { x: 0, y: 0 };
  next.players[1].kicked = false;
  next.goalEvent = null;
  return next;
}

// ---------------------------------------------------------------------------
// Main step function
// ---------------------------------------------------------------------------

/**
 * Advance the simulation by one fixed tick.
 *
 * @param state  - current simulation state (not mutated)
 * @param inputs - map of playerId ("p0", "p1") → PlayerInput
 * @param dt     - elapsed time for this tick in SECONDS (typically TICK_MS/1000)
 * @returns      - new simulation state
 *
 * Deterministic contract: no Math.random, no Date.now.
 * Same (state, inputs, dt) → same result. Always.
 */
export function step(state: HaxState, inputs: InputMap, dt: number): HaxState {
  const s = cloneState(state);
  s.tick += 1;
  s.goalEvent = null;

  // ── 1. Apply player input (acceleration) ──────────────────────────────────
  s.players.forEach((p, i) => {
    const input = inputs[`p${i}`];
    if (!input) return;

    p.kicking = input.kick;

    // Clamp joystick input magnitude to 1 (unit-ish)
    const dir = clampMag(input.move, 1);
    const accel = p.kicking ? PLAYER_KICK_ACCEL : PLAYER_ACCELERATION;

    // Add acceleration force (F = a * dir, already per-tick so multiply by dt*60
    // to be framerate-independent relative to our reference 60 Hz)
    p.vel = add(p.vel, scale(dir, accel * dt * 60));
  });

  // ── 2. Integrate velocity + apply damping ─────────────────────────────────
  const allDiscs: Disc[] = [...s.players, s.ball];

  for (const d of allDiscs) {
    // Apply damping first so the disc decelerates smoothly into the sleep threshold
    // rather than integrating a full step and then snapping to zero next tick.
    d.vel = scale(d.vel, d.damping);
    // Sleep: zero velocity below threshold to avoid fp drift at rest
    if (Math.abs(d.vel.x) < SLEEP_THRESHOLD && Math.abs(d.vel.y) < SLEEP_THRESHOLD) {
      d.vel = { x: 0, y: 0 };
    } else {
      d.pos = add(d.pos, scale(d.vel, dt * 60)); // integrate (units/tick at 60Hz reference)
    }
  }

  // ── 3. Disc-disc collisions ────────────────────────────────────────────────
  // 1v1: player0-ball, player1-ball, player0-player1
  // For nv n expansion, make this O(n²) over allDiscs — a later config change.
  resolveDiscDisc(s.players[0], s.ball);
  resolveDiscDisc(s.players[1], s.ball);
  resolveDiscDisc(s.players[0], s.players[1]);

  // ── 4. Kick impulse ───────────────────────────────────────────────────────
  // Fire once per contact window: when kick=true AND player touches ball AND
  // hasn't already fired this contact (kicked=false).
  // Mirrors HaxBall's kick-fires-on-contact-while-held model.
  s.players.forEach(p => {
    if (!p.kicking) {
      p.kicked = false; // reset so next contact can kick
      return;
    }

    const delta = sub(s.ball.pos, p.pos);
    const dist  = len(delta);
    const touching = dist < p.radius + s.ball.radius + 0.5; // small epsilon for touch detection

    if (touching && !p.kicked) {
      const n = dist > 1e-9 ? norm(delta) : { x: p.team === "A" ? 1 : -1, y: 0 };
      s.ball.vel = add(s.ball.vel, scale(n, PLAYER_KICK_STRENGTH));
      p.kicked = true;
    } else if (!touching) {
      p.kicked = false; // left contact range, ready to kick again on re-entry
    }
  });

  // ── 5. Wall collisions ────────────────────────────────────────────────────
  for (const seg of WALL_SEGMENTS) {
    for (const d of allDiscs) {
      resolveDiscWall(d, seg);
    }
  }

  // ── 6. Goal detection ─────────────────────────────────────────────────────
  const goal = detectGoal(s.ball);
  if (goal !== null) {
    if (goal === "A") s.scoreA += 1;
    else              s.scoreB += 1;
    s.goalEvent = goal;
    // Caller should call resetKickoff() on the next tick when goalEvent is set.
    // We do NOT auto-reset here so the caller can show a celebration frame.
  }

  return s;
}

// ---------------------------------------------------------------------------
// Self-check (npx tsx src/lib/games/haxball/physics.ts)
// ---------------------------------------------------------------------------

function demo(): void {
  let pass = 0;
  let fail = 0;

  function assert(cond: boolean, msg: string): void {
    if (cond) {
      console.log(`  PASS  ${msg}`);
      pass++;
    } else {
      console.error(`  FAIL  ${msg}`);
      fail++;
    }
  }

  const DT = TICK_MS / 1000;

  // ── Test 1: Ball at rest stays at rest (damping + sleep) ──────────────────
  {
    let s = createInitialState();
    for (let i = 0; i < 120; i++) s = step(s, {}, DT);
    assert(
      Math.abs(s.ball.vel.x) < 1e-6 && Math.abs(s.ball.vel.y) < 1e-6,
      "Ball at rest stays at rest after 120 ticks (damping/sleep)"
    );
    assert(
      Math.abs(s.ball.pos.x) < 1e-4 && Math.abs(s.ball.pos.y) < 1e-4,
      "Ball position stable at origin after 120 idle ticks"
    );
  }

  // ── Test 2: Player accelerating into ball moves it ─────────────────────────
  {
    let s = createInitialState();
    // Drive player 0 (team A, starts at x=-80) rightward toward the ball at x=0
    const inputs: InputMap = { p0: { move: { x: 1, y: 0 }, kick: false } };
    for (let i = 0; i < 60; i++) s = step(s, inputs, DT);
    assert(
      s.ball.vel.x > 0.1,
      `Player running into ball moves it rightward (ball.vel.x=${s.ball.vel.x.toFixed(3)})`
    );
  }

  // ── Test 3: Kick imparts more velocity than passive bump ───────────────────
  {
    // Baseline: passive bump speed
    let sPassive = createInitialState();
    const bumpInputs: InputMap = { p0: { move: { x: 1, y: 0 }, kick: false } };
    for (let i = 0; i < 60; i++) sPassive = step(sPassive, bumpInputs, DT);
    const passiveBallSpeed = len(sPassive.ball.vel);

    // With kick
    let sKick = createInitialState();
    const kickInputs: InputMap = { p0: { move: { x: 1, y: 0 }, kick: true } };
    for (let i = 0; i < 60; i++) sKick = step(sKick, kickInputs, DT);
    const kickBallSpeed = len(sKick.ball.vel);

    assert(
      kickBallSpeed > passiveBallSpeed,
      `Kick (${kickBallSpeed.toFixed(3)}) imparts more speed than passive bump (${passiveBallSpeed.toFixed(3)})`
    );
  }

  // ── Test 4: Ball stops at right wall (Classic WALL_BCOEF=0 → dead stop, not bounce) ──
  {
    let s = createInitialState();
    // Give ball a strong rightward velocity, outside goal mouth so it hits wall, not goal
    s.ball.vel = { x: 8, y: 0 };
    s.ball.pos = { x: 0, y: GOAL_HALF + BALL_RADIUS + 5 };
    for (let i = 0; i < 120; i++) s = step(s, {}, DT);
    // With WALL_BCOEF=0 (Classic HaxBall) restitution is 0: vel killed on contact,
    // ball clamped at the wall face. Should not pass through and should not bounce back.
    assert(
      s.ball.pos.x <= HALF_W + BALL_RADIUS &&
      Math.abs(s.ball.vel.x) < 1.0,
      `Ball stops at right wall — pos.x=${s.ball.pos.x.toFixed(2)}, vel.x=${s.ball.vel.x.toFixed(3)}`
    );
  }

  // ── Test 5: Ball in goal mouth scores ─────────────────────────────────────
  {
    let s = createInitialState();
    // Place ball fully through the right goal line, centred vertically
    s.ball.pos = { x: HALF_W + BALL_RADIUS + 1, y: 0 };
    s.ball.vel = { x: 3, y: 0 };
    s = step(s, {}, DT);
    assert(
      s.goalEvent === "A" && s.scoreA === 1,
      `Ball fully past right line scores for team A (scoreA=${s.scoreA}, goalEvent=${s.goalEvent})`
    );
  }

  // ── Test 6: Ball outside goal height does NOT score ───────────────────────
  {
    let s = createInitialState();
    s.ball.pos = { x: HALF_W + BALL_RADIUS + 1, y: GOAL_HALF + 5 };
    s.ball.vel = { x: 3, y: 0 };
    s = step(s, {}, DT);
    assert(
      s.goalEvent === null,
      "Ball past goal line but outside goal height does not score"
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${pass + fail} checks | ${pass} passed | ${fail} failed`);
  if (fail > 0) process.exit(1);
}

// Detect if run directly via tsx/ts-node (no require.main in ESM, so check argv)
if (
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].includes("physics")
) {
  console.log("HaxBall physics self-check\n");
  demo();
}
