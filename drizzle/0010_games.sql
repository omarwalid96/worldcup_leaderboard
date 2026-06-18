-- ─────────────────────────────────────────────────────────────────────────────
-- Games section (Phase 1 foundation).
--
-- A SEPARATE world from the prediction league: these tables NEVER touch
-- standings / predictions / matches. Two tables:
--   game_matches  — one row per match between two members (state in jsonb)
--   game_results  — aggregate W/L/D per user per game_type (public scoreboard)
--
-- Idempotent (CREATE TABLE IF NOT EXISTS, guarded policies + publication).
-- Apply with the rest after `npm run db:backup`. RLS lives here, not in schema.ts.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists "game_matches" (
  "id"          uuid primary key default gen_random_uuid(),
  "game_type"   text not null,
  "status"      text not null default 'pending',
  "player1_id"  uuid not null references "profiles"("id") on delete cascade,
  "player2_id"  uuid references "profiles"("id") on delete cascade,
  "turn"        uuid references "profiles"("id"),
  "state"       jsonb not null default '{}'::jsonb,
  "winner_id"   uuid references "profiles"("id"),
  "score"       jsonb,
  "created_at"  timestamptz not null default now(),
  "updated_at"  timestamptz not null default now()
);

create index if not exists "game_matches_player1_idx"  on "game_matches" ("player1_id");
create index if not exists "game_matches_player2_idx"  on "game_matches" ("player2_id");
create index if not exists "game_matches_status_idx"   on "game_matches" ("status");
create index if not exists "game_matches_game_type_idx" on "game_matches" ("game_type");

create table if not exists "game_results" (
  "user_id"    uuid not null references "profiles"("id") on delete cascade,
  "game_type"  text not null,
  "wins"       integer not null default 0,
  "losses"     integer not null default 0,
  "draws"      integer not null default 0,
  "updated_at" timestamptz not null default now(),
  primary key ("user_id", "game_type")
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table "game_matches" enable row level security;
alter table "game_results" enable row level security;

-- game_matches: a player (1 or 2) may read/update their own match rows. Inserts
-- only with player1_id = auth.uid() (you can only create a match you challenge).
-- Authoritative move resolution still happens via the service-role Server Action.
drop policy if exists "game_matches_select_participant" on "game_matches";
create policy "game_matches_select_participant" on "game_matches"
  for select to authenticated
  using (auth.uid() = player1_id or auth.uid() = player2_id);

drop policy if exists "game_matches_insert_own" on "game_matches";
create policy "game_matches_insert_own" on "game_matches"
  for insert to authenticated
  with check (auth.uid() = player1_id);

drop policy if exists "game_matches_update_participant" on "game_matches";
create policy "game_matches_update_participant" on "game_matches"
  for update to authenticated
  using (auth.uid() = player1_id or auth.uid() = player2_id)
  with check (auth.uid() = player1_id or auth.uid() = player2_id);

-- game_results: public W/L readable by all signed-in users; writes go through
-- the service role only (Server Action), so no insert/update policy.
drop policy if exists "game_results_read_all" on "game_results";
create policy "game_results_read_all" on "game_results"
  for select to authenticated using (true);

-- ── Realtime ───────────────────────────────────────────────────────────────
-- Subscribe to game_matches changes so the live duel rooms re-sync via
-- postgres_changes (the row is the single source of truth).
do $$
begin
  alter publication supabase_realtime add table game_matches;
exception when duplicate_object then null;
end $$;
