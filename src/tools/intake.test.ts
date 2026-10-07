import { describe, expect, it } from "vitest";
import { MockData } from "../data/mock.js";
import { offlineEmbedder } from "../memory/embed.js";
import { InMemoryStore } from "../memory/in-memory.js";
import { seedDemoHistory } from "../memory/index.js";
import { runIntake } from "./intake.js";

const NOW = new Date("2026-10-07T09:00:00Z");

describe("start_intake", () => {
  it("returns recall, recurrence and a spoken line for Rahul", async () => {
    const store = new InMemoryStore();
    await seedDemoHistory(store, offlineEmbedder, NOW);
    const result = await runIntake(
      { data: new MockData(), store, embedder: offlineEmbedder, converse: null },
      { patientId: "pat_rahul", complaint: "the ache is back again, it's been three weeks now", now: NOW },
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.recorded).toMatchObject({ region: "Lower back", regionSource: "inherited" });
    expect(result.recurrence).toMatchObject({ level: "recurrent", visitCount: 3 });
    expect(result.recall[0].when).toMatch(/weeks ago|days ago/);
    expect(result.spoken).toContain("Is this the same thing?");
    expect(result.aria).toMatchObject({ complete: false, model: "offline" });
    expect(result.spoken).toContain("How long");
  });

  it("hands over after the question budget using the transcript", async () => {
    const store = new InMemoryStore();
    const transcript = [
      { role: "user" as const, text: "my knee hurts" },
      { role: "assistant" as const, text: "How long?" },
      { role: "user" as const, text: "a week" },
      { role: "assistant" as const, text: "Worse or better?" },
      { role: "user" as const, text: "worse" },
      { role: "assistant" as const, text: "Anything else?" },
    ];
    const result = await runIntake(
      { data: new MockData(), store, embedder: offlineEmbedder, converse: null },
      { patientId: "pat_meena", complaint: "no, that's all", transcript, now: NOW },
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.aria).toMatchObject({ complete: true });
    expect(result.spoken).toContain("sending this to the doctor");
    expect(result.spoken).not.toContain("you told me"); // recall is spoken only on the opening turn
  });

  it("rejects unknown patients", async () => {
    const result = await runIntake(
      { data: new MockData(), store: new InMemoryStore(), embedder: offlineEmbedder, converse: null },
      { patientId: "pat_nobody", complaint: "hello" },
    );
    expect(result).toEqual({ error: "No patient with id pat_nobody." });
  });
});
