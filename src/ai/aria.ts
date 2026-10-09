/**
 * ARIA's next question. Adapted from Nirog's /api/aria/chat prompt for a voice
 * assistant with a short budget: three questions, then hand over to a doctor.
 *
 * The model conducts the conversation. It never writes the chart: the region,
 * recall, and recurrence flag come from deterministic code and are handed to the
 * model as context, and anything the model says about red flags is advisory
 * until the rules-based triage confirms it.
 *
 * It does not write the handover either. An early version let it, and on a dry
 * run it told the doctor the patient "seeks relief with rest or medication",
 * which the patient never said. The summary is now assembled by code from the
 * patient's own words (see tools/intake.ts), and whatever the model puts in
 * `summary` is discarded.
 */

import { z } from "zod";
import { T, type Lang } from "../i18n.js";
import { converseText, extractJson, type AnswerTool, type ConverseFn, type ConverseTurn } from "./converse.js";

export const QUESTION_BUDGET = 3;
/** The model may not hand over before this many questions, unless it raises a red flag. Enforced in code, not only in the prompt. */
export const MIN_QUESTIONS = 2;

export interface AriaContext {
  patientName: string;
  conditions: string[];
  allergies: string[];
  currentMedications: string[];
  /** The deterministic recall line, if any. */
  recallLine: string | null;
  region: string;
  recurrence: string | null;
  /** Language ARIA speaks to the patient in. The summary for the doctor is always English. */
  lang?: Lang;
}

/** The tool ARIA must call to speak. Forcing it is what guarantees a structured answer. */
export const ARIA_TOOL: AnswerTool = {
  name: "answer",
  description: "Say ARIA's next line to the patient.",
  inputSchema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "Only the words to be spoken: one or two short sentences, with at most ONE question." },
      complete: { type: "boolean", description: "True when the intake is ready to hand to the doctor." },
      redFlag: { type: "boolean", description: "True if anything suggests an emergency." },
      flags: {
        type: "array",
        items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, advice: { type: "string" } }, required: ["id", "label", "advice"] },
      },
    },
    required: ["reply", "complete", "redFlag"],
  },
};

export const ariaResultSchema = z.object({
  reply: z.string().min(1),
  complete: z.boolean(),
  summary: z.string().nullable().optional(),
  redFlag: z.boolean(),
  flags: z.array(z.object({ id: z.string(), label: z.string(), advice: z.string() })).default([]),
});
export type AriaResult = Omit<z.infer<typeof ariaResultSchema>, "summary"> & { summary: string | null };

export function ariaSystemPrompt(ctx: AriaContext, questionsAsked: number): string {
  return [
    `You are ARIA, a warm, professional clinical intake nurse for Nirog, a telehealth service for rural India. You are speaking through a voice assistant, so no markdown, no lists, no emoji, one or two short sentences per reply.`,
    ``,
    `Your job is a structured intake, NOT a diagnosis. Never name a probable condition, never prescribe. Gather what a doctor needs: onset, duration, character, what makes it better or worse, severity, associated symptoms. Ask exactly ONE question per reply, never two joined together. Never ask for something the patient has already told you in this conversation.`,
    ``,
    ctx.lang === "hi"
      ? `LANGUAGE: the patient is speaking Hindi. Write "reply" in simple everyday Hindi, in Devanagari script, the way a village nurse would speak. You are a woman: use feminine verb forms ("भेज रही हूँ"), never a slash form like "रहा/रही". Write the flags in English, because the doctor reads those.`
      : `LANGUAGE: reply in simple English.`,
    ``,
    `RED FLAGS: if anything suggests an emergency (chest pain with sweating or breathlessness, signs of stroke, severe bleeding, anaphylaxis, suicidal intent, a very sick infant), set redFlag true, add a flag {id, label, advice}, and calmly tell them to seek emergency care now.`,
    ``,
    `QUESTION BUDGET: you have asked ${questionsAsked} of ${QUESTION_BUDGET} questions. Ask at least 2 questions before handing over unless there is a red flag. When the budget is spent or the picture is sufficient, set complete=true, stop asking, and say you are sending this to the doctor with their history. Do NOT summarise what the patient said: the system writes the handover from their exact words.`,
    ``,
    `CONTEXT FROM THE PATIENT'S RECORD (already checked by the system, do not re-ask):`,
    `Patient: ${ctx.patientName}. Known conditions: ${ctx.conditions.join(", ") || "none"}. Allergies: ${ctx.allergies.join(", ") || "none"}. Current medicines: ${ctx.currentMedications.join(", ") || "none"}.`,
    `Body region of today's complaint: ${ctx.region}.`,
    ctx.recallLine ? `Memory already told the patient: "${ctx.recallLine}" If they have not answered that yet, your question should follow on from it.` : `No earlier related complaints were found.`,
    ctx.recurrence ? `Recurrence flag: ${ctx.recurrence}. This is worth a doctor's attention; say so briefly when you hand over.` : ``,
    ``,
    `Answer by calling the "answer" tool. Put only the words to be spoken in "reply". If you cannot call the tool, respond with ONLY this JSON object and no prose around it:`,
    `{"reply": string, "complete": boolean, "redFlag": boolean, "flags": [{"id","label","advice"}]}`,
  ].join("\n");
}

