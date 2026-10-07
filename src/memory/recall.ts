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
import { REGION_LABELS } from "../clinical/regions.js";
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
  let degraded = false;
  let degradedReason: string | undefined;

  try {
    await withTimeout(async () => {
      if (vector) {
        matches = await deps.store.search({
          patientId: input.patientId,
          embedding: vector,
          limit: 5,
          threshold: recallThresholdFor(embedProvider),
          before: now,
        });
      }
      history = await deps.store.history(input.patientId);
    }, MEMORY_TIMEOUT_MS);
  } catch (err) {
    degraded = true;
    degradedReason = err instanceof Error ? err.message : String(err);
  }

  const region = resolveRegion(text, matches, inheritThresholdFor(embedProvider));

  let complaintId: string | null = null;
  if (!degraded) {
    try {
      const visitId = await deps.store.currentVisit(input.patientId, now);
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

  return { complaintId, region, matches, history, flags, embedProvider, degraded, degradedReason, latencyMs: Date.now() - started };
}

export function shortWhen(d: Date, now: Date): string {
  const days = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${weeks} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/**
 * One sentence of recall for the voice assistant to say, chosen by the same
 * deterministic rule that drives the doctor's chart. Ported from Nirog's
 * /api/memory/context opener.
 */
export function recallSentence(r: RememberResult, now: Date): string | null {
  if (r.degraded) {
    return "One thing first. I can't get to your records right now, so I won't be able to tell you if this has come up before.";
  }
  const flag = r.flags[0];
  if (flag?.level === "recurrent") {
    const region = REGION_LABELS[flag.region].toLowerCase();
    const first = flag.complaints[0];
    return (
      `You have mentioned your ${region} ${flag.visitCount} times in the last ${flag.spanDays} days. ` +
      `${shortWhen(first.occurredAt, now).replace(/^./, (c) => c.toUpperCase())} you said "${first.rawText}". Is this the same thing?`
    );
  }
  if (flag?.level === "watch") {
    const region = REGION_LABELS[flag.region].toLowerCase();
    const prev = flag.complaints.filter((c) => c.occurredAt < now).at(-1);
    if (prev) return `You mentioned your ${region} ${shortWhen(prev.occurredAt, now)} too. Is this the same problem?`;
  }
  const closest = r.matches[0];
  if (closest) return `${shortWhen(closest.occurredAt, now).replace(/^./, (c) => c.toUpperCase())} you told me "${closest.rawText}". Does this feel related?`;
  return null;
}
