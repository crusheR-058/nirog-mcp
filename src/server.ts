import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDataSource } from "./data/index.js";
import { registerCarePlanTool } from "./tools/care-plan.js";
import { registerIntakeTool } from "./tools/intake.js";
import { getMemory } from "./memory/index.js";

export const SERVER_NAME = "nirog-mcp";
export const SERVER_VERSION = "0.1.0";

/**
 * Builds a fresh McpServer with every Nirog tool registered.
 * One instance is created per HTTP request (stateless transport), so keep
 * construction cheap and keep all state in the backing data layer.
 */
export async function createNirogServer(): Promise<McpServer> {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "ping",
    {
      title: "Ping",
      description:
        "Health check. Returns 'pong' and the server time. Use it to confirm the Nirog MCP server is reachable.",
      inputSchema: { message: z.string().optional().describe("Optional text to echo back") },
    },
    async ({ message }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ reply: "pong", echo: message ?? null, at: new Date().toISOString() }),
        },
      ],
    }),
  );

  const data = getDataSource();
  const { store, embedder } = await getMemory();
  registerCarePlanTool(server, data);
  registerIntakeTool(server, { data, store, embedder });

  return server;
}
