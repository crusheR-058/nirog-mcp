import express, { type NextFunction, type Request, type Response, type Router } from "express";
import { audit } from "../audit.js";
import { sessionSecret, verifyDoctorSession, type DoctorSession } from "../auth/doctor.js";
import { getDataSource } from "../data/index.js";

/**
 * /api/clinic: what the doctor portal reads.
 *
 * This is the other half of the MCP server. A consult that Alexa+ queues through
 * `report_red_flag` and an audit line written by any tool are read back here, so the
 * portal in one browser shows what happened through the voice assistant in another.
 *
 *   GET  /api/clinic/live     patients, consults waiting in the on-call pool, recent audit
 *   POST /api/clinic/audit    a doctor's own action (viewed chart, started consult, filed encounter)
 *
 * When the server has a NIROG_TOKEN_SECRET, both need a doctor session from /auth.
 * Without one the server is in open development mode and they are open too.
 */
function requireDoctor(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const session = token ? verifyDoctorSession(token, sessionSecret()) : null;
  if (session) res.locals.doctor = session;
  if (!session && process.env.NIROG_TOKEN_SECRET) {
    res.status(401).json({ error: "Sign in as a doctor to read clinic data." });
    return;
  }
  next();
}

export function clinicRoutes(): Router {
  const r = express.Router();
  r.use(express.json({ limit: "32kb" }));
  r.use(requireDoctor);

  r.get("/live", async (_req: Request, res: Response) => {
    try {
      const data = getDataSource();
      const [patients, consults, auditLog] = await Promise.all([data.listPatients(), data.listConsults(), data.listAudit(40)]);
      res.json({ at: new Date().toISOString(), patients, consults, audit: auditLog });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.post("/audit", async (req: Request, res: Response) => {
    const { action, target, reason, actorName } = req.body as { action?: string; target?: string; reason?: string; actorName?: string };
    if (!action || !target) {
      res.status(400).json({ error: "action and target are required" });
      return;
    }
    // A signed-in doctor is always recorded under their own name; the body's name only counts in open dev mode.
    const actor = (res.locals.doctor as DoctorSession | undefined)?.name ?? (actorName?.slice(0, 80) || "Doctor (dev mode)");
    await audit(getDataSource(), action.slice(0, 80), target.slice(0, 120), reason?.slice(0, 300), actor);
    res.json({ ok: true });
  });

  return r;
}
