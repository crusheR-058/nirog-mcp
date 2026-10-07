import { describe, expect, it } from "vitest";
import { MockData } from "../data/mock.js";
import { runRedFlag } from "./red-flag.js";

describe("report_red_flag", () => {
  it("escalates an emergency: advice, consult, caregiver", async () => {
    const data = new MockData();
    const r = await runRedFlag(data, { patientId: "pat_rahul", symptoms: "chest pain and sweating a lot" });
    if ("error" in r) throw new Error(r.error);
    expect(r.level).toBe("emergency");
    expect(r.actions.map((a) => a.type)).toEqual(["emergency_advice", "consult_requested", "caregiver_alerted"]);
    expect(r.consultId).toBeTruthy();
    expect(r.spoken).toContain("108");
    expect(data.consults[0]).toMatchObject({ patientId: "pat_rahul", triage: "emergency" });
  });

  it("queues an urgent consult without emergency advice", async () => {
    const r = await runRedFlag(new MockData(), { patientId: "pat_sunita", symptoms: "fever for 5 days" });
    if ("error" in r) throw new Error(r.error);
    expect(r.level).toBe("urgent");
    expect(r.actions.map((a) => a.type)).toEqual(["consult_requested", "caregiver_alerted"]);
    expect(r.spoken).toContain("urgent consultation");
  });

  it("lets the model raise routine to urgent but not lower", async () => {
    const up = await runRedFlag(new MockData(), { patientId: "pat_meena", symptoms: "feeling odd", modelRedFlag: true });
    if ("error" in up) throw new Error(up.error);
    expect(up.level).toBe("urgent");
    const same = await runRedFlag(new MockData(), { patientId: "pat_meena", symptoms: "I fainted", modelRedFlag: false });
    if ("error" in same) throw new Error(same.error);
    expect(same.level).toBe("emergency");
  });

  it("routine takes no action", async () => {
    const data = new MockData();
    const r = await runRedFlag(data, { patientId: "pat_meena", symptoms: "mild headache since morning" });
    if ("error" in r) throw new Error(r.error);
    expect(r.level).toBe("routine");
    expect(r.actions).toEqual([]);
    expect(data.consults).toEqual([]);
  });
});
