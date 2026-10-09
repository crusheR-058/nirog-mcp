/**
 * Remember: the write-and-recall path. Embed what the patient said, find what
 * they said before that meant the same thing, resolve the body region (possibly
 * inheriting it from memory), store the complaint, and run the recurrence rule
 * over the whole history.
 *
 * Memory failure is never silent. A failed lookup returns `degraded: true` with a
 * reason, and the spoken reply says the history could not be checked.
 */

import { detectAll, type RecurrenceFlag } from "../clinical/recurrence.js";
import { shortWhen, T, type Lang } from "../i18n.js";
import { inheritThresholdFor, resolveRegion, type ResolvedRegion } from "../clinical/resolve.js";
import type { Embedder } from "./embed.js";
import type { ComplaintRecord, MemoryStore, RecallMatch } from "./types.js";

/** Offline embedder scale. */
export const RECALL_THRESHOLD = 0.55;
/** Titan scale, measured in the Nirog repo. */
export const BEDROCK_RECALL_THRESHOLD = 0.85;

export function recallThresholdFor(provider: string): number {
  return provider.startsWith("bedrock:") ? BEDROCK_RECALL_THRESHOLD : RECALL_THRESHOLD;
}

export const MEMORY_TIMEOUT_MS = 2500;

export interface RememberResult {
  complaintId: string | null;
  /** The visit this sentence belongs to: one per consultation, shared by every turn of it. Null when memory was unreachable. */
  visitId: string | null;
  region: ResolvedRegion;
  matches: RecallMatch[];
  history: ComplaintRecord[];
  flags: RecurrenceFlag[];
  embedProvider: string;
  degraded: boolean;
  degradedReason?: string;
  latencyMs: number;
}

function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`memory did not respond within ${ms}ms`)), ms);
    }),
  ]).finally(() => timer && clearTimeout(timer));
}

export async function remember(
  deps: { store: MemoryStore; embedder: Embedder },
  input: { patientId: string; text: string; now?: Date },
): Promise<RememberResult> {
  const started = Date.now();
  const now = input.now ?? new Date();
  const text = input.text.trim();

  let vector: number[] | null = null;
  let embedProvider = deps.embedder.provider;
  try {
    const r = await deps.embedder.embed(text);
    vector = r.vector;
    embedProvider = r.provider;
  } catch {
    embedProvider = "none";
  }

  let matches: RecallMatch[] = [];
  let history: ComplaintRecord[] = [];
  let visitId: string | null = null;
  let degraded = false;
  let degradedReason: string | undefined;

  try {
    await withTimeout(async () => {
      const visit = await deps.store.currentVisit(input.patientId, now);
      visitId = visit;
      if (vector) {
        const found = await deps.store.search({
          patientId: input.patientId,
          embedding: vector,
          limit: 8,
          threshold: recallThresholdFor(embedProvider),
          before: now,
        });
        // Memory is about earlier visits. What the patient said two minutes ago in this same consultation is not a
        // recollection, and reading it back to them as one ("yesterday you told me...") would be absurd.
        matches = found.filter((m) => m.visitId !== visit).slice(0, 5);
      }
      history = await deps.store.history(input.patientId);
    }, MEMORY_TIMEOUT_MS);
  } catch (err) {
    degraded = true;
    degradedReason = err instanceof Error ? err.message : String(err);
  }

  const region = resolveRegion(text, matches, inheritThresholdFor(embedProvider));

  let complaintId: string | null = null;
  if (!degraded && visitId) {
    try {
      complaintId = await deps.store.insertComplaint({
        patientId: input.patientId,
        visitId,
        rawText: text,
        bodyRegion: region.region,
        regionSource: region.source,
        regionInheritedFrom: region.inheritedFrom ?? null,
        embedding: vector,
        embedModel: vector ? embedProvider : null,
        occurredAt: now,
      });
      history = [...history, { id: complaintId, visitId, patientId: input.patientId, rawText: text, bodyRegion: region.region, occurredAt: now }];
    } catch (err) {
      degraded = true;
      degradedReason = `write failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const flags = degraded ? [] : detectAll(history, now);

  return { complaintId, visitId, region, matches, history, flags, embedProvider, degraded, degradedReason, latencyMs: Date.now() - started };
}

export { shortWhen };

/**
 * One sentence of recall for the voice assistant to say, chosen by the same
 * deterministic rule that drives the doctor's chart. Ported from Nirog's
 * /api/memory/context opener. The patient's own words are quoted unchanged in
 * either language.
 */
export function recallSentence(r: RememberResult, now: Date, lang: Lang = "en"): string | null {
  if (r.degraded) return T.memoryDegraded(lang);
  const flag = r.flags[0];
  if (flag?.level === "recurrent") {
    const first = flag.complaints[0];
    return T.recallRecurrent(lang, { region: flag.region, visits: flag.visitCount, days: flag.spanDays, when: shortWhen(first.occurredAt, now, lang), text: first.rawText });
  }
  if (flag?.level === "watch") {
    const prev = flag.complaints.filter((c) => c.occurredAt < now).at(-1);
    if (prev) return T.recallWatch(lang, { region: flag.region, when: shortWhen(prev.occurredAt, now, lang) });
  }
  // A sentence that named nothing ("no, that's all") is not worth reminding anyone of.
  const closest = r.matches.find((m) => m.bodyRegion !== "unknown");
  if (closest) return T.recallClosest(lang, { when: shortWhen(closest.occurredAt, now, lang), text: closest.rawText });
  return null;
}
