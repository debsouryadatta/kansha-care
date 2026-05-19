import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import IORedis from "ioredis";
import { createDb, schema } from "@kansha/db";
import { createTelegramBot } from "./lib/telegram";
import { getWorkerEnv } from "./env";
import { ensureAppState, runBackfill, runLivePoll, runStartupCatchUp } from "./jobs/ingestion";
import { evaluateSourceSilence, sendDailySummaries } from "./jobs/alerts";

const env = getWorkerEnv();
const { db } = createDb(env.DATABASE_URL);
const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const queue = new Queue("kansha-jobs", { connection });

async function enqueueBackfillIfNeeded() {
  const [state] = await db.select().from(schema.appState).where(eq(schema.appState.id, "global")).limit(1);
  if (state?.backfillStatus === "completed") return;

  const existing = await queue.getJob("initial-backfill");
  if (existing) {
    const jobState = await existing.getState();
    if (jobState === "active" || jobState === "waiting" || jobState === "delayed") return;
    await existing.remove();
  }

  if (state?.backfillStatus === "running") {
    await db
      .update(schema.appState)
      .set({ backfillStatus: "pending", updatedAt: new Date() })
      .where(eq(schema.appState.id, "global"));
  }

  await queue.add(
    "backfill",
    {},
    {
      jobId: "initial-backfill",
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 }
    }
  );
}

async function enqueueStartupCatchUpIfReady() {
  const [state] = await db.select().from(schema.appState).where(eq(schema.appState.id, "global")).limit(1);
  if (state?.backfillStatus !== "completed") return;

  await queue.add(
    "startup-catch-up",
    {},
    {
      jobId: `startup-catch-up-${Date.now()}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: 20
    }
  );
}

await ensureAppState(db);
await enqueueBackfillIfNeeded();
await enqueueStartupCatchUpIfReady();
await queue.add(
  "live-poll",
  {},
  {
    jobId: "live-poll-repeat",
    repeat: { every: 60_000 }
  }
);
await queue.add(
  "source-silence",
  {},
  {
    jobId: "source-silence-repeat",
    repeat: { every: 60_000 }
  }
);
await queue.add(
  "daily-summary",
  {},
  {
    jobId: "daily-summary-repeat",
    repeat: { pattern: "0 9 * * *", tz: "Asia/Kolkata" }
  }
);

new Worker(
  "kansha-jobs",
  async (job) => {
    if (job.name === "backfill") return runBackfill(db);
    if (job.name === "startup-catch-up") return runStartupCatchUp(db, env.TELEGRAM_BOT_TOKEN, env.PUBLIC_DASHBOARD_URL);
    if (job.name === "live-poll") return runLivePoll(db, env.TELEGRAM_BOT_TOKEN, env.PUBLIC_DASHBOARD_URL);
    if (job.name === "source-silence") {
      return evaluateSourceSilence(db, env.TELEGRAM_BOT_TOKEN, env.PUBLIC_DASHBOARD_URL);
    }
    if (job.name === "daily-summary") return sendDailySummaries(db, env.TELEGRAM_BOT_TOKEN, env.PUBLIC_DASHBOARD_URL);
    throw new Error(`Unknown job: ${job.name}`);
  },
  { connection, concurrency: 2 }
);

const bot = createTelegramBot(db, env);
await bot.launch();

console.log("Worker started: backfill, live polling, alerting, Telegram bot, daily summaries");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
