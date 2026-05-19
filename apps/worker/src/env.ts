import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const workerEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().min(1),
  WEB_URL: z.string().url(),
  PUBLIC_DASHBOARD_URL: z.string().url(),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_BOT_USERNAME: z.string().min(1).optional(),
  GEOCODER_USER_AGENT: z.string().min(6),
  GEOAPIFY_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

function loadAppEnv() {
  const srcDir = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(srcDir, "../.env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) continue;

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

export function getWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  if (source === process.env) loadAppEnv();
  const normalized = { ...source };
  if (normalized.TELEGRAM_BOT_USERNAME?.trim() === "") delete normalized.TELEGRAM_BOT_USERNAME;
  if (normalized.GEOAPIFY_API_KEY?.trim() === "") delete normalized.GEOAPIFY_API_KEY;
  return workerEnvSchema.parse(normalized);
}
