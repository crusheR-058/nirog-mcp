/**
 * ARIA's next question. Adapted from Nirog's /api/aria/chat prompt for a voice
 * assistant with a short budget: three questions, then hand over to a doctor.
 *
 * The model conducts the conversation. It never writes the chart: the region,
 * recall, and recurrence flag come from deterministic code and are handed to the
 * model as context, and anything the model says about red flags is advisory
 * until the rules-based triage (Day 5) confirms it.
 */

import { z } from "zod";
import { converseText, extractJson, type ConverseFn, type ConverseTurn } from "./converse.js";

export const QUESTION_BUDGET = 3;

export interface AriaContext {
  patientName: string;
  conditions: string[];
  allergies: string[];
  currentMedications: string[];
  /** The deterministic recall line, if any. */
  recallLine: string | null;
  region: string;
  recurrence: string | null;
}

export const ariaResultSchema = z.object({
  reply: z.string().min(1),
  complete: z.boolean(),
  summary: z.string().nullable(),
  redFlag: z.boolean(),
  flags: z.array(z.object({ id: z.string(), label: z.string(), advice: z.string() })).default([]),
});
export type AriaResult = z.infer<typeof ariaResultSchema>;

export function ariaSystemPrompt(ctx: AriaContext, questionsAsked: number): string {
  return [
    `You are ARIA, a warm, professional clinical intake nurse for Nirog, a telehealth service for rural India. You are speaking through a voice assistant, so no markdown, no lists, no emoji, one or two short sentences per reply.`,
    ``,
    `Your job is a structured intake, NOT a diagnosis. Never name a probable condition, never prescribe. Gather what a doctor needs: onset, duration, character, what makes it better or worse, severity, associated symptoms. One question at a time.`,
    ``,
    `RED FLAGS: if anything suggests an emergency (chest pain with sweating or breathlessness, signs of stroke, severe bleeding, anaphylaxis, suicidal intent, a very sick infant), set redFlag true, add a flag {id, label, advice}, and calmly tell them to seek emergency care now.`,
    ``,
    `QUESTION BUDGET: you have asked ${questionsAsked} of ${QUESTION_BUDGET} questions. Ask at least 2 questions before handing over unless there is a red flag. When the budget is spent or the picture is sufficient, set complete=true, stop asking, say you are sending this to the doctor with their history, and write "summary": a short plain-language recap of what was recorded (not a diagnosis).`,
    ``,
    `CONTEXT FROM THE PATIENT'S RECORD (already checked by the system, do not re-ask):`,
    `Patient: ${ctx.patientName}. Known conditions: ${ctx.conditions.join(", ") || "none"}. Allergies: ${ctx.allergies.join(", ") || "none"}. Current medicines: ${ctx.currentMedications.join(", ") || "none"}.`,
    `Body region of today's complaint: ${ctx.region}.`,
    ctx.recallLine ? `Memory already told the patient: "${ctx.recallLine}" If they have not answered that yet, your question should follow on from it.` : `No earlier related complaints were found.`,
    ctx.recurrence ? `Recurrence flag: ${ctx.recurrence}. This is worth a doctor's attention; say so briefly when you hand over.` : ``,
    ``,
    `Respond with ONLY a JSON object, no prose around it:`,
    `{"reply": string, "complete": boolean, "summary": string|null, "redFlag": boolean, "flags": [{"id","label","advice"}]}`,
  ].join("\n");
}

export function countQuestions(turns: ConverseTurn[]): number {
  return turns.filter((t) => t.role === "assistant" && t.text.includes("?")).length;
}

/** Deterministic stand-in when no model is configured (tests, offline demos). */
export function offlineAria(ctx: AriaContext, turns: ConverseTurn[]): AriaResult {
  const asked = countQuestions(turns);
  if (asked >= QUESTION_BUDGET) {
    return {
      reply: "Thank you. I am sending this to the doctor along with your history.",
      complete: true,
      summary: `Patient reported a ${ctx.region.toLowerCase()} complaint.${ctx.recurrence ? ` ${ctx.recurrence}.` : ""}`,
      redFlag: false,
      flags: [],
    };
  }
  const questions = [
    "How long has this been going on this time?",
    "Is it getting worse, staying the same, or getting better?",
    "Is anything else bothering you along with it?",
  ];
  return { reply: questions[asked] ?? questions[0], complete: false, summary: null, redFlag: false, flags: [] };
}

export async function nextQuestion(
  ctx: AriaContext,
  turns: ConverseTurn[],
  converse: ConverseFn | null = process.env.ARIA_MODEL === "off" ? null : converseText,
): Promise<AriaResult & { model: string }> {
  if (!converse) return { ...offlineAria(ctx, turns), model: "offline" };
  const raw = await converse({ system: ariaSystemPrompt(ctx, countQuestions(turns)), turns });
  const parsed = ariaResultSchema.parse(extractJson(raw));
  return { ...parsed, model: process.env.BEDROCK_CHAT_MODEL ?? "openai.gpt-oss-120b-1:0" };
}
