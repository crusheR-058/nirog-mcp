import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface Settings {
  endpoint: string;
  token: string;
  patientId: string;
}

const KEY = "nirog-demo-settings";

export function loadSettings(): Settings {
  const defaults: Settings = { endpoint: `${location.origin}/mcp`, token: "", patientId: "pat_rahul" };
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

/** One stateless client per call: the server is stateless too, and auth changes apply immediately. */
export async function callTool(settings: Settings, tool: string, args: Record<string, unknown>): Promise<{ result?: unknown; error?: string; ms: number }> {
  const started = performance.now();
  const client = new Client({ name: "nirog-demo", version: "0.1.0" });
  const headers: Record<string, string> = settings.token ? { authorization: `Bearer ${settings.token}` } : {};
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
