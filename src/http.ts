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
import { agentRoutes } from "./agent/routes.js";
import { patientRoutes } from "./patient/routes.js";

const PORT = Number(process.env.PORT ?? 3333);
const HOST = process.env.HOST ?? "127.0.0.1";

const TOKEN_SECRET = process.env.NIROG_TOKEN_SECRET;
if (process.env.PUBLIC_DEMO === "1" && !TOKEN_SECRET) {
  // A public demo with no secret would be an open server, not a demo that hands out scoped tokens.
  console.error("PUBLIC_DEMO=1 needs NIROG_TOKEN_SECRET. Refusing to start.");
  process.exit(1);
}

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
  // App Runner puts one proxy in front; without this every visitor shares the proxy's address and one budget.
  app.set("trust proxy", 1);
  // shortcut: per-process memory, so each limit is per instance; use a shared store if the service scales out.
  const limit = (perTenMinutes: number) => {
    const hits = new Map<string, { n: number; reset: number }>();
    return (req: Request, res: Response, next: () => void) => {
      const ip = req.ip ?? "unknown";
      // One IPv6 customer usually holds a whole /64, so that is the unit a budget belongs to.
      const key = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
      const now = Date.now();
      const h = hits.get(key);
      if (!h || h.reset < now) {
        if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
        hits.set(key, { n: 1, reset: now + 10 * 60_000 });
      } else if (++h.n > perTenMinutes) {
        res.status(429).json({ error: "Too many requests from this address. Please wait a few minutes and try again." });
        return;
      }
      next();
    };
  };
  // Each tool call over /mcp is three or four requests; an agent turn or a spoken line is one, and each costs a model call.
  app.use("/mcp", limit(300));
  app.use("/api/agent", limit(60));
  app.use("/api/speak", limit(90));
  app.use("/auth/demo", limit(40));
  app.use("/auth/patient", limit(40));
  app.use("/api/patient", limit(120));
}

// Doctor sign-in for the portal page: Google, then one-time verification.
app.use("/auth", authRoutes());

// The simulated Alexa+ device: an agent that routes the patient's words to the MCP tools, and its voice.
app.use("/api", agentRoutes(TOKEN_SECRET));

// What the doctor portal reads: consults queued and audit lines written through the MCP tools.
app.use("/api/clinic", clinicRoutes());

// What a signed-in patient reads about themselves: their own words, handovers, care plans and doses.
app.use("/api/patient", patientRoutes());

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
