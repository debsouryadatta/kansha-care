import { randomBytes, createHash } from "node:crypto";
import { and, count, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { tool } from "ai";
import { z } from "zod";
import { schema, type DbClient } from "@kansha/db";
import {
  calculateRiskScore,
  defaultAlertConfig,
  extractRegion,
  getRiskLabel,
  haversineDistanceKm,
  magnitudeBand,
  timeWindowSchema,
  timeWindowToDate,
  type TimeWindow
} from "@kansha/types";
import { resolveLocation } from "./geocode";
import type { AgentSurface, AgentUser } from "./store";

export type AgentToolEnv = {
  geocoderUserAgent: string;
  geoapifyApiKey?: string | null;
  telegramBotUsername?: string | null;
};

export type AgentToolContext = {
  db: DbClient;
  user: AgentUser;
  env: AgentToolEnv;
  surface: AgentSurface;
  conversationId: string;
  telegramChatId?: string | null;
  actionMode: "client" | "pending" | "execute";
};

const nullableString = z.string().trim().min(1).max(240).nullable();
const nullableNumber = z.number().nullable();
const nullableBoolean = z.boolean().nullable();
const windowInput = timeWindowSchema.default("24h");

const addLocationInput = z.object({
  address: z.string().trim().min(2).max(300).describe("City, address, or place to add."),
  label: z.string().trim().min(1).max(160).nullable().describe("Optional user-facing label."),
  radiusKm: z.number().int().min(10).max(3000).nullable().describe("Optional alert radius. Use null for default."),
  magnitudeThreshold: z.number().min(0).max(10).nullable().describe("Optional magnitude threshold. Use null for default.")
});

const updateLocationInput = z.object({
  locationId: z.string().uuid().describe("The saved monitored location ID."),
  radiusKm: z.number().int().min(10).max(3000).nullable(),
  magnitudeThreshold: z.number().min(0).max(10).nullable(),
  alertsEnabled: nullableBoolean
});

const removeLocationInput = z.object({
  locationId: z.string().uuid().describe("The saved monitored location ID to remove.")
});

const disconnectTelegramInput = z.object({
  reason: nullableString.describe("Short reason for disconnecting Telegram, or null.")
});

export const actionSchemas = {
  addMonitoredLocation: addLocationInput,
  updateLocationRules: updateLocationInput,
  removeMonitoredLocation: removeLocationInput,
  disconnectTelegram: disconnectTelegramInput
} as const;

type ActionToolName = keyof typeof actionSchemas;

function eventDto(event: typeof schema.earthquakeEvents.$inferSelect) {
  return {
    id: event.id,
    usgsId: event.usgsId,
    magnitude: event.magnitude,
    place: event.place,
    time: event.time.toISOString(),
    updated: event.updated?.toISOString() ?? null,
    latitude: event.latitude,
    longitude: event.longitude,
    depthKm: event.depthKm,
    alert: event.alert,
    significance: event.significance,
    tsunami: event.tsunami,
    felt: event.felt,
    cdi: event.cdi,
    mmi: event.mmi,
    magType: event.magType,
    url: event.url
  };
}

function locationDto(location: typeof schema.monitoredLocations.$inferSelect) {
  return {
    id: location.id,
    label: location.label,
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    radiusKm: location.radiusKm,
    magnitudeThreshold: location.magnitudeThreshold,
    alertsEnabled: location.alertsEnabled,
    createdAt: location.createdAt.toISOString()
  };
}

async function getHealth(db: DbClient) {
  const [state] = await db.select().from(schema.appState).where(eq(schema.appState.id, "global")).limit(1);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const runs = await db.select().from(schema.ingestionRuns).where(gte(schema.ingestionRuns.startedAt, hourAgo));
  const successCount = runs.filter((run) => run.status === "success").length;
  const failureCount = runs.filter((run) => run.status === "failure").length;
  const successRateLastHour = runs.length ? Math.round((successCount / runs.length) * 100) : 0;
  const lastSuccess = state?.lastSuccessfulPollAt ?? null;
  const isSourceSilent = !lastSuccess || Date.now() - lastSuccess.getTime() > defaultAlertConfig.sourceSilenceMinutes * 60 * 1000;
  const status = isSourceSilent ? "down" : failureCount > 0 || state?.backfillStatus !== "completed" ? "degraded" : "healthy";

  return {
    backfillStatus: state?.backfillStatus ?? "pending",
    status,
    lastSuccessfulPollAt: lastSuccess?.toISOString() ?? null,
    lastFailedPollAt: state?.lastFailedPollAt?.toISOString() ?? null,
    successRateLastHour,
    currentFailures: failureCount,
    isSourceSilent,
    totalInserted: state?.totalInserted ?? 0,
    totalUpdated: state?.totalUpdated ?? 0
  };
}

async function globalSummary(db: DbClient, window: TimeWindow) {
  const since = timeWindowToDate(window);
  const rows = await db
    .select()
    .from(schema.earthquakeEvents)
    .where(gte(schema.earthquakeEvents.time, since))
    .orderBy(desc(schema.earthquakeEvents.time));
  const regionCounts = new Map<string, number>();
  const bands = { "<2.5": 0, "2.5-4.0": 0, "4.0-5.0": 0, ">=5.0": 0 };
  let highest: typeof rows[number] | null = null;
  for (const event of rows) {
    bands[magnitudeBand(event.magnitude)] += 1;
    const region = extractRegion(event.place);
    regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
    if (!highest || (event.magnitude ?? -Infinity) > (highest.magnitude ?? -Infinity)) highest = event;
  }
  return {
    window,
    total: rows.length,
    m4Plus: rows.filter((event) => (event.magnitude ?? 0) >= 4).length,
    m5Plus: rows.filter((event) => (event.magnitude ?? 0) >= 5).length,
    magnitudeBands: bands,
    highestMagnitudeEvent: highest ? eventDto(highest) : null,
    activeRegions: [...regionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([region, total]) => ({ region, total }))
  };
}

async function listUserLocations(db: DbClient, userId: string) {
  const rows = await db
    .select()
    .from(schema.monitoredLocations)
    .where(eq(schema.monitoredLocations.userId, userId))
    .orderBy(desc(schema.monitoredLocations.createdAt));
  return rows.map(locationDto);
}

async function locationStats(db: DbClient, location: typeof schema.monitoredLocations.$inferSelect) {
  const now = new Date();
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(schema.earthquakeEvents)
    .where(gte(schema.earthquakeEvents.time, last30d))
    .orderBy(desc(schema.earthquakeEvents.time));
  const origin = { lat: location.latitude, lng: location.longitude };
  const nearby = rows
    .map((event) => ({
      event,
      distanceKm: haversineDistanceKm(origin, { lat: event.latitude, lng: event.longitude })
    }))
    .filter((item) => item.distanceKm <= location.radiusKm)
    .sort((a, b) => b.event.time.getTime() - a.event.time.getTime());
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const riskScore = calculateRiskScore(
    nearby.map(({ event, distanceKm }) => ({
      magnitude: event.magnitude,
      distanceKm,
      time: event.time,
      alert: event.alert,
      significance: event.significance
    })),
    location.radiusKm,
    now
  );
  const largest = nearby.reduce<typeof nearby[number] | null>(
    (best, item) => (!best || (item.event.magnitude ?? -Infinity) > (best.event.magnitude ?? -Infinity) ? item : best),
    null
  );
  return {
    location: locationDto(location),
    riskScore,
    riskLabel: getRiskLabel(riskScore),
    counts: {
      last24h: nearby.filter((item) => item.event.time.getTime() >= dayAgo).length,
      last7d: nearby.filter((item) => item.event.time.getTime() >= weekAgo).length,
      last30d: nearby.length
    },
    largestEvent: largest ? { ...eventDto(largest.event), distanceKm: Math.round(largest.distanceKm) } : null,
    latestEvent: nearby[0] ? { ...eventDto(nearby[0].event), distanceKm: Math.round(nearby[0].distanceKm) } : null,
    nearbyEvents: nearby.slice(0, 10).map((item) => ({ ...eventDto(item.event), distanceKm: Math.round(item.distanceKm) }))
  };
}

async function userAlerts(db: DbClient, userId: string, options: { window?: TimeWindow | null; limit?: number | null; type?: string | null; severity?: string | null }) {
  const conditions: SQL[] = [or(eq(schema.alerts.userId, userId), isNull(schema.alerts.userId)) as SQL];
  if (options.window) conditions.push(gte(schema.alerts.createdAt, timeWindowToDate(options.window)));
  if (options.type) conditions.push(eq(schema.alerts.type, options.type as any));
  if (options.severity) conditions.push(eq(schema.alerts.severity, options.severity as any));
  const rows = await db
    .select()
    .from(schema.alerts)
    .where(and(...conditions))
    .orderBy(desc(schema.alerts.createdAt))
    .limit(Math.min(Math.max(options.limit ?? 20, 1), 50));
  return rows.map((alert) => ({
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    earthquakeEventId: alert.earthquakeEventId,
    locationId: alert.locationId,
    createdAt: alert.createdAt.toISOString()
  }));
}

async function telegramStatus(db: DbClient, userId: string) {
  const [activeChat] = await db
    .select()
    .from(schema.telegramChats)
    .where(and(eq(schema.telegramChats.userId, userId), eq(schema.telegramChats.isActive, true)))
    .limit(1);

  const [latestChat] = activeChat
    ? [activeChat]
    : await db
        .select()
        .from(schema.telegramChats)
        .where(eq(schema.telegramChats.userId, userId))
        .orderBy(desc(schema.telegramChats.linkedAt))
        .limit(1);

  return latestChat
    ? {
        connected: Boolean(activeChat),
        canReconnect: !activeChat,
        username: latestChat.username,
        firstName: latestChat.firstName,
        linkedAt: latestChat.linkedAt.toISOString()
      }
    : { connected: false, canReconnect: false, username: null, firstName: null, linkedAt: null };
}

function telegramChatStatus(chat: typeof schema.telegramChats.$inferSelect) {
  return {
    username: chat.username,
    firstName: chat.firstName,
    linkedAt: chat.linkedAt.toISOString()
  };
}

function eventSearchConditions(input: {
  window: TimeWindow;
  query: string | null;
  minMagnitude: number | null;
  alert: string | null;
  tsunami: boolean | null;
}) {
  const conditions: SQL[] = [gte(schema.earthquakeEvents.time, timeWindowToDate(input.window))];
  if (input.minMagnitude !== null) conditions.push(gte(schema.earthquakeEvents.magnitude, input.minMagnitude));
  if (input.alert !== null) conditions.push(eq(schema.earthquakeEvents.alert, input.alert));
  if (input.tsunami !== null) conditions.push(eq(schema.earthquakeEvents.tsunami, input.tsunami));
  if (input.query) {
    const pattern = `%${input.query}%`;
    const searchCondition = or(
      ilike(schema.earthquakeEvents.place, pattern),
      ilike(schema.earthquakeEvents.usgsId, pattern),
      ilike(schema.earthquakeEvents.alert, pattern),
      ilike(schema.earthquakeEvents.magType, pattern)
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  return conditions;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

async function createPendingAction(context: AgentToolContext, toolName: ActionToolName, input: unknown, toolCallId?: string) {
  const [pending] = await context.db
    .insert(schema.agentPendingActions)
    .values({
      conversationId: context.conversationId,
      userId: context.user.id,
      surface: context.surface,
      telegramChatId: context.telegramChatId ?? null,
      toolName,
      toolCallId,
      input,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    })
    .returning();
  return {
    requiresApproval: true,
    pendingActionId: pending.id,
    toolName,
    summary: approvalSummary(toolName, input)
  };
}

function approvalSummary(toolName: string, input: unknown) {
  const data = input as Record<string, unknown>;
  if (toolName === "addMonitoredLocation") return `Add monitored location: ${data.address}`;
  if (toolName === "updateLocationRules") return `Update location rules for ${data.locationId}`;
  if (toolName === "removeMonitoredLocation") return `Remove monitored location ${data.locationId}`;
  if (toolName === "disconnectTelegram") return "Disconnect Telegram alerts";
  return `Run ${toolName}`;
}

export async function executeAgentAction(
  context: Omit<AgentToolContext, "actionMode" | "surface" | "conversationId">,
  toolName: ActionToolName,
  rawInput: unknown
) {
  const input = actionSchemas[toolName].parse(rawInput) as any;
  if (toolName === "addMonitoredLocation") {
    const [{ total }] = await context.db
      .select({ total: count() })
      .from(schema.monitoredLocations)
      .where(eq(schema.monitoredLocations.userId, context.user.id));
    if (Number(total) >= 3) return { ok: false, message: "You can monitor up to 3 locations." };
    const resolved = await resolveLocation(context.db, {
      userId: context.user.id,
      query: input.address,
      defaultRadiusKm: input.radiusKm ?? defaultAlertConfig.localRadiusKm,
      userAgent: context.env.geocoderUserAgent,
      geoapifyApiKey: context.env.geoapifyApiKey
    });
    if (resolved.status !== "resolved") return { ok: false, message: "Location needs clarification.", resolution: resolved };
    const [location] = await context.db
      .insert(schema.monitoredLocations)
      .values({
        userId: context.user.id,
        label: input.label ?? resolved.label.split(",")[0],
        address: resolved.address,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        radiusKm: input.radiusKm ?? defaultAlertConfig.localRadiusKm,
        magnitudeThreshold: input.magnitudeThreshold ?? defaultAlertConfig.localMagnitudeThreshold,
        alertsEnabled: true
      })
      .returning();
    return { ok: true, message: `Added ${location.label}.`, location: locationDto(location) };
  }

  if (toolName === "updateLocationRules") {
    const [existing] = await context.db
      .select()
      .from(schema.monitoredLocations)
      .where(and(eq(schema.monitoredLocations.id, input.locationId), eq(schema.monitoredLocations.userId, context.user.id)))
      .limit(1);
    if (!existing) return { ok: false, message: "Location not found." };
    const [updated] = await context.db
      .update(schema.monitoredLocations)
      .set({
        radiusKm: input.radiusKm ?? undefined,
        magnitudeThreshold: input.magnitudeThreshold ?? undefined,
        alertsEnabled: input.alertsEnabled ?? undefined,
        updatedAt: new Date()
      })
      .where(eq(schema.monitoredLocations.id, existing.id))
      .returning();
    return { ok: true, message: `Updated ${updated.label}.`, location: locationDto(updated) };
  }

  if (toolName === "removeMonitoredLocation") {
    const [removed] = await context.db
      .delete(schema.monitoredLocations)
      .where(and(eq(schema.monitoredLocations.id, input.locationId), eq(schema.monitoredLocations.userId, context.user.id)))
      .returning();
    return removed ? { ok: true, message: `Removed ${removed.label}.` } : { ok: false, message: "Location not found." };
  }

  const result = await context.db
    .update(schema.telegramChats)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(schema.telegramChats.userId, context.user.id), eq(schema.telegramChats.isActive, true)))
    .returning();
  return result.length ? { ok: true, message: "Telegram disconnected." } : { ok: false, message: "Telegram is not connected." };
}

export async function executePendingAgentAction(db: DbClient, id: string, approve: boolean) {
  const [pending] = await db
    .select()
    .from(schema.agentPendingActions)
    .where(eq(schema.agentPendingActions.id, id))
    .limit(1);
  if (!pending || pending.status !== "pending") return { ok: false, message: "This action is no longer pending." };
  if (pending.expiresAt.getTime() < Date.now()) {
    await db
      .update(schema.agentPendingActions)
      .set({ status: "expired", resolvedAt: new Date() })
      .where(eq(schema.agentPendingActions.id, pending.id));
    return { ok: false, message: "This action expired." };
  }
  if (!approve) {
    await db
      .update(schema.agentPendingActions)
      .set({ status: "denied", resolvedAt: new Date() })
      .where(eq(schema.agentPendingActions.id, pending.id));
    return { ok: false, message: "Action denied." };
  }
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, pending.userId)).limit(1);
  if (!user) return { ok: false, message: "User not found." };
  const result = await executeAgentAction(
    {
      db,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      env: { geocoderUserAgent: process.env.GEOCODER_USER_AGENT ?? "kansha-agent/0.1", geoapifyApiKey: process.env.GEOAPIFY_API_KEY },
      telegramChatId: pending.telegramChatId
    },
    pending.toolName as ActionToolName,
    pending.input
  );
  await db
    .update(schema.agentPendingActions)
    .set({ status: "executed", resolvedAt: new Date(), result })
    .where(eq(schema.agentPendingActions.id, pending.id));
  return result;
}

