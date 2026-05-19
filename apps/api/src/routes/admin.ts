import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { schema, type DbClient } from "@kansha/db";
import { requireAdmin, requireAuth } from "../middleware/auth";
import type { AppBindings } from "../middleware/auth";
import { getHealth } from "./dashboard";

export function adminRoutes(db: DbClient, jwtSecret: string) {
  const app = new Hono<AppBindings>();

  app.use("*", requireAuth(jwtSecret), requireAdmin());

  app.get("/users", async (c) => {
    const [users, locations, telegramChats] = await Promise.all([
      db
        .select({
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
          role: schema.users.role,
          createdAt: schema.users.createdAt
        })
        .from(schema.users)
        .orderBy(desc(schema.users.createdAt)),
      db.select({ userId: schema.monitoredLocations.userId }).from(schema.monitoredLocations),
      db
        .select({
          userId: schema.telegramChats.userId,
          username: schema.telegramChats.username,
          firstName: schema.telegramChats.firstName,
          linkedAt: schema.telegramChats.linkedAt
        })
        .from(schema.telegramChats)
        .where(eq(schema.telegramChats.isActive, true))
    ]);
    const locationCounts = new Map<string, number>();
    for (const location of locations) {
      locationCounts.set(location.userId, (locationCounts.get(location.userId) ?? 0) + 1);
    }
    const activeTelegram = new Map(telegramChats.map((chat) => [chat.userId, chat]));

    return c.json({
      users: users.map((user) => {
        const telegram = activeTelegram.get(user.id);
        return {
          ...user,
          createdAt: user.createdAt.toISOString(),
          locationCount: locationCounts.get(user.id) ?? 0,
          telegramConnected: Boolean(telegram),
          telegramUsername: telegram?.username ?? null,
          telegramFirstName: telegram?.firstName ?? null,
          telegramLinkedAt: telegram?.linkedAt.toISOString() ?? null
        };
      })
    });
  });

  app.get("/locations", async (c) => {
    const rows = await db
      .select({
        id: schema.monitoredLocations.id,
        userId: schema.monitoredLocations.userId,
        userName: schema.users.name,
        userEmail: schema.users.email,
        label: schema.monitoredLocations.label,
        address: schema.monitoredLocations.address,
        latitude: schema.monitoredLocations.latitude,
        longitude: schema.monitoredLocations.longitude,
        radiusKm: schema.monitoredLocations.radiusKm,
        magnitudeThreshold: schema.monitoredLocations.magnitudeThreshold,
        alertsEnabled: schema.monitoredLocations.alertsEnabled,
        createdAt: schema.monitoredLocations.createdAt
      })
      .from(schema.monitoredLocations)
      .innerJoin(schema.users, eq(schema.users.id, schema.monitoredLocations.userId))
      .orderBy(desc(schema.monitoredLocations.createdAt));
    return c.json({ locations: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) });
  });

  app.get("/telegram-chats", async (c) => {
    const rows = await db
      .select({
        id: schema.telegramChats.id,
        userId: schema.telegramChats.userId,
        userName: schema.users.name,
        userEmail: schema.users.email,
        chatId: schema.telegramChats.chatId,
        username: schema.telegramChats.username,
        firstName: schema.telegramChats.firstName,
        isActive: schema.telegramChats.isActive,
        linkedAt: schema.telegramChats.linkedAt
      })
      .from(schema.telegramChats)
      .innerJoin(schema.users, eq(schema.users.id, schema.telegramChats.userId))
      .orderBy(desc(schema.telegramChats.linkedAt));
    return c.json({ chats: rows.map((row) => ({ ...row, linkedAt: row.linkedAt.toISOString() })) });
  });

  app.get("/health", async (c) => c.json(await getHealth(db)));

  app.post("/users/:id/telegram/disable", async (c) => {
    await db
      .update(schema.telegramChats)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(schema.telegramChats.userId, c.req.param("id")), eq(schema.telegramChats.isActive, true)));
    return c.json({ ok: true });
  });

  return app;
}
