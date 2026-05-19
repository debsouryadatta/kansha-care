import type { Context } from "hono";
import { z } from "zod";

export async function parseJson<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  const body = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid request body", parsed.error.flatten());
  }
  return parsed.data;
}

export function parseQuery<T extends z.ZodTypeAny>(c: Context, schema: T): z.infer<T> {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) {
    throw new HttpError(400, "Invalid query params", parsed.error.flatten());
  }
  return parsed.data;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}
