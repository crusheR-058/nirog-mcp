import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ConverseTurn } from "../ai/converse.js";
import { consentDenial, type ConsentScope } from "../auth/consent.js";
import { triage, type TriageLevel } from "../clinical/triage.js";
import { getDataSource } from "../data/index.js";
import type { Lang } from "../i18n.js";
import { createNirogServer, SERVER_VERSION } from "../server.js";

/**
 * The Alexa+ side of the demo, run for real: a Bedrock model reads the MCP tool descriptions and decides which tool
 * the patient's words need, the way Alexa+ would. It is an MCP client of this same server (in process), so it sees
 * exactly what any Alexa+ agent sees, and its instructions are the Agent Skill in skills/nirog/SKILL.md.
 *
 * The model routes; code keeps three things:
 *  - what the patient hears is the tools' own `spoken` lines, reviewed wording, never the model's prose;
 *  - start_intake gets the patient's exact words and this intake's transcript, not the model's paraphrase;
 *  - anything the triage rules flag reaches report_red_flag, even if the model never called it.
 *
 * One model call per turn: a voice cannot wait for a second round trip, and the reply needs none.
 */

/**
 * Models tried in order. Each has its own Bedrock quota, so a throttled first choice passes the turn to the next.
 * Read per call, so an evaluation can compare models in one process (BEDROCK_AGENT_MODEL pins a single one).
 */
export const agentModels = (): string[] =>
  (process.env.BEDROCK_AGENT_MODEL ?? process.env.BEDROCK_AGENT_MODELS ?? "apac.amazon.nova-lite-v1:0,global.amazon.nova-2-lite-v1:0,apac.amazon.nova-pro-v1:0")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

const SKILL = readFileSync(new URL("../../skills/nirog/SKILL.md", import.meta.url), "utf8").replace(/^---[\s\S]*?---\s*/, "");

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
export interface ToolUse {
  name: string;
  input: Record<string, unknown>;
}
/** One routing decision: which tools to call, or a short text reply when none fits. */
export type RouteFn = (req: { system: string; turns: ConverseTurn[]; tools: ToolSpec[] }) => Promise<{ text: string; toolUses: ToolUse[]; model?: string }>;

export interface AgentStep {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  ms: number;
  /** Who chose the tool: the model, the pattern router (when no model answered), or the guard (the rules flagged the words). */
  by: "model" | "patterns" | "guard";
}

export interface AgentReply {
  reply: string;
  level: TriageLevel;
  steps: AgentStep[];
  /** What decided: the model; the pattern router (no model answered, or it chose no tool for more than small talk);
   *  or the rules alone (an emergency, or no consent), with no model asked. */
  router: "model" | "patterns" | "rules";
  model: string | null;
  routeMs: number;
}

export interface AgentInput {
  patientId: string;
  language: Lang;
  text: string;
  /** The conversation so far, oldest first, without `text`. */
  history: ConverseTurn[];
  /** The turns of the intake in progress, if any; passed to start_intake as its transcript. */
  transcript: ConverseTurn[];
  /** True when the person speaking is this patient (their own session), so replies say "you", not their name. */
  self?: boolean;
}

const RANK: Record<TriageLevel, number> = { routine: 0, urgent: 1, emergency: 2 };
const higher = (a: TriageLevel, b: TriageLevel) => (RANK[b] > RANK[a] ? b : a);

function systemPrompt(patientId: string, lang: Lang, self = false): string {
  return `${SKILL}

## This session
${self
    ? `You are ARIA, the clinic's nurse assistant, talking directly with patient \`${patientId}\`, who speaks ${lang === "hi" ? "Hindi" : "English"}. Speak to them as "you", warmly and briefly, the way a nurse would.`
    : `You are the Alexa+ assistant in the patient's home. The person speaking is patient \`${patientId}\` and speaks ${lang === "hi" ? "Hindi" : "English"}.`}
