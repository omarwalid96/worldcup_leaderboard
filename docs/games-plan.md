# Games Section — Build Plan (agent handoff doc)

> **Audience:** an **Architecture agent** (builds the shared foundation) and several
> **Game agents** (each builds ONE game on top of the foundation). Read this whole
> doc first, then read **CLAUDE.md** for repo conventions. This doc is the contract
> between agents — respect the file-ownership boundaries so parallel agents don't
> collide.

---

## 0. Goal & vibe

A light, fun **games section** for the friend group inside "Eznii Ya Dawly" (a
World Cup prediction league). Games are quick, social, football-flavored, and
played **between league members**. Four interaction styles are in scope:
head-to-head duels, group party rounds, live (same-moment) games, and async
"take your turn whenever" games.

**Hard product rules (do not violate):**

- **Games are a SEPARATE world from the prediction league.** Game wins/losses
  NEVER touch `standings`, `total_points`, `predictions`, or league ranking. The
  prediction scoring is sacred. Games have their OWN records table.
- **Members only.** Reuse existing auth (`requireProfile()`); no anonymous play.
- **Mobile-first**, gold-on-black theme, reuse the existing UI kit + motion +
  confetti + haptics (`src/lib/celebrate.ts`).

---

## 1. The one architectural constraint

**Vercel is serverless — there is NO always-on game-loop server.** So:

- ✅ Turn-based and **light** realtime (taps, reaction, buzzer, board moves) — easy.
- ❌ No authoritative high-frequency physics / twitch action games.

We already use **Supabase Realtime** for the live leaderboard. It is the
server-less multiplayer primitive and the basis for all games here. Three tools:

| Tool | Use for | Persists? |
| --- | --- | --- |
| **Broadcast** | ephemeral events (a move, a tap, "ready", cursor) — pub/sub | ❌ lost on refresh |
| **Presence** | who's in the room right now (join/leave/sync) | ❌ in-memory |
| **postgres_changes** | subscribe to a DB row → **source of truth**, survives refresh | ✅ |

**Canonical pattern (USE THIS):** the `game_matches` row is the single source of
truth (state in a `jsonb` blob). Players subscribe to `channel('game:'+id)`.
Broadcast a move for instant feel, **also** write it to the row via a Server
Action, and let `postgres_changes` re-sync everyone (including refreshers).
Reference today: `src/components/leaderboard/realtime-leaderboard.tsx` already
does the `supabase.channel(...).on('postgres_changes', {table, filter}, cb).subscribe()`
dance — copy that shape.

---

## 2. Existing building blocks to REUSE (do not reinvent)

- **Supabase browser client:** `createClient()` from `src/lib/supabase/client.ts`.
- **Realtime subscribe pattern:** `src/components/leaderboard/realtime-leaderboard.tsx`.
- **Auth/session:** `requireProfile()` / `getSessionProfile()` from `src/lib/auth/session.ts`.
- **Web push (challenge invites & "your turn" pings):** `sendPushToUser(userId, {title, body, url}, prefKey?)` from `src/lib/notifications/send.ts`. (Add a new notif pref key — see §4.)
- **Server Actions pattern:** `src/lib/profile/actions.ts` (zod validate → `getCurrentUser()` → db write → `revalidatePath`).
- **UI kit:** shadcn in `src/components/ui/*` (Card, Button, Input, Textarea, Badge, Avatar, DropdownMenu, Tabs…).
- **Avatars:** `ZoomableAvatar` (`src/components/avatar/zoomable-avatar.tsx`) and `Avatar` for opponent faces.
- **Animations/feel:** `motion/react`, `canvas-confetti`, `src/lib/celebrate.ts` (`celebrateSave`, `haptic`, `celebrateClimb`).
- **DB:** Drizzle schema `src/db/schema.ts`, client `db` from `src/db`. Migrations are plain idempotent SQL in `drizzle/*.sql` applied lexically by `scripts/migrate.ts`. **Latest is `0009`; the games migration is `0010`.**

### ⚠️ Database safety (from CLAUDE.md — non-negotiable)
- Local and prod share ONE cloud Supabase DB. **Agents must NOT run migrations,
  seed, or write to the live DB.** Author the schema + migration SQL only; the
  human operator applies `0010` to the live DB (after `npm run db:backup`).
