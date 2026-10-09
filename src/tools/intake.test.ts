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
    // Memory's question is the only question on the opening turn. ARIA's own waits for the next one.
    expect(result.spoken.match(/\?/g)).toHaveLength(1);
    expect(result.spoken).not.toContain("How long");

    const next = await runIntake(
      { data: new MockData(), store, embedder: offlineEmbedder, converse: null },
      { patientId: "pat_rahul", complaint: "yes, the same", transcript: [{ role: "user", text: "the ache is back again" }, { role: "assistant", text: result.spoken }], now: new Date(NOW.getTime() + 60_000) },
    );
    if ("error" in next) throw new Error(next.error);
    expect(next.spoken).toBe("Is it getting worse, staying the same, or getting better?"); // counted as the second question
  });

  it("lets the model's red flag speak on the opening turn even when memory has a question", async () => {
    const store = new InMemoryStore();
    await seedDemoHistory(store, offlineEmbedder, NOW);
    const converse = async () => '{"reply":"Please see a doctor today.","complete":false,"redFlag":true,"flags":[{"id":"x","label":"y","advice":"z"}]}';
    const result = await runIntake({ data: new MockData(), store, embedder: offlineEmbedder, converse }, { patientId: "pat_rahul", complaint: "the ache is back again and my leg feels strange", now: NOW });
    if ("error" in result) throw new Error(result.error);
    expect(result.spoken).toContain("Please see a doctor today.");
    expect(result.aria).toMatchObject({ redFlag: true });
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

  it("writes the handover from the patient's own words, not from the model", async () => {
    const store = new InMemoryStore();
    await seedDemoHistory(store, offlineEmbedder, NOW);
    const first = "the ache is back again, it's been three weeks now";
    const deps0 = { data: new MockData(), store, embedder: offlineEmbedder, converse: null };
    // The first two turns go through the store as they would in a real consultation.
    await runIntake(deps0, { patientId: "pat_rahul", complaint: first, now: NOW });
    await runIntake(deps0, { patientId: "pat_rahul", complaint: "worse in the mornings and when I bend to lift water", transcript: [{ role: "user", text: first }], now: new Date(NOW.getTime() + 60_000) });
    const transcript = [
      { role: "user" as const, text: first },
      { role: "assistant" as const, text: "How bad is it?" },
      { role: "user" as const, text: "worse in the mornings and when I bend to lift water" },
      { role: "assistant" as const, text: "Anything else?" },
    ];
    // The model tries to slip in something the patient never said.
    const converse = async () => '{"reply":"I am sending this to the doctor.","complete":true,"summary":"Seeks relief with rest or medication.","redFlag":false,"flags":[]}';
    const result = await runIntake(
      { data: new MockData(), store, embedder: offlineEmbedder, converse },
      { patientId: "pat_rahul", complaint: "no, nothing else", transcript, now: new Date(NOW.getTime() + 120_000) },
    );
    if ("error" in result || !("reply" in result.aria)) throw new Error("no reply");
    const summary = result.aria.summary!;
    // The last sentence named nothing, but the visit is about the lower back, and the handover says so.
    expect(result.recorded.region).toBe("Unclassified");
    expect(summary).toContain("Region: Lower back (not named today; taken from an earlier complaint).");
    expect(summary).toContain(`"${first}"`);
    expect(summary).toContain('"worse in the mornings and when I bend to lift water"');
    expect(summary).toContain("Pattern: recurrent, 3 visits in 38 days.");
    expect(summary).toContain("Triage: routine.");
    expect(summary).not.toContain("Seeks relief");
  });

  it("says the pattern was not checked when memory is down", async () => {
    const broken = { currentVisit: async () => "v", insertComplaint: async () => "c", search: async () => { throw new Error("down"); }, history: async () => [] };
    const done = [{ role: "assistant" as const, text: "a?" }, { role: "assistant" as const, text: "b?" }, { role: "assistant" as const, text: "c?" }];
    const result = await runIntake({ data: new MockData(), store: broken, embedder: offlineEmbedder, converse: null }, { patientId: "pat_rahul", complaint: "my back hurts", transcript: done, now: NOW });
    if ("error" in result || !("reply" in result.aria)) throw new Error("no reply");
    expect(result.aria.summary).toContain("Pattern: NOT CHECKED");
  });

  it("rejects unknown patients", async () => {
    const result = await runIntake(
      { data: new MockData(), store: new InMemoryStore(), embedder: offlineEmbedder, converse: null },
      { patientId: "pat_nobody", complaint: "hello" },
    );
    expect(result).toEqual({ error: "No patient with id pat_nobody." });
  });
});
