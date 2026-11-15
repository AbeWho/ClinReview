import { APP_ROLE, UUID_RE, type Database, type Tx } from "./types";

/** Switch the current transaction to the restricted app role, scoped to one user. */
async function enterUserScope(tx: Tx, userId: string) {
  if (!UUID_RE.test(userId)) throw new Error("Invalid user id for database session");
  await tx.query("select set_config('app.user_id', $1, true)", [userId]);
  await tx.query(`set local role ${APP_ROLE}`);
}

/** Embedded Postgres (PGlite). `dataDir` undefined = in-memory (used by tests). */
export async function createPgliteDatabase(dataDir?: string): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dataDir, { recursive: true }); // first run on a clean clone has no .data/ yet
  }
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;

  type PgQueryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
  const wrap = (q: PgQueryable): Tx => ({
    query: async <T>(sql: string, params?: unknown[]) => (await q.query(sql, params)).rows as T[],
  });

  return {
    withUser: (userId, fn) =>
      pg.transaction(async (t) => {
        const tx = wrap(t);
        await enterUserScope(tx, userId);
        return fn(tx);
      }),
    withSystem: (fn) => pg.transaction(async (t) => fn(wrap(t))),
    exec: async (sql) => {
      await pg.exec(sql);
    },
    close: () => pg.close(),
  };
}

/** Hosted Postgres (e.g. Supabase) via a server-side connection string. */
export async function createPgDatabase(connectionString: string): Promise<Database> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString, max: 5 });

  async function run<T>(fn: (tx: Tx) => Promise<T>, userId?: string): Promise<T> {
    const client = await pool.connect();
    const tx: Tx = { query: async <R>(sql: string, params?: unknown[]) => (await client.query(sql, params)).rows as R[] };
    try {
      await client.query("begin");
      if (userId) await enterUserScope(tx, userId);
      const result = await fn(tx);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    withUser: (userId, fn) => run(fn, userId),
    withSystem: (fn) => run(fn),
    exec: async (sql) => {
      await pool.query(sql);
    },
    close: () => pool.end(),
  };
}
