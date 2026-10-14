/**
 * Preflight: can we reach memory and the clinic data, does recall work, and are the locks on?
 *   pnpm verify
 */
import pg from "pg";
import { getDataSource } from "../src/data/index.js";
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

console.log("\nClinic data (Supabase)");
if (process.env.NIROG_DATA_SOURCE !== "supabase") console.log("  skip  NIROG_DATA_SOURCE is not supabase");
else {
  try {
    const data = getDataSource();
    const patients = await data.listPatients();
    if (patients.length) ok(`${patients.length} patients`);
    else bad("no patients. Run: pnpm db:migrate");
    const plan = await data.getLatestEncounter("pat_sunita");
    if (plan?.prescriptions.length) ok(`care plan for pat_sunita: ${plan.prescriptions.map((p) => p.drug).join(", ")}`);
    else bad("pat_sunita has no completed encounter");
    ok(`${(await data.listConsults()).length} Alexa+ consults waiting, ${(await data.listAudit(500)).length} trust-log lines`);
  } catch (e) {
    bad(`data source: ${e instanceof Error ? e.message : String(e)}`);
  }

  // The publishable key ships to browsers, so it must read nothing.
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!anon) console.log("  skip  RLS check (set SUPABASE_ANON_KEY to run it)");
  else {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/patient?select=id`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } });
    const rows = r.ok ? ((await r.json()) as unknown[]) : [];
    if (rows.length === 0) ok(`anon key reads 0 patients (HTTP ${r.status}), RLS holds`);
    else bad(`anon key read ${rows.length} patients: row-level security is off`);
  }

  if (url) {
    const db = new pg.Client({ connectionString: url });
    try {
      await db.connect();
      await db.query("BEGIN");
      const { rows } = await db.query<{ id: string }>("INSERT INTO audit_event (actor_name, action, target) VALUES ('verify', 'verify', 'verify') RETURNING id");
      await db.query("UPDATE audit_event SET reason = 'tampered' WHERE id = $1", [rows[0].id]);
      bad("trust log accepted an edit");
    } catch (e) {
      if (String(e).includes("append-only")) ok("trust log refuses edits");
      else bad(`append-only check: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
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
