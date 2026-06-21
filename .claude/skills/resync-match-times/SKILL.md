---
name: resync-match-times
description: Re-sync match kickoff times (and scores/status) from the live football source into the DB, so prediction locks track the real start time. Use when a match was rescheduled, a kickoff looks wrong, or users report a match "didn't lock". Invoke when the user types /resync-match-times.
---

# /resync-match-times — pull kickoff/score changes from the source into the DB

The cron normally does this every ~10 min, but it's flaky (external scheduler).
When the source moves a kickoff and the cron hasn't run, the DB holds a stale
kickoff — so the server lock and the UI treat the match as open past its real
start. This skill forces the sync now.

It reuses the real server code (`src/lib/football/sync.ts`), so behaviour is
identical to the cron: kickoff only changes while a match is still `scheduled`,
finished matches are never touched, and picks past the refreshed kickoff get
locked the same run. It does **not** grade or recompute standings.

## ⚠ This writes to the LIVE shared DB

Per CLAUDE.md DATABASE SAFETY: always back up first, and apply only after the
user explicitly OKs the specific changes. The preview step is read-only and
needs no approval.

## Steps

1. **Server-only stub** (tsx can't import the server modules without it):
   ```bash
   source "$HOME/.nvm/nvm.sh" && nvm use 20
   mkdir -p node_modules/server-only
   echo 'module.exports={}' > node_modules/server-only/index.js
   printf '%s' '{"name":"server-only","version":"0.0.0","main":"index.js"}' > node_modules/server-only/package.json
   ```

2. **Preview (read-only)** — show what would change:
   ```bash
   npx tsx --env-file=.env.local .claude/skills/resync-match-times/preview.mjs
   ```
   Relay the table to the user. If it says "No changes", stop — remove the stub
   (step 5) and report nothing to do.

3. **Backup, then get the user's OK.** Only if there are changes:
   ```bash
   npm run db:backup
   ```
   Then ask the user to confirm applying the listed changes (call out any
   KICKOFF reschedules — those affect lock timing). Wait for an explicit yes.

4. **Apply** (LIVE mutation — only after yes):
   ```bash
   npx tsx --env-file=.env.local .claude/skills/resync-match-times/apply.mjs
   ```
   Report the SYNC RESULT (`scoresUpdated`, `statusChanges`, `lockedNow`).

5. **Remove the stub** (always, even on early exit):
   ```bash
   rm -rf node_modules/server-only
   ```

## Notes

- A reschedule that moved a kickoff EARLIER can mean a pick was submitted after
  the real start (before this fix landed). The sync locks it but does not undo
  it — if `lockedNow` is high right after a known reschedule, check
  `predictions.created_at` vs the new `kickoff_utc` for that match and flag any
  to the user; that's a manual data call, not something this skill auto-fixes.
- Deploying the code lets the cron handle future reschedules on its own; this
  skill is the manual nudge for when you can't wait for it.
