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

## Core domain rules (server-authoritative)
- **Scoring** (`src/lib/scoring/index.ts`): exact scoreline = **3**, correct
  outcome (right winner or both-draw) = **1**, wrong = **0**. **Double-down** ×2
  (one per matchday). Pure + unit-testable.
- **Prediction window** (`src/lib/time/usday.ts`): a pick can be created/edited
  in the **12 hours before kickoff**, then locks at kickoff. `isPredictable()`
  is the gate. Enforced in the Server Action AND in RLS (defense-in-depth).
- **Kickoff lock**: enforced server-side (`now()` vs `kickoff_utc`) in
  `savePrediction` AND Postgres RLS — never trust the client clock.
- **Grading** (`src/lib/scoring/grade.ts`): `gradeFinishedMatches()` grades
  finished+ungraded predictions (idempotent: only when `points_awarded IS NULL`),
  then `recomputeLeagueStandings()` sets `total_points = baseline_points +
  sum(graded)`, ranks (standard competition ranking), snapshots points_history +
  rank_history, awards badges.
- **`standings.baseline_points`**: admin-set starting score; total = baseline +
  graded. Survives re-grading. (Set manually per the league's chosen start.)
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

## Auth
- Preset username + password (no email/OAuth). Username → synthetic email
  `<username>@groupstage.local` (`src/lib/auth/usernames.ts`). Login/logout
  Server Actions in `src/lib/auth/actions.ts` — they call
  `revalidatePath("/", "layout")` before redirect to clear the Router Cache
  (fixes a logout→re-login client error). Manage users with the `users:*` scripts.

## Key directories
- `src/app/(app)/*` — authenticated pages (dashboard, matches, matches/[id],
  leaderboard, leagues, profile, settings, u/[username]); `layout.tsx` guards via
  `requireProfile()`. `src/app/api/cron/{sync,grade,notify}` — cron endpoints.
- `src/lib/{scoring,football,predictions,leaderboard,leagues,profile,
  notifications,avatar,cron,time,auth,supabase}` — domain logic.
- `src/components/{match,leaderboard,leagues,profile,avatar,layout,
  notifications,ui}`.
- `drizzle/*.sql` — migrations: `0000` schema, `0001` RLS + auth trigger +
  cross-schema FK, then feature migrations. NOTE: migration filenames are
  applied **lexically** by `scripts/migrate.ts` (not drizzle-kit), and there are
  duplicate `0006_*` names (harmless — order within a number doesn't matter here).
  Each is idempotent (`IF NOT EXISTS` / guarded). RLS lives only in SQL, never
  in `schema.ts`.

## Scripts (all read `.env.local`)
- `db:seed` — upsert fixtures + badges from the provider
- `db:migrate:all` — apply every `drizzle/*.sql` in order
- `users:create` / `users:rename` / `users:password`
- `db:push` is interactive (will hang on prompts) — prefer explicit SQL or migrations.

## When verifying UI
Log in as `omar`. Use puppeteer-core (installed) + system Chrome
(`/usr/bin/google-chrome-stable`) against a prod `npm run start` on a free port.
Watch for `pageerror`/console errors; `#418` = hydration mismatch (read
client-only state in `useEffect`, not during render).
