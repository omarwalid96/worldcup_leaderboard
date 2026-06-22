# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Agent guide for **"Eznii Ya Dawly"** — read this first; it's the fast-path context.

## What this app is
A private **World Cup 2026 score-prediction league** for a group of friends.
Users predict match scorelines; picks lock at kickoff; finished matches are
graded; an animated leaderboard ranks everyone. Deployed on Vercel, backed by
Supabase (Postgres + Auth + Realtime + Storage).

Brand name (user-facing): **Eznii Ya Dawly**. (Some code comments still say the
old name "GroupStage" — harmless.)

## Commands
Always `source "$HOME/.nvm/nvm.sh" && nvm use 20` first (Node 18 default breaks builds).

```bash
npm run dev          # dev server (Turbopack off)
npm run build        # production build (also runs the type check Next does)
npm run start        # serve the production build (use PORT=<n> to pick a port)
npm run typecheck    # tsc --noEmit  — keep at 0 errors
npm run lint         # eslint        — keep at 0 errors
```

**Tests:** there is no test framework configured (`npm test` does not exist).
Pure logic (e.g. scoring in `src/lib/scoring/index.ts`) is verified with
throwaway `node --env-file=.env.local one-off.mjs` scripts; UI is verified with
puppeteer-core + system Chrome (see "When verifying UI"). The definitive
green-light is `typecheck` + `lint` + `build` all passing.

DB / admin scripts (all load `.env.local`): see "Scripts" below.

## Stack
- **Next.js 15** (App Router, RSC, Server Actions), **TypeScript strict**
- **Tailwind v4** + **shadcn/ui**; theme is **gold-on-black** (FIFA 2026 identity).
  Fonts: `font-body` (Geist), `font-display` (Anton, headings), `font-numeric`
  (Teko, scoreboard numbers). Semantic colors: `text-gold` (brand/CTA),
  `text-success` (green=positive), `text-destructive`/`text-live` (red),
  `text-info` (blue). Tokens in `src/app/globals.css`.
- **Drizzle ORM** + **postgres-js**; schema in `src/db/schema.ts`, client `src/db/index.ts` (`db`)
- **Supabase**: `src/lib/supabase/{client,server}.ts` (browser/server + admin)
- **Motion** (motion/react) for animations; **Recharts** for profile charts;
  **canvas-confetti** for celebrations
- **web-push** for PWA notifications

## ⚠️ Environment rules (MUST follow)
- **Node 20**: always `source "$HOME/.nvm/nvm.sh" && nvm use 20` before any
  npm/node command. The default node is 18 and breaks the build.
- **Never `rm -rf .next` while a dev server is running** — it corrupts the dev
  cache and produces *false* "Application error" client exceptions. To verify a
  running app, do a clean `npm run build` then `PORT=<free port> npm run start`.
  Check a port is free with `ss -ltnp | grep <port>`; stop with `fuser -k <port>/tcp`.
- Verify changes with `npm run typecheck` && `npm run lint` (keep both at 0
  errors) then `npm run build`.
- **Recharts v3**: tooltip `formatter={(v) => ...}` — don't annotate the param
  as `number` or TS errors.

## 🔒 DATABASE SAFETY (critical — learned the hard way)
- **Local and production share ONE cloud Supabase DB** (`.env.local` DATABASE_URL
  points at prod). There is no separate dev DB.
- **NEVER mutate live data without the user's explicit approval** for that
  specific action. Reads/inspection are fine.
- **NEVER seed test predictions, run grading/regrade, or reset standings against
  the live tables.** Real users have real picks; grading recomputes standings
  and will overwrite/destroy real state.
- **For ANY testing that needs data, create separate TESTING TABLES** (e.g.
  `test_predictions`, `test_standings`) or a throwaway league row — never touch
  the production `predictions` / `standings` / `matches`. Drop test tables when
  done. See README "Testing policy".
