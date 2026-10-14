import { describe, expect, it } from "vitest";
import { patternRoute, runAgent, type RouteFn } from "./alexa.js";

const routeTo = (...toolUses: Array<{ name: string; input?: Record<string, unknown> }>): RouteFn => async () => ({ text: "", toolUses: toolUses.map((u) => ({ name: u.name, input: u.input ?? {} })) });
const all = { kind: "all" as const };
const ask = (text: string, extra: Partial<Parameters<typeof runAgent>[0]> = {}) => ({ patientId: "pat_rahul", language: "en" as const, text, history: [], transcript: [], ...extra });

describe("the Alexa+ agent", () => {
  it("runs the tool the model chose and speaks that tool's own line", async () => {
    const r = await runAgent(ask("what medicines do I take tonight?"), { scope: all, route: routeTo({ name: "get_care_plan" }) });
    expect(r.steps.map((s) => [s.tool, s.by])).toEqual([["get_care_plan", "model"]]);
    expect(r.reply).toContain("Amlodipine");
  });

  it("escalates an emergency without asking a model at all", async () => {
    let asked = false;
    const r = await runAgent(ask("I have chest pain and I am sweating a lot"), { scope: all, route: async () => { asked = true; return { text: "Let me help.", toolUses: [] }; } });
    expect(asked).toBe(false);
    expect(r.router).toBe("rules");
    expect(r.steps.map((s) => [s.tool, s.by])).toEqual([["report_red_flag", "guard"]]);
    expect(r.level).toBe("emergency");
    expect(r.reply).toContain("108");
  });

  it("hears an emergency spread over two turns of one intake", async () => {
    const r = await runAgent(
      ask("yes, and I am sweating a lot", { transcript: [{ role: "user", text: "my chest hurts" }, { role: "assistant", text: "Are you sweating or short of breath?" }] }),
      { scope: all, route: routeTo({ name: "start_intake" }) },
    );
    expect(r.level).toBe("emergency");
    expect(r.steps.at(-1)).toMatchObject({ tool: "report_red_flag", args: { symptoms: "my chest hurts. yes, and I am sweating a lot" } });
    expect(r.reply).toContain("108");
  });

  it("escalates when the model routed urgent words to the wrong tool", async () => {
    const r = await runAgent(ask("I have had a fever for five days, which tablet should I take?"), { scope: all, route: routeTo({ name: "get_care_plan" }) });
    expect(r.steps.map((s) => [s.tool, s.by])).toEqual([["get_care_plan", "model"], ["report_red_flag", "guard"]]);
    expect(r.level).toBe("urgent");
  });

  it("treats a made-up tool name as no tool, so the model's own words are not spoken", async () => {
    const r = await runAgent(ask("I took my Amlodipine"), { scope: all, route: async () => ({ text: "Do not take another dose today.", toolUses: [{ name: "record_medicine", input: {} }], model: "m" }) });
    expect(r.router).toBe("patterns");
    expect(r.steps[0]).toMatchObject({ tool: "log_dose_taken", by: "patterns" });
    expect(r.reply).not.toContain("Do not take another dose today");
  });

  it("routes by patterns when no model answers", async () => {
    const r = await runAgent(ask("my knee has been hurting for a week"), { scope: all, route: async () => { throw new Error("Bedrock down"); } });
    expect(r.router).toBe("patterns");
    expect(r.steps.map((s) => [s.tool, s.by])).toEqual([["start_intake", "patterns"]]);
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

  it("refuses a patient outside the household's consent before reading anything or asking a model", async () => {
    let asked = false;
    const r = await runAgent(ask("what medicines do I take?"), { scope: { kind: "patients", sub: "sunita-household", patients: ["pat_sunita"] }, route: async () => { asked = true; return { text: "", toolUses: [] }; } });
    expect(asked).toBe(false);
    expect(r.steps).toEqual([]);
    expect(r.router).toBe("rules");
    expect(r.reply).toBeTruthy();
  });

  it("never speaks the model's own medical words: a dose said in prose goes to the dose tool", async () => {
    const r = await runAgent(ask("I took my Amlodipine"), { scope: all, route: async () => ({ text: "You already took it today, do not take another.", toolUses: [], model: "m" }) });
    expect(r.router).toBe("patterns");
    expect(r.steps[0]).toMatchObject({ tool: "log_dose_taken", by: "patterns" });
    expect(r.reply).not.toContain("You already took it");
  });

  it("lets a whole greeting stay small talk, but not a greeting with a symptom in it", async () => {
    expect(patternRoute("hello, good evening")).toEqual([]);
    expect(patternRoute("thank you so much")).toEqual([]);
    expect(patternRoute("hello, my chest hurts")[0].name).toBe("start_intake");
  });

  it("answers small talk briefly without a tool", async () => {
    const r = await runAgent(ask("thank you"), { scope: all, route: async () => ({ text: "You're welcome.", toolUses: [] }) });
    expect(r.steps).toEqual([]);
    expect(r.reply).toBe("You're welcome.");
  });
});
