import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { nextQuestion, type AriaResult } from "../ai/aria.js";
import type { ConverseFn, ConverseTurn } from "../ai/converse.js";
import { audit } from "../audit.js";
import { consentDenial, type ConsentScope } from "../auth/consent.js";
import { classify, REGION_LABELS, type Region } from "../clinical/regions.js";
import { triage, type TriageLevel } from "../clinical/triage.js";
import type { NirogData } from "../data/types.js";
import { langInput, T, type Lang } from "../i18n.js";
import type { Embedder } from "../memory/embed.js";
import { recallSentence, remember, shortWhen } from "../memory/recall.js";
import type { MemoryStore } from "../memory/types.js";

export interface IntakeResult {
  patient: { id: string; name: string };
  recorded: { text: string; region: string; regionSource: string; inheritedFrom: string | null };
  recall: Array<{ text: string; when: string; distance: number }>;
  recurrence: { level: string; region: string; visitCount: number; spanDays: number; rule: string } | null;
  memory: { degraded: boolean; reason?: string; embedProvider: string; latencyMs: number };
  /**
   * ARIA's next question or handover line. `complete` means the intake is ready for a doctor, and `summary` is then
   * the handover: the patient's exact words plus what the rules found. It is assembled by code, never by the model.
   */
  aria: (AriaResult & { model: string }) | { error: string };
  /** Rules-based triage of this complaint. When not routine, call report_red_flag to escalate. */
  triage: { level: TriageLevel; matched: string[] };
  language: Lang;
  spoken: string;
}

/**
 * The handover a doctor reads. Every part of it is either a verbatim quote or the output of a rule, so nothing can
 * appear here that the patient did not say or that a rule did not find.
 */
export function handoverSummary(p: {
  said: string[];
  region: string;
  regionSource: string;
  recurrence: { level: string; visitCount: number; spanDays: number } | null;
  triage: TriageLevel;
  memoryDegraded: boolean;
}): string {
  const quotes = p.said.slice(-6).map((s) => `"${s.trim()}"`).join("; ");
  const parts = [
    `Said today: ${quotes}.`,
    `Region: ${p.region}${p.regionSource === "inherited" ? " (not named today; taken from an earlier complaint)" : p.regionSource === "none" ? " (not named, and nothing similar on record)" : ""}.`,
    p.memoryDegraded
      ? "Pattern: NOT CHECKED. The patient's history could not be reached."
      : p.recurrence
        ? `Pattern: ${p.recurrence.level}, ${p.recurrence.visitCount} visits in ${p.recurrence.spanDays} days.`
        : "Pattern: none found in the recorded history.",
    `Triage: ${p.triage}.`,
    "Assembled by rules from the patient's own words. Not a diagnosis.",
  ];
  return parts.join(" ");
}