- Past incident: seeding fake predictions + `regrade=1` on live tables wiped real
  standings and a user's pick. Don't repeat it.
- **Always `npm run db:backup` before any migration or regrade.** It writes a
  timestamped JSON of every table to `backups/` AND a `backup_log` row; the
  regrade cron (`src/lib/cron/backup-guard.ts`) refuses (HTTP 412) without a
  fresh backup. Restore = re-insert from the JSON.
- **Adding a column the app reads is safe**: edit `schema.ts` + an idempotent
  `ALTER TABLE … ADD COLUMN IF NOT EXISTS` migration, apply it to the live DB
  yourself (back up first), then push the code. Nullable additive columns touch
  no existing data. (Done this way for `business_card_url`, `quote`.)
- The pattern for applying a one-off SQL/recompute against live data: write a
  throwaway `node --env-file=.env.local x.mjs` using `postgres` (the pooler host
  `aws-0-eu-west-1.pooler.supabase.com`), run, delete the file. To call the real
  server-only `grade.ts` functions from a script, `tsx` needs a stub:
  `mkdir -p node_modules/server-only && echo 'module.exports={}' > …/index.js`
  (+ a minimal package.json), run, then remove it.

## Core domain rules (server-authoritative)
- **Scoring** (`src/lib/scoring/index.ts`): exact scoreline = **3**, correct
  outcome (right winner or both-draw) = **1**, wrong = **0**. Knockout exact-draw
  = **2** (winner decided on pens); pens bonus +1 winner / +1 exact (knockout
  only). Pure + unit-testable.
- **Double-down (×2) is DISABLED in the UI** but the scoring/DB logic is intact
  (commented out, search "disabled for now"). `scorePrediction` still ×2 if the
  `is_double_down` flag is set; new picks can't set it. `streakBonus()` is
  defined but **never applied** to standings — streak is display-only.
- **Prediction window** (`src/lib/time/usday.ts`): a pick can be created/edited
  starting **24 hours before kickoff** (`PREDICTION_WINDOW_HOURS`), then locks at
  kickoff. `isPredictable()` is the gate. Enforced in the Server Action AND RLS.
- **Kickoff lock**: enforced server-side (`now()` vs `kickoff_utc`) in
  `savePrediction` AND Postgres RLS — never trust the client clock.
- **`matches.matchday` is the group ROUND (1/2/3), NOT a calendar day** — all 24
  first-round group games share `matchday=1`. So anything "per matchday" that
  should mean "per day" must group by `(kickoff_utc::date)` instead. Profile
  charts and streaks already do this; see below.
