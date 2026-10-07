import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import { createNirogServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

const PORT = Number(process.env.PORT ?? 3333);
const HOST = process.env.HOST ?? "127.0.0.1";

const app = createMcpExpressApp({ host: HOST });

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, name: SERVER_NAME, version: SERVER_VERSION });
});

// Stateless Streamable HTTP: a new server + transport per request.
// This keeps the service horizontally scalable on App Runner / Lambda.
async function handleMcp(req: Request, res: Response) {
  const server = createNirogServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

app.post("/mcp", handleMcp);
app.get("/mcp", handleMcp);
app.delete("/mcp", handleMcp);

app.listen(PORT, HOST, () => {
  console.log(`${SERVER_NAME} ${SERVER_VERSION} listening on http://${HOST}:${PORT}/mcp`);
});
