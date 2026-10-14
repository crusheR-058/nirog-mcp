import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { audit } from "../audit.js";
import { consentDenial, type ConsentScope } from "../auth/consent.js";
import { triage, type TriageLevel } from "../clinical/triage.js";
import type { NirogData, PatientRecord } from "../data/types.js";
import { EMERGENCY_ADVICE, langInput, T, URGENT_ADVICE, type Lang } from "../i18n.js";

export interface RedFlagResult {
  patient: { id: string; name: string };
  level: TriageLevel;
  matched: Array<{ id: string; label: string; level: TriageLevel }>;
  actions: Array<{ type: "emergency_advice" | "consult_requested" | "caregiver_alerted" | "escalation_failed"; detail: string }>;
  consultId: string | null;
  spoken: string;
}

export async function runRedFlag(
  data: NirogData,
  input: { patientId: string; symptoms: string; modelRedFlag?: boolean; now?: Date; lang?: Lang },
): Promise<RedFlagResult | { error: string }> {
  // This tool must speak its advice even when the clinic record is down, so nothing below may throw past it.
  // An unknown patient is still refused; an unreachable record is triaged without the patient's conditions.
  let patient: PatientRecord | null = null;
  let recordDown = false;
  try {
    patient = await data.getPatient(input.patientId);
  } catch (err) {
    recordDown = true;
    console.error("[red-flag] patient record unreachable:", err instanceof Error ? err.message : String(err));
  }
  if (!patient && !recordDown) return { error: `No patient with id ${input.patientId}.` };
  const who = { id: input.patientId, name: patient?.fullName ?? input.patientId };
  const now = input.now ?? new Date();
  const lang = input.lang ?? "en";

  const t = triage(input.symptoms, patient?.conditions ?? [], lang);
  // The model may raise routine to urgent, never lower anything.
  const level: TriageLevel = t.level === "routine" && input.modelRedFlag ? "urgent" : t.level;

  const actions: RedFlagResult["actions"] = [];
  let consultId: string | null = null;
  const parts: string[] = [];
  const reason = t.matched[0]?.label ?? "Flagged by intake assistant";

  if (level === "routine") {
    parts.push(T.routineNoted(lang));
    await audit(data, "Called report_red_flag", who.name, "Triage: routine, no action");
  } else {
    if (level === "emergency") {
      const advice = t.advice ?? EMERGENCY_ADVICE[lang];
      actions.push({ type: "emergency_advice", detail: advice });
      parts.push(advice);
    }
    // The doctor opens the consult with the patient's words and the rule that fired. Saving it must never block escalation.
    const handoverId = await data
      .saveHandover({
        patientId: who.id,
        chiefComplaint: reason,
        narrative: `Said: "${input.symptoms.trim()}". ${t.matched.length ? `Matched: ${t.matched.map((m) => m.label).join("; ")}.` : "Raised by the intake assistant; no rule matched."} Escalated by rules-based triage. Not a diagnosis.`,
        symptoms: [],
        redFlags: t.matched.map((m) => m.label),
        triage: level,
        language: lang === "hi" ? "Hindi" : "English",
        now,
      })
      .catch((err: unknown) => {
        console.error("[red-flag] handover not saved:", err instanceof Error ? err.message : String(err));
        return undefined;
      });
    let alerted: string | null = null;
    try {
      consultId = await data.requestConsult({ patientId: who.id, triage: level, reason: `${reason}: "${input.symptoms.trim()}"`, now, handoverId });
      actions.push({ type: "consult_requested", detail: `${level} consult ${consultId} queued for the on-call doctor` });
      await audit(data, "Queued consult", who.name, `${level} · ${t.matched[0]?.id ?? "raised by the intake assistant"} · rules-based triage`);
      alerted = await data.alertCaregiver({ patientId: who.id, level, message: `${who.name}: ${reason}` });
      if (alerted) {
        actions.push({ type: "caregiver_alerted", detail: alerted });
        // Not "alerted": no message is sent yet. The contact is on the consult for the doctor to call.
        await audit(data, "Flagged family contact", who.name, `Red flag: ${reason} · contact on the consult; SMS not wired`);
      }
    } catch (err) {
      console.error("[red-flag] escalation not recorded:", err instanceof Error ? err.message : String(err));
      actions.push({ type: "escalation_failed", detail: "The clinic record could not be reached; nobody has been told. The patient was told to call 108." });
    }
    const failed = consultId === null;
    parts.push(
      failed ? T.escalationFailed(lang)
      : level === "emergency" ? T.emergencyAlerted(lang, Boolean(alerted))
      : (t.advice ?? URGENT_ADVICE[lang]) + (alerted ? T.familyTold(lang) : ""),
    );
  }

  return {
    patient: who,
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
