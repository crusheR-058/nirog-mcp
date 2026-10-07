/**
 * The recurrence rule.
 *
 * This is the one piece of the system that is allowed to make a claim about a
 * patient, so it is arithmetic and nothing else. No embedding, no model, no
 * scoring. Given the same complaints it always returns the same flag, and a
 * doctor can check it on paper in about ten seconds.
 *
 * The embeddings upstream decide *which complaints are about the same thing*.
 * This decides *whether that pattern is worth interrupting a doctor for*. Keeping
 * those two jobs apart is what makes the flag defensible.
 */

import type { Region } from "./regions.js";

export interface ComplaintRecord {
  id: string;
  visitId: string;
  patientId: string;
  rawText: string;
  bodyRegion: Region;
  occurredAt: Date;
}

export type RecurrenceLevel = "recurrent" | "watch";

export interface RecurrenceFlag {
  level: RecurrenceLevel;
  region: Region;
  /** Distinct visits, not distinct complaints — see below. */
  visitCount: number;
  spanDays: number;
  complaints: ComplaintRecord[];
  /** Plain-English statement of the rule that fired, shown verbatim in the UI. */
  rule: string;
}

export interface RecurrenceConfig {
  recurrentVisits: number;
  recurrentWindowDays: number;
  watchVisits: number;
  watchWindowDays: number;
}

/**
 * Defaults.
 *
 * Three presentations in ninety days is the threshold most primary-care guidance
 * treats as "stop managing this symptomatically and investigate the cause".
 * Two in thirty is not yet a pattern, but it is the point at which it is worth a
 * doctor's eye — so it gets a softer word.
 *
 * These are exported and overridable rather than baked in, because the right
 * numbers differ by specialty and this project is in no position to assert one
 * set as clinically universal.
 */
export const DEFAULT_CONFIG: RecurrenceConfig = {
  recurrentVisits: 3,
  recurrentWindowDays: 90,
  watchVisits: 2,
  watchWindowDays: 30,
};

const DAY_MS = 86_400_000;

export function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / DAY_MS;
}

/**
 * Three complaints logged in a single visit are one presentation, not a
 * recurrence — a patient elaborating on the same ache in three sentences has
 * not come back three times. Counting complaints instead of visits here would
 * let a talkative patient trigger the flag on their first appointment, which is
 * exactly the kind of false alarm that teaches doctors to ignore the banner.
 */
function distinctVisits(complaints: ComplaintRecord[]): number {
  return new Set(complaints.map((c) => c.visitId)).size;
}

/**
 * Find the recurrence flag for one region, or null.
 *
 * Returning null is a first-class outcome. A tool that can only ever confirm a
 * suspicion is not measuring anything.
 */
export function detectRegion(
  complaints: ComplaintRecord[],
  region: Region,
  now: Date,
  config: RecurrenceConfig = DEFAULT_CONFIG,
): RecurrenceFlag | null {
  if (region === "unknown") return null;

  const inRegion = complaints
    .filter((c) => c.bodyRegion === region)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  if (inRegion.length === 0) return null;

  const check = (
    minVisits: number,
    windowDays: number,
    level: RecurrenceLevel,
  ): RecurrenceFlag | null => {
    const cutoff = new Date(now.getTime() - windowDays * DAY_MS);
    const window = inRegion.filter((c) => c.occurredAt >= cutoff);
    const visits = distinctVisits(window);
    if (visits < minVisits) return null;

    const first = window[0].occurredAt;
    const last = window[window.length - 1].occurredAt;

    return {
      level,
      region,
      visitCount: visits,
      spanDays: Math.round(daysBetween(first, last)),
      complaints: window,
      rule:
        level === "recurrent"
          ? `${minVisits} or more separate visits mentioning this region within ${windowDays} days`
          : `${minVisits} or more separate visits mentioning this region within ${windowDays} days`,
    };
  };

  // Strongest first — a case that satisfies both should be reported as recurrent.
  return (
    check(config.recurrentVisits, config.recurrentWindowDays, "recurrent") ??
    check(config.watchVisits, config.watchWindowDays, "watch")
  );
}

/**
 * All flags across all regions, strongest first.
 */
export function detectAll(
  complaints: ComplaintRecord[],
  now: Date,
  config: RecurrenceConfig = DEFAULT_CONFIG,
): RecurrenceFlag[] {
  const regions = [...new Set(complaints.map((c) => c.bodyRegion))];
  const flags = regions
    .map((r) => detectRegion(complaints, r, now, config))
    .filter((f): f is RecurrenceFlag => f !== null);

  const weight = (l: RecurrenceLevel) => (l === "recurrent" ? 0 : 1);
  return flags.sort(
    (a, b) => weight(a.level) - weight(b.level) || b.visitCount - a.visitCount,
  );
}
