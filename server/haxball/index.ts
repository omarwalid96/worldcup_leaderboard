/**
 * HaxBall realtime server — authoritative 60Hz planck.js physics per room.
 * Clients send input; the server simulates and broadcasts compact snapshots.
 *
 *   node --env-file=.env.local server/haxball/index.ts   # local
 *
 * Imports the SAME world.ts the client uses — one source of truth, no fork.
 * Match goes 'finished' via the app's own applyMove when a client reports the
 * cap; this server only simulates + relays.
 */
import { WebSocketServer, WebSocket } from "ws";
import postgres from "postgres";
import {
  createSim,
  step,
  snapshot,
  DT,
  type Sim,
  type Input,
} from "../../src/lib/games/haxball/world.ts";

const PORT = Number(process.env.PORT ?? 8080);
// Sim runs at 60Hz; broadcast every 2nd tick = 30Hz. Clients interpolate.
const BROADCAST_EVERY = 2;
const EMPTY_ROOM_TTL = 30_000;
const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 4 });

const ZERO: Input = { x: 0, y: 0, kick: false };

interface Client { ws: WebSocket; slot: "p0" | "p1"; }
interface Room {
  sim: Sim;
  inputs: { p0: Input; p1: Input };
  clients: Set<Client>;
  loop: ReturnType<typeof setInterval> | null;
  emptySince: number | null;
}
const rooms = new Map<string, Room>();

/** Trust boundary: never feed raw client JSON into the sim. */
function normInput(raw: unknown): Input {
  const o = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  return { x: num(o.x), y: num(o.y), kick: o.kick === true };
}

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

function startLoop(room: Room) {
  if (room.loop) return;
  let tick = 0;
  room.loop = setInterval(() => {
    const goal = step(room.sim, room.inputs.p0, room.inputs.p1);
    if (++tick % BROADCAST_EVERY === 0 || goal) {
      const snap = snapshot(room.sim, room.inputs.p0, room.inputs.p1, goal);
      const msg = JSON.stringify({ t: "state", s: snap });
      for (const c of room.clients) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(msg);
    }
  }, DT * 1000);
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
      catch { return ws.close(1011, "lookup failed"); }
      if (!p) return ws.close(1008, "no match");
      const slot = m.userId === p.p1 ? "p0" : m.userId === p.p2 ? "p1" : null;
      if (!slot) return ws.close(1008, "not a player");

      room = rooms.get(m.matchId) ?? null;
      if (!room) {
        room = {
          sim: createSim(),
          inputs: { p0: { ...ZERO }, p1: { ...ZERO } },
          clients: new Set(),
          loop: null,
          emptySince: null,
        };
        rooms.set(m.matchId, room);
      }
      me = { ws, slot };
      room.clients.add(me);
      room.emptySince = null;
      startLoop(room);
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
    room.inputs[me.slot] = { ...ZERO };
    if (room.clients.size === 0) room.emptySince = Date.now();
  });
});

// Single sweep timer reaps idle rooms.
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL) {
      if (room.loop) clearInterval(room.loop);
      rooms.delete(id);
    }
  }
}, 10_000);
