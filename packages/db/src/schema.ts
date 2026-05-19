import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);
export const backfillStatusEnum = pgEnum("backfill_status", ["pending", "running", "completed", "failed"]);
export const healthStatusEnum = pgEnum("health_status", ["healthy", "degraded", "down"]);
export const ingestionStatusEnum = pgEnum("ingestion_status", ["success", "failure"]);
export const agentSurfaceEnum = pgEnum("agent_surface", ["web", "telegram"]);
export const agentActionStatusEnum = pgEnum("agent_action_status", ["pending", "approved", "denied", "expired", "executed"]);
export const alertTypeEnum = pgEnum("alert_type", [
  "global_high_severity",
  "local_high_severity",
  "swarm",
  "source_silence",
  "daily_summary"
]);
export const alertSeverityEnum = pgEnum("alert_severity", ["info", "medium", "high", "critical"]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["pending", "sent", "failed", "skipped"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash"),
    role: userRoleEnum("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(sql`lower(${table.email})`)
  })
);

export const earthquakeEvents = pgTable(
  "earthquake_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usgsId: varchar("usgs_id", { length: 120 }).notNull(),
    magnitude: doublePrecision("magnitude"),
    place: text("place").notNull(),
    time: timestamp("time", { withTimezone: true }).notNull(),
    updated: timestamp("updated", { withTimezone: true }),
    longitude: doublePrecision("longitude").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    depthKm: doublePrecision("depth_km"),
    alert: varchar("alert", { length: 40 }),
    significance: integer("significance"),
    tsunami: boolean("tsunami").notNull().default(false),
    felt: integer("felt"),
    cdi: doublePrecision("cdi"),
    mmi: doublePrecision("mmi"),
    magType: varchar("mag_type", { length: 40 }),
    url: text("url"),
    raw: jsonb("raw").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    usgsIdx: uniqueIndex("earthquake_events_usgs_idx").on(table.usgsId),
    timeIdx: index("earthquake_events_time_idx").on(table.time),
    magnitudeIdx: index("earthquake_events_magnitude_idx").on(table.magnitude),
    latLngIdx: index("earthquake_events_lat_lng_idx").on(table.latitude, table.longitude)
  })
);

export const ingestionRuns = pgTable(
  "ingestion_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: varchar("source", { length: 80 }).notNull(),
    status: ingestionStatusEnum("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    fetched: integer("fetched").notNull().default(0),
    inserted: integer("inserted").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    errorMessage: text("error_message")
  },
  (table) => ({
    startedIdx: index("ingestion_runs_started_idx").on(table.startedAt),
    statusIdx: index("ingestion_runs_status_idx").on(table.status)
  })
);

export const appState = pgTable("app_state", {
  id: varchar("id", { length: 60 }).primaryKey().default("global"),
  backfillStatus: backfillStatusEnum("backfill_status").notNull().default("pending"),
  healthStatus: healthStatusEnum("health_status").notNull().default("degraded"),
  lastSuccessfulPollAt: timestamp("last_successful_poll_at", { withTimezone: true }),
  lastFailedPollAt: timestamp("last_failed_poll_at", { withTimezone: true }),
  lastBackfillAt: timestamp("last_backfill_at", { withTimezone: true }),
  totalInserted: integer("total_inserted").notNull().default(0),
  totalUpdated: integer("total_updated").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const monitoredLocations = pgTable(
  "monitored_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 160 }).notNull(),
    address: text("address").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    radiusKm: integer("radius_km").notNull().default(500),
    magnitudeThreshold: doublePrecision("magnitude_threshold").notNull().default(4),
    alertsEnabled: boolean("alerts_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    userIdx: index("monitored_locations_user_idx").on(table.userId)
  })
);

export const telegramLinkTokens = pgTable(
  "telegram_link_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tokenIdx: uniqueIndex("telegram_link_tokens_hash_idx").on(table.tokenHash),
    userIdx: index("telegram_link_tokens_user_idx").on(table.userId)
  })
);

export const telegramChats = pgTable(
  "telegram_chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chatId: varchar("chat_id", { length: 120 }).notNull(),
    username: varchar("username", { length: 160 }),
    firstName: varchar("first_name", { length: 160 }),
    isActive: boolean("is_active").notNull().default(true),
    linkedAt: timestamp("linked_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    userActiveIdx: uniqueIndex("telegram_chats_user_active_idx")
      .on(table.userId)
      .where(sql`${table.isActive} = true`),
    chatActiveIdx: uniqueIndex("telegram_chats_chat_active_idx")
      .on(table.chatId)
      .where(sql`${table.isActive} = true`)
  })
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: alertTypeEnum("type").notNull(),
    severity: alertSeverityEnum("severity").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    earthquakeEventId: uuid("earthquake_event_id").references(() => earthquakeEvents.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => monitoredLocations.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    message: text("message").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    dedupeIdx: uniqueIndex("alerts_dedupe_idx").on(table.dedupeKey),
    userIdx: index("alerts_user_idx").on(table.userId),
    createdIdx: index("alerts_created_idx").on(table.createdAt)
  })
);

