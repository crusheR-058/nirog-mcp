import { describe, expect, it } from "vitest";
import { triage } from "./triage.js";

describe("triage", () => {
  it("flags chest pain with sweating as an emergency", () => {
    const r = triage("since this morning I have chest pain and I am sweating a lot");
    expect(r.level).toBe("emergency");
    expect(r.matched[0].id).toBe("chest_pain_acs");
  });

  it("hears chest pain the way people say it, not only the way notes write it", () => {
    for (const said of ["my chest hurts and I am sweating", "there is pain in my chest and I feel breathless", "my chest feels tight and I can't catch my breath", "छाती दुख रही है और पसीना आ रहा है"]) {
      expect(triage(said, [], said.match(/[ऀ-ॿ]/) ? "hi" : "en").level, said).toBe("emergency");
    }
    expect(triage("no pain in my chest, just sweating from the heat", []).level).toBe("routine");
  });

  it("does not fire on negated symptoms", () => {
    expect(triage("no chest pain, just a cough and I'm not breathless").level).toBe("routine");
  });

  it("uses the patient's conditions", () => {
    expect(triage("I am wheezing and my inhaler isn't helping", ["Asthma"]).level).toBe("emergency");
    expect(triage("I am wheezing and my inhaler isn't helping", []).level).toBe("routine");
    expect(triage("feeling confused and very sleepy", ["Type 2 Diabetes"]).level).toBe("emergency");
  });

  it("marks lasting fever and severe pain as urgent", () => {
    expect(triage("fever for 4 days now").level).toBe("urgent");
    expect(triage("the pain is unbearable").level).toBe("urgent");
  });

  it("ranks the strongest rule first", () => {
    const r = triage("fever for a week and now I fainted");
    expect(r.level).toBe("emergency");
    expect(r.matched.map((m) => m.id)).toEqual(["unconscious", "high_fever_days"]);
  });

  it("gives a helpline for self-harm", () => {
    expect(triage("I want to end my life").advice).toContain("14416");
  });

  it("returns routine for the demo lumbar complaint", () => {
    expect(triage("the ache is back again, it's been three weeks now").level).toBe("routine");
  });
});
