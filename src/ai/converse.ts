/**
 * Chat completion on Amazon Bedrock. Ported from Nirog (src/lib/ai/converse.ts).
 * Uses the default AWS credential chain. gpt-oss emits reasoning blocks before
 * the answer; those never leave this module.
 */

export const CHAT_MODEL = process.env.BEDROCK_CHAT_MODEL ?? "openai.gpt-oss-120b-1:0";

export interface ConverseTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ConverseOptions {
  system: string;
  turns: ConverseTurn[];
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: "low" | "medium" | "high";
}

export type ConverseFn = (opts: ConverseOptions) => Promise<string>;

export async function converseText(opts: ConverseOptions): Promise<string> {
  const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "ap-south-1" });

  // Converse requires alternating roles starting with "user".
  const messages: { role: "user" | "assistant"; content: { text: string }[] }[] = [];
  for (const t of opts.turns) {
    const last = messages[messages.length - 1];
    if (last && last.role === t.role) last.content[0].text += `\n${t.text}`;
    else messages.push({ role: t.role, content: [{ text: t.text }] });
  }
  if (messages[0]?.role !== "user") messages.unshift({ role: "user", content: [{ text: "(patient is present)" }] });

  const res = await client.send(
    new ConverseCommand({
      modelId: CHAT_MODEL,
      system: [{ text: opts.system }],
      messages,
      inferenceConfig: { maxTokens: opts.maxTokens ?? 800, temperature: opts.temperature ?? 0.4 },
      additionalModelRequestFields: { reasoning_effort: opts.reasoningEffort ?? "low" },
    }),
  );

  const text = (res.output?.message?.content ?? [])
    .map((b) => ("text" in b ? b.text : null))
    .filter((t): t is string => typeof t === "string" && t.length > 0)
    .join("\n")
    .trim();
  if (!text) throw new Error(`${CHAT_MODEL} returned no text`);
  return text;
}

/** Extract the first JSON object from a reply that may have prose or fences around it. */
export function extractJson<T>(raw: string): T {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("model returned no JSON object");
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
