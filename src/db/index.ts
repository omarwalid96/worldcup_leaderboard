import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { requireEnv } from "@/lib/env";

/**
 * Server-side Drizzle client backed by postgres-js.
 *
 * Connects with the pooled Supabase connection string. Drizzle operations run
 * as the postgres role (RLS-exempt), so this client must ONLY be used from
 * trusted server code (Server Actions, route handlers, cron) — never expose its
 * results without an explicit auth check.
 *
 * Lazily instantiated via a Proxy so importing this module never reads
 * DATABASE_URL until a query actually runs (keeps the static landing page and
 * builds working without a DB configured).
 */
declare global {
  var __gs_pg__: ReturnType<typeof postgres> | undefined;
  var __gs_db__: PostgresJsDatabase<typeof schema> | undefined;
}

function getDb(): PostgresJsDatabase<typeof schema> {
  if (!globalThis.__gs_db__) {
    globalThis.__gs_pg__ ??= postgres(requireEnv("databaseUrl"), {
      prepare: false, // required for Supabase transaction-mode pooler
    });
    globalThis.__gs_db__ = drizzle(globalThis.__gs_pg__, { schema });
  }
  return globalThis.__gs_db__;
}

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
