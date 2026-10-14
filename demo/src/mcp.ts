import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface Settings {
  endpoint: string;
  token: string;
  patientId: string;
  /** The language the patient speaks and hears. Sent to every tool. */
  language: "en" | "hi";
}

const KEY = "nirog-demo-settings";

export function loadSettings(): Settings {
  const defaults: Settings = { endpoint: `${location.origin}/mcp`, token: "", patientId: "pat_rahul", language: "en" };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return defaults;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: settings live for the session only */
  }
}

export interface DemoAccess {
  consentToken: string;
  doctorSession: string;
}

let demo: Promise<DemoAccess | null> | null = null;
/**
 * On the public demo deployment the server hands out a short-lived consent token for the demo household and a demo
 * doctor session. Anywhere else /auth/demo is a 404 and this is null. Fetched once per page load, never stored.
 */
export function demoAccess(): Promise<DemoAccess | null> {
  // Ask only a server that wants tokens, so an open development server is not asked for something it does not have.
  demo ??= fetch(`${location.origin}/health`)
    .then((r) => (r.ok ? (r.json() as Promise<{ auth?: string }>) : null))
    .then((h) => (h?.auth === "consent-token" ? fetch(`${location.origin}/auth/demo`) : null))
    .then((r) => (r?.ok ? (r.json() as Promise<DemoAccess>) : null))
    .catch(() => null);
  return demo;
}

/** The household's consent token: the one in settings, or on the public demo the one the server hands out. */
export async function consentHeader(settings: Settings = loadSettings()): Promise<Record<string, string>> {
  const token = settings.token || (await demoAccess())?.consentToken;
  return token ? { authorization: `Bearer ${token}` } : {};
}

export interface AgentStep {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  ms: number;
  by: "model" | "patterns" | "guard";
}
export interface AgentReply {
  reply: string;
  level: "routine" | "urgent" | "emergency";
  steps: AgentStep[];
  router: "model" | "patterns";
  model: string | null;
  routeMs: number;
}

/** The simulated Alexa+ device: the server's agent picks the MCP tools for these words. Null when it cannot be reached. */
export async function callAgent(
  settings: Settings,
  body: { patientId: string; language: Settings["language"]; text: string; history: Array<{ role: "user" | "assistant"; text: string }>; transcript: Array<{ role: "user" | "assistant"; text: string }> },
): Promise<AgentReply | null> {
  try {
    const r = await fetch(`${new URL(settings.endpoint).origin}/api/agent`, { method: "POST", headers: { "content-type": "application/json", ...(await consentHeader(settings)) }, body: JSON.stringify(body) });
    return r.ok ? ((await r.json()) as AgentReply) : null;
  } catch {
    return null;
  }
}

/** One stateless client per call: the server is stateless too, and auth changes apply immediately. */
export async function callTool(settings: Settings, tool: string, args: Record<string, unknown>): Promise<{ result?: unknown; error?: string; ms: number }> {
  const started = performance.now();
  const client = new Client({ name: "nirog-demo", version: "0.1.0" });
  const token = settings.token || (await demoAccess())?.consentToken;
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  const transport = new StreamableHTTPClientTransport(new URL(settings.endpoint), { requestInit: { headers } });
  try {
    await client.connect(transport);
    const r = await client.callTool({ name: tool, arguments: args });
    const text = (r.content as Array<{ type: string; text?: string }>).find((c) => c.type === "text")?.text ?? "";
    const ms = Math.round(performance.now() - started);
    if (r.isError) return { error: text, ms };
    try {
      return { result: JSON.parse(text), ms };
    } catch {
      return { result: text, ms };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), ms: Math.round(performance.now() - started) };
  } finally {
    await client.close().catch(() => undefined);
  }
}
