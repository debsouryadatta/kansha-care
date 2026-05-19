import { serve } from "@hono/node-server";
import { createDb } from "@kansha/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { adminRoutes } from "./routes/admin";
import { agentRoutes } from "./routes/agent";
import { authRoutes } from "./routes/auth";
import { dashboardRoutes } from "./routes/dashboard";
import { getApiEnv } from "./env";
import { HttpError } from "./lib/http";

const env = getApiEnv();
const { db } = createDb(env.DATABASE_URL);

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN ?? env.WEB_URL,
    credentials: true,
    allowHeaders: ["content-type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
  })
);

app.get("/", (c) =>
  c.json({
    name: "Kansha Care Earthquake Monitor API",
    status: "ok"
  })
);

app.route("/auth", authRoutes(db, env));
app.route("/agent", agentRoutes(db, env));
app.route("/", dashboardRoutes(db, env));
app.route("/admin", adminRoutes(db, env.JWT_SECRET));

app.onError((error, c) => {
  if (error instanceof HttpError) {
    return c.json({ error: error.message, details: error.details ?? null }, error.status as any);
  }

  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
});

const port = env.PORT;

serve(
  {
    fetch: app.fetch,
    port
  },
  (info) => {
    console.log(`API listening on http://localhost:${info.port}`);
  }
);
