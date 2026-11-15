/**
 * Reset the LOCAL embedded database and re-seed the demo project.
 * Stop `npm run dev` first (only one process can open the local database at a time).
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { createPgliteDatabase } from "../lib/db/adapters";
import { migrate } from "../lib/db/migrate";
import { ensureDemoSeed } from "../lib/db/seed";

async function main() {
  if (process.env.DATABASE_URL) {
    console.error("DATABASE_URL is set. db:reset only resets the local embedded database; refusing to touch a hosted database.");
    process.exit(1);
  }
  const dir = path.resolve(process.env.PGLITE_DATA_DIR || ".data/pglite");
  if (!dir.includes(`${path.sep}.data${path.sep}`)) throw new Error(`Refusing to delete unexpected path ${dir}`);
  await rm(dir, { recursive: true, force: true });
  const db = await createPgliteDatabase(dir);
  const ran = await migrate(db);
  const seeded = await ensureDemoSeed(db);
  await db.close();
  console.log(`Reset ${dir}. Migrations: ${ran.join(", ")}. Demo seed: ${seeded ? "created" : "already present"}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
