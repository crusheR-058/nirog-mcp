import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { createNirogServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { consentVerifier } from "./auth/tokens.js";
import { scopeFromAuth } from "./auth/consent.js";
import { authRoutes } from "./auth/routes.js";
import { clinicRoutes } from "./clinic/routes.js";

const PORT = Number(process.env.PORT ?? 3333);
const HOST = process.env.HOST ?? "127.0.0.1";

const TOKEN_SECRET = process.env.NIROG_TOKEN_SECRET;

const app = createMcpExpressApp({ host: HOST });

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, name: SERVER_NAME, version: SERVER_VERSION, auth: TOKEN_SECRET ? "consent-token" : "open" });
});

// Consent: every /mcp request carries a household token scoped to specific patients.
// Without NIROG_TOKEN_SECRET the server is open, for local development only.
if (TOKEN_SECRET) {
  app.use("/mcp", requireBearerAuth({ verifier: consentVerifier(TOKEN_SECRET) }));
} else {
  console.warn("NIROG_TOKEN_SECRET not set: /mcp is open to any caller and every patient. Do not deploy like this.");
}

// Stateless Streamable HTTP: a new server + transport per request.
// This keeps the service horizontally scalable on App Runner / Lambda.
async function handleMcp(req: Request, res: Response) {
  const server = await createNirogServer(scopeFromAuth(req.auth));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

// The public demo hands out tokens to anyone, and /mcp calls a paid model, so each address gets a budget.
// shortcut: per-process memory, so the limit is per instance; use a shared store if the service scales out.
if (process.env.PUBLIC_DEMO === "1") {
  const hits = new Map<string, { n: number; reset: number }>();
  // App Runner puts one proxy in front; without this every visitor shares the proxy's address and one budget.
  app.set("trust proxy", 1);
  // Each tool call is three or four HTTP requests (initialize, initialized, call), so 300 is roughly 80 tool calls.
  const LIMIT = 300, WINDOW_MS = 10 * 60_000;
  app.use(["/mcp", "/auth/demo"], (req, res, next) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + WINDOW_MS });
    else if (++h.n > LIMIT) {
      res.status(429).json({ error: "Too many requests from this address. Please wait a few minutes and try again." });
      return;
    }
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  });
}

// Doctor sign-in for the portal page: Google, then one-time verification.
app.use("/auth", authRoutes());

// What the doctor portal reads: consults queued and audit lines written through the MCP tools.
app.use("/api/clinic", clinicRoutes());

// The demo, built by `pnpm build:demo` into dist/demo. Static, same-origin with /mcp.
const demoDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "demo");
if (existsSync(demoDir)) {
  app.use("/demo", express.static(demoDir, { index: "index.html", maxAge: "1h" }));
  app.get("/", (_req: Request, res: Response) => res.redirect("/demo/"));
}

app.post("/mcp", handleMcp);
app.get("/mcp", handleMcp);
app.delete("/mcp", handleMcp);

app.listen(PORT, HOST, () => {
  console.log(`${SERVER_NAME} ${SERVER_VERSION} listening on http://${HOST}:${PORT}/mcp`);
});
