import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  bigint,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleId: text("google_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  image: text("image"),
  needsReconnect: boolean("needs_reconnect").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const oauthTokens = pgTable("oauth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  accessToken: text("access_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  scopes: text("scopes").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userConfigs = pgTable("user_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  selectedLanguages: text("selected_languages").array().notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const customRepos = pgTable(
  "custom_repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("custom_repos_user_repo_idx").on(
      table.userId,
      table.owner,
      table.name
    ),
  ]
);

export const curatedRepos = pgTable(
  "curated_repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    languages: text("languages").array().notNull(),
    labelMapping: text("label_mapping").array().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("curated_repos_owner_name_idx").on(table.owner, table.name)]
);

export const trackedIssues = pgTable(
  "tracked_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    githubIssueId: bigint("github_issue_id", { mode: "number" }).notNull(),
    issueNumber: integer("issue_number").notNull(),
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    issueUrl: text("issue_url").notNull(),
    issueTitle: text("issue_title").notNull(),
    labels: text("labels").array().notNull(),
    status: text("status", { enum: ["open", "closed", "assigned"] })
      .notNull()
      .default("open"),
    issueOpenedAt: timestamp("issue_opened_at").notNull(),
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastCheckedAt: timestamp("last_checked_at").notNull().defaultNow(),
    sheetRowId: text("sheet_row_id"),
  },
  (table) => [
    uniqueIndex("tracked_issues_user_issue_idx").on(
      table.userId,
      table.githubIssueId
    ),
    index("tracked_issues_user_status_idx").on(table.userId, table.status),
  ]
);

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trigger: text("trigger", { enum: ["cron", "manual"] }).notNull(),
    status: text("status", {
      enum: ["pending", "running", "success", "failed"],
    })
      .notNull()
      .default("pending"),
    newIssuesCount: integer("new_issues_count"),
    staleIssuesCount: integer("stale_issues_count"),
    error: text("error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    index("runs_user_started_idx").on(table.userId, table.startedAt),
  ]
);

export const sheets = pgTable("sheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  spreadsheetId: text("spreadsheet_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OAuthToken = typeof oauthTokens.$inferSelect;
export type UserConfig = typeof userConfigs.$inferSelect;
export type CustomRepo = typeof customRepos.$inferSelect;
export type CuratedRepo = typeof curatedRepos.$inferSelect;
export type TrackedIssue = typeof trackedIssues.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Sheet = typeof sheets.$inferSelect;
