import { describe, expect, it } from "vitest";
import { runAgent, type RouteFn } from "./alexa.js";

const routeTo = (...toolUses: Array<{ name: string; input?: Record<string, unknown> }>): RouteFn => async () => ({ text: "", toolUses: toolUses.map((u) => ({ name: u.name, input: u.input ?? {} })) });
const all = { kind: "all" as const };
const ask = (text: string, extra: Partial<Parameters<typeof runAgent>[0]> = {}) => ({ patientId: "pat_rahul", language: "en" as const, text, history: [], transcript: [], ...extra });

describe("the Alexa+ agent", () => {
  it("runs the tool the model chose and speaks that tool's own line", async () => {
    const r = await runAgent(ask("what medicines do I take tonight?"), { scope: all, route: routeTo({ name: "get_care_plan" }) });
    expect(r.steps.map((s) => [s.tool, s.by])).toEqual([["get_care_plan", "model"]]);
    expect(r.reply).toContain("Amlodipine");
  });

  it("escalates an emergency the model did not route to any tool", async () => {
    const r = await runAgent(ask("I have chest pain and I am sweating a lot"), { scope: all, route: async () => ({ text: "Let me help.", toolUses: [] }) });
    expect(r.steps.map((s) => [s.tool, s.by])).toEqual([["start_intake", "patterns"], ["report_red_flag", "guard"]]);
    expect(r.level).toBe("emergency");
    expect(r.reply).toContain("108");
    expect(r.reply).not.toContain("Let me help");
  });

  it("escalates when the model routed the words to the wrong tool", async () => {
    const r = await runAgent(ask("my chest hurts and I'm sweating, which tablet should I take?"), { scope: all, route: routeTo({ name: "get_care_plan" }) });
    expect(r.steps.map((s) => s.tool)).toEqual(["get_care_plan", "report_red_flag"]);
    expect(r.reply).toContain("108");
    expect(r.reply).not.toContain("Amlodipine"); // an emergency is the escalation's line alone
  });

  it("routes by patterns and still escalates when no model answers", async () => {
    const r = await runAgent(ask("I can't breathe properly"), { scope: all, route: async () => { throw new Error("Bedrock down"); } });
    expect(r.router).toBe("patterns");
    expect(r.steps.map((s) => [s.tool, s.by])).toEqual([["start_intake", "patterns"], ["report_red_flag", "guard"]]);
    expect(r.level).toBe("emergency");
  });

  it("routes a named medicine to the dose log by patterns", async () => {
    const r = await runAgent(ask("I just had my Amlodipine"), { scope: all, route: async () => { throw new Error("throttled"); } });
    expect(r.steps[0]).toMatchObject({ tool: "log_dose_taken", by: "patterns", args: { medicine: "Amlodipine" } });
  });

  it("keeps the patient's exact words and the session's patient, whatever the model passed", async () => {
    const r = await runAgent(ask("the ache is back again"), {
      scope: all,
      route: routeTo({ name: "start_intake", input: { patient_id: "pat_sunita", complaint: "patient reports lumbar pain" } }),
    });
    expect(r.steps[0].args).toMatchObject({ patient_id: "pat_rahul", complaint: "the ache is back again", language: "en" });
  });

  it("speaks the consent refusal when the household has no consent for the patient", async () => {
    const r = await runAgent(ask("what medicines do I take?"), { scope: { kind: "patients", sub: "sunita-household", patients: ["pat_sunita"] }, route: routeTo({ name: "get_care_plan" }) });
    expect(r.steps[0].error).toBeTruthy();
    expect(r.reply).toBe(r.steps[0].error);
  });

  it("never speaks the model's own medical words: a dose said in prose goes to the dose tool", async () => {
    const r = await runAgent(ask("I took my Amlodipine"), { scope: all, route: async () => ({ text: "You already took it today, do not take another.", toolUses: [], model: "m" }) });
    expect(r.router).toBe("patterns");
    expect(r.steps[0]).toMatchObject({ tool: "log_dose_taken", by: "patterns" });
    expect(r.reply).not.toContain("You already took it");
  });

  it("answers small talk briefly without a tool", async () => {
    const r = await runAgent(ask("thank you"), { scope: all, route: async () => ({ text: "You're welcome.", toolUses: [] }) });
    expect(r.steps).toEqual([]);
    expect(r.reply).toBe("You're welcome.");
  });
});