- New tables are additive and safe; the risk is only if you touch existing tables.
  Games tables are brand new — do not ALTER `standings`/`predictions`/`matches`.

---

## 3. PHASE 1 SCOPE (what we build now)

1. **Shared games foundation** (Architecture agent) — schema, RLS, the
   `game_matches` engine helpers, the `/games` hub, nav entry, challenge+notify
   flow, profile "Games record" card, the realtime room hook.
2. **Game #1: ⚽ Penalty Shootout Duel** (Game agent A) — most on-theme.
3. **Game #2: 🧠 Trivia Duel (World Cup)** (Game agent B) — reuses challenge infra.

Connect-4, Higher/Lower, Reaction Race, Guess-the-Team are **Phase 2** — specced
briefly in §8 so the foundation is built general enough, but NOT built now.

---

## 4. SHARED FOUNDATION — Architecture agent spec

**You own these files. Game agents depend on your interfaces — keep them stable.**

### 4a. Schema + migration (`src/db/schema.ts` + `drizzle/0010_games.sql`)

Add to `schema.ts` and write an idempotent `drizzle/0010_games.sql` (`CREATE TABLE
IF NOT EXISTS`, `CREATE TYPE … / DO $$ … guarded enums`). **Do not run it.**

```
game_matches
  id           uuid pk default gen_random_uuid()
  game_type    text not null            -- 'penalty_duel' | 'trivia_duel' | … (string, not enum, so new games need no migration)
  status       text not null default 'pending'  -- pending | active | finished | declined | expired
  player1_id   uuid not null -> profiles(id) on delete cascade  -- challenger
  player2_id   uuid          -> profiles(id) on delete cascade  -- challenged (null = open challenge, optional)
  turn         uuid          -> profiles(id)   -- whose turn (null for simultaneous games)
  state        jsonb not null default '{}'     -- per-game blob (each game defines its shape)
  winner_id    uuid          -> profiles(id)   -- null until finished; null+finished = draw
  score        jsonb         -- optional {p1:int,p2:int} for display
  created_at   timestamptz not null default now()
  updated_at   timestamptz not null default now()
  indexes: (player1_id), (player2_id), (status), (game_type)

game_results            -- aggregate W/L per user per game_type (for profile card + badges later)
  user_id      uuid not null -> profiles(id) on delete cascade
  game_type    text not null
  wins         int not null default 0
  losses       int not null default 0
  draws        int not null default 0
  updated_at   timestamptz not null default now()
  pk (user_id, game_type)
```

