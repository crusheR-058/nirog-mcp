import { describe, expect, it } from "vitest";
import { MOCK_ENCOUNTERS, MOCK_PATIENTS } from "../data/mock.js";
import { buildCarePlan, dosesForFrequency } from "./care-plan.js";

const rahul = MOCK_PATIENTS[0];
const sunita = MOCK_PATIENTS[1];
const meena = MOCK_PATIENTS[2];
const rahulEnc = MOCK_ENCOUNTERS[0];
const sunitaEnc = MOCK_ENCOUNTERS[1];

describe("dosesForFrequency", () => {
  it("maps common doctor shorthand", () => {
    expect(dosesForFrequency("Once daily")).toEqual(["morning"]);
    expect(dosesForFrequency("Twice daily")).toEqual(["morning", "night"]);
    expect(dosesForFrequency("TDS")).toEqual(["morning", "afternoon", "night"]);
    expect(dosesForFrequency("PRN")).toEqual(["as needed"]);
    expect(dosesForFrequency(undefined)).toEqual(["as directed"]);
  });
});

describe("buildCarePlan", () => {
  it("reports active medicines and days remaining", () => {
    const now = new Date("2026-10-07T06:00:00Z"); // exactly 25 days after Rahul's 90-day plan started
    const plan = buildCarePlan(rahul, rahulEnc, now);
    expect(plan.medications).toHaveLength(1);
    expect(plan.medications[0]).toMatchObject({ drug: "Amlodipine", status: "active", daysRemaining: 65, timesOfDay: ["morning"] });
    expect(plan.followUp).toMatchObject({ status: "upcoming", daysUntil: 65 });
    expect(plan.spoken).toContain("Amlodipine 5mg 1 tablet morning");
  });

  it("marks completed courses and overdue follow-ups", () => {
    const now = new Date("2027-01-01T00:00:00Z");
    const plan = buildCarePlan(rahul, rahulEnc, now);
    expect(plan.medications[0].status).toBe("completed");
    expect(plan.followUp?.status).toBe("overdue");
    expect(plan.spoken).toContain("no active medicines");
    expect(plan.spoken).toContain("overdue");
  });

  it("lists pending tests and twice-daily timing", () => {
    const now = new Date("2026-10-07T00:00:00Z");
    const plan = buildCarePlan(sunita, sunitaEnc, now);
    expect(plan.pendingTests).toEqual(["HbA1c", "Fasting lipid profile"]);
    expect(plan.medications[0].timesOfDay).toEqual(["morning", "night"]);
    expect(plan.patient.allergies).toEqual(["Sulfa drugs"]);
  });

  it("handles a patient with no plan", () => {
    const plan = buildCarePlan(meena, null, new Date());
    expect(plan.medications).toEqual([]);
    expect(plan.spoken).toContain("no care plan on file");
  });
});
