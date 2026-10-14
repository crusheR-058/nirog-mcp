import { readFileSync } from "node:fs";
import pg from "pg";
import { getMemory, seedDemoHistory } from "./memory/index.js";

/**
 * Put the demo clinic back as seeded: today's queue, no Alexa+ consults, no filed encounters or doses, and each
 * patient's complaint history re-embedded. The same SQL as `pnpm db:reset`. The trust log is append-only and keeps
 * its history, including a line saying who reset the demo.
 */
export async function resetDemo(): Promise<void> {
  const url = process.env.MEMORY_DATABASE_URL;
  if (process.env.MEMORY_STORE !== "pg" || !url) throw new Error("Resetting needs the Postgres clinic (MEMORY_STORE=pg).");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    for (const f of ["reset-demo.sql", "seed.sql"]) await db.query(readFileSync(new URL(`../supabase/${f}`, import.meta.url), "utf8"));
  } finally {
    await db.end();
  }
  const { store, embedder } = await getMemory();
  await seedDemoHistory(store, embedder);
}
