-- Comments on an AI Summary recap: each user gets ONE comment per summary
-- (upserted), shown to everyone in the recap popup. The /recap skill reads
-- these on its next run so it can respond to the banter. Nullable section:
-- a summary simply has zero comment rows until people write. Idempotent.
create table if not exists "summary_comments" (
  "id"         uuid primary key default gen_random_uuid(),
  "summary_id" uuid not null references "ai_summaries"("id") on delete cascade,
  "user_id"    uuid not null references "profiles"("id") on delete cascade,
  "body"       text not null,
  "created_at" timestamptz not null default now(),
  unique ("summary_id", "user_id")
);

create index if not exists "summary_comments_summary_idx"
  on "summary_comments" ("summary_id", "created_at");

-- RLS: any authenticated member reads all comments (communal). Inserts/updates
-- go through the server action (service role) which enforces auth + 140-char cap.
alter table "summary_comments" enable row level security;

drop policy if exists "summary_comments_read_all" on "summary_comments";
create policy "summary_comments_read_all" on "summary_comments"
  for select to authenticated using (true);
