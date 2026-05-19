import { schema, type DbClient } from "@kansha/db";
import { defaultAlertConfig, normalizeUsgsFeature, usgsFeedSchema } from "@kansha/types";
import { eq, inArray, sql } from "drizzle-orm";
import { evaluateAlerts } from "./alerts";

const feeds = {
  month: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson",
  day: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  hour: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson"
} as const;

async function fetchFeed(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/geo+json, application/json"
      }
    });
    if (!response.ok) throw new Error(`USGS feed returned ${response.status}`);
    const json = await response.json();
    return usgsFeedSchema.parse(json);
  } finally {
    clearTimeout(timeout);
  }
}

export async function ensureAppState(db: DbClient) {
  await db
    .insert(schema.appState)
    .values({ id: "global" })
    .onConflictDoNothing();
}

export async function runBackfill(db: DbClient) {
  await ensureAppState(db);
  const [state] = await db.select().from(schema.appState).where(eq(schema.appState.id, "global")).limit(1);
  if (state?.backfillStatus === "completed") return;

  await db
    .update(schema.appState)
    .set({ backfillStatus: "running", updatedAt: new Date() })
    .where(eq(schema.appState.id, "global"));

  const startedAt = new Date();
  try {
    const feed = await fetchFeed(feeds.month);
    const result = await upsertFeatures(db, feed.features);
    const finishedAt = new Date();
    await db.insert(schema.ingestionRuns).values({
      source: "all_month",
      status: "success",
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      fetched: feed.features.length,
      inserted: result.inserted,
      updated: result.updated
    });
    await db
      .update(schema.appState)
      .set({
        backfillStatus: "completed",
        lastBackfillAt: finishedAt,
        totalInserted: (state?.totalInserted ?? 0) + result.inserted,
        totalUpdated: (state?.totalUpdated ?? 0) + result.updated,
        updatedAt: finishedAt
      })
      .where(eq(schema.appState.id, "global"));
  } catch (error) {
    const finishedAt = new Date();
    await db.insert(schema.ingestionRuns).values({
      source: "all_month",
      status: "failure",
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    await db
      .update(schema.appState)
      .set({ backfillStatus: "failed", lastFailedPollAt: finishedAt, updatedAt: finishedAt })
      .where(eq(schema.appState.id, "global"));
    console.error("Backfill failed", error);
  }
}

export async function runLivePoll(db: DbClient, telegramToken: string, dashboardUrl: string) {
  return runIncrementalIngestion(db, feeds.hour, "all_hour", telegramToken, dashboardUrl, "Live poll failed");
}

export async function runStartupCatchUp(db: DbClient, telegramToken: string, dashboardUrl: string) {
  return runIncrementalIngestion(db, feeds.day, "all_day", telegramToken, dashboardUrl, "Startup catch-up failed");
}

async function runIncrementalIngestion(
  db: DbClient,
  feedUrl: string,
  source: "all_day" | "all_hour",
  telegramToken: string,
  dashboardUrl: string,
  errorLabel: string
) {
  await ensureAppState(db);
  const startedAt = new Date();
  try {
    const feed = await fetchFeed(feedUrl);
    const result = await upsertFeatures(db, feed.features);
    const finishedAt = new Date();
    await db.insert(schema.ingestionRuns).values({
      source,
      status: "success",
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      fetched: feed.features.length,
      inserted: result.inserted,
      updated: result.updated
    });
    const [state] = await db.select().from(schema.appState).where(eq(schema.appState.id, "global")).limit(1);
    await db
      .update(schema.appState)
      .set({
        healthStatus: "healthy",
        lastSuccessfulPollAt: finishedAt,
        totalInserted: (state?.totalInserted ?? 0) + result.inserted,
        totalUpdated: (state?.totalUpdated ?? 0) + result.updated,
        updatedAt: finishedAt
      })
      .where(eq(schema.appState.id, "global"));

    await evaluateAlerts(db, result.events, telegramToken, dashboardUrl);
  } catch (error) {
    const finishedAt = new Date();
    await db.insert(schema.ingestionRuns).values({
      source,
      status: "failure",
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    await db
      .update(schema.appState)
      .set({ healthStatus: "degraded", lastFailedPollAt: finishedAt, updatedAt: finishedAt })
      .where(eq(schema.appState.id, "global"));
    console.error(errorLabel, error);
  }
}

async function upsertFeatures(db: DbClient, features: Parameters<typeof normalizeUsgsFeature>[0][]) {
  const normalizedEvents = features.map((feature) => {
    const normalized = normalizeUsgsFeature(feature);
    return {
      usgsId: normalized.usgsId,
      magnitude: normalized.magnitude,
      place: normalized.place,
      time: normalized.time,
      updated: normalized.updated,
      longitude: normalized.longitude,
      latitude: normalized.latitude,
      depthKm: normalized.depthKm,
      alert: normalized.alert,
      significance: normalized.significance,
      tsunami: normalized.tsunami,
      felt: normalized.felt,
      cdi: normalized.cdi,
      mmi: normalized.mmi,
      magType: normalized.magType,
      url: normalized.url,
      raw: normalized.raw,
      updatedAt: new Date()
    };
  });

  const existingIds = new Set<string>();
  for (const chunk of chunks(normalizedEvents.map((event) => event.usgsId), 500)) {
    const rows = await db
      .select({ usgsId: schema.earthquakeEvents.usgsId })
      .from(schema.earthquakeEvents)
      .where(inArray(schema.earthquakeEvents.usgsId, chunk));
    rows.forEach((row) => existingIds.add(row.usgsId));
  }

  const upsertedEvents: Array<typeof schema.earthquakeEvents.$inferSelect> = [];
  for (const chunk of chunks(normalizedEvents, 500)) {
    const rows = await db
      .insert(schema.earthquakeEvents)
      .values(chunk)
      .onConflictDoUpdate({
        target: schema.earthquakeEvents.usgsId,
        set: {
          magnitude: sql`excluded.magnitude`,
          place: sql`excluded.place`,
          time: sql`excluded.time`,
          updated: sql`excluded.updated`,
          longitude: sql`excluded.longitude`,
          latitude: sql`excluded.latitude`,
          depthKm: sql`excluded.depth_km`,
          alert: sql`excluded.alert`,
          significance: sql`excluded.significance`,
          tsunami: sql`excluded.tsunami`,
          felt: sql`excluded.felt`,
          cdi: sql`excluded.cdi`,
          mmi: sql`excluded.mmi`,
          magType: sql`excluded.mag_type`,
          url: sql`excluded.url`,
          raw: sql`excluded.raw`,
          updatedAt: new Date()
        }
      })
      .returning();
    upsertedEvents.push(...rows);
  }

  const updated = normalizedEvents.filter((event) => existingIds.has(event.usgsId)).length;
  return {
    inserted: normalizedEvents.length - updated,
    updated,
    events: upsertedEvents
  };
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
