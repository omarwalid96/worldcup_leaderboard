-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security for GroupStage
--
-- Model: a small private league. Authenticated members can READ shared data
-- (other profiles, matches, standings, badges) but can only WRITE their own
-- profile and predictions. All grading/standings writes happen via the
-- service-role key (which bypasses RLS), never from the client.
--
-- Run AFTER 0000_*.sql. Idempotent where practical.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS on every table.
alter table "profiles"        enable row level security;
alter table "leagues"         enable row level security;
alter table "league_members"  enable row level security;
alter table "matches"         enable row level security;
alter table "predictions"     enable row level security;
alter table "standings"       enable row level security;
alter table "badges"          enable row level security;
alter table "user_badges"     enable row level security;
alter table "points_history"  enable row level security;

-- ── profiles ────────────────────────────────────────────────────────────────
-- Everyone signed in can read profiles (league is public-ish within the group).
drop policy if exists "profiles_read_all" on "profiles";
create policy "profiles_read_all" on "profiles"
  for select to authenticated using (true);

-- Only the owner can update their own profile.
drop policy if exists "profiles_update_own" on "profiles";
create policy "profiles_update_own" on "profiles"
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ── leagues / membership ─────────────────────────────────────────────────────
drop policy if exists "leagues_read_all" on "leagues";
create policy "leagues_read_all" on "leagues"
  for select to authenticated using (true);

-- A league owner can update/delete their league.
drop policy if exists "leagues_modify_owner" on "leagues";
create policy "leagues_modify_owner" on "leagues"
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "leagues_delete_owner" on "leagues";
create policy "leagues_delete_owner" on "leagues"
  for delete to authenticated using (auth.uid() = owner_id);

-- Only an admin can create a league (defense-in-depth; the Server Action also
-- checks). Owner must be the creator.
drop policy if exists "leagues_insert_self_owner" on "leagues";
drop policy if exists "leagues_insert_admin_owner" on "leagues";
create policy "leagues_insert_admin_owner" on "leagues"
  for insert to authenticated
  with check (
    auth.uid() = owner_id
    and exists (select 1 from profiles pf where pf.id = auth.uid() and pf.is_admin)
  );

drop policy if exists "league_members_read_all" on "league_members";
create policy "league_members_read_all" on "league_members"
  for select to authenticated using (true);

-- A user can add/remove only their own membership (join/leave).
drop policy if exists "league_members_join_self" on "league_members";
create policy "league_members_join_self" on "league_members"
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "league_members_leave_self" on "league_members";
create policy "league_members_leave_self" on "league_members"
  for delete to authenticated using (auth.uid() = user_id);

-- ── matches (read-only to clients; written only by service role) ──────────────
drop policy if exists "matches_read_all" on "matches";
create policy "matches_read_all" on "matches"
  for select to authenticated using (true);

-- ── predictions (own rows only) ──────────────────────────────────────────────
drop policy if exists "predictions_read_all" on "predictions";
create policy "predictions_read_all" on "predictions"
  for select to authenticated using (true); -- league members can see each other's picks

-- Insert only your own prediction, for a match within the 24h pre-kickoff
-- prediction window (now >= kickoff - 24h AND kickoff > now).
drop policy if exists "predictions_insert_own_unlocked" on "predictions";
create policy "predictions_insert_own_unlocked" on "predictions"
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and locked = false
    and exists (
      select 1 from "matches" m
      where m.id = match_id
        and m.kickoff_utc > now()
        and now() >= m.kickoff_utc - interval '24 hours'
    )
  );

-- Update only your own prediction, while unlocked, within the 24h window.
-- Defense-in-depth; the Server Action checks first.
drop policy if exists "predictions_update_own_unlocked" on "predictions";
create policy "predictions_update_own_unlocked" on "predictions"
  for update to authenticated
  using (
    auth.uid() = user_id
    and locked = false
    and exists (
      select 1 from "matches" m
      where m.id = match_id
        and m.kickoff_utc > now()
        and now() >= m.kickoff_utc - interval '24 hours'
    )
  )
  with check (
    auth.uid() = user_id
    and locked = false
    and exists (
      select 1 from "matches" m
      where m.id = match_id
        and m.kickoff_utc > now()
        and now() >= m.kickoff_utc - interval '24 hours'
    )
  );

-- ── standings (read-only to clients) ─────────────────────────────────────────
drop policy if exists "standings_read_all" on "standings";
create policy "standings_read_all" on "standings"
  for select to authenticated using (true);

-- ── badges / user_badges (read-only to clients) ──────────────────────────────
drop policy if exists "badges_read_all" on "badges";
create policy "badges_read_all" on "badges"
  for select to authenticated using (true);

drop policy if exists "user_badges_read_all" on "user_badges";
create policy "user_badges_read_all" on "user_badges"
  for select to authenticated using (true);

-- ── points_history (own rows readable) ───────────────────────────────────────
drop policy if exists "points_history_read_all" on "points_history";
create policy "points_history_read_all" on "points_history"
  for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tie profiles to auth.users so deleting an auth user cascades to its profile
-- (and onward to predictions/standings/etc via their FKs). Drizzle can't model
-- this cross-schema FK, so it lives here.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  alter table profiles
    add constraint profiles_id_fkey
    foreign key (id) references auth.users(id) on delete cascade;
exception when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-create a profile when an auth user is created.
-- The user-creation script passes display_name + username in raw_user_meta_data.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, timezone, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'timezone', 'UTC'),
    coalesce((new.raw_user_meta_data->>'is_admin')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime: broadcast standings changes so the leaderboard animates live.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table standings;
exception when duplicate_object then null;
end $$;
