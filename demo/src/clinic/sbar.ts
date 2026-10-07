/**
 * SBAR handover, ported from Nirog (src/lib/clinical/sbar.ts). Every line comes from
 * something the patient said or a rule that fired. No model writes any of it.
 */
import { MEMORY_CARDS } from "../copy";

export interface Complaint {
  id: string;
  when: string;
  occurredAt: Date;
  text: string;
  region: string;
  inherited?: boolean;
  distance: number | null;
}

export interface Flag {
  level: "recurrent" | "watch";
  region: string;
  visitCount: number;
  spanDays: number;
  complaints: Complaint[];
  rule: string;
}

export interface Sbar {
  situation: string;
  background: string[];
  assessment: string[];
  recommendation: string[];
  provenance: string[];
}

const DAY = 86_400_000;

/** Rahul's seeded history with concrete dates relative to tonight. */
export function rahulComplaints(now = new Date()): Complaint[] {
  const daysAgo = [38, 27, 16, 0];
  return MEMORY_CARDS.map((c, i) => ({
    id: c.id,
    when: c.when,
    occurredAt: new Date(now.getTime() - daysAgo[i] * DAY),
    text: c.text,
    region: c.region,
    inherited: c.inherited,
    distance: c.distance,
  }));
}

/** The recurrence rule: 3+ visits in one region within 90 days, or 2 within 30 for "watch". */
export function detectFlags(complaints: Complaint[], now = new Date()): Flag[] {
  const regions = [...new Set(complaints.map((c) => c.region))];
  const flags: Flag[] = [];
  for (const region of regions) {
    const inRegion = complaints.filter((c) => c.region === region).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const check = (minVisits: number, windowDays: number, level: Flag["level"]) => {
      const cutoff = now.getTime() - windowDays * DAY;
      const window = inRegion.filter((c) => c.occurredAt.getTime() >= cutoff);
      if (window.length < minVisits) return null;
      const span = Math.round((window[window.length - 1].occurredAt.getTime() - window[0].occurredAt.getTime()) / DAY);
      return { level, region, visitCount: window.length, spanDays: span, complaints: window, rule: `${minVisits} or more separate visits mentioning this region within ${windowDays} days` } as Flag;
    };
    const f = check(3, 90, "recurrent") ?? check(2, 30, "watch");
    if (f) flags.push(f);
  }
  return flags.sort((a, b) => (a.level === "recurrent" ? 0 : 1) - (b.level === "recurrent" ? 0 : 1));
}

const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
function weeksAgo(d: Date, now: Date) {
  const days = Math.round((now.getTime() - d.getTime()) / DAY);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  const w = Math.round(days / 7);
  if (w < 9) return `${w} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

export function buildSbar(input: { age: number; sex: string; familyHistory?: string; complaints: Complaint[]; flags: Flag[]; now: Date; degraded: boolean }): Sbar {
  const { age, sex, familyHistory, complaints, flags, now, degraded } = input;
  const sorted = [...complaints].sort((x, y) => y.occurredAt.getTime() - x.occurredAt.getTime());
  const latest = sorted[0];
  const strongest = flags[0];

  const situation = latest ? `${age}-year-old ${sex}, presenting ${weeksAgo(latest.occurredAt, now)} with: “${latest.text}”` : `${age}-year-old ${sex}. No complaints recorded.`;

  const background: string[] = [];
  if (degraded) background.push("Prior history could not be retrieved. The items below may be incomplete.");
  if (strongest) {
    background.push(`${strongest.visitCount} separate presentations involving the ${strongest.region.toLowerCase()} across ${strongest.spanDays} days:`);
    for (const c of strongest.complaints) background.push(`  ${shortDate(c.occurredAt)}  “${c.text}”`);
    background.push("Linked by meaning rather than by matching words. The patient described the same problem differently each time.");
  } else if (sorted.length > 1) {
    background.push(`${sorted.length} complaints on record, no recurring pattern:`);
    for (const c of sorted.slice(0, 5)) background.push(`  ${shortDate(c.occurredAt)}  “${c.text}”`);
  } else background.push("No prior complaints on record.");
  if (familyHistory) background.push(`Family history: ${familyHistory}`);

  const assessment: string[] = [];
  if (degraded) assessment.push("NOT ASSESSED. The patient's history was unavailable when this was written. No recurrence flag appears because none was looked for.");
  else if (strongest?.level === "recurrent") {
    assessment.push(`Recurrent presentation: ${strongest.visitCount} visits in ${strongest.spanDays} days for the same body region.`);
    assessment.push(`Rule applied: ${strongest.rule}.`);
    assessment.push("This is a pattern in the record, not a diagnosis. The cause has not been assessed.");
  } else if (strongest?.level === "watch") assessment.push(`Repeat presentation: ${strongest.visitCount} visits in ${strongest.spanDays} days. Below the recurrence threshold, flagged for awareness only.`);
  else assessment.push("No recurring pattern found in the recorded history. This is a real negative result, not a failure to look.");

  const recommendation: string[] = [];
  if (degraded) recommendation.push("Re-run this handover once the record is reachable, before making a management decision that depends on history.");
  else if (strongest?.level === "recurrent") {
    recommendation.push("Consider whether repeated symptomatic management is still appropriate, or whether the underlying cause warrants investigation.");
    if (familyHistory) recommendation.push("Family history above may be relevant to that decision.");
    recommendation.push("Clinical judgement required. This tool does not triage.");
  } else if (strongest?.level === "watch") recommendation.push("No action indicated by this tool. Noted in case a third presentation follows.");
  else recommendation.push("No action indicated by this tool.");

  const provenance = [
    `Assembled ${shortDate(now)} from ${complaints.length} recorded complaint${complaints.length === 1 ? "" : "s"}.`,
    "Every quoted line is the patient's own wording, unedited.",
    "Recurrence determined by a fixed rule, not by a model.",
  ];
  return { situation, background, assessment, recommendation, provenance };
}

export function renderSbar(s: Sbar): string {
  const block = (label: string, lines: string[]) => `${label}\n${lines.map((l) => (l.startsWith("  ") ? l : `  ${l}`)).join("\n")}`;
  return [`S  ${s.situation}`, block("B", s.background), block("A", s.assessment), block("R", s.recommendation)].join("\n\n");
}