- **Grading** (`src/lib/scoring/grade.ts`): `gradeFinishedMatches()` grades
  finished+ungraded predictions (idempotent: only when `points_awarded IS NULL`),
  then `recomputeLeagueStandings()` sets `total_points = baseline_points +
  sum(graded)`, dense-ranks (1,1,2,3…), snapshots points/rank_history, awards
  badges. `computeStreaks()` counts consecutive most-recent **calendar
  match-days** with a correct pick (rest days don't break it).
- **`standings.baseline_points`**: admin-set starting score; total = baseline +
  graded. Survives re-grading. (Set manually per the league's chosen start.)
- **Profile charts** (`src/lib/profile/stats.ts`): points/rank/participation are
  computed **live from graded predictions grouped by calendar date** (NOT from
  the `points_history`/`rank_history` snapshot tables, which key on the bogus
  group-round matchday and are effectively legacy). Points series starts at the
  user's baseline so it ends at their real total.
- All times stored **UTC**; converted to the user's timezone only for display
  (`KickoffTime` resolves the browser tz on mount).

## Football data (no API key)
- All data flows through the `FootballProvider` interface (`src/lib/football`),
  swappable via `FOOTBALL_PROVIDER` env. Default = `worldcup26` (composite:
  worldcup26.ir near-live + openfootball fallback).
- worldcup26.ir is the SINGLE fixture source so live scores reconcile 1:1.
  It's flaky → 3-retry + backoff. Only the **cron** calls it (cron → DB → users
  read DB; no per-user API calls). `src/lib/football/stadiums.ts` maps venue →
  timezone to convert the source's local kickoff times to UTC.

## Cron pipeline (cron → DB → users)
- Endpoints (all `Authorization: Bearer $CRON_SECRET`):
  - `POST /api/cron/sync` — sync scores/status, lock kicked-off picks, grade,
    recompute standings, fire score-hit + rank-climb push.
  - `POST /api/cron/notify` — "lock your pick" reminders (45–60 min pre-kickoff).
  - `POST /api/cron/grade?regrade=1` — re-grade all finished matches (⚠️ live data).
- Scheduling: Vercel Hobby crons only run daily (unreliable for sub-hourly), so
  an **external scheduler (cron-job.org)** pings the endpoints every ~10 min.
  `.github/workflows/cron.yml` is a fallback (GitHub throttles scheduled runs).
- `runPipeline` writes a `cron_log` heartbeat (`src/lib/cron/log.ts`) so you can
  confirm the cron is firing. `standings.last_synced_at` only bumps when a score
  actually changes — a stale value is NOT proof the cron is down.
- **Live UI** (display-only, decoupled from the cron — never grades):
  - `LiveRefresher` (`src/components/match/live-refresher.tsx`) mounts only on a
    `live` match and `router.refresh()`es from the visible tab — re-runs the
    page's server query (our DB), never the football API. While live, the
    "League picks" list shows **provisional** points (`+3/+1/0`) from the current
    score via `basePoints()`; finished matches show the real graded points.
  - `/api/live` is a **server-cached (30s) ESPN proxy** (`fifa.world`
    scoreboard): N users → ≤1 upstream fetch / 30s, fails soft to empty. Clients
    poll it ~20s. `useLiveMatch` (`use-live-match.ts`) feeds the per-match score/
    clock; ESPN is the *preferred, redundant* live source over wc26 and the
    `completed` flag is the tiebreaker that unsticks a stale-LIVE match (see
    memory). Providers reconcile by **FIFA code** via `teamCodeOf`
    (`src/lib/football/team-ids.ts`) — NOT fuzzy names — and `/api/live` uses it
    to attach our DB `matchId` so the live pill can deep-link.
  - `FieldHero` (`field-hero.tsx`) — CSS-drawn football pitch behind the flags +
    score on the match detail page (live + finished). `LiveIsland`
    (`live-island.tsx`) — Google-Sports-style pill under the header on every app
    page, links to the live match. `MatchEvents` (`match-events.tsx`) — goals/
    cards timeline (newest first), from `/api/match-events`; persisted in
    `matches.events` jsonb (migration `0015`).

## Auth
- Preset username + password (no email/OAuth). Username → synthetic email
  `<username>@groupstage.local` (`src/lib/auth/usernames.ts`). Login/logout
  Server Actions in `src/lib/auth/actions.ts` — they call
  `revalidatePath("/", "layout")` before redirect to clear the Router Cache
  (fixes a logout→re-login client error). Manage users with the `users:*` scripts.

## Realtime leaderboard + nudges ("whack")
- `RealtimeLeaderboard` (`src/components/leaderboard/realtime-leaderboard.tsx`)
  subscribes to a Supabase Realtime channel per league: standings updates re-rank
  live, and members can **nudge** ("whack") each other — a full-screen cartoon-
  hammer animation (`nudge-animation.tsx`). `sendNudge` (server action,
  rate-limited) inserts a `nudges` row (migration `0013`) + broadcasts; the target
  sees it live if present and **replays unseen nudges on next open**
  (`markNudgesSeen`). The animation copy is perspective-aware: pass `toName` →
  "You whacked X!" for the sender, else "X whacked you!" for the receiver.
- AI-summary card has a `summary_comments` thread (migration `0014`).

## Key directories
- `src/app/(app)/*` — authenticated pages (dashboard, matches, matches/[id],
  leaderboard, leagues, profile, settings, badges, u/[username]); `layout.tsx`
  guards via `requireProfile()`. `src/app/api/cron/{sync,grade,notify}` — cron.
- `src/lib/{scoring,football,predictions,leaderboard,leagues,profile,
  notifications,avatar,cron,time,auth,supabase}` — domain logic.
- `src/components/{match,leaderboard,leagues,profile,avatar,layout,
  notifications,ui}`.
- `drizzle/*.sql` — migrations: `0000` schema, `0001` RLS + auth trigger +
  cross-schema FK, then feature migrations through `0015` (business card `0008`,
  quote `0009`, games `0010`, sponsors `0011`, ai_summaries `0012`, nudges `0013`,
  summary_comments `0014`, match_events `0015`). NOTE: filenames are applied
  **lexically** by `scripts/migrate.ts` (not drizzle-kit), and there are duplicate
  `0006_*` names (harmless — order within a number doesn't matter here). Each is
  idempotent (`IF NOT EXISTS` / guarded). RLS lives only in SQL, never in `schema.ts`.

## AI Summary recap (`/recap` skill → home card)
- The home "AI Summary" card (`src/components/summary/ai-summary-card.tsx`, under
  League Leaders) shows the latest row of the `ai_summaries` table. There is NO
  app-side LLM call / API key — recaps are written by the **Claude Code `/recap`
  skill** (`.claude/skills/recap/`): `gather.mjs` (READ-ONLY data snapshot) → Claude
  writes a funny Egyptian-banter recap → `publish.mjs` inserts one `ai_summaries`
  row. Read `.claude/skills/recap/USAGE.md`. The skill is read-only except that one
  insert; it never touches predictions/standings/matches.

## Profiles: DB-only fields + badges
- `profiles.business_card_url` (nullable) — a per-user business-card image, shown
  as a small tappable/zoomable thumbnail on the profile when set. **No app UI to
  edit it** — set the URL directly in the DB. Null → section hidden.
- `profiles.quote` (nullable) — a short tagline; **editable in Settings**. Shown
  on the home leader spotlight under the user's name when they're the league #1
  (handles multiple tied leaders).
- **Badges** (`scripts/seed.ts` `BADGES`, awarded in `grade.ts` `awardBadges()`):
  `first_exact`, `hat_trick`, `hot_streak` (3 match-days in a row), `top_of_table`,
  `sharpshooter` (5 correct results), `perfect_day` (all picks one day correct),
  `double_or_nothing` (legacy — double-down disabled), `group_guru` (seeded, no
  award rule yet). Descriptions surfaced on the `/badges` page.

## Scripts (all read `.env.local`)
- `db:seed` — upsert fixtures + badges from the provider
- `db:backup` — full logical JSON snapshot → `backups/` (+ `backup_log` row)
- `db:migrate:all` — apply every `drizzle/*.sql` in order
- `users:create` / `users:rename` / `users:password`
  - `users:rename` changes only `profiles.display_name` (the UI name); the login
    username is unchanged.
  - `users:rename-login -- <old> <new>` changes the **login** username: updates
    `profiles.username` + `auth.users.email` (`<name>@groupstage.local`) in one
    guarded transaction. The **UID is preserved**, so all predictions/standings/
    badges/history (keyed by `profiles.id`) and the password (keyed by the auth
    user id) survive untouched — the user logs in with the new username + same
    password. New username must match `^[a-z0-9_]{3,20}$`. Back up first.
- `db:push` is interactive (will hang on prompts) — prefer explicit SQL or migrations.

## When verifying UI
Log in as `omar`. Use puppeteer-core (installed) + system Chrome
(`/usr/bin/google-chrome-stable`) against a prod `npm run start` on a free port.
Watch for `pageerror`/console errors; `#418` = hydration mismatch (read
client-only state in `useEffect`, not during render).
