import { embedderFromEnv, resilientEmbedder, type Embedder } from "./embed.js";
import { InMemoryStore } from "./in-memory.js";
import { PgStore, type PgFlavour } from "./pg.js";
import { remember } from "./recall.js";
import type { MemoryStore } from "./types.js";

/** Rahul's demo history from the Nirog seed: three lumbar visits with no shared words, plus a decoy. */
export const DEMO_HISTORY: Array<{ patientId: string; daysAgo: number; text: string }> = [
  { patientId: "pat_rahul", daysAgo: 38, text: "my lower back has been aching for a few days, worse in the mornings" },
  { patientId: "pat_rahul", daysAgo: 27, text: "blocked nose and a bit of a cough, think I caught something" },
  { patientId: "pat_rahul", daysAgo: 16, text: "I keep getting this pain when I stand up from my desk" },
  { patientId: "pat_sunita", daysAgo: 9, text: "feeling very tired lately and thirsty all the time" },
];

export async function seedDemoHistory(store: MemoryStore, embedder: Embedder, now = new Date()): Promise<void> {
  for (const h of DEMO_HISTORY) {
    await remember({ store, embedder }, { patientId: h.patientId, text: h.text, now: new Date(now.getTime() - h.daysAgo * 86_400_000) });
  }
}

let memory: { store: MemoryStore; embedder: Embedder } | undefined;

/**
 * MEMORY_STORE=memory (default): in-process store seeded with the demo history.
 * MEMORY_STORE=pg: Postgres at MEMORY_DATABASE_URL, flavour from MEMORY_PG_FLAVOUR (pgvector | cockroach).
 */
export async function getMemory(): Promise<{ store: MemoryStore; embedder: Embedder }> {
  if (memory) return memory;
  const embedder = resilientEmbedder(embedderFromEnv(), (err) => console.warn(`[memory] embedder fell back to offline: ${err.message}`));
  const kind = process.env.MEMORY_STORE ?? "memory";
  if (kind === "pg") {
    const url = process.env.MEMORY_DATABASE_URL;
    if (!url) throw new Error("MEMORY_DATABASE_URL is required when MEMORY_STORE=pg");
    const store = new PgStore(url, (process.env.MEMORY_PG_FLAVOUR as PgFlavour) ?? "pgvector");
    await store.migrate();
    memory = { store, embedder };
  } else {
    const store = new InMemoryStore();
    await seedDemoHistory(store, embedder);
    memory = { store, embedder };
  }
  return memory;
}