/** Counts questions in either script: "?" ends an English question, and Hindi ones too. */
export function countQuestions(turns: ConverseTurn[]): number {
  return turns.filter((t) => t.role === "assistant" && t.text.includes("?")).length;
}

/** Deterministic stand-in when no model is configured (tests, offline demos). */
export function offlineAria(ctx: AriaContext, turns: ConverseTurn[]): AriaResult {
  const lang = ctx.lang ?? "en";
  const asked = countQuestions(turns);
  if (asked >= QUESTION_BUDGET) {
    return {
      reply: T.offlineHandover(lang),
      complete: true,
      summary: null,
      redFlag: false,
      flags: [],
    };
  }
  const questions = T.offlineQuestions(lang);
  return { reply: questions[asked] ?? questions[0], complete: false, summary: null, redFlag: false, flags: [] };
}

export async function nextQuestion(
  ctx: AriaContext,
  turns: ConverseTurn[],
  converse: ConverseFn | null = process.env.ARIA_MODEL === "off" ? null : converseText,
): Promise<AriaResult & { model: string }> {
  if (!converse) return { ...offlineAria(ctx, turns), model: "offline" };
  const asked = countQuestions(turns);
  const ask = async (extra?: string) =>
    ariaResultSchema.parse(extractJson(await converse({ system: ariaSystemPrompt(ctx, asked) + (extra ? `\n\n${extra}` : ""), turns, tool: ARIA_TOOL })));

  let parsed = await ask();
  if (parsed.complete && !parsed.redFlag && asked < MIN_QUESTIONS) {
    // The prompt says to ask at least two questions and the model does not always listen. Ask it once more;
    // if it still wants to hand over, use the built-in question rather than send a doctor a one-line history.
    const retry = await ask(`You tried to hand over after only ${asked} question${asked === 1 ? "" : "s"}. That is too early. Set complete=false and ask ONE more question now.`).catch(() => null);
    const questions = T.offlineQuestions(ctx.lang ?? "en");
    parsed = retry && !retry.complete ? retry : { ...parsed, reply: questions[asked] ?? questions[0], complete: false };
  }
  // The other end of the same rule. Once the budget is spent the intake is handed over, whatever the model would
  // still like to ask: a patient kept answering questions is a patient not yet in front of a doctor.
  if (!parsed.complete && !parsed.redFlag && asked >= QUESTION_BUDGET) {
    parsed = { ...parsed, reply: T.offlineHandover(ctx.lang ?? "en"), complete: true };
  }
  return { ...parsed, summary: null, model: process.env.BEDROCK_CHAT_MODEL ?? "openai.gpt-oss-120b-1:0" };
}
