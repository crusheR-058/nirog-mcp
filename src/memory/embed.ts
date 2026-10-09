/**
 * Embeddings with an honest fallback. Ported from Nirog (src/lib/ai/embed.ts).
 *
 *   bedrock  — Amazon Titan Text Embeddings V2, via the default AWS credential chain.
 *   offline  — a deterministic lexical embedder for tests and machines with no AWS.
 *
 * Whichever backend produced a vector is recorded next to it, so nobody has to
 * guess later whether a recall was backed by a real model.
 */

import { createHash } from "node:crypto";
import { normalize } from "../clinical/normalize.js";

export const EMBED_DIMS = 1024;

export interface EmbeddingResult {
  vector: number[];
  provider: string;
}

export interface Embedder {
  readonly provider: string;
  embed(text: string): Promise<EmbeddingResult>;
}

/* Offline lexical embedder with clinical concept expansion. */
const CONCEPTS: Record<string, readonly string[]> = {
  ache: ["pain"], aching: ["pain"], aches: ["pain"], achy: ["pain"],
  sore: ["pain"], soreness: ["pain"], hurt: ["pain"], hurts: ["pain"],
  hurting: ["pain"], pain: ["pain"], painful: ["pain"], throb: ["pain"],
  throbbing: ["pain"], stiff: ["pain", "stiffness"], stiffness: ["stiffness"],
  twinge: ["pain"], niggle: ["pain"], discomfort: ["pain"],
  back: ["back"], lower: ["lower"], lumbar: ["back", "lower"],
  spine: ["back"], kamar: ["back", "lower"],
  stand: ["posture", "back", "lower"], standing: ["posture", "back", "lower"],
  stood: ["posture", "back", "lower"], sitting: ["posture"], sit: ["posture"],
  bending: ["posture", "back"], bend: ["posture", "back"],
  lifting: ["posture", "back"], lift: ["posture", "back"],
  desk: ["posture"], chair: ["posture"],
  again: ["recurrence"], returned: ["recurrence"],
  keeps: ["recurrence", "persistent"], keep: ["recurrence", "persistent"],
  still: ["persistent"], persistent: ["persistent"], constant: ["persistent"],
  weeks: ["duration"], week: ["duration"], days: ["duration"], day: ["duration"],
  months: ["duration"], month: ["duration"], morning: ["diurnal"],
  night: ["diurnal"], evening: ["diurnal"],
  head: ["head"], headache: ["head", "pain"], migraine: ["head", "pain"],
  stomach: ["abdomen"], belly: ["abdomen"], nausea: ["abdomen"],
  chest: ["chest"], cough: ["chest"], breath: ["chest"],
  fever: ["systemic"], tired: ["systemic"], fatigue: ["systemic"],
  knee: ["leg"], leg: ["leg"], ankle: ["leg"], shoulder: ["arm"],
  neck: ["neck"], rash: ["skin"], itchy: ["skin"],

  // Hindi, in the folded spelling from clinical/normalize.ts
  "कमर": ["back", "lower"], "पीठ": ["back"], "दर्द": ["pain"], "तकलीफ": ["pain"], "अकडन": ["pain", "stiffness"],
  "फिर": ["recurrence"], "दोबारा": ["recurrence"], "वापस": ["recurrence"], "अभी": ["persistent"],
  "दिन": ["duration"], "हफ्ते": ["duration"], "महीने": ["duration"], "सुबह": ["diurnal"], "रात": ["diurnal"],
  "सिर": ["head"], "सिरदर्द": ["head", "pain"], "पेट": ["abdomen"], "उल्टी": ["abdomen"],
  "सीने": ["chest"], "छाती": ["chest"], "खांसी": ["chest"], "सांस": ["chest"],
  "बुखार": ["systemic"], "थकान": ["systemic"], "कमजोरी": ["systemic"],
  "घुटने": ["leg"], "पैर": ["leg"], "कंधे": ["arm"], "हाथ": ["arm"], "गर्दन": ["neck"], "खुजली": ["skin"],
};