Pass patient_id "${patientId}" and language "${lang}" to every tool.
Call the tool the patient's words need, at most two. A reply to a question you just asked about a symptom continues that intake: call start_intake.
Saying they took or have just had a medicine, in any language ("I took my tablet", "मैंने दवा ले ली", "goli kha li"), is log_dose_taken, not a symptom.
If the words could describe something serious, call start_intake; the server's rules decide whether to escalate.
If nothing calls for a tool (a greeting, thanks), answer in one short sentence without a tool. Never give medical advice yourself.`;
}

const BUSY = /Throttling|TooManyRequests|Too many requests|ServiceUnavailable|ModelNotReady|ServiceQuota/i;

/** Bedrock Converse with tools, auto choice, down the model chain until one answers. Any Bedrock model with tool use works. */
export const bedrockRoute: RouteFn = async (req) => {
  let last: unknown;
  for (const model of agentModels()) {
    try {
      return { ...(await converseRoute(model, req)), model };
    } catch (e) {
      // Busy, slow, not enabled in this account: whatever the reason, the next model gets the turn.
      last = e;
      console.warn(`[agent] ${model} did not answer (${(e as { name?: string }).name ?? "error"}); trying the next model`);
    }
  }
  throw last;
};

type Bedrock = import("@aws-sdk/client-bedrock-runtime").BedrockRuntimeClient;
let bedrock: Promise<Bedrock> | null = null;
// One client for the process, so connections and the adaptive retry state are reused across turns.
const bedrockClient = () =>
  (bedrock ??= import("@aws-sdk/client-bedrock-runtime").then((m) => new m.BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "ap-south-1", maxAttempts: 2, retryMode: "adaptive" })));

async function converseRoute(model: string, { system, turns, tools }: Parameters<RouteFn>[0]): Promise<{ text: string; toolUses: ToolUse[] }> {
  const { ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
  const client = await bedrockClient();
  const messages: { role: "user" | "assistant"; content: { text: string }[] }[] = [];
  for (const t of turns) {
    const last = messages[messages.length - 1];
    if (last && last.role === t.role) last.content[0].text += `\n${t.text}`;
    else messages.push({ role: t.role, content: [{ text: t.text }] });
  }
  if (messages[0]?.role !== "user") messages.shift();
  const res = await client.send(
    new ConverseCommand({
      modelId: model,
      system: [{ text: system }],
      messages,
      inferenceConfig: { maxTokens: 400, temperature: 0 },
      toolConfig: { tools: tools.map((t) => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.inputSchema } } })), toolChoice: { auto: {} } } as never,
    }),
    // A voice turn cannot wait on a stalled model; the next one in the chain, or the patterns, take over.
    { abortSignal: AbortSignal.timeout(8_000) },
  );
  const blocks = res.output?.message?.content ?? [];
  const toolUses: ToolUse[] = [];
  let text = "";
  for (const b of blocks) {
    if ("toolUse" in b && b.toolUse?.name) toolUses.push({ name: b.toolUse.name, input: (b.toolUse.input ?? {}) as Record<string, unknown> });
    else if ("text" in b && b.text) text += b.text;
  }
  // Some models think aloud in tags before answering; the patient never hears that.
  return { text: text.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim(), toolUses };
}

/* When no model answers: plain patterns, the same ones the demo page used before there was an agent. */
const SYMPTOM = /pain|ache|hurt|fever|cough|dizzy|bleed|breath|vomit|sweat|faint|swell|swollen|rash|numb|chest|tight|सीन|छाती|seene|chhati|दर्द|बुखार|सांस|साँस|खांसी|खाँसी|चक्कर|उल्टी|पसीना|बेहोश|तकलीफ़|तकलीफ|सूज|dard|bukhar|chakkar/i;
const DOSE = /\b(took|taken|had my|just had|have had)\b.*\b(medicines?|tablets?|pills?|dose|dawai|dawa|goli)\b|\b(dawai|dawa|goli)\b.*\b(le li|kha li|le liya|kha liya)\b|(दवा|दवाई|गोली)\s*(ले|खा)\s*(ली|लिया)/i;
const SUMMARY = /\b(this week|past week|last week|summary)\b|\bhow (is|has|was|have) .{1,30}(doing|been)\b|इस हफ्ते|इस हफ़्ते|कैसे हैं|कैसी हैं|कैसे रहे|हाल कैसा/i;
const CARE_PLAN = /\b(medicines?|tablets?|dawai|dose|pills?|tests?|follow[- ]?up|next visit|doctor next|what do i take)\b|कौन सी दवा|कौन-सी दवा|दवा कब|जाँच|जांच/i;
// Greeting words only, so "hello, my chest hurts" is not small talk.
const GREETING = /^\s*(hi|hello|hey|thanks?|thank you|good (morning|afternoon|evening|night)|namaste|नमस्ते|धन्यवाद|शुक्रिया)\b[\s,.!]*((hi|hello|hey|good|morning|afternoon|evening|night|there|aria|alexa|ji|thanks?|you|so|much|very)[\s,.!]*){0,4}$/i;

export function patternRoute(text: string, medicines: string[] = []): ToolUse[] {
  // A symptom always wins: "I took my tablet but my chest still hurts" must reach triage, not the dose log.
  if (SYMPTOM.test(text)) return [{ name: "start_intake", input: {} }];
  const named = medicines.find((m) => text.toLowerCase().includes(m.toLowerCase()));
  if (DOSE.test(text) || (named && /\b(took|taken|had)\b/i.test(text))) return [{ name: "log_dose_taken", input: named ? { medicine: named } : {} }];
  if (SUMMARY.test(text)) return [{ name: "get_family_summary", input: {} }];
  if (CARE_PLAN.test(text)) return [{ name: "get_care_plan", input: {} }];
  if (GREETING.test(text)) return [];
  return [{ name: "start_intake", input: {} }];
}

async function medicinesOf(patientId: string): Promise<string[]> {
  try {
    const data = getDataSource();
    const [p, e] = await Promise.all([data.getPatient(patientId), data.getLatestEncounter(patientId)]);
    return [...(p?.currentMedications ?? []).map((m) => m.split(" ")[0]), ...(e?.prescriptions ?? []).map((r) => r.drug)];
  } catch {
    return [];
  }
}

async function conditionsOf(patientId: string): Promise<string[]> {
  try {
    return (await getDataSource().getPatient(patientId))?.conditions ?? [];
  } catch {
    return [];
  }
}

/** What the patient hears when the clinic cannot be reached. Never a raw error: those can carry hostnames and ARNs. */
const UNREACHABLE: Record<Lang, string> = {
  en: "I can't reach the clinic record right now. If this feels serious, call 108 now.",
  hi: "मैं अभी क्लिनिक के रिकॉर्ड तक नहीं पहुँच पा रही। अगर तकलीफ़ गंभीर लगे तो अभी 108 पर कॉल कीजिए।",
};
const LISTENING: Record<Lang, string> = {
  en: "I'm listening. Tell me what's bothering you, or ask about your medicines.",
  hi: "मैं सुन रही हूँ। बताइए क्या तकलीफ़ है, या अपनी दवाओं के बारे में पूछिए।",
};

export async function runAgent(input: AgentInput, deps: { scope: ConsentScope; route?: RouteFn }): Promise<AgentReply> {
  // Consent first: no model call and no read of the record for a patient this household has not consented for.
  const denied = consentDenial(deps.scope, input.patientId, input.language);
  if (denied) return { reply: denied, level: "routine", steps: [], router: "rules", model: null, routeMs: 0 };

  // The rules read the whole intake, not one sentence: "my chest hurts", then "yes, I'm sweating", is one emergency.
  const said = [...input.transcript.filter((t) => t.role === "user").map((t) => t.text), input.text].join(". ");
  const ruled = triage(said, await conditionsOf(input.patientId), input.language).level;

  const route = deps.route ?? bedrockRoute;
  const server = await createNirogServer(deps.scope);
  const client = new Client({ name: "alexa-plus-simulator", version: SERVER_VERSION });
  const steps: AgentStep[] = [];
  const call = async (tool: string, args: Record<string, unknown>, by: AgentStep["by"]) => {
    const t0 = Date.now();
    try {
      const r = await client.callTool({ name: tool, arguments: args });
      const text = (r.content as Array<{ type: string; text?: string }>).find((c) => c.type === "text")?.text ?? "";
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* a plain-text answer */
      }
      steps.push(r.isError ? { tool, args, error: text, ms: Date.now() - t0, by } : { tool, args, result: parsed, ms: Date.now() - t0, by });
    } catch (e) {
      console.error(`[agent] ${tool} failed:`, e instanceof Error ? e.message : String(e));
      steps.push({ tool, args, error: "The tool could not be reached.", ms: Date.now() - t0, by });
    }
  };

  try {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    await client.connect(clientSide);
    const tools = (await client.listTools()).tools
      .filter((t) => t.name !== "ping")
      .map((t) => {
        const { $schema: _s, ...schema } = t.inputSchema as Record<string, unknown>;
        return { name: t.name, description: t.description ?? "", inputSchema: schema };
      });
    const known = new Set(tools.map((t) => t.name));

    const t0 = Date.now();
    let decision: Awaited<ReturnType<RouteFn>> = { text: "", toolUses: [] };
    let router: AgentReply["router"] = "model";
    if (ruled === "emergency") {
      // No model stands between an emergency and its advice: the guard below escalates at once.
      router = "rules";
    } else {
      try {
        decision = await route({ system: systemPrompt(input.patientId, input.language, input.self), turns: [...input.history.slice(-8), { role: "user", text: input.text }], tools });
      } catch (e) {
        // No model answered. The patterns still route the turn, and the guard below still runs the rules.
        console.error("[agent] routing failed, using patterns:", e instanceof Error ? e.message : String(e));
        router = "patterns";
        decision = { text: "", toolUses: patternRoute(input.text, await medicinesOf(input.patientId)) };
      }
    }
    const routeMs = Date.now() - t0;

    // Only tools that exist, each once. A made-up tool name counts as no tool at all.
    let uses = decision.toolUses.filter((u, i, all) => known.has(u.name) && all.findIndex((x) => x.name === u.name) === i).slice(0, 2);
    // The model may answer in its own words only for small talk. Anything else goes through a tool, so the wording
    // is reviewed and the trust log has it: a model once told a patient "do not take another dose" from memory alone.
    if (router === "model" && uses.length === 0) {
      const fallback = patternRoute(input.text, await medicinesOf(input.patientId));
      if (fallback.length) {
        router = "patterns";
        uses = fallback;
      }
    }

    for (const use of uses) {
      // The session's patient and language, always; the patient's own words for intake and triage.
      const args: Record<string, unknown> = { ...use.input, patient_id: input.patientId, language: input.language, speaking_to: input.self ? "patient" : "household" };
      if (use.name === "start_intake") Object.assign(args, { complaint: input.text, transcript: input.transcript });
      if (use.name === "report_red_flag") args.symptoms = said;
      await call(use.name, args, router === "rules" ? "guard" : router);
    }

    // The guard: whatever the model chose, words the rules flag are escalated, and escalation must have succeeded.
    const intake = steps.find((s) => s.tool === "start_intake");
    const ir = intake?.result as { triage?: { level: TriageLevel }; aria?: { redFlag?: boolean } } | undefined;
    const flagged = higher(ir?.triage?.level ?? "routine", ruled);
    const escalate = Boolean(intake?.error) || flagged !== "routine" || Boolean(ir?.aria?.redFlag);
    if (escalate && !steps.some((s) => s.tool === "report_red_flag" && s.result)) {
      await call("report_red_flag", { patient_id: input.patientId, symptoms: said, model_red_flag: Boolean(ir?.aria?.redFlag), language: input.language }, "guard");
    }

    // What the patient hears: the tools' spoken lines. An emergency is the escalation's line alone.
    const rf = steps.find((s) => s.tool === "report_red_flag" && s.result) ?? null;
    const rfr = rf?.result as { level: TriageLevel; spoken: string } | undefined;
    const level: TriageLevel = rfr ? higher(flagged, rfr.level) : flagged;
    let reply: string;
    if (escalate && !rfr) reply = UNREACHABLE[input.language];
    else if (rfr?.level === "emergency") reply = rfr.spoken;
    else {
      const lines = steps.map((s) => (s.result && typeof s.result === "object" ? (s.result as { spoken?: string }).spoken : s.error ? UNREACHABLE[input.language] : undefined));
      reply = [...new Set(lines.filter((x): x is string => Boolean(x)))].join(" ").trim() || decision.text.slice(0, 300) || LISTENING[input.language];
    }

    return { reply, level, steps, router, model: decision.model ?? null, routeMs };
  } finally {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}
