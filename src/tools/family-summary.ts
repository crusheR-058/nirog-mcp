import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { audit } from "../audit.js";
import { consentDenial, type ConsentScope } from "../auth/consent.js";
import { detectAll } from "../clinical/recurrence.js";
import { REGION_LABELS } from "../clinical/regions.js";
import type { NirogData } from "../data/types.js";
import { langInput, T, type Lang } from "../i18n.js";
import type { ComplaintRecord, MemoryStore } from "../memory/types.js";
import { buildCarePlan } from "./care-plan.js";

const DAY_MS = 86_400_000;
const SCHEDULED = ["morning", "afternoon", "night"];

export interface FamilySummary {
  patient: { id: string; name: string };
  days: number;
  complaints: number;
  /** How many complaints fell in each body region. Counts only, never the patient's words. */
  regions: Record<string, number>;
  recurrence: { level: string; region: string; visitCount: number; spanDays: number } | null;
  medicines: { expected: number; taken: number; adherencePct: number | null };
  consultsRequested: number;
  memory: { degraded: boolean };
  spoken: string;
}

/**
 * A caregiver's view of the last few days: how often something hurt, whether a
 * pattern is forming, and whether medicines are being taken.
 *
 * It reports counts and regions, never quotes. A daughter asking "how is Papa this
 * week" should learn that his back came up three times, not hear what he said word
 * for word. And it needs the same consent as every other tool: the caller's token
 * must already cover this patient.
 */
export async function runFamilySummary(
  deps: { data: NirogData; store: MemoryStore },
  input: { patientId: string; days?: number; now?: Date; lang?: Lang },
): Promise<FamilySummary | { error: string }> {
  const patient = await deps.data.getPatient(input.patientId);
  if (!patient) return { error: `No patient with id ${input.patientId}.` };
  const now = input.now ?? new Date();
  const lang = input.lang ?? "en";
  const days = Math.min(30, Math.max(1, Math.round(input.days ?? 7)));
  const since = new Date(now.getTime() - days * DAY_MS);

  let history: ComplaintRecord[] = [];
  let degraded = false;
  try {
    history = await deps.store.history(patient.id);
  } catch {
    degraded = true;
  }
  const recent = history.filter((c) => c.occurredAt >= since);
  const regions: Record<string, number> = {};
  for (const c of recent) regions[REGION_LABELS[c.bodyRegion]] = (regions[REGION_LABELS[c.bodyRegion]] ?? 0) + 1;
  const flag = degraded ? null : (detectAll(history, now)[0] ?? null);

  const encounter = await deps.data.getLatestEncounter(patient.id);
  const plan = buildCarePlan(patient, encounter, now, lang);
  const perDay = plan.medications.filter((m) => m.status === "active").reduce((n, m) => n + m.timesOfDay.filter((s) => SCHEDULED.includes(s)).length, 0);
  // A plan that started three days ago cannot have seven days of expected doses.
  const planDays = encounter ? Math.max(0, Math.ceil((now.getTime() - new Date(encounter.startedAt).getTime()) / DAY_MS)) : 0;
  const expected = perDay * Math.min(days, planDays);
  const taken = Math.min(expected, (await deps.data.listDoses(patient.id, since)).filter((d) => SCHEDULED.includes(d.slot)).length);

  const consultsRequested = (await deps.data.listConsults()).filter((c) => c.patientId === patient.id && new Date(c.at) >= since).length;

  const body = T.summary(lang, {
    name: patient.fullName,
    days,
    complaints: recent.length,
    flag: flag ? { region: flag.region, visits: flag.visitCount, span: flag.spanDays } : null,
    taken,
    expected,
    consults: consultsRequested,
  });

  await audit(deps.data, "Called get_family_summary", patient.fullName, `Last ${days} days · counts only, no quotes`);

  return {
    patient: { id: patient.id, name: patient.fullName },
    days,
    complaints: recent.length,
    regions,
    recurrence: flag ? { level: flag.level, region: REGION_LABELS[flag.region], visitCount: flag.visitCount, spanDays: flag.spanDays } : null,
    medicines: { expected, taken, adherencePct: expected > 0 ? Math.round((taken / expected) * 100) : null },
    consultsRequested,
    memory: { degraded },
    spoken: degraded ? `${T.memoryDegraded(lang)} ${body}` : body,
  };
}

export function registerFamilySummaryTool(server: McpServer, deps: { data: NirogData; store: MemoryStore; scope?: ConsentScope }, now: () => Date = () => new Date()) {
  const scope = deps.scope ?? { kind: "all" as const };
  server.registerTool(
    "get_family_summary",
    {
      title: "Get family summary",
      description:
        "A caregiver's summary of one patient over the last few days: how many complaints were recorded and in which " +
        "body regions, whether a recurrence pattern is forming, how many scheduled doses were recorded as taken, and " +
        "whether any urgent consults were requested. Reports counts only and never repeats the patient's own words. " +
        "Use when a family member asks how someone has been doing. Requires consent for that patient like every other tool.",
      inputSchema: {
        patient_id: z.string().describe("Nirog patient id of the person being asked about"),
        days: z.number().int().min(1).max(30).optional().describe("How many days back to summarise. Default 7."),
        language: langInput,
      },
    },
    async ({ patient_id, days, language }) => {
      const lang: Lang = language ?? "en";
      const denied = consentDenial(scope, patient_id, lang);
      if (denied) {
        await audit(deps.data, "Refused get_family_summary", patient_id, "No consent for this patient on this device");
        return { isError: true, content: [{ type: "text", text: denied }] };
      }
      const result = await runFamilySummary(deps, { patientId: patient_id, days, now: now(), lang });
      if ("error" in result) return { isError: true, content: [{ type: "text", text: result.error }] };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );
}
