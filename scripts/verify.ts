/**
 * Preflight: can we reach memory, and does recall work on the live database?
 *   pnpm verify
 */
import { PgStore, type PgFlavour } from "../src/memory/pg.js";
import { embedderFromEnv, resilientEmbedder } from "../src/memory/embed.js";
import { recallThresholdFor } from "../src/memory/recall.js";

let fatal = false;
const ok = (s: string) => console.log(`  ok    ${s}`);
const bad = (s: string) => { console.log(`  FAIL  ${s}`); fatal = true; };

console.log("\nMemory (Postgres)");
const url = process.env.MEMORY_DATABASE_URL;
if (!url) bad("MEMORY_DATABASE_URL not set");
else {
  const store = new PgStore(url, (process.env.MEMORY_PG_FLAVOUR as PgFlavour) ?? "pgvector");
  try {
    const t0 = Date.now();
    const history = await store.history("pat_rahul");
    ok(`connected to ${new URL(url).host} in ${Date.now() - t0}ms`);
    if (history.length === 0) bad("pat_rahul has no history. Run: pnpm db:migrate");
    else ok(`pat_rahul has ${history.length} complaints`);

    const embedder = resilientEmbedder(embedderFromEnv());
    const q = await embedder.embed("the ache is back again, it's been three weeks now");
    const matches = await store.search({ patientId: "pat_rahul", embedding: q.vector, limit: 3, threshold: recallThresholdFor(q.provider) });
    if (matches.length) ok(`recall via ${q.provider}: closest "${matches[0].rawText}" at ${matches[0].distance.toFixed(3)}`);
    else bad(`recall via ${q.provider} returned nothing (seeded with a different embedder? re-run db:migrate after clearing)`);
  } catch (e) {
    bad(`connection failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await store.close();
  }
}

console.log("\nEmbedder");
const emb = embedderFromEnv();
try {
  const r = await emb.embed("hello");
  ok(`${r.provider} -> ${r.vector.length} dims`);
} catch (e) {
  bad(`${emb.provider}: ${e instanceof Error ? e.message : String(e)}`);
}

console.log(fatal ? "\nNOT READY" : "\nREADY");
process.exit(fatal ? 1 : 0);
