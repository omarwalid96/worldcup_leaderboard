/**
 * Drizzle schema for GroupStage.
 *
 * Conventions:
 *  - All timestamps stored in UTC (`timestamp with time zone`).
 *  - `profiles.id` mirrors the Supabase auth user id (auth.users.id).
 *  - Kickoff lock + grading are SERVER-authoritative; the client never decides them.
 *  - RLS is applied via SQL migration (see drizzle/0001_rls.sql), not here.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  unique,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const matchStatus = pgEnum("match_status", [
  "scheduled",
  "live",
  "finished",
]);

export const matchStage = pgEnum("match_stage", [
  "group",
  "round_of_32",
  "round_of_16",
  "quarter_final",
  "semi_final",
  "third_place",
  "final",
]);

/** User profile, 1:1 with a Supabase auth user. */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // = auth.users.id
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  // Optional business-card image. Editable only directly in the DB (no app UI);
  // shown as a small tappable thumbnail on the profile when set, else hidden.
  businessCardUrl: text("business_card_url"),
  // Short personal tagline (max 120 chars). Shown on the home leader spotlight.
  quote: text("quote"),
  timezone: text("timezone").notNull().default("UTC"),
  // Web Push subscription (PushSubscription JSON) — null until the user opts in.
  pushSubscription: jsonb("push_subscription"),
  notifPrefs: jsonb("notif_prefs")
    .notNull()
    .default({ lockReminder: true, scoreHit: true, rankClimb: true, gameChallenge: true, nudge: true }),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const leagues = pgTable("leagues", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const leagueMembers = pgTable(
  "league_members",
  {
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId] })],
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Stable id from the data provider, used for idempotent upserts on sync.
    externalId: text("external_id").notNull().unique(),
    stage: matchStage("stage").notNull(),
    groupName: text("group_name"), // e.g. "A".."L" for group stage, null for knockout
    matchday: integer("matchday").notNull(), // tournament day index, used for streaks/double-down
    homeTeam: text("home_team").notNull(),
    awayTeam: text("away_team").notNull(),
    homeCode: text("home_code"), // ISO country code for flag (nullable for TBD knockout slots)
    awayCode: text("away_code"),
    venue: text("venue"),
    kickoffUtc: timestamp("kickoff_utc", { withTimezone: true }).notNull(),
    status: matchStatus("status").notNull().default("scheduled"),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    // Penalty shootout (knockout only) — the data source can't report these, so
    // an admin sets them after the match. wentToPens gates the pens bonus.
    wentToPens: boolean("went_to_pens").notNull().default(false),
    pensHome: integer("pens_home"), // actual shootout score
    pensAway: integer("pens_away"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  },
  (t) => [
    index("matches_kickoff_idx").on(t.kickoffUtc),
    index("matches_status_idx").on(t.status),
  ],
);

export const predictions = pgTable(
  "predictions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    homePick: integer("home_pick").notNull(),
    awayPick: integer("away_pick").notNull(),
    isDoubleDown: boolean("is_double_down").notNull().default(false),
    // Penalty shootout pick (knockout only) — saved upfront with the scoreline.
    // Only scored if the match actually goes to pens. pensWinner: 'home'|'away'.
    pensWinner: text("pens_winner"),
    pensHomePick: integer("pens_home_pick"), // optional exact shootout score guess
    pensAwayPick: integer("pens_away_pick"),
    // Set true by the server once kickoff has passed; a locked pick is immutable.
    locked: boolean("locked").notNull().default(false),
    // null until the match is graded.
    pointsAwarded: integer("points_awarded"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("predictions_user_match_unique").on(t.userId, t.matchId),
    index("predictions_match_idx").on(t.matchId),
    index("predictions_user_idx").on(t.userId),
    index("predictions_user_points_idx").on(t.userId, t.pointsAwarded),
  ],
);

/** Cached per-league standing row, recomputed by the grading pipeline. */
export const standings = pgTable(
  "standings",
  {
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // Manual starting points (a baseline set by an admin). total_points =
    // baseline_points + sum of graded prediction points. Survives re-grading.
    baselinePoints: integer("baseline_points").notNull().default(0),
    totalPoints: integer("total_points").notNull().default(0),
    rank: integer("rank").notNull().default(0),
    previousRank: integer("previous_rank").notNull().default(0),
    exactHits: integer("exact_hits").notNull().default(0),
    streak: integer("streak").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.leagueId, t.userId] }),
    index("standings_league_rank_idx").on(t.leagueId, t.rank),
  ],
);

/**
 * A "nudge" — one user whacks another on the leaderboard. The animation itself
 * is ephemeral (a Supabase broadcast), but we persist the nudge so the target
 * can replay it on next open and so we can rate-limit sends (one per hour per
 * sender, checked server-side). `seen` flips once the target plays it.
 */
export const nudges = pgTable(
  "nudges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    seen: boolean("seen").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("nudges_from_idx").on(t.fromUserId, t.createdAt),
    index("nudges_to_unseen_idx").on(t.toUserId, t.seen),
  ],
);

