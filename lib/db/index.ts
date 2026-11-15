import { createPgDatabase, createPgliteDatabase } from "./adapters";
import { migrate } from "./migrate";
import type { Database } from "./types";

export type { Database, Tx } from "./types";

const globalForDb = globalThis as unknown as { __clinreviewDb?: Promise<Database> };

async function init(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  const db = url
    ? await createPgDatabase(url)
    : await createPgliteDatabase(process.env.PGLITE_DATA_DIR || ".data/pglite");
  await migrate(db);
  // Local embedded DB: seed the demo project automatically so the app is usable on first boot.
  if (!url || process.env.SEED_DEMO_ON_BOOT === "true") {
    const { ensureDemoSeed } = await import("./seed");
    await ensureDemoSeed(db);
  }
  return db;
}

/** Shared database handle (cached across hot reloads in development). */
export function getDb(): Promise<Database> {
  if (!globalForDb.__clinreviewDb) {
    globalForDb.__clinreviewDb = init().catch((error) => {
      globalForDb.__clinreviewDb = undefined;
      throw error;
    });
  }
  return globalForDb.__clinreviewDb;
}