export async function pendingActionsForConversation(db: DbClient, conversationId: string) {
  return db
    .select()
    .from(schema.agentPendingActions)
    .where(and(eq(schema.agentPendingActions.conversationId, conversationId), eq(schema.agentPendingActions.status, "pending"), gte(schema.agentPendingActions.expiresAt, new Date())))
    .orderBy(desc(schema.agentPendingActions.createdAt));
}

function maybeActionTool<TSchema extends z.ZodTypeAny>(
  context: AgentToolContext,
  toolName: ActionToolName,
  description: string,
  inputSchema: TSchema
) {
  if (context.actionMode === "client") {
    return tool({ description, inputSchema });
  }
  return tool({
    description,
    inputSchema,
    execute: async (input, options) => {
      if (context.actionMode === "pending") {
        return createPendingAction(context, toolName, input, options.toolCallId);
      }
      return executeAgentAction(context, toolName, input);
    }
  });
}

export function buildAgentTools(context: AgentToolContext) {
  return {
    getAgentCapabilities: tool({
      description: "Explain the specific things this Kansha assistant can do for the user.",
      inputSchema: z.object({}),
      execute: async () => ({
        can: [
          "Summarize global earthquake activity",
          "Search events by time, magnitude, alert level, tsunami flag, or place",
          "Resolve locations and find nearby earthquakes",
          "Explain monitored location risk",
          "Compare monitored locations",
          "List and explain alerts",
          "Check ingestion and Telegram status",
          "Create a Telegram connection link",
          "Add, update, or remove monitored locations after confirmation"
        ],
        cannot: ["Make emergency decisions", "Access other users' private data", "Change admin settings"]
      })
    }),
    getDashboardSnapshot: tool({
      description: "Get the current dashboard state: summary, health, locations, alerts, and Telegram status.",
      inputSchema: z.object({ window: windowInput }),
      execute: async ({ window }) => ({
        summary: await globalSummary(context.db, window),
        health: await getHealth(context.db),
        locations: await listUserLocations(context.db, context.user.id),
        alerts: await userAlerts(context.db, context.user.id, { window, limit: 5 }),
        telegram: await telegramStatus(context.db, context.user.id)
      })
    }),
    searchEvents: tool({
      description: "Search earthquake events stored in the Kansha database.",
      inputSchema: z.object({
        window: windowInput,
        query: nullableString,
        minMagnitude: nullableNumber,
        alert: nullableString,
        tsunami: nullableBoolean,
        limit: z.number().int().min(1).max(50)
      }),
      execute: async (input) => {
        const whereClause = and(...eventSearchConditions(input));
        const rows = await context.db
          .select()
          .from(schema.earthquakeEvents)
          .where(whereClause)
          .orderBy(desc(schema.earthquakeEvents.time))
          .limit(input.limit);
        return { events: rows.map(eventDto), totalReturned: rows.length };
      }
    }),
    getEventDetails: tool({
      description: "Get details for one earthquake event by database ID or USGS ID.",
      inputSchema: z.object({ eventId: z.string().trim().min(1).max(160) }),
      execute: async ({ eventId }) => {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(eventId);
        const [event] = await context.db
          .select()
          .from(schema.earthquakeEvents)
          .where(isUuid ? or(eq(schema.earthquakeEvents.id, eventId), eq(schema.earthquakeEvents.usgsId, eventId)) : eq(schema.earthquakeEvents.usgsId, eventId))
          .limit(1);
        return event ? { found: true, event: eventDto(event) } : { found: false };
      }
    }),
    aggregateEvents: tool({
      description: "Aggregate events by region, magnitude band, alert level, or day.",
      inputSchema: z.object({
        window: windowInput,
        groupBy: z.enum(["region", "magnitude_band", "alert", "day"])
      }),
      execute: async ({ window, groupBy }) => {
        const rows = await context.db
          .select()
          .from(schema.earthquakeEvents)
          .where(gte(schema.earthquakeEvents.time, timeWindowToDate(window)))
          .orderBy(desc(schema.earthquakeEvents.time));
        const groups = new Map<string, number>();
        for (const event of rows) {
          const key =
            groupBy === "region"
              ? extractRegion(event.place)
              : groupBy === "magnitude_band"
                ? magnitudeBand(event.magnitude)
                : groupBy === "alert"
                  ? event.alert ?? "none"
                  : event.time.toISOString().slice(0, 10);
          groups.set(key, (groups.get(key) ?? 0) + 1);
        }
        return {
          window,
          groupBy,
          groups: [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([key, total]) => ({ key, total }))
        };
      }
    }),
    resolveLocation: tool({
      description: "Resolve a natural-language location to saved user location or coordinates.",
      inputSchema: z.object({ query: z.string().trim().min(2).max(240) }),
      execute: async ({ query }) =>
        resolveLocation(context.db, {
          userId: context.user.id,
          query,
          defaultRadiusKm: defaultAlertConfig.localRadiusKm,
          userAgent: context.env.geocoderUserAgent,
          geoapifyApiKey: context.env.geoapifyApiKey
        })
    }),
    getNearbyEvents: tool({
      description: "Find database events near a natural-language location or coordinates.",
      inputSchema: z.object({
        locationQuery: z.string().trim().min(2).max(240),
        window: windowInput,
        radiusKm: z.number().int().min(10).max(3000).nullable(),
        minMagnitude: nullableNumber,
        limit: z.number().int().min(1).max(50)
      }),
      execute: async ({ locationQuery, window, radiusKm, minMagnitude, limit }) => {
        const resolved = await resolveLocation(context.db, {
          userId: context.user.id,
          query: locationQuery,
          defaultRadiusKm: radiusKm ?? defaultAlertConfig.localRadiusKm,
          userAgent: context.env.geocoderUserAgent,
          geoapifyApiKey: context.env.geoapifyApiKey
        });
        if (resolved.status !== "resolved") return { location: resolved, events: [] };
        const radius = radiusKm ?? resolved.radiusKm ?? defaultAlertConfig.localRadiusKm;
        const conditions: SQL[] = [gte(schema.earthquakeEvents.time, timeWindowToDate(window))];
        if (minMagnitude !== null) conditions.push(gte(schema.earthquakeEvents.magnitude, minMagnitude));
        const rows = await context.db
          .select()
          .from(schema.earthquakeEvents)
          .where(and(...conditions))
          .orderBy(desc(schema.earthquakeEvents.time));
        const events = rows
          .map((event) => ({
            event,
            distanceKm: haversineDistanceKm({ lat: resolved.latitude, lng: resolved.longitude }, { lat: event.latitude, lng: event.longitude })
          }))
          .filter((item) => item.distanceKm <= radius)
          .sort((a, b) => b.event.time.getTime() - a.event.time.getTime())
          .slice(0, limit)
          .map((item) => ({ ...eventDto(item.event), distanceKm: Math.round(item.distanceKm) }));
        return { location: resolved, radiusKm: radius, events };
      }
    }),
    listMonitoredLocations: tool({
      description: "List the authenticated user's monitored locations and alert rules.",
      inputSchema: z.object({}),
      execute: async () => ({ locations: await listUserLocations(context.db, context.user.id) })
    }),
    getLocationRiskSummary: tool({
      description: "Explain risk and nearby activity for a saved monitored location.",
      inputSchema: z.object({
        locationId: z.string().uuid().nullable(),
        locationQuery: nullableString
      }),
      execute: async ({ locationId, locationQuery }) => {
        let location: typeof schema.monitoredLocations.$inferSelect | undefined;
        if (locationId) {
          [location] = await context.db
            .select()
            .from(schema.monitoredLocations)
            .where(and(eq(schema.monitoredLocations.id, locationId), eq(schema.monitoredLocations.userId, context.user.id)))
            .limit(1);
        } else if (locationQuery) {
          const resolved = await resolveLocation(context.db, {
            userId: context.user.id,
            query: locationQuery,
            defaultRadiusKm: defaultAlertConfig.localRadiusKm,
            userAgent: context.env.geocoderUserAgent,
            geoapifyApiKey: context.env.geoapifyApiKey
          });
          if (resolved.status === "resolved" && resolved.locationId) {
            [location] = await context.db.select().from(schema.monitoredLocations).where(eq(schema.monitoredLocations.id, resolved.locationId)).limit(1);
          }
        }
        return location ? await locationStats(context.db, location) : { found: false, message: "Saved location not found." };
      }
    }),
    compareLocations: tool({
      description: "Compare all monitored locations by current risk and recent activity.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await context.db.select().from(schema.monitoredLocations).where(eq(schema.monitoredLocations.userId, context.user.id));
        const stats = await Promise.all(rows.map((location) => locationStats(context.db, location)));
        return { locations: stats.sort((a, b) => b.riskScore - a.riskScore) };
      }
    }),
    listAlerts: tool({
      description: "List alert history visible to the authenticated user.",
      inputSchema: z.object({
        window: timeWindowSchema.nullable(),
        type: nullableString,
        severity: nullableString,
        limit: z.number().int().min(1).max(50)
      }),
      execute: async (input) => ({ alerts: await userAlerts(context.db, context.user.id, input) })
    }),
    explainAlert: tool({
      description: "Explain why an alert fired. Use latest=true if the user asks for their latest alert.",
      inputSchema: z.object({
        alertId: z.string().uuid().nullable(),
        latest: z.boolean()
      }),
      execute: async ({ alertId, latest }) => {
        const conditions: SQL[] = [or(eq(schema.alerts.userId, context.user.id), isNull(schema.alerts.userId)) as SQL];
        if (alertId) conditions.push(eq(schema.alerts.id, alertId));
        const [alert] = await context.db
          .select()
          .from(schema.alerts)
          .where(and(...conditions))
          .orderBy(desc(schema.alerts.createdAt))
          .limit(latest || !alertId ? 1 : 1);
        if (!alert) return { found: false };
        const event = alert.earthquakeEventId
          ? (await context.db.select().from(schema.earthquakeEvents).where(eq(schema.earthquakeEvents.id, alert.earthquakeEventId)).limit(1))[0]
          : null;
        return {
          found: true,
          alert: {
            id: alert.id,
            type: alert.type,
            severity: alert.severity,
            title: alert.title,
            message: alert.message,
            createdAt: alert.createdAt.toISOString(),
            rule: alert.type.replaceAll("_", " "),
            event: event ? eventDto(event) : null
          }
        };
      }
    }),
    getSystemHealth: tool({
      description: "Check ingestion/backfill/source health.",
      inputSchema: z.object({}),
      execute: async () => getHealth(context.db)
    }),
    getTelegramStatus: tool({
      description: "Check whether Telegram alerts are connected for the authenticated user.",
      inputSchema: z.object({}),
      execute: async () => telegramStatus(context.db, context.user.id)
    }),
    createTelegramConnectLink: tool({
      description: "Reconnect a saved Telegram chat, or create a short-lived Telegram connection link for first-time setup. This does not mutate alert rules.",
      inputSchema: z.object({}),
      execute: async () => {
        const [existingChat] = await context.db
          .select()
          .from(schema.telegramChats)
          .where(eq(schema.telegramChats.userId, context.user.id))
          .orderBy(desc(schema.telegramChats.linkedAt))
          .limit(1);

        if (existingChat) {
          const now = new Date();
          const [reactivatedChat] = await context.db.transaction(async (tx) => {
            await tx
              .update(schema.telegramChats)
              .set({ isActive: false, updatedAt: now })
              .where(and(eq(schema.telegramChats.userId, context.user.id), eq(schema.telegramChats.isActive, true)));
            await tx
              .update(schema.telegramChats)
              .set({ isActive: false, updatedAt: now })
              .where(and(eq(schema.telegramChats.chatId, existingChat.chatId), eq(schema.telegramChats.isActive, true)));
            return tx
              .update(schema.telegramChats)
              .set({ isActive: true, linkedAt: now, updatedAt: now })
              .where(eq(schema.telegramChats.id, existingChat.id))
              .returning();
          });

          return {
            ok: true,
            connected: true,
            reactivated: true,
            message: "Telegram alerts are reconnected.",
            chat: telegramChatStatus(reactivatedChat)
          };
        }

        if (!context.env.telegramBotUsername) {
          return { ok: false, message: "Telegram bot username is not configured." };
        }

        const token = randomToken(24);
        await context.db.insert(schema.telegramLinkTokens).values({
          userId: context.user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000)
        });
        return {
          ok: true,
          connected: false,
          reactivated: false,
          expiresInMinutes: 15,
          url: `https://t.me/${context.env.telegramBotUsername}?start=connect_${token}`
        };
      }
    }),
    addMonitoredLocation: maybeActionTool(
      context,
      "addMonitoredLocation",
      "Add a new monitored location. Requires user confirmation before mutation.",
      addLocationInput
    ),
    updateLocationRules: maybeActionTool(
      context,
      "updateLocationRules",
      "Update radius, threshold, or enabled state for a monitored location. Requires user confirmation.",
      updateLocationInput
    ),
    removeMonitoredLocation: maybeActionTool(
      context,
      "removeMonitoredLocation",
      "Remove a monitored location. Requires user confirmation.",
      removeLocationInput
    ),
    disconnectTelegram: maybeActionTool(
      context,
      "disconnectTelegram",
      "Disconnect Telegram alerts. Requires user confirmation.",
      disconnectTelegramInput
    )
  };
}