const STOP = new Set([
  "a", "an", "the", "is", "it", "i", "my", "me", "of", "in", "on", "at", "to",
  "and", "or", "but", "for", "with", "this", "that", "been", "have", "has",
  "had", "am", "was", "were", "be", "get", "getting", "got", "from", "when",
  "up", "out", "so", "very", "really", "just", "some", "few", "bit",
  "है", "हैं", "में", "से", "का", "की", "के", "को", "हो", "रहा", "रही", "और", "मेरे", "मेरी", "मेरा", "यह", "भी", "था", "थी",
]);

function tokenize(text: string): string[] {
  return normalize(text)
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function tokenVector(token: string, out: Float64Array, weight: number): void {
  const digest = createHash("sha256").update(token).digest();
  for (let k = 0; k < 8; k++) {
    const idx = ((digest[k * 2] << 8) | digest[k * 2 + 1]) % EMBED_DIMS;
    const sign = digest[k * 2 + 1] & 1 ? 1 : -1;
    out[idx] += sign * weight;
  }
}

const MAPPED_SURFACE_WEIGHT = 0.3;
const CONCEPT_WEIGHT = 2.0;

export function offlineEmbed(text: string): number[] {
  const out = new Float64Array(EMBED_DIMS);
  for (const t of tokenize(text)) {
    const concepts = CONCEPTS[t];
    if (concepts?.length) {
      tokenVector(t, out, MAPPED_SURFACE_WEIGHT);
      for (const c of concepts) tokenVector(`concept:${c}`, out, CONCEPT_WEIGHT);
    } else {
      tokenVector(t, out, 1);
    }
  }
  let norm = 0;
  for (let i = 0; i < EMBED_DIMS; i++) norm += out[i] * out[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return Array.from({ length: EMBED_DIMS }, () => 0);
  return Array.from(out, (v) => v / norm);
}

export const offlineEmbedder: Embedder = {
  provider: "offline:lexical-v1",
  async embed(text) {
    return { vector: offlineEmbed(text), provider: "offline:lexical-v1" };
  },
};

/* Bedrock Titan embedder, default credential chain (CLI profile locally, IAM role on AWS). */
export function bedrockEmbedder(opts: { region: string; model: string }): Embedder {
  const provider = `bedrock:${opts.model}`;
  return {
    provider,
    async embed(text) {
      const { BedrockRuntimeClient, InvokeModelCommand } = await import("@aws-sdk/client-bedrock-runtime");
      const client = new BedrockRuntimeClient({ region: opts.region });
      const res = await client.send(
        new InvokeModelCommand({
          modelId: opts.model,
          contentType: "application/json",
          body: JSON.stringify({ inputText: text, dimensions: EMBED_DIMS, normalize: true }),
        }),
      );
      const body = JSON.parse(new TextDecoder().decode(res.body));
      const vector: number[] = body.embedding;
      if (!Array.isArray(vector) || vector.length !== EMBED_DIMS) {
        throw new Error(`Titan returned ${vector?.length ?? "no"} dimensions, expected ${EMBED_DIMS}`);
      }
      return { vector, provider };
    },
  };
}

/** Try the real embedder, fall back to offline, and always report who answered. */
export function resilientEmbedder(primary: Embedder, onFallback?: (err: Error) => void): Embedder {
  if (primary.provider === offlineEmbedder.provider) return primary;
  let warned = false;
  return {
    provider: primary.provider,
    async embed(text) {
      try {
        return await primary.embed(text);
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        if (!warned) {
          warned = true;
          onFallback?.(e);
        }
        return offlineEmbedder.embed(text);
      }
    },
  };
}

/** EMBEDDER=bedrock uses Titan in AWS_REGION; anything else is offline. */
export function embedderFromEnv(): Embedder {
  if (process.env.EMBEDDER === "bedrock") {
    return bedrockEmbedder({
      region: process.env.AWS_REGION ?? "ap-south-1",
      model: process.env.BEDROCK_EMBED_MODEL ?? "amazon.titan-embed-text-v2:0",
    });
  }
  return offlineEmbedder;
}

export function cosineDistance(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return Infinity;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}
