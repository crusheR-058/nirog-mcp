import { describe, expect, it } from "vitest";
import { MockData } from "../data/mock.js";
import { offlineEmbedder } from "../memory/embed.js";
import { InMemoryStore } from "../memory/in-memory.js";
import { buildCarePlan } from "../tools/care-plan.js";
import { runIntake } from "../tools/intake.js";
import { runRedFlag } from "../tools/red-flag.js";
import { normalize } from "./normalize.js";
import { classify } from "./regions.js";
import { triage } from "./triage.js";

const NOW = new Date("2026-10-07T09:00:00Z");

describe("normalize", () => {
  it("folds nukta and chandrabindu so both spellings match one pattern", () => {
    expect(normalize("साँस")).toBe(normalize("सांस"));
    expect(normalize("कमज़ोरी")).toBe(normalize("कमजोरी"));
  });
});

describe("lexicon in Hindi", () => {
  it("classifies Devanagari and romanised complaints", () => {
    expect(classify("मेरी कमर में बहुत दर्द है").region).toBe("lower_back");
    expect(classify("सिर में दर्द हो रहा है").region).toBe("head");
    expect(classify("तीन दिन से बुखार है").region).toBe("systemic");
    expect(classify("घुटने में दर्द है").region).toBe("leg");
    expect(classify("pet dard ho raha hai").region).toBe("abdomen");
  });

  it("does not read सिर inside फिर", () => {
    expect(classify("फिर से वही तकलीफ़").region).toBe("unknown");
  });
});

describe("triage in Hindi", () => {
  it("flags chest pain with sweating, in either spelling", () => {
    expect(triage("सीने में दर्द है और पसीना आ रहा है").level).toBe("emergency");
    expect(triage("छाती में दर्द है और साँस फूल रही है").matched[0].id).toBe("chest_pain_acs");
    expect(triage("seene mein dard hai aur paseena aa raha hai").level).toBe("emergency");
  });

  it("respects Hindi negation, which follows the noun", () => {
    expect(triage("सीने में दर्द नहीं है, बस खांसी है").level).toBe("routine");
  });

  it("does not mistake 'won't stop' for a negation", () => {
    // "पसीना नहीं रुक रहा" means the sweating will not stop. Treating नहीं as a denial here would miss an emergency.
    expect(triage("सीने में दर्द है और पसीना नहीं रुक रहा").level).toBe("emergency");
  });

  it("catches breathing trouble, fainting and self-harm", () => {
    expect(triage("सांस नहीं ले पा रहा हूँ").level).toBe("emergency");
    expect(triage("वो बेहोश हो गई").level).toBe("emergency");
    const sh = triage("मैं जीना नहीं चाहता", [], "hi");
    expect(sh.level).toBe("emergency");
    expect(sh.advice).toContain("14416");
  });

  it("uses the patient's conditions", () => {
    expect(triage("सांस फूल रही है", ["Asthma"]).level).toBe("emergency");
    expect(triage("सांस फूल रही है", []).level).toBe("routine");
  });

  it("marks a fever of several days urgent and answers in Hindi", () => {
    const r = triage("चार दिन से बुखार है", [], "hi");
    expect(r.level).toBe("urgent");
    expect(r.advice).toContain("डॉक्टर");
  });
});

describe("tools answer in Hindi", () => {
  it("start_intake recalls and asks in Hindi while quoting the patient unchanged", async () => {
    const store = new InMemoryStore();
    const deps = { data: new MockData(), store, embedder: offlineEmbedder, converse: null };
    for (const [daysAgo, text] of [[30, "कमर में दर्द है"], [18, "मेरी कमर फिर से दुख रही है"]] as const) {
      await runIntake(deps, { patientId: "pat_meena", complaint: text, now: new Date(NOW.getTime() - daysAgo * 86_400_000), lang: "hi" });
    }
    const r = await runIntake(deps, { patientId: "pat_meena", complaint: "कमर में फिर से दर्द हो रहा है", now: NOW, lang: "hi" });
    if ("error" in r) throw new Error(r.error);
    expect(r.recorded.region).toBe("Lower back");
    expect(r.recurrence).toMatchObject({ level: "recurrent", visitCount: 3 });
    expect(r.spoken).toContain("3 बार कमर की तकलीफ़");
    expect(r.spoken).toContain("कमर में दर्द है"); // the first complaint, quoted as said
    expect(r.spoken).toContain("कब से"); // ARIA's offline question, in Hindi
  });

  it("report_red_flag speaks the 108 advice in Hindi and still queues the consult", async () => {
    const data = new MockData();
    const r = await runRedFlag(data, { patientId: "pat_rahul", symptoms: "सीने में दर्द है और पसीना आ रहा है", lang: "hi" });
    if ("error" in r) throw new Error(r.error);
    expect(r.level).toBe("emergency");
    expect(r.spoken).toContain("108");
    expect(r.spoken).toContain("एम्बुलेंस");
    expect(data.consults).toHaveLength(1);
  });

  it("get_care_plan reads the plan in Hindi", () => {
    const data = new MockData();
    return data.getLatestEncounter("pat_sunita").then(async (enc) => {
      const plan = buildCarePlan((await data.getPatient("pat_sunita"))!, enc, NOW, "hi");
      expect(plan.spoken).toContain("Metformin 500mg 1 गोली सुबह और रात");
      expect(plan.spoken).toContain("बाकी जाँचें");
    });
  });
});
