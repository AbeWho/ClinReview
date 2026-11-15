export type Row = Record<string, unknown>;

/** A transaction handle. Every query in a request runs through one of these. */
export interface Tx {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Database {
  /** Run `fn` in a transaction as `userId`, with Row Level Security enforced by Postgres. */
  withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Run `fn` in a privileged transaction. Only for migrations, seeding and sign-in lookups. */
  withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Execute a multi-statement SQL script (migrations). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export const APP_ROLE = "clinreview_app";
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