export async function runIntake(
  deps: { data: NirogData; store: MemoryStore; embedder: Embedder; converse?: ConverseFn | null },
  input: { patientId: string; complaint: string; transcript?: ConverseTurn[]; now?: Date; lang?: Lang },
): Promise<IntakeResult | { error: string }> {
  const patient = await deps.data.getPatient(input.patientId);
  if (!patient) return { error: `No patient with id ${input.patientId}.` };
  const now = input.now ?? new Date();
  const lang = input.lang ?? "en";

  const r = await remember({ store: deps.store, embedder: deps.embedder }, { patientId: input.patientId, text: input.complaint, now });
  const flag = r.flags[0] ?? null;
  const recallLine = recallSentence(r, now, lang);

  // The region of the visit, not of the last sentence. An intake usually ends on something like "no, nothing else",
  // and a handover that called a back complaint "Unclassified" because of it would be worse than no handover.
  const anchor = r.history.filter((c) => c.visitId === r.visitId).find((c) => c.bodyRegion !== "unknown");
  const visitRegion: Region = anchor?.bodyRegion ?? r.region.region;
  const visitSource = anchor ? (classify(anchor.rawText).region === "unknown" ? "inherited" : "lexicon") : r.region.source;

  const recurrenceText = flag ? `${flag.level}: ${flag.visitCount} visits about the ${REGION_LABELS[flag.region].toLowerCase()} in ${flag.spanDays} days` : null;
  const turns: ConverseTurn[] = [...(input.transcript ?? []), { role: "user", text: input.complaint.trim() }];
  let aria: IntakeResult["aria"];
  try {
    aria = await nextQuestion(
      {
        patientName: patient.fullName,
        conditions: patient.conditions,
        allergies: patient.allergies,
        currentMedications: patient.currentMedications,
        recallLine,
        region: REGION_LABELS[visitRegion],
        recurrence: recurrenceText,
        lang,
      },
      turns,
      deps.converse,
    );
  } catch (err) {
    aria = { error: err instanceof Error ? err.message : String(err) };
    console.error("[aria] no usable answer:", aria.error.slice(0, 300));
  }

  // Recall is spoken once, on the opening turn; later turns carry it in the data only.
  const openingTurn = !input.transcript || input.transcript.length === 0;
  const ariaLine = "reply" in aria ? aria.reply : T.ariaUnreachable(lang);
  const t = triage(input.complaint, patient.conditions, lang);

  // When memory has something to ask ("...Is this the same thing?"), that is the question for this turn. The model is
  // still consulted, because its red-flag vote counts on every turn, but its own question waits: nobody should be
  // asked two things at once by a voice.
  const recallAsks = openingTurn && Boolean(recallLine) && !r.degraded;
  if (recallAsks && "reply" in aria && !aria.redFlag) aria = { ...aria, reply: recallLine!, complete: false };

  if ("reply" in aria) {
    aria = {
      ...aria,
      summary: aria.complete
        ? handoverSummary({
            said: turns.filter((x) => x.role === "user").map((x) => x.text),
            region: REGION_LABELS[visitRegion],
            regionSource: visitSource,
            recurrence: flag ? { level: flag.level, visitCount: flag.visitCount, spanDays: flag.spanDays } : null,
            triage: t.level,
            memoryDegraded: r.degraded,
          })
        : null,
    };
  }
  const said = "reply" in aria ? aria.reply : ariaLine;
  const spoken =
    t.level === "emergency"
      ? `${t.advice} ${T.escalating(lang)}`
      : said === recallLine
        ? said
        : [openingTurn ? recallLine : null, said].filter(Boolean).join(" ");

  await audit(
    deps.data,
    "Called start_intake",
    patient.fullName,
    `${REGION_LABELS[visitRegion]} · triage ${t.level}${flag ? ` · ${flag.level}` : ""}${r.degraded ? " · memory unreachable" : ""}`,
  );

  return {
    patient: { id: patient.id, name: patient.fullName },
    recorded: {
      text: input.complaint.trim(),
      region: REGION_LABELS[r.region.region],
      regionSource: r.region.source,
      inheritedFrom: r.region.inheritedFromText ?? null,
    },
    recall: r.matches.map((m) => ({ text: m.rawText, when: shortWhen(m.occurredAt, now, lang), distance: Number(m.distance.toFixed(3)) })),
    recurrence: flag
      ? { level: flag.level, region: REGION_LABELS[flag.region], visitCount: flag.visitCount, spanDays: flag.spanDays, rule: flag.rule }
      : null,
    memory: { degraded: r.degraded, reason: r.degradedReason, embedProvider: r.embedProvider, latencyMs: r.latencyMs },
    aria,
    triage: { level: t.level, matched: t.matched.map((m) => m.id) },
    language: lang,
    spoken,
  };
}

export function registerIntakeTool(
  server: McpServer,
  deps: { data: NirogData; store: MemoryStore; embedder: Embedder; converse?: ConverseFn | null; scope?: ConsentScope },
  now: () => Date = () => new Date(),
) {
  const scope = deps.scope ?? { kind: "all" as const };
  server.registerTool(
    "start_intake",
    {
      title: "Start intake",
      description:
        "Records what the patient says, in their own words, into their clinical memory and recalls earlier complaints " +
        "that meant the same thing even when worded differently. Returns prior matches, a recurrence flag when the same " +
        "body region has come up across several visits, ARIA's next intake question (or a handover line once " +
        "`aria.complete` is true), and a `spoken` line to read aloud. Pass the earlier turns of this conversation in " +
        "`transcript` so ARIA does not repeat herself. If memory could not be reached it says so instead of pretending " +
        "there is no history. Call this whenever a patient describes or elaborates on a symptom.",
      inputSchema: {
        patient_id: z.string().describe("Nirog patient id, e.g. pat_rahul"),
        complaint: z.string().min(3).max(1000).describe("Exactly what the patient said, unedited, in whatever language they said it"),
        transcript: z
          .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) }))
          .max(40)
          .optional()
          .describe("Earlier turns of this intake conversation, oldest first, not including `complaint`"),
        language: langInput,
      },
    },
    async ({ patient_id, complaint, transcript, language }) => {
      const lang: Lang = language ?? "en";
      const denied = consentDenial(scope, patient_id, lang);
      if (denied) {
        await audit(deps.data, "Refused start_intake", patient_id, "No consent for this patient on this device");
        return { isError: true, content: [{ type: "text", text: denied }] };
      }
      const result = await runIntake(deps, { patientId: patient_id, complaint, transcript, now: now(), lang });
      if ("error" in result) return { isError: true, content: [{ type: "text", text: result.error }] };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
}
