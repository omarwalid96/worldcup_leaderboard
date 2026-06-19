/**
 * HaxBall realtime server — the ONE always-on process the serverless app can't host.
 * Runs the authoritative 60Hz physics loop per room; clients just send input and
 * render the state it pushes. Deployed standalone to Fly.io (see fly.toml).
 *
 *   node --env-file=.env.local server/haxball/index.ts   # local
 *
 * It imports the SAME physics.ts the client uses — one source of truth, no fork.
 * Match goes 'finished' via the app's own applyMove when a client reports the cap;
 * this server only simulates + relays (it has no business writing scores).
 */
import { WebSocketServer, WebSocket } from "ws";
import postgres from "postgres";
import {
  step,
  createInitialState,
  resetKickoff,
  TICK_MS,
  type HaxState,
  type InputMap,
} from "../../src/lib/games/haxball/physics.ts";

const PORT = Number(process.env.PORT ?? 8080);
const BROADCAST_EVERY = 1; // push every tick = 60Hz (1v1 bandwidth is trivial)
const EMPTY_ROOM_TTL = 30_000; // drop a room 30s after the last client leaves
const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 4 });

interface Client { ws: WebSocket; slot: "p0" | "p1"; }
interface Room {
  state: HaxState;
  inputs: InputMap;            // { p0, p1 }
  clients: Set<Client>;
  loop: ReturnType<typeof setInterval> | null;
  emptySince: number | null;
}
const rooms = new Map<string, Room>();

/** Trust boundary: never feed raw client JSON into step(). Client sends a flat
 *  { x, y, kick }; coerce+clamp to { move:{x,y in [-1,1]}, kick:bool }; garbage → no-op. */
function normInput(raw: unknown): InputMap[string] {
  const o = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  return { move: { x: num(o.x), y: num(o.y) }, kick: o.kick === true };
}

/** matchId → its two player ids (cached; the row is immutable for our purposes). */
const playerCache = new Map<string, { p1: string; p2: string | null }>();
async function players(matchId: string) {
  if (playerCache.has(matchId)) return playerCache.get(matchId)!;
  const [row] = await sql<{ player1_id: string; player2_id: string | null; game_type: string }[]>`
    select player1_id, player2_id, game_type from game_matches where id = ${matchId} limit 1`;
  if (!row || row.game_type !== "haxball_duel") return null;
  const v = { p1: row.player1_id, p2: row.player2_id };
  playerCache.set(matchId, v);
  return v;
}

function startLoop(id: string, room: Room) {
  if (room.loop) return;
  let tick = 0;
  room.loop = setInterval(() => {
    room.state = step(room.state, room.inputs, TICK_MS / 1000);
    if (room.state.goalEvent) room.state = resetKickoff(room.state, room.state.goalEvent);
    if (++tick % BROADCAST_EVERY === 0) {
      const msg = JSON.stringify({ t: "state", s: room.state });
      for (const c of room.clients) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(msg);
    }
  }, TICK_MS);
}

const wss = new WebSocketServer({ host: "0.0.0.0", port: PORT });
console.log(`haxball server on :${PORT}`);

wss.on("connection", (ws) => {
  let room: Room | null = null;
  let me: Client | null = null;

  ws.on("message", async (buf) => {
    let m: { t: string; matchId?: string; userId?: string; move?: unknown };
    try { m = JSON.parse(buf.toString()); } catch { return; }

    if (m.t === "join" && m.matchId && m.userId) {
      let p;
      try { p = await players(m.matchId); }
      catch { return ws.close(1011, "lookup failed"); } // never leave the socket hanging
      if (!p) return ws.close(1008, "no match");
      const slot = m.userId === p.p1 ? "p0" : m.userId === p.p2 ? "p1" : null;
      if (!slot) return ws.close(1008, "not a player"); // light auth: must be one of the two

      room = rooms.get(m.matchId) ?? null;
      if (!room) {
        room = {
          state: createInitialState(),
          inputs: { p0: { move: { x: 0, y: 0 }, kick: false }, p1: { move: { x: 0, y: 0 }, kick: false } },
          clients: new Set(),
          loop: null,
          emptySince: null,
        };
        rooms.set(m.matchId, room);
      }
      me = { ws, slot };
      room.clients.add(me);
      room.emptySince = null;
      startLoop(m.matchId, room);
      ws.send(JSON.stringify({ t: "joined", slot }));
      return;
    }

    if (m.t === "input" && room && me) {
      room.inputs[me.slot] = normInput(m.move);
    }
  });

  ws.on("close", () => {
    if (!room || !me) return;
    room.clients.delete(me);
    // Stop input from a gone player so their disc doesn't drift on stale input.
    room.inputs[me.slot] = { move: { x: 0, y: 0 }, kick: false };
    if (room.clients.size === 0) room.emptySince = Date.now();
  });
});

// ponytail: single sweep timer reaps idle rooms — no per-room teardown bookkeeping.
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL) {
      if (room.loop) clearInterval(room.loop);
      rooms.delete(id);
    }
  }
}, 10_000);
