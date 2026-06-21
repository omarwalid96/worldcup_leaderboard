-- "Nudges": one user whacks another on the leaderboard (a cartoon hammer/bomb
-- animation). The animation is delivered live via a Supabase broadcast; this
-- table persists it so the target can replay on next open + so sends can be
-- rate-limited (one per hour per sender). Idempotent.
create table if not exists "nudges" (
  "id"           uuid primary key default gen_random_uuid(),
  "league_id"    uuid not null references "leagues"("id") on delete cascade,
  "from_user_id" uuid not null references "profiles"("id") on delete cascade,
  "to_user_id"   uuid not null references "profiles"("id") on delete cascade,
  "seen"         boolean not null default false,
  "created_at"   timestamptz not null default now()
);

create index if not exists "nudges_from_idx" on "nudges" ("from_user_id", "created_at");
create index if not exists "nudges_to_unseen_idx" on "nudges" ("to_user_id", "seen");

-- RLS: a user reads nudges aimed at them. Inserts + the rate-limit check + the
-- broadcast all go through the server action (service role), so no insert/update
-- policy is needed for the client.
alter table "nudges" enable row level security;

drop policy if exists "nudges_read_own" on "nudges";
create policy "nudges_read_own" on "nudges"
  for select to authenticated using (auth.uid() = to_user_id);
