import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { NirogData } from "../data/types.js";
import type { Embedder } from "../memory/embed.js";
import { recallSentence, remember, shortWhen } from "../memory/recall.js";
import type { MemoryStore } from "../memory/types.js";
import { REGION_LABELS } from "../clinical/regions.js";

export interface IntakeResult {
  patient: { id: string; name: string };
  recorded: { text: string; region: string; regionSource: string; inheritedFrom: string | null };
  recall: Array<{ text: string; when: string; distance: number }>;
  recurrence: { level: string; region: string; visitCount: number; spanDays: number; rule: string } | null;
  memory: { degraded: boolean; reason?: string; embedProvider: string; latencyMs: number };
  spoken: string;
}

export async function runIntake(
  deps: { data: NirogData; store: MemoryStore; embedder: Embedder },
  input: { patientId: string; complaint: string; now?: Date },
): Promise<IntakeResult | { error: string }> {
  const patient = await deps.data.getPatient(input.patientId);
  if (!patient) return { error: `No patient with id ${input.patientId}.` };
  const now = input.now ?? new Date();

  const r = await remember({ store: deps.store, embedder: deps.embedder }, { patientId: input.patientId, text: input.complaint, now });
  const flag = r.flags[0] ?? null;
  const recallLine = recallSentence(r, now);

  const ack = `Noted: "${input.complaint.trim()}".`;
  const spoken = [ack, recallLine].filter(Boolean).join(" ");

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
    spoken,
  };
}

export function registerIntakeTool(
  server: McpServer,
  deps: { data: NirogData; store: MemoryStore; embedder: Embedder },
  now: () => Date = () => new Date(),
) {
  server.registerTool(
    "start_intake",
    {
      title: "Start intake",
      description:
        "Records what the patient says, in their own words, into their clinical memory and recalls earlier complaints " +
        "that meant the same thing even when worded differently. Returns prior matches, a recurrence flag when the same " +
        "body region has come up across several visits, and a `spoken` line to read aloud. If memory could not be " +
        "reached it says so instead of pretending there is no history. Call this first whenever a patient describes a symptom.",
      inputSchema: {
        patient_id: z.string().describe("Nirog patient id, e.g. pat_rahul"),
        complaint: z.string().min(3).max(1000).describe("Exactly what the patient said, unedited"),
      },
    },
    async ({ patient_id, complaint }) => {
      const result = await runIntake(deps, { patientId: patient_id, complaint, now: now() });
      if ("error" in result) return { isError: true, content: [{ type: "text", text: result.error }] };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
}
