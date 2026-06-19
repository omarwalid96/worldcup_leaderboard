-- AI-generated league recaps for the home "AI Summary" card. Written by the
-- /recap Claude Code skill; the card shows the latest row. Idempotent.
create table if not exists "ai_summaries" (
  "id"         uuid primary key default gen_random_uuid(),
  "body"       text not null,
  "created_at" timestamptz not null default now()
);

create index if not exists "ai_summaries_created_idx" on "ai_summaries" ("created_at" desc);

-- RLS: readable by any signed-in member; writes go through the service role
-- (the skill / a server action), so no insert policy.
alter table "ai_summaries" enable row level security;

drop policy if exists "ai_summaries_read_all" on "ai_summaries";
create policy "ai_summaries_read_all" on "ai_summaries"
  for select to authenticated using (true);
