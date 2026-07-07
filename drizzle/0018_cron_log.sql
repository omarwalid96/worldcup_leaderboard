-- cron_log: heartbeat + audit for the sync cron. Previously created ad-hoc by
-- recordCronRun() on every tick (a DDL round-trip ~300×/day); that was removed
-- to keep quiet ticks cheap, so the table is owned here now. Idempotent.
create table if not exists cron_log (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  detail jsonb,
  ran_at timestamptz not null default now()
);

-- Fixed heartbeat row, upserted in place by quiet ticks (no row growth).
insert into cron_log (id, job, detail)
values ('00000000-0000-0000-0000-000000000001', 'sync', '{"heartbeat":true}'::jsonb)
on conflict (id) do nothing;
