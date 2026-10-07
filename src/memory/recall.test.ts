import { describe, expect, it } from "vitest";
import { classify } from "../clinical/regions.js";
import { offlineEmbedder } from "./embed.js";
import { InMemoryStore } from "./in-memory.js";
import { DEMO_HISTORY, seedDemoHistory } from "./index.js";
import { recallSentence, remember } from "./recall.js";

const NOW = new Date("2026-10-07T09:00:00Z");

async function seeded() {
  const store = new InMemoryStore();
  await seedDemoHistory(store, offlineEmbedder, NOW);
  return store;
}

describe("lexicon", () => {
  it("names lumbar complaints and refuses to guess the adverb 'back'", () => {
    expect(classify("my lower back has been aching").region).toBe("lower_back");
    expect(classify("the ache is back again, it's been three weeks now").region).toBe("unknown");
    expect(classify("no chest pain at all, but for a week now my knee hurts").region).toBe("leg"); // negated chest, real knee
  });
});

describe("remember", () => {
  it("recalls differently worded lumbar complaints and inherits the region", async () => {
    const store = await seeded();
    const r = await remember({ store, embedder: offlineEmbedder }, { patientId: "pat_rahul", text: "the ache is back again, it's been three weeks now", now: NOW });

    expect(r.degraded).toBe(false);
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.matches.map((m) => m.bodyRegion)).not.toContain("chest"); // the cough decoy stays out
    expect(r.region).toMatchObject({ region: "lower_back", source: "inherited" });
    expect(r.flags[0]).toMatchObject({ level: "recurrent", region: "lower_back", visitCount: 3 });

    const line = recallSentence(r, NOW)!;
    expect(line).toContain("lower back");
    expect(line).toContain("3 times");
  });

  it("does not manufacture a recurrence from one visit", async () => {
    const store = await seeded();
    const r = await remember({ store, embedder: offlineEmbedder }, { patientId: "pat_sunita", text: "I have a headache since yesterday", now: NOW });
    expect(r.region.region).toBe("head");
    expect(r.flags).toEqual([]);
    expect(r.matches).toEqual([]);
    expect(recallSentence(r, NOW)).toBeNull();
  });

  it("keeps patients separate", async () => {
    const store = await seeded();
    const r = await remember({ store, embedder: offlineEmbedder }, { patientId: "pat_meena", text: "my lower back hurts", now: NOW });
    expect(r.matches).toEqual([]);
    expect(r.history).toHaveLength(1);
  });

  it("reports degraded memory instead of an empty history", async () => {
    const broken = {
      currentVisit: async () => "v",
      insertComplaint: async () => "c",
      search: async () => { throw new Error("connection refused"); },
      history: async () => [],
    };
    const r = await remember({ store: broken, embedder: offlineEmbedder }, { patientId: "pat_rahul", text: "my lower back hurts", now: NOW });
    expect(r.degraded).toBe(true);
    expect(r.flags).toEqual([]);
    expect(recallSentence(r, NOW)).toContain("can't get to your records");
  });

  it("seed covers the demo script", () => {
    expect(DEMO_HISTORY.filter((h) => h.patientId === "pat_rahul")).toHaveLength(3);
  });
});
