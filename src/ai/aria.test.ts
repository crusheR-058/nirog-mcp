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
    expect(r.summary).toContain("lower back");
  });

  it("parses a model reply wrapped in prose and fences", async () => {
    const fake = async () => 'Sure:\n```json\n{"reply":"How long has it been?","complete":false,"summary":null,"redFlag":false,"flags":[]}\n```';
    const r = await nextQuestion(ctx, [{ role: "user", text: "the ache is back again" }], fake);
    expect(r.reply).toBe("How long has it been?");
    expect(r.model).toContain("gpt-oss");
  });

  it("rejects a malformed model reply", async () => {
    const fake = async () => '{"reply": ""}';
    await expect(nextQuestion(ctx, [], fake)).rejects.toThrow();
  });
});
