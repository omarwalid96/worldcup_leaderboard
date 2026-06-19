# /recap — AI league recap (how to use)

A **Claude Code skill** that writes a funny Egyptian-football-banter recap of the
league's recent activity from the **live database**, then auto-publishes it to the
home-page **AI Summary** card so every user sees it in the app.

**No API key, no subscription, no per-call cost** — it runs inside this Claude Code
chat (Claude reads the DB and writes the recap). It is **read-only** except for one
insert into the `ai_summaries` table when it publishes.

## How to run it

In the Claude Code chat, type:

```
/recap
```

That uses **today** (last 1 day). Add a time window and/or steering:

| Command | What it does |
|---|---|
| `/recap` | Today's activity |
| `/recap last 3 days` | Last 3 days |
| `/recap this week` | Last 7 days |
| `/recap all` | Whole tournament so far (~30 days) |
| `/recap roast Gogo` | Focus the banter on one person |
| `/recap focus on the England match` | Center it on a specific match |
| `/recap keep it clean` | Hype only, no roasting |
| `/recap make it short` | Tighter, fewer lines |
| `/recap last 3 days draft` | Generate but **do NOT publish** (add `draft` or `no publish`) |

Combine freely, e.g. `/recap this week roast everyone, keep it short`.

## What happens

1. Claude runs `gather.mjs` (read-only) to pull current standings + the window's
   graded matches, picks, live matches, badges, penalty-duel results, quotes, and
   new sponsors.
2. Claude writes the recap from that **real data** (no invented events) and shows it
   to you in a copy-paste block — paste it straight into the WhatsApp group.
3. Unless you said `draft`, it auto-publishes via `publish.mjs` → inserts a row into
   `ai_summaries` → the **AI Summary** card on the Home page updates for all users.

To tweak after seeing it: just say "make it spicier / shorter / focus on Saif" and
Claude rewrites and republishes.

## Files

- `SKILL.md` — the instructions Claude follows (the skill definition).
- `gather.mjs` — READ-ONLY data snapshot (`node --env-file=.env.local … gather.mjs [days]`).
- `publish.mjs` — inserts the recap into `ai_summaries` (reads body from stdin).

## Safety

- Read-only against `predictions`/`standings`/`matches`/etc.; the only write is the
  `ai_summaries` insert (per the DB-safety rules in `CLAUDE.md`).
- The Home card shows the **latest** recap; older rows are kept as history.
