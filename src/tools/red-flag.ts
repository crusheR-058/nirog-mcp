import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { audit } from "../audit.js";
import { consentDenial, type ConsentScope } from "../auth/consent.js";
import { triage, type TriageLevel } from "../clinical/triage.js";
import type { NirogData } from "../data/types.js";
import { EMERGENCY_ADVICE, langInput, T, URGENT_ADVICE, type Lang } from "../i18n.js";

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
  input: { patientId: string; symptoms: string; modelRedFlag?: boolean; now?: Date; lang?: Lang },
): Promise<RedFlagResult | { error: string }> {
  const patient = await data.getPatient(input.patientId);
  if (!patient) return { error: `No patient with id ${input.patientId}.` };
  const now = input.now ?? new Date();
  const lang = input.lang ?? "en";

  const t = triage(input.symptoms, patient.conditions, lang);
  // The model may raise routine to urgent, never lower anything.
  const level: TriageLevel = t.level === "routine" && input.modelRedFlag ? "urgent" : t.level;

  const actions: RedFlagResult["actions"] = [];
  let consultId: string | null = null;
  const parts: string[] = [];
  const reason = t.matched[0]?.label ?? "Flagged by intake assistant";

  if (level === "routine") {
    parts.push(T.routineNoted(lang));
    await audit(data, "Called report_red_flag", patient.fullName, "Triage: routine, no action");
  } else {
    if (level === "emergency") {
      const advice = t.advice ?? EMERGENCY_ADVICE[lang];
      actions.push({ type: "emergency_advice", detail: advice });
      parts.push(advice);
    }
    consultId = await data.requestConsult({ patientId: patient.id, triage: level, reason: `${reason}: "${input.symptoms.trim()}"`, now });
    actions.push({ type: "consult_requested", detail: `${level} consult ${consultId} queued for the on-call doctor` });
    await audit(data, "Queued consult", patient.fullName, `${level} · ${t.matched[0]?.id ?? "raised by the intake assistant"} · rules-based triage`);
    const alerted = await data.alertCaregiver({ patientId: patient.id, level, message: `${patient.fullName}: ${reason}` });
    if (alerted) {
      actions.push({ type: "caregiver_alerted", detail: alerted });
      await audit(data, "Alerted family contact", patient.fullName, `Red flag: ${reason}`);
    }
    parts.push(level === "emergency" ? T.emergencyAlerted(lang, Boolean(alerted)) : (t.advice ?? URGENT_ADVICE[lang]) + (alerted ? T.familyTold(lang) : ""));
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

export function registerRedFlagTool(server: McpServer, data: NirogData, scope: ConsentScope = { kind: "all" }, now: () => Date = () => new Date()) {
  server.registerTool(
    "report_red_flag",
    {
      title: "Report red flag",
      description:
        "Runs rules-based triage on what the patient said and escalates: emergency advice spoken immediately, an " +
        "urgent or emergency consult queued for the on-call doctor, and the family contact alerted. The rules are a " +
        "fixed table (chest pain with sweating, stroke signs, breathing difficulty, severe bleeding, self-harm, and " +
        "more), they understand English and Hindi, and they consider the patient's known conditions. Call it whenever " +
        "a symptom sounds serious, or when start_intake returns a triage level other than routine or aria.redFlag=true. " +
        "Returns the level, the matched rules, the actions taken, and a `spoken` line.",
      inputSchema: {
        patient_id: z.string().describe("Nirog patient id"),
        symptoms: z.string().min(3).max(1000).describe("What the patient said, unedited"),
        model_red_flag: z.boolean().optional().describe("Set true if the intake assistant flagged this; can raise routine to urgent, never lower"),
        language: langInput,
      },
    },
    async ({ patient_id, symptoms, model_red_flag, language }) => {
      const lang: Lang = language ?? "en";
      const denied = consentDenial(scope, patient_id, lang);
      if (denied) {
        await audit(data, "Refused report_red_flag", patient_id, "No consent for this patient on this device");
        return { isError: true, content: [{ type: "text", text: denied }] };
      }
      const result = await runRedFlag(data, { patientId: patient_id, symptoms, modelRedFlag: model_red_flag, now: now(), lang });
      if ("error" in result) return { isError: true, content: [{ type: "text", text: result.error }] };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
}
