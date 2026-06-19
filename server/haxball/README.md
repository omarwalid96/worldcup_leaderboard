# HaxBall realtime server

The one always-on process the serverless app can't host. Runs the authoritative
60Hz physics loop per match; both phones are equal clients (send input, render
pushed state). Imports the SAME `src/lib/games/haxball/physics.ts` the client
uses — one source of truth.

- `index.ts` — the ws server (per-room loop, ~20Hz state broadcast, matchId+userId
  auth, input validated at the boundary, idle rooms reaped).
- `Dockerfile` — built from the **repo root** so it can copy the shared physics file.
- `fly.toml` — Fly.io config (free tier; idle machines suspend, wake on connect).

## Deploy (Fly.io, free)

Run from the **repo root**. Install flyctl first: <https://fly.io/docs/flyctl/install/> then `fly auth login`.

```bash
# 1. create the app (no deploy yet). Accept name 'haxball-eznii' or pick your own;
#    decline Postgres/Redis/other addons.
fly launch --no-deploy --config server/haxball/fly.toml --dockerfile server/haxball/Dockerfile

# 2. give it the DB url (the pooler URL from .env.local — verifies match players)
fly secrets set DATABASE_URL="<DATABASE_URL from .env.local>" --app haxball-eznii

# 3. deploy
fly deploy --config server/haxball/fly.toml --dockerfile server/haxball/Dockerfile
```

## Point the app at it

Set in **Vercel env** and local `.env.local`, then redeploy the web app:

```
NEXT_PUBLIC_HAXBALL_WS=wss://haxball-eznii.fly.dev
```

(Use your app's real hostname if you picked a different name. Must be `wss://`,
not `https://`.) Without this env var the HaxBall game shows "Game server not
configured."

## Run locally

```bash
cd server/haxball && npm install
PORT=8090 node --env-file=../../.env.local node_modules/.bin/tsx index.ts
# point the app at it: NEXT_PUBLIC_HAXBALL_WS=ws://localhost:8090
```

## Notes
- Free-tier machines **suspend when idle** and wake on the next connection — the
  first join after a quiet spell takes a second or two. Fine for a friends' app.
- Auth: a client joins with `{matchId, userId}`; the server checks both against
  the `game_matches` row and rejects anyone who isn't one of the two players.
- This server only simulates + relays. The match is marked `finished` by the web
  app's own `applyMove` when a client reports the goal cap.
