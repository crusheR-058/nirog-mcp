import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ConsentScope } from "./auth/consent.js";
import { getDataSource } from "./data/index.js";
import { getMemory } from "./memory/index.js";
import { registerCarePlanTool } from "./tools/care-plan.js";
import { registerDoseTool } from "./tools/dose.js";
import { registerFamilySummaryTool } from "./tools/family-summary.js";
import { registerIntakeTool } from "./tools/intake.js";
import { registerRedFlagTool } from "./tools/red-flag.js";

export const SERVER_NAME = "nirog-mcp";
export const SERVER_VERSION = "0.2.0";

/**
 * Builds a fresh McpServer with every Nirog tool registered.
 * One instance is created per HTTP request (stateless transport), so keep
 * construction cheap and keep all state in the backing data layer.
 */
export async function createNirogServer(scope: ConsentScope = { kind: "all" }): Promise<McpServer> {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "ping",
    {
      title: "Ping",
      description: "Health check. Returns 'pong' and the server time. Use it to confirm the Nirog MCP server is reachable.",
      inputSchema: { message: z.string().optional().describe("Optional text to echo back") },
    },
    async ({ message }) => ({
      content: [{ type: "text", text: JSON.stringify({ reply: "pong", echo: message ?? null, at: new Date().toISOString() }) }],
    }),
  );

  const data = getDataSource();
  const { store, embedder } = await getMemory();
  registerIntakeTool(server, { data, store, embedder, scope });
  registerRedFlagTool(server, data, scope);
  registerCarePlanTool(server, data, scope);
  registerDoseTool(server, data, scope);
  registerFamilySummaryTool(server, { data, store, scope });

  return server;
}
