import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { audit } from "../audit.js";
import { consentDenial, type ConsentScope } from "../auth/consent.js";
import type { NirogData } from "../data/types.js";
import { langInput, T, type Lang } from "../i18n.js";
import { buildCarePlan, type MedicationLine } from "./care-plan.js";

/** The clinic's clock. Doses are counted per local day, not per UTC day. Default is IST. */
const OFFSET_MS = Number(process.env.CLINIC_UTC_OFFSET_MINUTES ?? 330) * 60_000;
const SCHEDULED = ["morning", "afternoon", "night"];

export function clinicClock(now: Date) {
  const local = new Date(now.getTime() + OFFSET_MS);
  const hour = local.getUTCHours();
  const minutes = String(local.getUTCMinutes()).padStart(2, "0");
  return {
    /** Start of the clinic's local day, as a UTC instant. */
    dayStart: new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET_MS),
    period: hour < 12 ? "morning" : hour < 17 ? "afternoon" : "night",
    time: `${hour % 12 || 12}:${minutes} ${hour < 12 ? "am" : "pm"}`,
  };
}

export interface DoseResult {
  patient: { id: string; name: string };
  logged: boolean;
  /** Why nothing was logged, when `logged` is false. */
  reason?: "no_active_medicines" | "which_medicine" | "already_taken";
  drug: string | null;
  slot: string | null;
  today: { expected: number; taken: number } | null;
  remainingToday: string[];
  spoken: string;
}

function pick(active: MedicationLine[], medicine?: string): MedicationLine | null {
  if (medicine?.trim()) {
    const m = medicine.trim().toLowerCase();
    return active.find((a) => a.drug.toLowerCase().includes(m) || m.includes(a.drug.toLowerCase())) ?? null;
  }
  return active.length === 1 ? active[0] : null;
}

export async function runDose(data: NirogData, input: { patientId: string; medicine?: string; now?: Date; lang?: Lang }): Promise<DoseResult | { error: string }> {
  const patient = await data.getPatient(input.patientId);
  if (!patient) return { error: `No patient with id ${input.patientId}.` };
  const now = input.now ?? new Date();
  const lang = input.lang ?? "en";
  const who = { id: patient.id, name: patient.fullName };

  const plan = buildCarePlan(patient, await data.getLatestEncounter(patient.id), now, lang);
  const active = plan.medications.filter((m) => m.status === "active");
  if (active.length === 0) {
    return { patient: who, logged: false, reason: "no_active_medicines", drug: null, slot: null, today: null, remainingToday: [], spoken: T.doseNoMeds(lang, patient.fullName) };
  }

  const med = pick(active, input.medicine);
  if (!med) {
    const list = active.map((m) => `${m.drug} ${m.strength ?? ""}`.trim()).join(lang === "hi" ? " या " : " or ");
    return { patient: who, logged: false, reason: "which_medicine", drug: null, slot: null, today: null, remainingToday: [], spoken: T.doseWhich(lang, list) };
  }

  const clock = clinicClock(now);
  const label = `${med.drug} ${med.strength ?? ""}`.trim();
  const slots = med.timesOfDay.filter((s) => SCHEDULED.includes(s));
  const takenToday = (await data.listDoses(patient.id, clock.dayStart)).filter((d) => d.drug === med.drug).map((d) => d.slot);

  // "As needed" medicines have no schedule to check against, so they are simply recorded.
  if (slots.length === 0) {
    await data.logDose({ patientId: patient.id, drug: med.drug, slot: med.timesOfDay[0], takenAt: now });
    await audit(data, "Logged dose", patient.fullName, `${label} · ${med.timesOfDay[0]}`);
    return { patient: who, logged: true, drug: med.drug, slot: med.timesOfDay[0], today: null, remainingToday: [], spoken: T.doseLogged(lang, { drug: label, slot: med.timesOfDay[0], time: clock.time, next: null }) };
  }

  const remaining = slots.filter((s) => !takenToday.includes(s));
  if (remaining.length === 0) {
    // The double-dose guard: every scheduled dose for today is already on record.
    await audit(data, "Refused duplicate dose", patient.fullName, `${label} · today's scheduled doses are already recorded`);
    return { patient: who, logged: false, reason: "already_taken", drug: med.drug, slot: null, today: { expected: slots.length, taken: slots.length }, remainingToday: [], spoken: T.doseDuplicate(lang, label) };
  }

  const slot = remaining.includes(clock.period) ? clock.period : remaining[0];
  await data.logDose({ patientId: patient.id, drug: med.drug, slot, takenAt: now });
  await audit(data, "Logged dose", patient.fullName, `${label} · ${slot}`);
  const left = remaining.filter((s) => s !== slot);
  return {
    patient: who,
    logged: true,
    drug: med.drug,
    slot,
    today: { expected: slots.length, taken: slots.length - left.length },
    remainingToday: left,
    spoken: T.doseLogged(lang, { drug: label, slot, time: clock.time, next: left[0] ?? null }),
  };
}

export function registerDoseTool(server: McpServer, data: NirogData, scope: ConsentScope = { kind: "all" }, now: () => Date = () => new Date()) {
  server.registerTool(
    "log_dose_taken",
    {
      title: "Log dose taken",
      description:
        "Records that the patient took a medicine from their care plan, and guards against a double dose: if every " +
        "scheduled dose for today is already recorded it refuses and says so. If the patient has several active " +
        "medicines and does not name one, it asks which. Use when the patient says they took, or are about to take, " +
        "their medicine. Returns what was logged, what is left today, and a `spoken` line.",
      inputSchema: {
        patient_id: z.string().describe("Nirog patient id"),
        medicine: z.string().max(80).optional().describe("The medicine named by the patient, if any, e.g. 'amlodipine' or 'the BP tablet'"),
        language: langInput,
      },
    },
    async ({ patient_id, medicine, language }) => {
      const lang: Lang = language ?? "en";
      const denied = consentDenial(scope, patient_id, lang);
      if (denied) {
        await audit(data, "Refused log_dose_taken", patient_id, "No consent for this patient on this device");
        return { isError: true, content: [{ type: "text", text: denied }] };
      }
      const result = await runDose(data, { patientId: patient_id, medicine, now: now(), lang });
      if ("error" in result) return { isError: true, content: [{ type: "text", text: result.error }] };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
}
