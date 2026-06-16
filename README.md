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

## Architecture notes

- **Server-authoritative rules.** Kickoff locks and grading are decided on the
  server by comparing `now()` to `kickoff_utc`. The client clock is never trusted.
- **Swappable data source.** All football data flows through the
  `FootballProvider` interface (`src/lib/football`). Switch sources via the
  `FOOTBALL_PROVIDER` env var without touching app code.
- **All times stored in UTC**, converted to the user's timezone only for display.
- **RLS** restricts each user to editing only their own predictions/profile.

## Build plan

1. ✅ **Scaffold** — Next 15 + Tailwind v4 + shadcn + Drizzle + Supabase, design system, landing page.
2. ⏳ **Auth + profiles** — preset username/password users, profile page, RLS.
3. **Data layer** — `FootballProvider` adapter, seed 2026 fixtures, match cards.
4. **Predictions** — scoreline picks, server-enforced kickoff lock.
5. **Cron pipeline** — poll, flip statuses, grade, compute standings.
6. **Leaderboard** — animated ranked table, Realtime, podium, rank trends.
7. **Gamification** — double-down, streaks, badges, confetti, profile chart.
8. **Notifications** — PWA, web push, settings.
9. **Leagues** — invite codes/links, multi-league.
10. **Polish + ship** — installable PWA, states, a11y, deploy to Vercel.
