import { Hono } from "hono";
import { and, count, desc, eq, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
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
  timeWindowToDate
} from "@kansha/types";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../middleware/auth";
import type { ApiEnv } from "../env";
import { createRandomToken, sha256 } from "../lib/crypto";
import { eventDto, locationDto } from "../lib/dto";
import { geocodeAddress, suggestAddresses } from "../lib/geocode";
import { HttpError, parseJson, parseQuery } from "../lib/http";

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

async function getLocationStats(db: DbClient, location: typeof schema.monitoredLocations.$inferSelect) {
  const now = new Date();
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const events = await db
    .select()
    .from(schema.earthquakeEvents)
    .where(gte(schema.earthquakeEvents.time, last30d))
    .orderBy(desc(schema.earthquakeEvents.time));

  const origin = { lat: location.latitude, lng: location.longitude };
  const nearbyEvents = events
    .map((event) => ({
      event,
      distanceKm: haversineDistanceKm(origin, { lat: event.latitude, lng: event.longitude })
    }))
    .filter((item) => item.distanceKm <= location.radiusKm)
    .sort((a, b) => b.event.time.getTime() - a.event.time.getTime());

  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const riskScore = calculateRiskScore(
    nearbyEvents.map(({ event, distanceKm }) => ({
      magnitude: event.magnitude,
      distanceKm,
      time: event.time,
      alert: event.alert,
      significance: event.significance
    })),
    location.radiusKm,
    now
  );

  const largestEvent = nearbyEvents.reduce<typeof nearbyEvents[number] | null>((largest, item) => {
    if (!largest) return item;
    return (item.event.magnitude ?? -Infinity) > (largest.event.magnitude ?? -Infinity) ? item : largest;
  }, null);

  return {
    location: locationDto(location),
    riskScore,
    riskLabel: getRiskLabel(riskScore),
    counts: {
      last24h: nearbyEvents.filter((item) => item.event.time.getTime() >= dayAgo).length,
      last7d: nearbyEvents.filter((item) => item.event.time.getTime() >= weekAgo).length,
      last30d: nearbyEvents.filter((item) => item.event.time.getTime() >= monthAgo).length
    },
    largestEvent: largestEvent ? eventDto(largestEvent.event) : null,
    latestEvent: nearbyEvents[0] ? eventDto(nearbyEvents[0].event) : null,
    nearbyEvents: nearbyEvents.slice(0, 50).map((item) => ({
      ...eventDto(item.event),
      distanceKm: Math.round(item.distanceKm)
    }))
  };
}

const eventQuerySchema = z.object({
  window: timeWindowSchema.default("24h"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(8),
  q: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((value) => value || undefined),
  minMagnitude: z.coerce.number().optional(),
  alert: z.string().optional()
});

const locationCreateSchema = z.object({
  address: z.string().min(2).max(300),
  label: z.string().min(1).max(160).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().int().min(10).max(3000).default(defaultAlertConfig.localRadiusKm),
  magnitudeThreshold: z.number().min(0).max(10).default(defaultAlertConfig.localMagnitudeThreshold),
  alertsEnabled: z.boolean().default(true)
}).refine((value) => (value.latitude === undefined) === (value.longitude === undefined), {
  message: "Latitude and longitude must be provided together",
  path: ["latitude"]
});

const locationUpdateSchema = z.object({
  address: z.string().min(2).max(300).optional(),
  label: z.string().min(1).max(160).optional(),
  radiusKm: z.number().int().min(10).max(3000).optional(),
  magnitudeThreshold: z.number().min(0).max(10).optional(),
  alertsEnabled: z.boolean().optional()
});

const locationSuggestSchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(8).default(6)
});

function telegramChatDto(chat: typeof schema.telegramChats.$inferSelect) {
  return {
    username: chat.username,
    firstName: chat.firstName,
    linkedAt: chat.linkedAt.toISOString()
  };
}

