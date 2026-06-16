/**
 * Seeds the 2026 World Cup fixtures + badge definitions.
 *
 *   npm run db:seed
 *
 * Idempotent: matches upsert on external_id, badges upsert on id. Safe to
 * re-run (e.g. after the provider publishes new results) — it refreshes
 * scores/status without touching predictions or standings.
 *
 * Needs DATABASE_URL. Uses the configured FootballProvider (default openfootball).
 */
import postgres from "postgres";
import { compositeProvider } from "../src/lib/football/composite";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

const BADGES = [
  { id: "first_exact", name: "Bullseye", description: "Predict your first exact scoreline.", icon: "🎯" },
  { id: "hat_trick", name: "Hat-trick", description: "Three exact scorelines.", icon: "🎩" },
  { id: "hot_streak", name: "On Fire", description: "Correct results on 3 matchdays in a row.", icon: "🔥" },
  { id: "double_or_nothing", name: "High Roller", description: "Land a double-down for points.", icon: "🎲" },
  { id: "group_guru", name: "Group Guru", description: "Score in every group-stage matchday.", icon: "🧠" },
  { id: "top_of_table", name: "Table Topper", description: "Sit at #1 on the leaderboard.", icon: "👑" },
] as const;

async function main() {
  console.log(`Fetching fixtures from ${compositeProvider.name}…`);
  const fixtures = await compositeProvider.getFixtures();
  console.log(`Got ${fixtures.length} fixtures.`);

  // Switching fixture sources changes external_id scheme. Remove stale matches
  // whose external_id is no longer present (keeps predictions on kept matches).
  const keepIds = fixtures.map((f) => f.externalId);
  if (keepIds.length > 0) {
    const removed = await sql`
      delete from matches where external_id <> all(${keepIds})
    `;
    if (removed.count > 0) console.log(`Removed ${removed.count} stale matches.`);
  }

  let upserted = 0;
  for (const f of fixtures) {
    await sql`
      insert into matches (
        external_id, stage, group_name, matchday,
        home_team, away_team, home_code, away_code,
        venue, kickoff_utc, status, home_score, away_score, last_synced_at
      ) values (
        ${f.externalId}, ${f.stage}, ${f.groupName}, ${f.matchday},
        ${f.homeTeam}, ${f.awayTeam}, ${f.homeCode}, ${f.awayCode},
        ${f.venue}, ${f.kickoffUtc}, ${f.status}, ${f.homeScore}, ${f.awayScore}, now()
      )
      on conflict (external_id) do update set
        stage = excluded.stage,
        group_name = excluded.group_name,
        matchday = excluded.matchday,
        home_team = excluded.home_team,
        away_team = excluded.away_team,
        home_code = excluded.home_code,
        away_code = excluded.away_code,
        venue = excluded.venue,
        kickoff_utc = excluded.kickoff_utc,
        -- Don't downgrade a live/finished status back to scheduled from the
        -- results feed; let the cron own live transitions.
        status = case
          when matches.status = 'live' and excluded.status = 'scheduled' then 'live'
          else excluded.status
        end,
        home_score = excluded.home_score,
        away_score = excluded.away_score,
        last_synced_at = now()
    `;
    upserted++;
  }
  console.log(`Upserted ${upserted} matches.`);

  for (const b of BADGES) {
    await sql`
      insert into badges (id, name, description, icon)
      values (${b.id}, ${b.name}, ${b.description}, ${b.icon})
      on conflict (id) do update set
        name = excluded.name, description = excluded.description, icon = excluded.icon
    `;
  }
  console.log(`Upserted ${BADGES.length} badges.`);

  const [counts] = await sql<{ total: number; finished: number; groups: number }[]>`
    select
      count(*)::int as total,
      count(*) filter (where status = 'finished')::int as finished,
      count(distinct group_name)::int as groups
    from matches
  `;
  console.log(
    `\nDB now has ${counts.total} matches (${counts.finished} finished) across ${counts.groups} groups.`,
  );
}

main()
  .then(() => sql.end())
  .catch(async (err) => {
    console.error(err);
    await sql.end();
    process.exit(1);
  });
