import { describe, expect, it } from "vitest";
import { ariaSystemPrompt, countQuestions, nextQuestion, offlineAria, type AriaContext } from "./aria.js";

const ctx: AriaContext = {
  patientName: "Rahul Yadav",
  conditions: ["Hypertension"],
  allergies: [],
  currentMedications: ["Amlodipine 5mg OD"],
  recallLine: "You have mentioned your lower back 3 times in the last 38 days. Is this the same thing?",
  region: "Lower back",
  recurrence: "recurrent: 3 visits in 38 days",
};

describe("aria", () => {
  it("puts record context and recall into the prompt", () => {
    const p = ariaSystemPrompt(ctx, 1);
    expect(p).toContain("Amlodipine");
    expect(p).toContain("lower back 3 times");
    expect(p).toContain("asked 1 of 3");
  });

  it("counts only assistant questions", () => {
    expect(countQuestions([
      { role: "assistant", text: "Hello." },
      { role: "assistant", text: "How long?" },
      { role: "user", text: "Why?" },
    ])).toBe(1);
  });

  it("offline fallback hands over after the budget", () => {
    const turns = Array.from({ length: 3 }, () => ({ role: "assistant" as const, text: "q?" }));
    const r = offlineAria(ctx, turns);
    expect(r.complete).toBe(true);
    expect(r.summary).toBeNull(); // the handover is written by code in tools/intake.ts
  });

  it("discards whatever the model writes as a summary", async () => {
    const turns = [{ role: "assistant" as const, text: "q1?" }, { role: "assistant" as const, text: "q2?" }, { role: "user" as const, text: "that's all" }];
    const fake = async () => '{"reply":"Sending this to the doctor.","complete":true,"summary":"Patient seeks relief with rest or medication.","redFlag":false,"flags":[]}';
    const r = await nextQuestion(ctx, turns, fake);
    expect(r.complete).toBe(true);
    expect(r.summary).toBeNull();
  });

  it("does not let the model hand over after one question", async () => {
    const turns = [{ role: "user" as const, text: "the ache is back" }, { role: "assistant" as const, text: "How bad is it?" }, { role: "user" as const, text: "bad" }];
    // A model that insists: the built-in question is used instead.
    const stubborn = async () => '{"reply":"Sending this to the doctor.","complete":true,"redFlag":false,"flags":[]}';
    const a = await nextQuestion(ctx, turns, stubborn);
    expect(a.complete).toBe(false);
    expect(a.reply).toBe("Is it getting worse, staying the same, or getting better?");

    // A model that listens on the second ask: its own question is used.
    let calls = 0;
    const listens = async () => (++calls === 1 ? '{"reply":"Sending this.","complete":true,"redFlag":false,"flags":[]}' : '{"reply":"Does it spread to your legs?","complete":false,"redFlag":false,"flags":[]}');
    const b = await nextQuestion(ctx, turns, listens);
    expect(b).toMatchObject({ complete: false, reply: "Does it spread to your legs?" });
    expect(calls).toBe(2);
  });

  it("hands over once the question budget is spent, even if the model wants to keep asking", async () => {
    const spent = [{ role: "assistant" as const, text: "a?" }, { role: "assistant" as const, text: "b?" }, { role: "assistant" as const, text: "c?" }, { role: "user" as const, text: "no" }];
    const curious = async () => '{"reply":"And how is your sleep?","complete":false,"redFlag":false,"flags":[]}';
    const r = await nextQuestion(ctx, spent, curious);
    expect(r.complete).toBe(true);
    expect(r.reply).toBe("Thank you. I am sending this to the doctor along with your history.");
  });

  it("lets a red flag end the intake at once", async () => {
    const early = async () => '{"reply":"Please seek emergency care now.","complete":true,"redFlag":true,"flags":[{"id":"x","label":"y","advice":"z"}]}';
    const r = await nextQuestion(ctx, [{ role: "user" as const, text: "I can't feel my arm" }], early);
    expect(r).toMatchObject({ complete: true, redFlag: true });
  });

  it("parses a model reply wrapped in prose and fences", async () => {
    const fake = async () => 'Sure:\n```json\n{"reply":"How long has it been?","complete":false,"summary":null,"redFlag":false,"flags":[]}\n```';
    const r = await nextQuestion(ctx, [{ role: "user", text: "the ache is back again" }], fake);
    expect(r.reply).toBe("How long has it been?");
    expect(r.model).toContain("gpt-oss");
  });

  it("asks for its answer through a forced tool call", async () => {
    let seen: { tool?: { name: string } } = {};
    const spy = async (opts: { tool?: { name: string } }) => {
      seen = opts;
      return '{"reply":"How long?","complete":false,"redFlag":false}';
    };
    const r = await nextQuestion(ctx, [{ role: "user", text: "the ache is back" }], spy);
    expect(seen.tool?.name).toBe("answer");
    expect(r.flags).toEqual([]); // optional in the tool schema, defaulted here
  });

  it("rejects a malformed model reply", async () => {
    const fake = async () => '{"reply": ""}';
    await expect(nextQuestion(ctx, [], fake)).rejects.toThrow();
  });
});
