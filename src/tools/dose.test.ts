import { describe, expect, it } from "vitest";
import { MockData } from "../data/mock.js";
import { offlineEmbedder } from "../memory/embed.js";
import { InMemoryStore } from "../memory/in-memory.js";
import { seedDemoHistory } from "../memory/index.js";
import { clinicClock, runDose } from "./dose.js";
import { runFamilySummary } from "./family-summary.js";
import { runRedFlag } from "./red-flag.js";

// 9:00 UTC is 2:30 pm in the clinic (IST); 16:00 UTC is 9:30 pm the same local day.
const AFTERNOON = new Date("2026-10-07T09:00:00Z");
const NIGHT = new Date("2026-10-07T16:00:00Z");
const NEXT_MORNING = new Date("2026-10-08T02:00:00Z");

describe("clinicClock", () => {
  it("counts the day in clinic time, not UTC", () => {
    expect(clinicClock(AFTERNOON)).toMatchObject({ period: "afternoon", time: "2:30 pm" });
    // 20:00 UTC is 1:30 am the next local day, so it belongs to a new day's doses.
    expect(clinicClock(new Date("2026-10-07T20:00:00Z")).dayStart.toISOString()).toBe("2026-10-07T18:30:00.000Z");
  });
});

describe("log_dose_taken", () => {
  it("logs a once-daily medicine and then refuses a second dose the same day", async () => {
    const data = new MockData();
    const first = await runDose(data, { patientId: "pat_rahul", now: AFTERNOON });
    if ("error" in first) throw new Error(first.error);
    expect(first).toMatchObject({ logged: true, drug: "Amlodipine", slot: "morning", remainingToday: [] });
    expect(first.spoken).toContain("That is all for today");

    const second = await runDose(data, { patientId: "pat_rahul", now: NIGHT });
    if ("error" in second) throw new Error(second.error);
    expect(second).toMatchObject({ logged: false, reason: "already_taken" });
    expect(second.spoken).toContain("do not take an extra dose");
    expect(data.doses).toHaveLength(1);
  });

  it("allows the dose again the next clinic day", async () => {
    const data = new MockData();
    await runDose(data, { patientId: "pat_rahul", now: AFTERNOON });
    const r = await runDose(data, { patientId: "pat_rahul", now: NEXT_MORNING });
    expect(r).toMatchObject({ logged: true, slot: "morning" });
  });

  it("walks a twice-daily medicine through both slots", async () => {
    const data = new MockData();
    const a = await runDose(data, { patientId: "pat_sunita", now: AFTERNOON });
    expect(a).toMatchObject({ logged: true, slot: "morning", remainingToday: ["night"] });
    const b = await runDose(data, { patientId: "pat_sunita", now: NIGHT });
    expect(b).toMatchObject({ logged: true, slot: "night", remainingToday: [] });
    expect(await runDose(data, { patientId: "pat_sunita", now: NIGHT })).toMatchObject({ logged: false, reason: "already_taken" });
  });

  it("asks which medicine when there are several, and matches a named one", async () => {
    const data = new MockData();
    const ask = await runDose(data, { patientId: "pat_lakshmi", now: AFTERNOON });
    if ("error" in ask) throw new Error(ask.error);
    expect(ask).toMatchObject({ logged: false, reason: "which_medicine" });
    expect(ask.spoken).toContain("Telmisartan 40mg or Paracetamol 500mg");
    expect(await runDose(data, { patientId: "pat_lakshmi", medicine: "paracetamol", now: AFTERNOON })).toMatchObject({ logged: true, drug: "Paracetamol" });
  });

  it("records nothing when there is no plan, and audits what it did", async () => {
    const data = new MockData();
    expect(await runDose(data, { patientId: "pat_meena", now: AFTERNOON })).toMatchObject({ logged: false, reason: "no_active_medicines" });
    await runDose(data, { patientId: "pat_rahul", now: AFTERNOON });
    await runDose(data, { patientId: "pat_rahul", now: NIGHT });
    expect(data.audit.map((a) => a.action)).toEqual(["Refused duplicate dose", "Logged dose"]);
  });

  it("answers in Hindi", async () => {
    const r = await runDose(new MockData(), { patientId: "pat_rahul", now: AFTERNOON, lang: "hi" });
    if ("error" in r) throw new Error(r.error);
    expect(r.spoken).toContain("सुबह की खुराक");
  });
});

describe("get_family_summary", () => {
  it("reports counts, a forming pattern and adherence, without quoting the patient", async () => {
    const data = new MockData();
    const store = new InMemoryStore();
    await seedDemoHistory(store, offlineEmbedder, AFTERNOON);
    await runDose(data, { patientId: "pat_lakshmi", medicine: "telmisartan", now: AFTERNOON });

    const r = await runFamilySummary({ data, store }, { patientId: "pat_lakshmi", days: 7, now: AFTERNOON });
    if ("error" in r) throw new Error(r.error);
    expect(r.complaints).toBe(1); // one knee visit in the last 7 days
    expect(r.regions).toEqual({ Leg: 1 });
    expect(r.recurrence).toMatchObject({ level: "watch", region: "Leg", visitCount: 2 });
    // Telmisartan once + Paracetamol twice = 3 a day; the plan is 7 days old.
    expect(r.medicines).toMatchObject({ expected: 21, taken: 1 });
    expect(r.spoken).toContain("the leg has come up 2 times");
    expect(r.spoken).not.toContain("knees"); // counts only, never her words
  });

  it("counts urgent consults and clamps expected doses to the age of the plan", async () => {
    const data = new MockData();
    const store = new InMemoryStore();
    await runRedFlag(data, { patientId: "pat_rahul", symptoms: "fever for 5 days", now: AFTERNOON });
    const r = await runFamilySummary({ data, store }, { patientId: "pat_rahul", days: 30, now: AFTERNOON });
    if ("error" in r) throw new Error(r.error);
    expect(r.consultsRequested).toBe(1);
    expect(r.medicines.expected).toBe(26); // plan started 12 Sept: 26 days old, not 30
    expect(r.spoken).toContain("1 urgent consult was requested");
  });

  it("says so when memory is unreachable instead of reporting zero complaints as fact", async () => {
    const broken = { currentVisit: async () => "v", insertComplaint: async () => "c", search: async () => [], history: async () => { throw new Error("down"); } };
    const r = await runFamilySummary({ data: new MockData(), store: broken }, { patientId: "pat_rahul", now: AFTERNOON });
    if ("error" in r) throw new Error(r.error);
    expect(r.memory.degraded).toBe(true);
    expect(r.spoken).toContain("can't get to your records");
  });
});
