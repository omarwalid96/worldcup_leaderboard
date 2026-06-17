-- ─────────────────────────────────────────────────────────────────────────────
-- 0006_rls_window.sql
-- Switch prediction INSERT/UPDATE RLS policies from the US-Eastern calendar-day
-- gate to a pure UTC time-window gate: picks open 12 hours before kickoff and
-- lock at kickoff. The window is the same instant for every user worldwide.
-- ─────────────────────────────────────────────────────────────────────────────

-- Insert: own row, not locked, within 12h window.
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
        and now() >= m.kickoff_utc - interval '12 hours'
    )
  );

-- Update: own row, not locked, within 12h window.
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
        and now() >= m.kickoff_utc - interval '12 hours'
    )
  )
  with check (
    auth.uid() = user_id
    and locked = false
    and exists (
      select 1 from "matches" m
      where m.id = match_id
        and m.kickoff_utc > now()
        and now() >= m.kickoff_utc - interval '12 hours'
    )
  );
