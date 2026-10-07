import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { triage, type TriageLevel } from "../clinical/triage.js";
import type { NirogData } from "../data/types.js";

export interface RedFlagResult {
  patient: { id: string; name: string };
  level: TriageLevel;
  matched: Array<{ id: string; label: string; level: TriageLevel }>;
  actions: Array<{ type: "emergency_advice" | "consult_requested" | "caregiver_alerted"; detail: string }>;
  consultId: string | null;
  spoken: string;
}

export async function runRedFlag(
  data: NirogData,
  input: { patientId: string; symptoms: string; modelRedFlag?: boolean; now?: Date },
): Promise<RedFlagResult | { error: string }> {
  const patient = await data.getPatient(input.patientId);
  if (!patient) return { error: `No patient with id ${input.patientId}.` };
  const now = input.now ?? new Date();

  const t = triage(input.symptoms, patient.conditions);
  // The model may raise routine to urgent, never lower anything.
  const level: TriageLevel = t.level === "routine" && input.modelRedFlag ? "urgent" : t.level;

  const actions: RedFlagResult["actions"] = [];
  let consultId: string | null = null;
  const parts: string[] = [];

  if (level === "routine") {
    parts.push("Nothing here needs emergency care. I have noted it for the doctor.");
  } else {
    if (level === "emergency") {
      const advice = t.advice ?? "This could be serious. Please call 108 for an ambulance or go to the nearest hospital right now.";
      actions.push({ type: "emergency_advice", detail: advice });
      parts.push(advice);
    }
    const reason = t.matched[0]?.label ?? "Flagged by intake assistant";
    consultId = await data.requestConsult({ patientId: patient.id, triage: level, reason: `${reason}: "${input.symptoms.trim()}"`, now });
    actions.push({ type: "consult_requested", detail: `${level} consult ${consultId} queued for the on-call doctor` });
    const alerted = await data.alertCaregiver({ patientId: patient.id, level, message: `${patient.fullName}: ${reason}` });
    if (alerted) actions.push({ type: "caregiver_alerted", detail: alerted });
    parts.push(
      level === "emergency"
        ? `I have also alerted the on-call doctor${alerted ? " and your family contact" : ""}.`
        : (t.advice ?? "I am booking you an urgent consultation with the doctor.") + (alerted ? " Your family contact has been told." : ""),
    );
  }

  return {
    patient: { id: patient.id, name: patient.fullName },
    level,
    matched: t.matched.map(({ id, label, level }) => ({ id, label, level })),
    actions,
    consultId,
    spoken: parts.join(" "),
  };
}

export function registerRedFlagTool(server: McpServer, data: NirogData, now: () => Date = () => new Date()) {
  server.registerTool(
    "report_red_flag",
    {
      title: "Report red flag",
      description:
        "Runs rules-based triage on what the patient said and escalates: emergency advice spoken immediately, an " +
        "urgent or emergency consult queued for the on-call doctor, and the family contact alerted. The rules are a " +
        "fixed table (chest pain with sweating, stroke signs, breathing difficulty, severe bleeding, self-harm, and " +
        "more) and they consider the patient's known conditions. Call it whenever a symptom sounds serious, or when " +
        "start_intake returns aria.redFlag=true. Returns the level, the matched rules, the actions taken, and a `spoken` line.",
      inputSchema: {
        patient_id: z.string().describe("Nirog patient id"),
        symptoms: z.string().min(3).max(1000).describe("What the patient said, unedited"),
        model_red_flag: z.boolean().optional().describe("Set true if the intake assistant flagged this; can raise routine to urgent, never lower"),
      },
    },
    async ({ patient_id, symptoms, model_red_flag }) => {
      const result = await runRedFlag(data, { patientId: patient_id, symptoms, modelRedFlag: model_red_flag, now: now() });
      if ("error" in result) return { isError: true, content: [{ type: "text", text: result.error }] };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
}
