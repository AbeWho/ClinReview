import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Database } from "./types";

export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

/** Apply any SQL migrations that have not run yet, in filename order, each in its own transaction. */
export async function migrate(db: Database, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.exec(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const applied = new Set(
    (await db.withSystem((tx) => tx.query<{ name: string }>("select name from schema_migrations"))).map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    try {
      await db.exec(`begin;\n${sql}\n;insert into schema_migrations(name) values ('${file.replace(/'/g, "''")}');\ncommit;`);
    } catch (error) {
      await db.exec("rollback").catch(() => undefined);
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
    ran.push(file);
  }
  return ran;
}