export function dashboardRoutes(db: DbClient, env: ApiEnv) {
  const app = new Hono<AppBindings>();

  app.use("*", requireAuth(env.JWT_SECRET));

  app.get("/events", async (c) => {
    const query = parseQuery(c, eventQuerySchema);
    const since = timeWindowToDate(query.window);
    const conditions: SQL[] = [gte(schema.earthquakeEvents.time, since)];

    if (query.minMagnitude !== undefined) {
      conditions.push(gte(schema.earthquakeEvents.magnitude, query.minMagnitude));
    }

    if (query.alert) {
      conditions.push(eq(schema.earthquakeEvents.alert, query.alert));
    }

    if (query.q) {
      const pattern = `%${query.q}%`;
      const searchCondition = or(
        ilike(schema.earthquakeEvents.place, pattern),
        ilike(schema.earthquakeEvents.usgsId, pattern),
        ilike(schema.earthquakeEvents.alert, pattern),
        ilike(schema.earthquakeEvents.magType, pattern)
      );
      if (searchCondition) conditions.push(searchCondition);
    }

    const whereClause = and(...conditions);
    const [{ total }] = await db
      .select({ total: count() })
      .from(schema.earthquakeEvents)
      .where(whereClause);
    const totalEvents = Number(total);
    const totalPages = Math.max(1, Math.ceil(totalEvents / query.pageSize));
    const page = Math.min(query.page, totalPages);

    const rows = await db
      .select()
      .from(schema.earthquakeEvents)
      .where(whereClause)
      .orderBy(desc(schema.earthquakeEvents.time))
      .limit(query.pageSize)
      .offset((page - 1) * query.pageSize);

    const eventIds = rows.map((event) => event.id);
    const fired = eventIds.length
      ? await db
          .select({ eventId: schema.alerts.earthquakeEventId })
          .from(schema.alerts)
          .where(inArray(schema.alerts.earthquakeEventId, eventIds))
      : [];
    const firedSet = new Set(fired.map((item) => item.eventId).filter(Boolean));

    return c.json({
      events: rows.map((event) => ({ ...eventDto(event), triggeredAlert: firedSet.has(event.id) })),
      pagination: {
        page,
        pageSize: query.pageSize,
        total: totalEvents,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages
      }
    });
  });

  app.get("/events/:id", async (c) => {
    const id = c.req.param("id");
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    const [event] = await db
      .select()
      .from(schema.earthquakeEvents)
      .where(isUuid ? or(eq(schema.earthquakeEvents.id, id), eq(schema.earthquakeEvents.usgsId, id)) : eq(schema.earthquakeEvents.usgsId, id))
      .limit(1);
    if (!event) throw new HttpError(404, "Event not found");
    return c.json({ event: eventDto(event) });
  });

  app.get("/summary/global", async (c) => {
    const query = parseQuery(c, z.object({ window: timeWindowSchema.default("24h") }));
    const since = timeWindowToDate(query.window);
    const rows = await db
      .select()
      .from(schema.earthquakeEvents)
      .where(gte(schema.earthquakeEvents.time, since))
      .orderBy(desc(schema.earthquakeEvents.time));

    const bands = { "<2.5": 0, "2.5-4.0": 0, "4.0-5.0": 0, ">=5.0": 0 };
    const regionCounts = new Map<string, number>();
    for (const event of rows) {
      bands[magnitudeBand(event.magnitude)] += 1;
      const region = extractRegion(event.place);
      regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
    }

    const highest = rows.reduce<typeof rows[number] | null>((best, event) => {
      if (!best) return event;
      return (event.magnitude ?? -Infinity) > (best.magnitude ?? -Infinity) ? event : best;
    }, null);

    return c.json({
      total: rows.length,
      highestMagnitudeEvent: highest ? eventDto(highest) : null,
      magnitudeBands: bands,
      activeRegions: [...regionCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([region, count]) => ({ region, count })),
      m4Plus: rows.filter((event) => (event.magnitude ?? 0) >= 4).length,
      m5Plus: rows.filter((event) => (event.magnitude ?? 0) >= 5).length
    });
  });

  app.get("/health", async (c) => c.json(await getHealth(db)));

  app.get("/locations", async (c) => {
    const user = c.get("user");
    const rows = await db
      .select()
      .from(schema.monitoredLocations)
      .where(eq(schema.monitoredLocations.userId, user.id))
      .orderBy(desc(schema.monitoredLocations.createdAt));
    return c.json({ locations: rows.map(locationDto) });
  });

  app.get("/locations/suggest", async (c) => {
    const query = parseQuery(c, locationSuggestSchema);
    const suggestions = await suggestAddresses(query.q, {
      geoapifyApiKey: env.GEOAPIFY_API_KEY,
      userAgent: env.GEOCODER_USER_AGENT,
      limit: query.limit
    });
    return c.json({ suggestions });
  });

  app.post("/locations", async (c) => {
    const user = c.get("user");
    const body = await parseJson(c, locationCreateSchema);
    const [{ total }] = await db
      .select({ total: count() })
      .from(schema.monitoredLocations)
      .where(eq(schema.monitoredLocations.userId, user.id));
    if (Number(total) >= 3) throw new HttpError(400, "You can monitor up to 3 locations");

    const result =
      body.latitude !== undefined && body.longitude !== undefined
        ? {
            label: body.label ?? body.address,
            address: body.address,
            latitude: body.latitude,
            longitude: body.longitude
          }
        : await geocodeAddress(db, body.address, env.GEOCODER_USER_AGENT);
    const [location] = await db
      .insert(schema.monitoredLocations)
      .values({
        userId: user.id,
        label: body.label ?? result.label.split(",")[0],
        address: result.address,
        latitude: result.latitude,
        longitude: result.longitude,
        radiusKm: body.radiusKm,
        magnitudeThreshold: body.magnitudeThreshold,
        alertsEnabled: body.alertsEnabled
      })
      .returning();

    return c.json({ location: locationDto(location) }, 201);
  });

  app.patch("/locations/:id", async (c) => {
    const user = c.get("user");
    const body = await parseJson(c, locationUpdateSchema);
    const [existing] = await db
      .select()
      .from(schema.monitoredLocations)
      .where(and(eq(schema.monitoredLocations.id, c.req.param("id")), eq(schema.monitoredLocations.userId, user.id)))
      .limit(1);
    if (!existing) throw new HttpError(404, "Location not found");

    const geocoded = body.address ? await geocodeAddress(db, body.address, env.GEOCODER_USER_AGENT) : null;
    const [updated] = await db
      .update(schema.monitoredLocations)
      .set({
        label: body.label ?? (geocoded ? geocoded.label.split(",")[0] : undefined),
        address: geocoded?.address,
        latitude: geocoded?.latitude,
        longitude: geocoded?.longitude,
        radiusKm: body.radiusKm,
        magnitudeThreshold: body.magnitudeThreshold,
        alertsEnabled: body.alertsEnabled,
        updatedAt: new Date()
      })
      .where(eq(schema.monitoredLocations.id, existing.id))
      .returning();
    return c.json({ location: locationDto(updated) });
  });

  app.delete("/locations/:id", async (c) => {
    const user = c.get("user");
    await db
      .delete(schema.monitoredLocations)
      .where(and(eq(schema.monitoredLocations.id, c.req.param("id")), eq(schema.monitoredLocations.userId, user.id)));
    return c.json({ ok: true });
  });

  app.get("/locations/:id/stats", async (c) => {
    const user = c.get("user");
    const [location] = await db
      .select()
      .from(schema.monitoredLocations)
      .where(and(eq(schema.monitoredLocations.id, c.req.param("id")), eq(schema.monitoredLocations.userId, user.id)))
      .limit(1);
    if (!location) throw new HttpError(404, "Location not found");
    return c.json(await getLocationStats(db, location));
  });

  app.post("/telegram/connect-token", async (c) => {
    const user = c.get("user");
    const [existingChat] = await db
      .select()
      .from(schema.telegramChats)
      .where(eq(schema.telegramChats.userId, user.id))
      .orderBy(desc(schema.telegramChats.linkedAt))
      .limit(1);

    if (existingChat) {
      const now = new Date();
      const [reactivatedChat] = await db.transaction(async (tx) => {
        await tx
          .update(schema.telegramChats)
          .set({ isActive: false, updatedAt: now })
          .where(and(eq(schema.telegramChats.userId, user.id), eq(schema.telegramChats.isActive, true)));
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

      return c.json({
        connected: true,
        reactivated: true,
        chat: telegramChatDto(reactivatedChat)
      });
    }

    const token = createRandomToken(24);
    await db.insert(schema.telegramLinkTokens).values({
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    });
    return c.json({
      connected: false,
      reactivated: false,
      expiresInMinutes: 15,
      url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=connect_${token}`
    });
  });

  app.post("/telegram/disconnect", async (c) => {
    const user = c.get("user");
    await db
      .update(schema.telegramChats)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(schema.telegramChats.userId, user.id), eq(schema.telegramChats.isActive, true)));
    return c.json({ ok: true });
  });

  app.get("/telegram/status", async (c) => {
    const user = c.get("user");
    const [activeChat] = await db
      .select()
      .from(schema.telegramChats)
      .where(and(eq(schema.telegramChats.userId, user.id), eq(schema.telegramChats.isActive, true)))
      .limit(1);

    const [latestChat] = activeChat
      ? [activeChat]
      : await db
          .select()
          .from(schema.telegramChats)
          .where(eq(schema.telegramChats.userId, user.id))
          .orderBy(desc(schema.telegramChats.linkedAt))
          .limit(1);

    return c.json({
      connected: Boolean(activeChat),
      canReconnect: Boolean(!activeChat && latestChat),
      chat: latestChat ? telegramChatDto(latestChat) : null
    });
  });

  return app;
}

export { getHealth, getLocationStats };
