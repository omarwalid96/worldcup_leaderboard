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
  timezone: text("timezone").notNull().default("UTC"),
  // Web Push subscription (PushSubscription JSON) — null until the user opts in.
  pushSubscription: jsonb("push_subscription"),
  notifPrefs: jsonb("notif_prefs")
    .notNull()
    .default({ lockReminder: true, scoreHit: true, rankClimb: true }),
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
    totalPoints: integer("total_points").notNull().default(0),
    rank: integer("rank").notNull().default(0),
    previousRank: integer("previous_rank").notNull().default(0),
    exactHits: integer("exact_hits").notNull().default(0),
    streak: integer("streak").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId] })],
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
