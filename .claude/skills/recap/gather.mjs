/**
 * READ-ONLY data gatherer for the /recap skill. Pulls a snapshot of recent
 * league activity so Claude can write a funny recap. Touches NOTHING — pure
 * SELECTs. Run with:  node --env-file=.env.local .claude/skills/recap/gather.mjs [days]
 *
 * `days` (default 1) is the lookback window in calendar days for "activity".
 * Standings/leaders are always current. Output is JSON on stdout.
 */
import postgres from "postgres";

const days = Number(process.argv[2] ?? 1);
const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

function out(o) {
  process.stdout.write(JSON.stringify(o, null, 2) + "\n");
}

try {
  const sinceExpr = sql`now() - (${days} || ' days')::interval`;

  // Current standings (the live table) — who's winning right now.
  const standings = await sql`
    select p.display_name, p.username, p.quote, s.total_points, s.rank,
           s.previous_rank, s.streak, s.exact_hits
    from standings s join profiles p on p.id = s.user_id
    order by s.total_points desc, p.display_name`;

  // Matches that FINISHED in the window, with everyone's pick + points.
  const gradedPicks = await sql`
    select m.home_team, m.away_team, m.home_score, m.away_score,
           (m.kickoff_utc at time zone 'UTC')::date as day,
           p.display_name, pr.home_pick, pr.away_pick, pr.points_awarded
    from matches m
    join predictions pr on pr.match_id = m.id
    join profiles p on p.id = pr.user_id
    where m.status = 'finished'
      and pr.points_awarded is not null
      and m.kickoff_utc >= ${sinceExpr}
    order by m.kickoff_utc, pr.points_awarded desc`;

  // Live matches right now (in play) + the picks beside them.
  const liveMatches = await sql`
    select m.home_team, m.away_team, m.home_score, m.away_score
    from matches m where m.status = 'live'`;

  // Predictions created/updated in the window (who showed up, last-minute picks).
  const recentPicks = await sql`
    select p.display_name, m.home_team, m.away_team, pr.home_pick, pr.away_pick,
           pr.updated_at, m.kickoff_utc
    from predictions pr
    join matches m on m.id = pr.match_id
    join profiles p on p.id = pr.user_id
    where pr.updated_at >= ${sinceExpr}
    order by pr.updated_at desc
    limit 40`;

  // Badges earned in the window.
  const badges = await sql`
    select p.display_name, b.name, b.icon, ub.earned_at
    from user_badges ub
    join badges b on b.id = ub.badge_id
    join profiles p on p.id = ub.user_id
    where ub.earned_at >= ${sinceExpr}
    order by ub.earned_at desc`;

  // Games played (finished duels) in the window — who beat whom.
  const games = await sql`
    select gm.game_type, gm.score, gm.updated_at,
           w.display_name as winner,
           p1.display_name as p1, p2.display_name as p2
    from game_matches gm
    left join profiles w on w.id = gm.winner_id
    left join profiles p1 on p1.id = gm.player1_id
    left join profiles p2 on p2.id = gm.player2_id
    where gm.status = 'finished' and gm.updated_at >= ${sinceExpr}
    order by gm.updated_at desc`;

  // Anyone with a quote set (so the recap can riff on them, esp. the leader).
  const quotes = await sql`
    select display_name, quote from profiles where quote is not null and quote <> ''`;

  // Sponsors added in the window.
  const sponsorsAdded = await sql`
    select p.display_name, s.created_at
    from sponsors s left join profiles p on p.id = s.uploaded_by
    where s.created_at >= ${sinceExpr}`;

  out({
    window_days: days,
    generated_at: new Date().toISOString(),
    standings,
    leader_points: standings[0]?.total_points ?? null,
    graded_picks: gradedPicks,
    live_matches: liveMatches,
    recent_picks: recentPicks,
    badges_earned: badges,
    games_played: games,
    quotes,
    sponsors_added: sponsorsAdded,
  });
  await sql.end();
} catch (e) {
  out({ error: e.message });
  await sql.end();
  process.exit(1);
}
