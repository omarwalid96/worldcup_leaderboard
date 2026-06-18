-- Shared "Sponsors" gallery on the home dashboard: a single global list of up to
-- 10 images (cap enforced in the app). Any member can add/remove any image.
-- Idempotent.
create table if not exists "sponsors" (
  "id"          uuid primary key default gen_random_uuid(),
  "image_url"   text not null,
  "uploaded_by" uuid references "profiles"("id") on delete set null,
  "created_at"  timestamptz not null default now()
);

create index if not exists "sponsors_created_idx" on "sponsors" ("created_at");

-- RLS: any authenticated member can read, insert, and delete (communal gallery).
alter table "sponsors" enable row level security;

drop policy if exists "sponsors_read_all" on "sponsors";
create policy "sponsors_read_all" on "sponsors"
  for select to authenticated using (true);

drop policy if exists "sponsors_insert_member" on "sponsors";
create policy "sponsors_insert_member" on "sponsors"
  for insert to authenticated with check (true);

drop policy if exists "sponsors_delete_member" on "sponsors";
create policy "sponsors_delete_member" on "sponsors"
  for delete to authenticated using (true);
