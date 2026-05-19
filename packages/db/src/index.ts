import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export { schema };
export * from "./schema";

const { Pool } = pg;

export function createDb(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl
  });
  return {
    db: drizzle(pool, { schema }),
    pool
  };
}

export type DbClient = ReturnType<typeof createDb>["db"];
