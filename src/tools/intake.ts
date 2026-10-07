import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NirogData } from "../data/types.js";
import type { Embedder } from "../memory/embed.js";
import { recallSentence, remember, shortWhen } from "../memory/recall.js";
import type { MemoryStore } from "../memory/types.js";
import { REGION_LABELS } from "../clinical/regions.js";
import { nextQuestion, type AriaResult } from "../ai/aria.js";
import type { ConverseFn, ConverseTurn } from "../ai/converse.js";

export interface IntakeResult {
  patient: { id: string; name: string };
  recorded: { text: string; region: string; regionSource: string; inheritedFrom: string | null };
  recall: Array<{ text: string; when: string; distance: number }>;
  recurrence: { level: string; region: string; visitCount: number; spanDays: number; rule: string } | null;
  memory: { degraded: boolean; reason?: string; embedProvider: string; latencyMs: number };
  /** ARIA's next question or handover line. `complete` means the intake is ready for a doctor. */
  aria: (AriaResult & { model: string }) | { error: string };
  spoken: string;
}

export async function runIntake(
  deps: { data: NirogData; store: MemoryStore; embedder: Embedder; converse?: ConverseFn | null },
  input: { patientId: string; complaint: string; transcript?: ConverseTurn[]; now?: Date },
): Promise<IntakeResult | { error: string }> {
  const patient = await deps.data.getPatient(input.patientId);
  if (!patient) return { error: `No patient with id ${input.patientId}.` };
  const now = input.now ?? new Date();

  const r = await remember({ store: deps.store, embedder: deps.embedder }, { patientId: input.patientId, text: input.complaint, now });
  const flag = r.flags[0] ?? null;
  const recallLine = recallSentence(r, now);

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
        region: REGION_LABELS[r.region.region],
        recurrence: recurrenceText,
      },
      turns,
      deps.converse,
    );
  } catch (err) {
    aria = { error: err instanceof Error ? err.message : String(err) };
  }

  // Recall is spoken once, on the opening turn; later turns carry it in the data only.
  const openingTurn = !input.transcript || input.transcript.length === 0;
  const ariaLine = "reply" in aria ? aria.reply : "I could not reach the intake assistant, but your complaint is recorded and a doctor will see it.";
  const spoken = [openingTurn ? recallLine : null, ariaLine].filter(Boolean).join(" ");

  return {
    patient: { id: patient.id, name: patient.fullName },
    recorded: {
      text: input.complaint.trim(),
      region: REGION_LABELS[r.region.region],
      regionSource: r.region.source,
      inheritedFrom: r.region.inheritedFromText ?? null,
    },
    recall: r.matches.map((m) => ({ text: m.rawText, when: shortWhen(m.occurredAt, now), distance: Number(m.distance.toFixed(3)) })),
    recurrence: flag
      ? { level: flag.level, region: REGION_LABELS[flag.region], visitCount: flag.visitCount, spanDays: flag.spanDays, rule: flag.rule }
      : null,
    memory: { degraded: r.degraded, reason: r.degradedReason, embedProvider: r.embedProvider, latencyMs: r.latencyMs },
    aria,
    spoken,
  };
}

export function registerIntakeTool(
  server: McpServer,
  deps: { data: NirogData; store: MemoryStore; embedder: Embedder; converse?: ConverseFn | null },
  now: () => Date = () => new Date(),
) {
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
        complaint: z.string().min(3).max(1000).describe("Exactly what the patient said, unedited"),
        transcript: z
          .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) }))
          .max(40)
          .optional()
          .describe("Earlier turns of this intake conversation, oldest first, not including `complaint`"),
      },
    },
    async ({ patient_id, complaint, transcript }) => {
      const result = await runIntake(deps, { patientId: patient_id, complaint, transcript, now: now() });
      if ("error" in result) return { isError: true, content: [{ type: "text", text: result.error }] };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
}
