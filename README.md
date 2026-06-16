# GroupStage ⚽🏆

A private **World Cup 2026 prediction league** for you and your friends. Predict
scorelines, lock at kickoff, grade live, and climb an animated leaderboard.

Built with **Next.js 15 (App Router, RSC, Server Actions) · TypeScript (strict) ·
Tailwind v4 · shadcn/ui · Supabase (Postgres + Auth + Realtime) · Drizzle ORM ·
Motion · TanStack Query**.

> **Status:** Milestone 1 complete — scaffold, design system, data model, and the
> swappable football-data adapter are in place. See the build plan below.

## Prerequisites

- Node **20.x** (`nvm use` reads `.nvmrc`)
- A Supabase project (cloud)

## Quick start

```bash
nvm use                     # Node 20.19.6
npm install
cp .env.example .env.local  # then fill in your Supabase + secrets
npm run dev                 # http://localhost:3000
```

The public landing page renders without any env configured. Auth, predictions,
and the leaderboard require Supabase (Milestone 2+).

## Environment

See [`.env.example`](./.env.example) for the full list. The essentials:

| Var | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | same page (server-only, bypasses RLS) |
| `DATABASE_URL` | Supabase → Database → Connection string (pooler URI) |
| `FOOTBALL_PROVIDER` | `openfootball` (default, no key) |
| `*_VAPID_*` | `npx web-push generate-vapid-keys` |
| `CRON_SECRET` | any long random string |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:push` | Push Drizzle schema to the DB |
| `npm run db:generate` / `db:migrate` | Generate + apply SQL migrations |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:seed` | Seed the 2026 fixtures (Milestone 3) |
| `npm run users:create` | Create preset username/password users (Milestone 2) |
| `npm run users:rename -- <username> "<New Name>"` | Change a user's display name (login username stays the same) |
| `npm run users:password -- <username> ["<new-pass>"]` | Set a user's password (random if omitted) |

## Architecture notes

- **Server-authoritative rules.** Kickoff locks and grading are decided on the
  server by comparing `now()` to `kickoff_utc`. The client clock is never trusted.
- **Swappable data source.** All football data flows through the
  `FootballProvider` interface (`src/lib/football`). Switch sources via the
  `FOOTBALL_PROVIDER` env var without touching app code.
- **All times stored in UTC**, converted to the user's timezone only for display.
- **RLS** restricts each user to editing only their own predictions/profile.

## Deployment & cron

Deployed on **Vercel** from this GitHub repo (auto-deploys on push to `main`).

### Required Vercel env vars
Set all of [`.env.example`](./.env.example) in **Vercel → Settings → Environment
Variables**. Notably, use the **transaction pooler** `DATABASE_URL` (port `6543`)
on Vercel (serverless), while local migrations use the **session pooler**
(`5432`). Set `NEXT_PUBLIC_APP_URL` to your deployed URL.

### Keeping scores live (important)
Vercel's **Hobby plan only runs crons once per day**, which is useless during
live matches. So the primary scheduler is a **GitHub Actions workflow**
([`.github/workflows/cron.yml`](./.github/workflows/cron.yml)) that pings the
cron endpoints every ~10 minutes. To enable it, add two **repo secrets**
(Settings → Secrets and variables → Actions):

- `APP_URL` = your Vercel URL
- `CRON_SECRET` = same value as the Vercel `CRON_SECRET` env var

The `vercel.json` daily cron remains as a backup. Both endpoints are protected
by the `CRON_SECRET` bearer token. (Upgrade to Vercel Pro for native frequent
crons instead, if preferred.)

### Cron endpoints (all `Authorization: Bearer $CRON_SECRET`)
- `POST /api/cron/sync` — sync scores/status, lock kicked-off picks, grade
  finished matches, recompute standings, fire score-hit + rank-climb push.
- `POST /api/cron/notify` — send "lock your pick" reminders (45–60 min pre-kickoff).
- `POST /api/cron/grade?regrade=1` — re-grade everything (after a scoring change).

## Build plan

1. ✅ Scaffold · 2. ✅ Auth + profiles + RLS · 3. ✅ Data layer + fixtures ·
4. ✅ Predictions + kickoff lock · 5. ✅ Cron pipeline (grade + standings) ·
6. ✅ Animated leaderboard + Realtime · 7. ✅ Gamification (badges, confetti, chart) ·
8. ✅ PWA + web push + settings · 9. ⏭️ Leagues (deferred) ·
10. ✅ Polish + ship (states, a11y, GitHub Actions cron).

Plus: near-live scores via worldcup26.ir (openfootball fallback); per-user pick
history (`/u/[username]`); perf indexes.