export const badges = pgTable("badges", {
  id: text("id").primaryKey(), // slug, e.g. "first_exact"
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(), // lucide icon name or emoji
});

export const userBadges = pgTable(
  "user_badges",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    badgeId: text("badge_id")
      .notNull()
      .references(() => badges.id, { onDelete: "cascade" }),
    earnedAt: timestamp("earned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badgeId] })],
);

/**
 * Shared "Sponsors" gallery shown on the home dashboard. A single global list
 * (not per-user) capped at 10 images, enforced in the upload action. Any member
 * can add or remove any image. `uploadedBy` is informational.
 */
export const sponsors = pgTable("sponsors", {
  id: uuid("id").primaryKey().defaultRandom(),
  imageUrl: text("image_url").notNull(),
  uploadedBy: uuid("uploaded_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * AI-generated league recaps shown on the home "AI Summary" card. Written by the
 * /recap Claude Code skill (gather → write → publish). The card shows the most
 * recent row; older rows are retained as history.
 */
export const aiSummaries = pgTable("ai_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** One comment per user per AI Summary recap, shown to everyone in the popup. */
export const summaryComments = pgTable(
  "summary_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    summaryId: uuid("summary_id")
      .notNull()
      .references(() => aiSummaries.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.summaryId, t.userId)],
);

/** Per-user rank snapshot per matchday per league, for the rank-over-time chart. */
export const rankHistory = pgTable(
  "rank_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    matchday: integer("matchday").notNull(),
    rank: integer("rank").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("rank_history_user_idx").on(t.userId),
    uniqueIndex("rank_history_user_league_matchday_unique").on(
      t.userId,
      t.leagueId,
      t.matchday,
    ),
  ],
);

/** Append-only points ledger powering the profile "points over time" chart. */
export const pointsHistory = pgTable(
  "points_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    matchday: integer("matchday").notNull(),
    cumulativePoints: integer("cumulative_points").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("points_history_user_idx").on(t.userId),
    uniqueIndex("points_history_user_matchday_unique").on(t.userId, t.matchday),
  ],
);

// ── Games (separate world from the prediction league) ───────────────────────
// game_type is a free-form string (not an enum) so adding a new game needs no
// migration. RLS lives in drizzle/0010_games.sql, never here.

/** A single game match between two members. `state` holds the per-game blob. */
export const gameMatches = pgTable(
  "game_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameType: text("game_type").notNull(), // 'penalty_duel' | 'trivia_duel' | …
    status: text("status").notNull().default("pending"), // pending | active | finished | declined | expired
    player1Id: uuid("player1_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }), // challenger
    player2Id: uuid("player2_id").references(() => profiles.id, {
      onDelete: "cascade",
    }), // challenged (null = open challenge)
    turn: uuid("turn").references(() => profiles.id), // whose turn (null for simultaneous)
    state: jsonb("state").notNull().default({}), // per-game blob
    winnerId: uuid("winner_id").references(() => profiles.id), // null until finished; null+finished = draw
    score: jsonb("score"), // optional {p1,p2} for display
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("game_matches_player1_idx").on(t.player1Id),
    index("game_matches_player2_idx").on(t.player2Id),
    index("game_matches_status_idx").on(t.status),
    index("game_matches_game_type_idx").on(t.gameType),
  ],
);

/** Aggregate W/L/D per user per game_type (profile card + future badges). */
export const gameResults = pgTable(
  "game_results",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    gameType: text("game_type").notNull(),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.gameType] })],
);

// ── Relations ──────────────────────────────────────────────────────────────
export const profilesRelations = relations(profiles, ({ many }) => ({
  predictions: many(predictions),
  memberships: many(leagueMembers),
  badges: many(userBadges),
}));

export const leaguesRelations = relations(leagues, ({ one, many }) => ({
  owner: one(profiles, {
    fields: [leagues.ownerId],
    references: [profiles.id],
  }),
  members: many(leagueMembers),
  standings: many(standings),
}));

export const leagueMembersRelations = relations(leagueMembers, ({ one }) => ({
  league: one(leagues, {
    fields: [leagueMembers.leagueId],
    references: [leagues.id],
  }),
  user: one(profiles, {
    fields: [leagueMembers.userId],
    references: [profiles.id],
  }),
}));

export const matchesRelations = relations(matches, ({ many }) => ({
  predictions: many(predictions),
}));

export const predictionsRelations = relations(predictions, ({ one }) => ({
  user: one(profiles, {
    fields: [predictions.userId],
    references: [profiles.id],
  }),
  match: one(matches, {
    fields: [predictions.matchId],
    references: [matches.id],
  }),
}));

// ── Inferred types ───────────────────────────────────────────────────────────
export type Profile = typeof profiles.$inferSelect;
export type League = typeof leagues.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Prediction = typeof predictions.$inferSelect;
export type Standing = typeof standings.$inferSelect;
export type Badge = typeof badges.$inferSelect;
export type RankHistory = typeof rankHistory.$inferSelect;
export type GameMatchRow = typeof gameMatches.$inferSelect;
export type GameResultRow = typeof gameResults.$inferSelect;