export const alertDeliveries = pgTable(
  "alert_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    telegramChatId: uuid("telegram_chat_id").references(() => telegramChats.id, { onDelete: "set null" }),
    status: deliveryStatusEnum("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    alertUserIdx: uniqueIndex("alert_deliveries_alert_user_idx").on(table.alertId, table.userId)
  })
);

export const dailySummaries = pgTable(
  "daily_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    summaryDate: varchar("summary_date", { length: 20 }).notNull(),
    message: text("message").notNull(),
    status: deliveryStatusEnum("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    userDateIdx: uniqueIndex("daily_summaries_user_date_idx").on(table.userId, table.summaryDate)
  })
);

export const geocodingCache = pgTable(
  "geocoding_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    query: text("query").notNull(),
    label: text("label").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    raw: jsonb("raw").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    queryIdx: uniqueIndex("geocoding_cache_query_idx").on(sql`lower(${table.query})`)
  })
);

export const agentConversations = pgTable(
  "agent_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    surface: agentSurfaceEnum("surface").notNull(),
    telegramChatId: uuid("telegram_chat_id").references(() => telegramChats.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").notNull().default(true),
    title: varchar("title", { length: 180 }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    userSurfaceIdx: index("agent_conversations_user_surface_idx").on(table.userId, table.surface),
    telegramChatIdx: index("agent_conversations_telegram_chat_idx").on(table.telegramChatId),
    activeIdx: index("agent_conversations_active_idx").on(table.isActive)
  })
);

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => agentConversations.id, { onDelete: "cascade" }),
    messageId: varchar("message_id", { length: 160 }).notNull(),
    role: varchar("role", { length: 40 }).notNull(),
    message: jsonb("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    conversationIdx: index("agent_messages_conversation_idx").on(table.conversationId),
    messageIdx: index("agent_messages_message_idx").on(table.messageId),
    createdIdx: index("agent_messages_created_idx").on(table.createdAt)
  })
);

export const agentPendingActions = pgTable(
  "agent_pending_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => agentConversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    surface: agentSurfaceEnum("surface").notNull(),
    telegramChatId: uuid("telegram_chat_id").references(() => telegramChats.id, { onDelete: "cascade" }),
    toolName: varchar("tool_name", { length: 120 }).notNull(),
    toolCallId: varchar("tool_call_id", { length: 180 }),
    input: jsonb("input").notNull(),
    status: agentActionStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    result: jsonb("result"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    userStatusIdx: index("agent_pending_actions_user_status_idx").on(table.userId, table.status),
    conversationIdx: index("agent_pending_actions_conversation_idx").on(table.conversationId),
    expiresIdx: index("agent_pending_actions_expires_idx").on(table.expiresAt)
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  monitoredLocations: many(monitoredLocations),
  telegramChats: many(telegramChats),
  agentConversations: many(agentConversations)
}));

export const monitoredLocationsRelations = relations(monitoredLocations, ({ one }) => ({
  user: one(users, {
    fields: [monitoredLocations.userId],
    references: [users.id]
  })
}));

export const telegramChatsRelations = relations(telegramChats, ({ one, many }) => ({
  user: one(users, {
    fields: [telegramChats.userId],
    references: [users.id]
  }),
  agentConversations: many(agentConversations)
}));

export const agentConversationsRelations = relations(agentConversations, ({ one, many }) => ({
  user: one(users, {
    fields: [agentConversations.userId],
    references: [users.id]
  }),
  telegramChat: one(telegramChats, {
    fields: [agentConversations.telegramChatId],
    references: [telegramChats.id]
  }),
  messages: many(agentMessages),
  pendingActions: many(agentPendingActions)
}));

export const agentMessagesRelations = relations(agentMessages, ({ one }) => ({
  conversation: one(agentConversations, {
    fields: [agentMessages.conversationId],
    references: [agentConversations.id]
  })
}));

export const agentPendingActionsRelations = relations(agentPendingActions, ({ one }) => ({
  conversation: one(agentConversations, {
    fields: [agentPendingActions.conversationId],
    references: [agentConversations.id]
  }),
  user: one(users, {
    fields: [agentPendingActions.userId],
    references: [users.id]
  }),
  telegramChat: one(telegramChats, {
    fields: [agentPendingActions.telegramChatId],
    references: [telegramChats.id]
  })
}));