RLS (in the migration SQL, NOT schema.ts — see CLAUDE.md): a user may
`select`/`update` a `game_matches` row only if they are player1 or player2;
`insert` only with `player1_id = auth.uid()`. `game_results` readable by all
(it's public W/L), writable only by the server (service role / Server Action).
Enable realtime on `game_matches` (add to the `supabase_realtime` publication).

### 4b. Engine helpers (`src/lib/games/`)

Create a small domain module Game agents build on:

- `src/lib/games/types.ts` — TS types: `GameType`, `GameMatch`, `GameStatus`,
  and a `GameDefinition` interface (metadata: type, title, emoji, blurb, mode:
  `'turn'|'simultaneous'`, minPlayers, route).
- `src/lib/games/registry.ts` — an array/map of `GameDefinition`s; the hub reads
  this to list games. **Game agents append their definition here** (small,
  low-conflict edit — coordinate so each appends one entry).
- `src/lib/games/actions.ts` — Server Actions (the shared API surface):
  - `createChallenge({gameType, opponentId})` → inserts a `pending` match, fires
    a push to the opponent ("X challenged you to <game>"), returns `{id}`.
  - `respondToChallenge(matchId, accept: boolean)` → sets `active`/`declined`.
  - `applyMove(matchId, move: unknown)` → **generic**: loads the row, calls the
    game's reducer (registry), validates it's the caller's turn (for turn games),
    writes new `state`/`turn`/`status`/`winner_id`, updates `updated_at`. On
    finish, bumps `game_results` for both players. Returns the new match.
  - `getMatch(matchId)` / `listMyMatches()` for hub + resume.
  - Per-game LOGIC is a pure reducer the game agent provides:
    `reduce(state, move, ctx) -> {state, turn?, status?, winnerId?, score?}`,
    registered in the registry. Keep reducers PURE + unit-testable (like
    `src/lib/scoring/index.ts`).
- `src/lib/games/queries.ts` — read helpers (`getGameRecord(userId)` for profile).

### 4c. Realtime room hook (`src/components/games/use-game-room.ts`)

A client hook every game UI uses:
`useGameRoom(matchId)` → subscribes to `channel('game:'+matchId)` with
`postgres_changes` on `game_matches` filtered `id=eq.<matchId>`, returns the live
`match` (refetched via a Server Action on change), plus presence (who's in the
room) and a `broadcast(event, payload)` helper for instant ephemeral feedback.
Model it on `realtime-leaderboard.tsx`. This is the ONLY realtime plumbing game
agents need.

### 4d. Hub + navigation + profile card

- `src/app/(app)/games/page.tsx` — the **Games hub**: lists games from the
  registry (emoji, title, blurb, "Play" → challenge a friend), plus the user's
  active/pending matches ("Your turn" / "Waiting" / incoming challenges to
  accept). Auth-guarded like other `(app)` pages.
- `src/app/(app)/games/[matchId]/page.tsx` — the **match shell**: loads the
  match, looks up the game in the registry, renders that game's `<Component />`.
  Game agents render INTO this shell (their component receives `matchId` +
  initial match).
- **Nav:** add a "Games" entry (`Gamepad2` lucide icon) to
  `src/components/layout/app-nav.tsx` NAV array AND/OR the avatar dropdown
  `src/components/layout/user-menu.tsx`. (Bottom nav has 5 items already; decide
  whether Games replaces one slot on mobile or lives in the menu — recommend the
  avatar menu + a hub card on the dashboard to avoid crowding the 5-tab bar.)
- **Profile "Games record" card:** add to `src/app/(app)/profile/page.tsx` and
  `src/app/(app)/u/[username]/page.tsx` — small card showing W/L/D per game from
  `getGameRecord`. Render only if the user has played ≥1 game.
- **Notif pref:** add a `gameChallenge` key to the `notifPrefs` default
  (`{lockReminder, scoreHit, rankClimb, gameChallenge}`) in `schema.ts` default,
  `settings` parse, and `PushSettings`. Pass `prefKey: 'gameChallenge'` to
  `sendPushToUser` for invites.

### 4d. Deliverable checklist for the Architecture agent
- [ ] `schema.ts` + `drizzle/0010_games.sql` (do NOT run it)
- [ ] `src/lib/games/{types,registry,actions,queries}.ts`
- [ ] `src/components/games/use-game-room.ts`
- [ ] `/games` hub + `/games/[matchId]` shell + nav entry + profile games card
- [ ] notifPrefs `gameChallenge`
- [ ] Stub-register Phase-1 games in the registry with `comingSoon: true` so the
      hub renders before the game agents finish; game agents flip it on.
- [ ] `npm run typecheck` + `npm run lint` clean (don't run `build` if others are mid-edit)

---

## 5. GAME #1 — ⚽ Penalty Shootout Duel (Game agent A)

**Mode:** head-to-head, best-of-5, **turn-based** (alternate kicker/keeper) OR
simplified async (each player takes all 5 kicks on their turn). Recommend
alternating rounds: each round both players act once (shooter aims, keeper dives).

**Feel:** a moving power+direction indicator; tap to shoot/dive. Use motion for
the ball, `haptic()` on tap, `celebrateSave()`/confetti on win.

**State blob shape (example):**
```
{ round: 1, kicks: [{kicker:'p1', dir:'L', save:false, goal:true}, …],
  scoreP1: 0, scoreP2: 0, phase: 'shoot'|'keep', actor: <userId> }
```

**Reducer** (`src/lib/games/penalty/reducer.ts`, pure): given current state + a
move (`{dir:'L'|'M'|'R'}` for shooter, `{dive:'L'|'M'|'R'}` for keeper), resolve
goal/save, advance round, detect best-of-5 win → return `{state, status, winnerId, score}`.

**UI** (`src/components/games/penalty/penalty-duel.tsx`, client): uses
`useGameRoom(matchId)`, renders the pitch/goal, calls `applyMove`. Broadcasts the
opponent's tap for instant animation, trusts the row for truth.

**Files (own ONLY these + append 1 registry entry):**
`src/lib/games/penalty/reducer.ts`, `src/components/games/penalty/*`, the registry
entry `{type:'penalty_duel', emoji:'⚽', title:'Penalty Shootout', mode:'turn', …}`.

---

## 6. GAME #2 — 🧠 Trivia Duel (World Cup) (Game agent B)

**Mode:** head-to-head, 5 questions, fastest-correct wins each point. Async-safe:
both players answer the same 5 Qs whenever; compare correctness (and optionally
time) to award points. (A live buzzer variant can come later via broadcast.)

**Question bank:** a static TS array `src/lib/games/trivia/questions.ts`
(`{id, q, choices[4], answerIndex, category}`) — ~40+ World Cup / football Qs.
Each match picks 5 at random (seed stored in state for fairness — see Date.now
note: generate the seed in the Server Action, store in state).

**State blob:**
```
{ questionIds:[…5], answers:{ [userId]: [ {qid, choice, correct, ms} ] }, scoreP1, scoreP2 }
```

**Reducer** (`src/lib/games/trivia/reducer.ts`, pure): record an answer, when both
players have answered all 5 → tally → `{status:'finished', winnerId, score}`.

**UI** (`src/components/games/trivia/trivia-duel.tsx`): question card, 4 choice
buttons, progress, reveal correct, final scoreboard. `haptic()` + confetti on win.

**Files (own ONLY these + append 1 registry entry):**
`src/lib/games/trivia/{questions,reducer}.ts`, `src/components/games/trivia/*`,
registry entry `{type:'trivia_duel', emoji:'🧠', title:'Trivia Duel', mode:'simultaneous', …}`.

---

## 7. File-ownership map (prevents parallel collisions)

| Owner | Files |
| --- | --- |
| **Arch agent** | `schema.ts`, `drizzle/0010_games.sql`, `src/lib/games/{types,registry,actions,queries}.ts`, `src/components/games/use-game-room.ts`, `src/app/(app)/games/**`, `app-nav.tsx`/`user-menu.tsx`, profile games card in both profile pages, notifPrefs additions |
| **Game A (penalty)** | `src/lib/games/penalty/**`, `src/components/games/penalty/**`, +1 registry entry |
| **Game B (trivia)** | `src/lib/games/trivia/**`, `src/components/games/trivia/**`, +1 registry entry |

**Sequencing:** Arch agent goes FIRST (game agents need `use-game-room`, `actions`,
the registry shape, the `[matchId]` shell). Game agents run in PARALLEL after the
foundation lands. The only shared edit is appending one registry entry each —
keep entries tiny and on separate lines to avoid merge friction.

---

## 8. Phase 2 backlog (spec later, keep foundation general enough)

- **🔴 Connect-4 / Tic-Tac-Toe** — turn-based, board in `state`, the textbook
  Supabase realtime game.
- **🔢 Higher/Lower (player & team stats)** — solo or duel, data-driven, no realtime.
- **⚡ Reaction Race** — live, presence + broadcast, fastest tap wins.
- **😀 Guess the Team/Player** — daily group puzzle (emoji/flag/clue).
- **✏️ Draw & Guess** — canvas + broadcast strokes (most effort).
- **🟩 Football Wordle** — daily shareable word/player guess.

These should all fit `game_matches` (+ for daily/group ones, possibly a
`game_type='…'` with `player2_id` null and a per-day row). If a Phase-2 game needs
a new shape, prefer extending the `state` jsonb over new tables.

---

## 9. Definition of done (each agent)

- `npm run typecheck` (0 errors) + `npm run lint` (0 errors; the pre-existing
  `score-picker.tsx` `<img>` warning is OK).
- Pure reducers have a throwaway `node --env-file=.env.local x.mjs` sanity check
  (per CLAUDE.md testing policy).
- Do NOT run migrations / seed / touch the live DB. Do NOT commit or push.
- Report: files changed, registry entry added, reducer test result, checks clean.
- Human operator then: applies `0010` to live DB after `db:backup`, runs a full
  `build`, verifies the hub + each game with puppeteer, commits, pushes.
