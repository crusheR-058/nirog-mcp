import express, { type Request, type Response, type Router } from "express";
import { z } from "zod";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { scopeFromAuth } from "../auth/consent.js";
import { consentVerifier } from "../auth/tokens.js";
import { runAgent } from "./alexa.js";

/**
 * The simulated Alexa+ device's two server calls.
 *
 *   POST /api/agent   { patientId, language, text, history, transcript }  the agent routes the words to MCP tools
 *   POST /api/speak   { text, language }                                 Amazon Polly (neural voice Kajal), audio/mpeg
 *
 * Both carry the household consent token when the server has a secret, like /mcp. The agent can only act within
 * that token's patients, because the tools it calls check the same scope.
 */

const Turn = z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) });
const AgentBody = z.object({
  patientId: z.string().min(1).max(80),
  language: z.enum(["en", "hi"]).default("en"),
  text: z.string().trim().min(1).max(1000),
  history: z.array(Turn).max(20).default([]),
  transcript: z.array(Turn).max(40).default([]),
});
const SpeakBody = z.object({ text: z.string().trim().min(1).max(600), language: z.enum(["en", "hi"]).default("en") });

// Kajal speaks Indian English and Hindi, so one voice carries a conversation that switches language.
const VOICE = process.env.POLLY_VOICE ?? "Kajal";
// shortcut: per-process cache of recent lines; repeated prompts ("Is this the same thing?") cost nothing twice.
const spoken = new Map<string, Buffer>();

async function synthesize(text: string, language: "en" | "hi"): Promise<Buffer> {
  const key = `${language}:${text}`;
  const hit = spoken.get(key);
  if (hit) return hit;
  const { PollyClient, SynthesizeSpeechCommand } = await import("@aws-sdk/client-polly");
  const polly = new PollyClient({ region: process.env.AWS_REGION ?? "ap-south-1" });
  const out = await polly.send(
    new SynthesizeSpeechCommand({ Engine: "neural", VoiceId: VOICE as never, LanguageCode: language === "hi" ? "hi-IN" : "en-IN", OutputFormat: "mp3", Text: text }),
  );
  const audio = Buffer.from(await out.AudioStream!.transformToByteArray());
  if (spoken.size >= 300) spoken.delete(spoken.keys().next().value!);
  spoken.set(key, audio);
  return audio;
}

export function agentRoutes(secret?: string): Router {
  const r = express.Router();
  const auth = secret ? [requireBearerAuth({ verifier: consentVerifier(secret) })] : [];

  r.post("/agent", express.json({ limit: "64kb" }), ...auth, async (req: Request, res: Response) => {
    const parsed = AgentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      return;
    }
    try {
      res.json(await runAgent(parsed.data, { scope: scopeFromAuth(req.auth) }));
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.post("/speak", express.json({ limit: "8kb" }), ...auth, async (req: Request, res: Response) => {
    const parsed = SpeakBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "text (1 to 600 characters) is required" });
      return;
    }
    try {
      const audio = await synthesize(parsed.data.text, parsed.data.language);
      res.set({ "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" }).send(audio);
    } catch (e) {
      // The page falls back to the browser's own voice.
      res.status(503).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  return r;
}
