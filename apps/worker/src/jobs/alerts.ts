import { schema, type DbClient } from "@kansha/db";
import {
  buildAlertDedupeKey,
  calculateRiskScore,
  defaultAlertConfig,
  extractRegion,
  getRiskLabel,
  haversineDistanceKm,
  magnitudeBand
} from "@kansha/types";
import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import { globalHighMessage, localHighMessage, sourceSilenceMessage, swarmMessage } from "../lib/messages";
import { sendTelegramMessage } from "../lib/telegram";

type EventRow = typeof schema.earthquakeEvents.$inferSelect;

function eventDto(event: EventRow) {
  return {
    id: event.id,
    usgsId: event.usgsId,
    magnitude: event.magnitude,
    place: event.place,
    time: event.time.toISOString(),
    updated: event.updated ? event.updated.toISOString() : null,
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

async function activeChats(db: DbClient, userId?: string) {
  return db
    .select()
    .from(schema.telegramChats)
    .where(
      userId
        ? and(eq(schema.telegramChats.userId, userId), eq(schema.telegramChats.isActive, true))
        : eq(schema.telegramChats.isActive, true)
    );
}

async function createAlert(
  db: DbClient,
  values: Omit<typeof schema.alerts.$inferInsert, "id" | "createdAt">
) {
  const inserted = await db.insert(schema.alerts).values(values).onConflictDoNothing().returning();
  return inserted[0] ?? null;
}

async function deliverToChats(
  db: DbClient,
  token: string,
  alert: typeof schema.alerts.$inferSelect,
  chats: Awaited<ReturnType<typeof activeChats>>,
  message: string
) {
  for (const chat of chats) {
    const [delivery] = await db
      .insert(schema.alertDeliveries)
      .values({
        alertId: alert.id,
        userId: chat.userId,
        telegramChatId: chat.id,
        status: "pending"
      })
      .onConflictDoNothing()
      .returning();
    if (!delivery) continue;

    try {
      await sendTelegramMessage(token, chat.chatId, message);
      await db
        .update(schema.alertDeliveries)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(schema.alertDeliveries.id, delivery.id));
    } catch (error) {
      await db
        .update(schema.alertDeliveries)
        .set({ status: "failed", errorMessage: error instanceof Error ? error.message : String(error) })
        .where(eq(schema.alertDeliveries.id, delivery.id));
      console.error("Telegram delivery failed", error);
    }
  }
}

export async function evaluateAlerts(db: DbClient, events: EventRow[], telegramToken: string, dashboardUrl: string) {
  for (const event of events) {
    await evaluateGlobalHigh(db, event, telegramToken, dashboardUrl);
    await evaluateLocalHigh(db, event, telegramToken, dashboardUrl);
  }
  await evaluateSwarm(db, telegramToken, dashboardUrl);
}

async function evaluateGlobalHigh(db: DbClient, event: EventRow, telegramToken: string, dashboardUrl: string) {
  if ((event.magnitude ?? 0) < defaultAlertConfig.globalMagnitudeThreshold) return;
  const dto = eventDto(event);
  const message = globalHighMessage(dto, dashboardUrl);
  const alert = await createAlert(db, {
    type: "global_high_severity",
    severity: "high",
    dedupeKey: buildAlertDedupeKey(["global-high", event.usgsId]),
    earthquakeEventId: event.id,
    title: `M${event.magnitude} earthquake: ${event.place}`,
    message,
    payload: dto
  });
  if (!alert) return;
  await deliverToChats(db, telegramToken, alert, await activeChats(db), message);
}

async function evaluateLocalHigh(db: DbClient, event: EventRow, telegramToken: string, dashboardUrl: string) {
  const locations = await db
    .select()
    .from(schema.monitoredLocations)
    .where(eq(schema.monitoredLocations.alertsEnabled, true));

  for (const location of locations) {
    if ((event.magnitude ?? 0) < location.magnitudeThreshold) continue;
    const distanceKm = haversineDistanceKm(
      { lat: location.latitude, lng: location.longitude },
      { lat: event.latitude, lng: event.longitude }
    );
    if (distanceKm > location.radiusKm) continue;

    const dto = eventDto(event);
    const message = localHighMessage(dto, location.label, distanceKm, dashboardUrl);
    const alert = await createAlert(db, {
      type: "local_high_severity",
      severity: "high",
      dedupeKey: buildAlertDedupeKey(["local-high", location.userId, location.id, event.usgsId]),
      earthquakeEventId: event.id,
      userId: location.userId,
      locationId: location.id,
      title: `Local alert near ${location.label}`,
      message,
      payload: { event: dto, location, distanceKm }
    });
    if (!alert) continue;
    await deliverToChats(db, telegramToken, alert, await activeChats(db, location.userId), message);
  }
}

export async function evaluateSwarm(db: DbClient, telegramToken: string, dashboardUrl: string) {
  const since = new Date(Date.now() - defaultAlertConfig.swarmWindowMinutes * 60 * 1000);
  const events = await db
    .select()
    .from(schema.earthquakeEvents)
    .where(gte(schema.earthquakeEvents.time, since))
    .orderBy(desc(schema.earthquakeEvents.time));

  for (const event of events) {
    const cluster = events.filter(
      (candidate) =>
        haversineDistanceKm(
          { lat: event.latitude, lng: event.longitude },
          { lat: candidate.latitude, lng: candidate.longitude }
        ) <= defaultAlertConfig.swarmRadiusKm
    );
    if (cluster.length <= defaultAlertConfig.swarmCountThreshold) continue;

    const latBucket = Math.round(event.latitude);
    const lngBucket = Math.round(event.longitude);
    const windowBucket = Math.floor(since.getTime() / (30 * 60 * 1000));
    const highestMagnitude = cluster.reduce<number | null>((max, item) => {
      if (item.magnitude === null) return max;
      return max === null || item.magnitude > max ? item.magnitude : max;
    }, null);
    const region = extractRegion(event.place);
    const message = swarmMessage(cluster.length, region, highestMagnitude, dashboardUrl);
    const alert = await createAlert(db, {
      type: "swarm",
      severity: "medium",
      dedupeKey: buildAlertDedupeKey(["swarm", windowBucket, latBucket, lngBucket]),
      earthquakeEventId: event.id,
      title: `Swarm near ${region}`,
      message,
      payload: { count: cluster.length, region, highestMagnitude }
    });
    if (!alert) return;
    await deliverToChats(db, telegramToken, alert, await activeChats(db), message);
    return;
  }
}

export async function evaluateSourceSilence(db: DbClient, telegramToken: string, dashboardUrl: string) {
  const [state] = await db.select().from(schema.appState).where(eq(schema.appState.id, "global")).limit(1);
  const lastSuccess = state?.lastSuccessfulPollAt ?? null;
  const minutes = lastSuccess ? Math.floor((Date.now() - lastSuccess.getTime()) / 60_000) : 999;
  if (minutes <= defaultAlertConfig.sourceSilenceMinutes) return;

  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recentFailures = await db
    .select()
    .from(schema.ingestionRuns)
    .where(and(eq(schema.ingestionRuns.status, "failure"), gte(schema.ingestionRuns.startedAt, since)));
  const message = sourceSilenceMessage(minutes, lastSuccess, recentFailures.length, dashboardUrl);
  const alert = await createAlert(db, {
    type: "source_silence",
    severity: "critical",
    dedupeKey: buildAlertDedupeKey(["source-silence", lastSuccess?.toISOString() ?? "never"]),
    title: "USGS source silence",
    message,
    payload: { minutes, lastSuccess: lastSuccess?.toISOString() ?? null, failures: recentFailures.length }
  });
  if (!alert) return;
  await deliverToChats(db, telegramToken, alert, await activeChats(db), message);
}

export async function sendDailySummaries(db: DbClient, telegramToken: string, dashboardUrl: string) {
  const chats = await activeChats(db);
  const [state] = await db.select().from(schema.appState).where(eq(schema.appState.id, "global")).limit(1);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const events = await db.select().from(schema.earthquakeEvents).where(gte(schema.earthquakeEvents.time, since));
  const bands = { "<2.5": 0, "2.5-4.0": 0, "4.0-5.0": 0, ">=5.0": 0 };
  const regions = new Map<string, number>();
  for (const event of events) {
    bands[magnitudeBand(event.magnitude)] += 1;
    const region = extractRegion(event.place);
    regions.set(region, (regions.get(region) ?? 0) + 1);
  }
  const activeRegions = [...regions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const summaryDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  for (const chat of chats) {
    const locations = await db
      .select()
      .from(schema.monitoredLocations)
      .where(eq(schema.monitoredLocations.userId, chat.userId));
    const userAlerts = await db
      .select()
      .from(schema.alerts)
      .where(and(gte(schema.alerts.createdAt, since), or(eq(schema.alerts.userId, chat.userId), isNull(schema.alerts.userId))));
    const alertCounts = userAlerts.reduce<Record<string, number>>((acc, alert) => {
      acc[alert.type] = (acc[alert.type] ?? 0) + 1;
      return acc;
    }, {});
    const locationStats = locations.map((location) => {
      const nearby = events
        .map((event) => ({
          event,
          distanceKm: haversineDistanceKm(
            { lat: location.latitude, lng: location.longitude },
            { lat: event.latitude, lng: event.longitude }
          )
        }))
        .filter((item) => item.distanceKm <= location.radiusKm);
      const score = calculateRiskScore(
        nearby.map(({ event, distanceKm }) => ({
          magnitude: event.magnitude,
          distanceKm,
          time: event.time,
          alert: event.alert,
          significance: event.significance
        })),
        location.radiusKm
      );
      return `${location.label}: ${getRiskLabel(score)} risk, score ${score}`;
    });
    const locationLines = locations.length
      ? locationStats
      : ["No monitored locations configured"];
    const message = [
      "Daily earthquake summary",
      "",
      "Period: Last 24 hours",
      `Total earthquakes: ${events.length}`,
      "",
      "Magnitude breakdown:",
      `M < 2.5: ${bands["<2.5"]}`,
      `M 2.5-4.0: ${bands["2.5-4.0"]}`,
      `M 4.0-5.0: ${bands["4.0-5.0"]}`,
      `M >= 5.0: ${bands[">=5.0"]}`,
      "",
      "Top active regions:",
      ...(activeRegions.length ? activeRegions.map(([region, count], index) => `${index + 1}. ${region} - ${count}`) : ["No activity"]),
      "",
      "Alerts fired:",
      `Global high severity: ${alertCounts.global_high_severity ?? 0}`,
      `Local alerts: ${alertCounts.local_high_severity ?? 0}`,
      `Swarm alerts: ${alertCounts.swarm ?? 0}`,
      `Source silence: ${alertCounts.source_silence ?? 0}`,
      "",
      "Your locations:",
      ...locationLines,
      "",
      "System health:",
      `Status: ${state?.healthStatus ?? "degraded"}`,
      `Backfill: ${state?.backfillStatus ?? "pending"}`,
      `Last successful poll: ${state?.lastSuccessfulPollAt?.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) ?? "never"} IST`,
      "",
      `Dashboard: ${dashboardUrl}`
    ].join("\n");

    const [summary] = await db
      .insert(schema.dailySummaries)
      .values({
        userId: chat.userId,
        summaryDate,
        message,
        status: "pending"
      })
      .onConflictDoNothing()
      .returning();
    if (!summary) continue;

    try {
      await sendTelegramMessage(telegramToken, chat.chatId, message);
      await db
        .update(schema.dailySummaries)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(schema.dailySummaries.id, summary.id));
    } catch (error) {
      await db
        .update(schema.dailySummaries)
        .set({ status: "failed" })
        .where(eq(schema.dailySummaries.id, summary.id));
      console.error("Daily summary failed", error);
    }
  }
}
