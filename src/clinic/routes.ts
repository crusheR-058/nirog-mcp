import express, { type NextFunction, type Request, type Response, type Router } from "express";
import { z } from "zod";
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
 *   GET  /api/clinic/live                 the whole clinic (when the server has a database), the on-call pool, recent audit
 *   POST /api/clinic/audit                a doctor's own action (viewed chart, went on call)
 *   POST /api/clinic/consults/:id/start   the doctor opens a consult
 *   POST /api/clinic/encounters           the doctor files a consultation; it becomes the patient's care plan
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

const EncounterBody = z.object({
  patientId: z.string().min(1).max(80),
  consultId: z.string().max(80).nullable().optional(),
  chiefComplaint: z.string().max(200).default(""),
  assessment: z.string().trim().min(1, "a clinical assessment is required").max(2000),
  notes: z.string().max(2000).default(""),
  prescriptions: z
    .array(z.object({ drug: z.string().trim().min(1).max(80), strength: z.string().max(40).optional(), frequency: z.string().max(60).optional(), durationDays: z.number().int().min(1).max(365).optional() }))
    .max(12)
    .default([]),
  labs: z.array(z.object({ test: z.string().trim().min(1).max(80), priority: z.enum(["routine", "urgent"]).default("routine") })).max(12).default([]),
  followUp: z.object({ inDays: z.number().int().min(1).max(365), channel: z.enum(["video", "audio", "chat"]), instructions: z.string().max(300).optional() }).nullable().optional(),
  ariaAccepted: z.boolean().default(false),
});

export function clinicRoutes(): Router {
  const r = express.Router();
  r.use(express.json({ limit: "32kb" }));
  r.use(requireDoctor);

  r.get("/live", async (_req: Request, res: Response) => {
    try {
      const data = getDataSource();
      const [patients, consults, auditLog, clinic] = await Promise.all([data.listPatients(), data.listConsults(), data.listAudit(40), data.clinicSnapshot()]);
      res.json({ at: new Date().toISOString(), patients, consults, audit: auditLog, clinic });
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

  r.post("/consults/:id/start", async (req: Request, res: Response) => {
    const doctor = res.locals.doctor as DoctorSession | undefined;
    try {
      const data = getDataSource();
      const id = String(req.params.id).slice(0, 80);
      if (!(await data.startConsult(id, doctor?.registrationNo ?? null))) {
        res.status(404).json({ error: "No open consult with that id." });
        return;
      }
      await audit(data, "Started consult", String(req.body?.patientName ?? id).slice(0, 120), String(req.body?.reason ?? "").slice(0, 300) || undefined, doctor?.name ?? "Doctor (dev mode)");
      res.json({ ok: true });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.post("/encounters", async (req: Request, res: Response) => {
    const parsed = EncounterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      return;
    }
    const b = parsed.data;
    const doctor = res.locals.doctor as DoctorSession | undefined;
    try {
      const data = getDataSource();
      const patient = await data.getPatient(b.patientId);
      if (!patient) {
        res.status(404).json({ error: "No such patient." });
        return;
      }
      const id = await data.fileEncounter({
        patientId: patient.id,
        consultId: b.consultId ?? null,
        doctorRegistrationNo: doctor?.registrationNo ?? null,
        chiefComplaint: b.chiefComplaint,
        assessment: b.assessment,
        clinicalNotes: b.notes,
        prescriptions: b.prescriptions.map((rx, i) => ({ id: `rx_${i + 1}`, drug: rx.drug, strength: rx.strength || undefined, frequency: rx.frequency || undefined, durationDays: rx.durationDays })),
        labRequests: b.labs.map((l, i) => ({ id: `lab_${i + 1}`, test: l.test, priority: l.priority })),
        followUp: b.followUp ?? null,
        now: new Date(),
      });
      const rx = b.prescriptions.length;
      await audit(data, "Filed encounter", patient.fullName, `${rx} prescription${rx === 1 ? "" : "s"} · ${b.ariaAccepted ? "ARIA handover accepted" : "ARIA handover not accepted"}`, doctor?.name ?? "Doctor (dev mode)");
      res.json({ ok: true, id });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  return r;
}
