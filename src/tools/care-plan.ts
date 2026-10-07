import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EncounterRecord, NirogData, PatientRecord, PrescribedItem } from "../data/types.js";
import { consentDenial, type ConsentScope } from "../auth/consent.js";

const DAY_MS = 86_400_000;

/** Map a free-text frequency from the doctor to times of day a voice assistant can read out. */
export function dosesForFrequency(frequency?: string): string[] {
  const f = (frequency ?? "").toLowerCase();
  if (/thrice|three|tds|tid|3x/.test(f)) return ["morning", "afternoon", "night"];
  if (/twice|two|bd|bid|2x/.test(f)) return ["morning", "night"];
  if (/once|daily|od|1x/.test(f)) return ["morning"];
  if (/prn|as needed|when required/.test(f)) return ["as needed"];
  return ["as directed"];
}

export interface MedicationLine {
  drug: string;
  strength?: string;
  dose?: string;
  frequency?: string;
  timesOfDay: string[];
  daysRemaining: number | null;
  status: "active" | "completed";
}

export interface CarePlanSummary {
  patient: { id: string; name: string; conditions: string[]; allergies: string[] };
  planFrom: string | null;
  chiefComplaint: string | null;
  medications: MedicationLine[];
  pendingTests: string[];
  followUp: { dueOn: string; daysUntil: number; status: "overdue" | "due_today" | "upcoming"; instructions?: string } | null;
  doctorInstructions: string | null;
  spoken: string;
}

function medicationLine(item: PrescribedItem, startedAt: Date, now: Date): MedicationLine {
  const daysElapsed = Math.floor((now.getTime() - startedAt.getTime()) / DAY_MS);
  const daysRemaining = item.durationDays != null ? item.durationDays - daysElapsed : null;
  return {
    drug: item.drug,
    strength: item.strength,
    dose: item.dose,
    frequency: item.frequency,
    timesOfDay: dosesForFrequency(item.frequency),
    daysRemaining,
    status: daysRemaining != null && daysRemaining < 0 ? "completed" : "active",
  };
}

/** Pure function so it is unit-testable with a fixed `now`. */
export function buildCarePlan(patient: PatientRecord, encounter: EncounterRecord | null, now: Date): CarePlanSummary {
  const base = { id: patient.id, name: patient.fullName, conditions: patient.conditions, allergies: patient.allergies };

  if (!encounter) {
    return {
      patient: base,
      planFrom: null,
      chiefComplaint: null,
      medications: [],
      pendingTests: [],
      followUp: null,
      doctorInstructions: null,
      spoken: `${patient.fullName} has no care plan on file yet. If something is bothering them, I can start an intake.`,
    };
  }

  const startedAt = new Date(encounter.startedAt);
  const medications = encounter.prescriptions.map((p) => medicationLine(p, startedAt, now));
  const active = medications.filter((m) => m.status === "active");
  const pendingTests = encounter.labRequests.map((l) => l.test);

  let followUp: CarePlanSummary["followUp"] = null;
  if (encounter.followUp) {
    const dueOn = new Date(startedAt.getTime() + encounter.followUp.inDays * DAY_MS);
    const daysUntil = Math.ceil((dueOn.getTime() - now.getTime()) / DAY_MS);
    followUp = {
      dueOn: dueOn.toISOString().slice(0, 10),
      daysUntil,
      status: daysUntil < 0 ? "overdue" : daysUntil === 0 ? "due_today" : "upcoming",
      instructions: encounter.followUp.instructions,
    };
  }

  const parts: string[] = [];
  if (active.length === 0) parts.push(`${patient.fullName} has no active medicines right now.`);
  else
    parts.push(
      `${patient.fullName} has ${active.length} active medicine${active.length > 1 ? "s" : ""}: ` +
        active.map((m) => `${m.drug} ${m.strength ?? ""} ${m.dose ?? ""} ${m.timesOfDay.join(" and ")}`.replace(/\s+/g, " ").trim()).join("; ") +
        ".",
    );
  if (pendingTests.length) parts.push(`Pending tests: ${pendingTests.join(" and ")}.`);
  if (followUp) {
    if (followUp.status === "overdue") parts.push(`The follow-up with the doctor is overdue by ${-followUp.daysUntil} days.`);
    else if (followUp.status === "due_today") parts.push("The follow-up with the doctor is due today.");
    else parts.push(`The next follow-up is in ${followUp.daysUntil} days.`);
  }

  return {
    patient: base,
    planFrom: encounter.startedAt.slice(0, 10),
    chiefComplaint: encounter.chiefComplaint,
    medications,
    pendingTests,
    followUp,
    doctorInstructions: encounter.clinicalNotes || null,
    spoken: parts.join(" "),
  };
}

export function registerCarePlanTool(server: McpServer, data: NirogData, scope: ConsentScope = { kind: "all" }, now: () => Date = () => new Date()) {
  server.registerTool(
    "get_care_plan",
    {
      title: "Get care plan",
      description:
        "Returns the patient's current care plan from their last doctor consultation: active medicines with times of day, " +
        "pending tests, and when the next follow-up is due. Includes a `spoken` field ready to read aloud. " +
        "Use when the patient asks what medicines to take, whether tests are pending, or when to see the doctor next.",
      inputSchema: { patient_id: z.string().describe("Nirog patient id, e.g. pat_rahul") },
    },
    async ({ patient_id }) => {
      const denied = consentDenial(scope, patient_id);
      if (denied) return { isError: true, content: [{ type: "text", text: denied }] };
      const patient = await data.getPatient(patient_id);
      if (!patient) {
        return { isError: true, content: [{ type: "text", text: `No patient with id ${patient_id}.` }] };
      }
      const encounter = await data.getLatestEncounter(patient_id);
      const plan = buildCarePlan(patient, encounter, now());
      return { content: [{ type: "text", text: JSON.stringify(plan) }] };
    },
  );
}
