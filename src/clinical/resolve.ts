/**
 * Resolving a complaint's body region, using memory when the words alone are
 * not enough. Ported from Nirog (src/lib/clinical/resolve.ts).
 *
 * "The ache is back again" contains the word *back* as an adverb. The lexicon
 * returns unknown; memory supplies the region from the closest prior complaint,
 * if and only if it is close enough. Otherwise it stays unknown. No guessing.
 */

import { classify, type Region } from "./regions.js";
import type { RecallMatch } from "../memory/types.js";

/** Offline embedder scale. Stricter than the recall threshold on purpose. */
export const INHERIT_THRESHOLD = 0.4;
/** Titan scale, measured on a labelled battery in the Nirog repo. */
export const BEDROCK_INHERIT_THRESHOLD = 0.68;

export function inheritThresholdFor(provider: string): number {
  return provider.startsWith("bedrock:") ? BEDROCK_INHERIT_THRESHOLD : INHERIT_THRESHOLD;
}

export type RegionSource = "lexicon" | "inherited" | "none";

export interface ResolvedRegion {
  region: Region;
  source: RegionSource;
  inheritedFrom?: string;
  inheritedFromText?: string;
  distance?: number;
  matchedTerms: string[];
}

export function resolveRegion(text: string, matches: RecallMatch[], inheritThreshold: number = INHERIT_THRESHOLD): ResolvedRegion {
  const lexical = classify(text);
  if (lexical.region !== "unknown") {
    return { region: lexical.region, source: "lexicon", matchedTerms: lexical.matchedTerms };
  }

  const candidate = matches
    .filter((m) => m.bodyRegion !== "unknown" && m.distance <= inheritThreshold)
    .sort((a, b) => a.distance - b.distance)[0];

  if (!candidate) return { region: "unknown", source: "none", matchedTerms: [] };

  return {
    region: candidate.bodyRegion,
    source: "inherited",
    inheritedFrom: candidate.id,
    inheritedFromText: candidate.rawText,
    distance: candidate.distance,
    matchedTerms: [],
  };
}
