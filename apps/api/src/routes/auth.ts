import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import { z } from "zod";
import { schema, type DbClient } from "@kansha/db";
import { clearAuthCookie, requireAuth, setAuthCookie, signAuthToken, type AppBindings } from "../middleware/auth";
import type { ApiEnv } from "../env";
import { safeEqual } from "../lib/crypto";
import { HttpError, parseJson } from "../lib/http";

const signupSchema = z.object({
  name: z.string().min(2).max(160),
  email: z.string().email(),
  password: z.string().min(8).max(200)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const bcryptCost = 12;

function safeUser(user: typeof schema.users.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

export function authRoutes(db: DbClient, env: ApiEnv) {
  const app = new Hono<AppBindings>();
  const isProd = env.NODE_ENV === "production";

  app.post("/signup", async (c) => {
    const body = await parseJson(c, signupSchema);
    const existing = await db
      .select()
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = lower(${body.email})`)
      .limit(1);
    if (existing[0]) throw new HttpError(409, "An account with this email already exists");

    const [user] = await db
      .insert(schema.users)
      .values({
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash: await bcrypt.hash(body.password, bcryptCost),
        role: "user"
      })
      .returning();
    setAuthCookie(c, signAuthToken(safeUser(user), env.JWT_SECRET), isProd);
    return c.json({ user: safeUser(user) }, 201);
  });

  app.post("/login", async (c) => {
    const body = await parseJson(c, loginSchema);
    const [user] = await db
      .select()
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = lower(${body.email})`)
      .limit(1);

    if (!user?.passwordHash || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }

    setAuthCookie(c, signAuthToken(safeUser(user), env.JWT_SECRET), isProd);
    return c.json({ user: safeUser(user) });
  });

  app.post("/admin-login", async (c) => {
    const body = await parseJson(c, loginSchema);
    if (!safeEqual(body.email.toLowerCase(), env.ADMIN_EMAIL.toLowerCase()) || !safeEqual(body.password, env.ADMIN_PASSWORD)) {
      throw new HttpError(401, "Invalid admin credentials");
    }

    const existing = await db
      .select()
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = lower(${env.ADMIN_EMAIL})`)
      .limit(1);

    const [admin] = existing[0]
      ? await db
          .update(schema.users)
          .set({ role: "admin", updatedAt: new Date() })
          .where(eq(schema.users.id, existing[0].id))
          .returning()
      : await db
          .insert(schema.users)
          .values({
            name: "Kansha Admin",
            email: env.ADMIN_EMAIL.toLowerCase(),
            passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, bcryptCost),
            role: "admin"
          })
          .returning();

    setAuthCookie(c, signAuthToken(safeUser(admin), env.JWT_SECRET), isProd);
    return c.json({ user: safeUser(admin) });
  });

  app.get("/me", requireAuth(env.JWT_SECRET), (c) => {
    return c.json({ user: c.get("user") });
  });

  app.post("/logout", (c) => {
    clearAuthCookie(c, isProd);
    return c.json({ ok: true });
  });

  return app;
}
