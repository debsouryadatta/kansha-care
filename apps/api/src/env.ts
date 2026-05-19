import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const apiEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  WEB_URL: z.string().url(),
  CORS_ORIGIN: z.string().url().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(1),
  TELEGRAM_BOT_USERNAME: z.string().min(1),
  GEOCODER_USER_AGENT: z.string().min(6),
  GEOAPIFY_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000)
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

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

export function getApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  if (source === process.env) loadAppEnv();
  const normalized = { ...source };
  if (normalized.CORS_ORIGIN?.trim() === "") delete normalized.CORS_ORIGIN;
  if (normalized.GEOAPIFY_API_KEY?.trim() === "") delete normalized.GEOAPIFY_API_KEY;
  return apiEnvSchema.parse(normalized);
}
