/**
 * Create the memory tables and the clinic schema on MEMORY_DATABASE_URL, seed the demo clinic,
 * and seed the complaint history. Idempotent: rerun it to reset today's demo queue.
 *
 *   pnpm db:migrate
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { PgStore, type PgFlavour } from "../src/memory/pg.js";
import { embedderFromEnv, resilientEmbedder } from "../src/memory/embed.js";
import { DEMO_HISTORY } from "../src/memory/index.js";
import { remember } from "../src/memory/recall.js";

const url = process.env.MEMORY_DATABASE_URL;
if (!url) {
  console.error("MEMORY_DATABASE_URL is not set. Add it to .env (Supabase: Project Settings > Database > Connection string, URI, Session mode).");
  process.exit(1);
}
const flavour = (process.env.MEMORY_PG_FLAVOUR as PgFlavour) ?? "pgvector";
const store = new PgStore(url, flavour);
const embedder = resilientEmbedder(embedderFromEnv(), (e) => console.warn(`  embedder fell back to offline: ${e.message}`));

console.log(`memory: ${flavour} at ${new URL(url).host}`);
console.log(`embedder: ${embedder.provider}`);

await store.migrate();
console.log("  ok  memory schema");

// The clinic tables are Postgres-only (pgvector flavour, i.e. Supabase); CockroachDB keeps memory only.
if (flavour === "pgvector") {
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  for (const f of ["supabase/migrations/0001_clinic.sql", "supabase/seed.sql"]) {
    await db.query(readFileSync(f, "utf8"));
    console.log(`  ok  ${f}`);
  }
  await db.end();
}

const now = new Date();
const patients = [...new Set(DEMO_HISTORY.map((h) => h.patientId))];
for (const patientId of patients) {
  const existing = await store.history(patientId);
  if (existing.length) {
    console.log(`  skip ${patientId}: already has ${existing.length} complaints`);
    continue;
  }
  for (const h of DEMO_HISTORY.filter((x) => x.patientId === patientId)) {
    const at = new Date(now.getTime() - h.daysAgo * 86_400_000);
    const r = await remember({ store, embedder }, { patientId, text: h.text, now: at });
    console.log(`  seed ${patientId} ${h.daysAgo}d ago -> ${r.region.region} (${r.region.source})`);
  }
}
await store.close();
console.log("done");
