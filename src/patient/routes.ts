import express, { type Request, type Response, type Router } from "express";
import { sessionSecret } from "../auth/doctor.js";
import { verifyToken, type ConsentPayload } from "../auth/tokens.js";
import { getDataSource } from "../data/index.js";
import type { AuditRecord, DoseRecord, EncounterRecord, HandoverRecord, PatientRecord } from "../data/types.js";
import { getMemory } from "../memory/index.js";
import type { ComplaintRecord } from "../memory/types.js";

/**
 * /api/patient: what a signed-in patient reads about themselves.
 *
 *   GET /api/patient/me   the record, history and care plan of every patient the session covers
 *
 * The session is a consent token from /auth/patient/session (or, on the public demo, a demo grant). Which patients it
 * covers is inside the signed token, so no request can name a patient id. The same token drives the Alexa+ agent and
 * the MCP tools for this patient, which is why the portal and the voice assistant can never disagree about access.
 */
export interface PatientHistory {
  record: PatientRecord;
  /** What the patient said, in their own words, as the memory store kept it. Null when memory could not be read. */
  complaints: Array<Pick<ComplaintRecord, "id" | "rawText" | "bodyRegion"> & { occurredAt: string }> | null;
  handovers: HandoverRecord[];
  encounters: EncounterRecord[];
  /** The last 90 days of dose events. */
  doses: DoseRecord[];
  /** Consults still waiting for a doctor. */
  consults: Array<{ id: string; triage: string; reason: string; at: string }>;
  /** Every trust-log line about this patient: who read or changed their record, and why. */
  access: AuditRecord[];
}

function bearer(req: Request): ConsentPayload | null {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    return token ? verifyToken(token, sessionSecret()) : null;
  } catch {
    return null;
  }
}

export function patientRoutes(): Router {
  const r = express.Router();

  r.get("/me", async (req: Request, res: Response) => {
    const session = bearer(req);
    if (!session) {
      res.status(401).json({ error: "Sign in to read your record." });
      return;
    }
    try {
      const data = getDataSource();
      const since = new Date(Date.now() - 90 * 86_400_000);
      const [consults, auditLog, memory] = await Promise.all([data.listConsults(), data.listAudit(200), getMemory().catch(() => null)]);
      // shortcut: a household is a handful of people; one token with hundreds of patients is not a patient session.
      const ids = session.patients.slice(0, 8);
      const patients = await Promise.all(
        ids.map(async (id): Promise<PatientHistory | null> => {
          const record = await data.getPatient(id);
          if (!record) return null;
          const [handovers, encounters, doses, complaints] = await Promise.all([
            data.listHandovers(id),
            data.listEncounters(id),
            data.listDoses(id, since),
            // A failed read is reported as unknown, never as an empty history: a patient must not read "nothing recorded" into an outage.
            memory ? memory.store.history(id).then((h) => h.map((c) => ({ id: c.id, rawText: c.rawText, bodyRegion: c.bodyRegion, occurredAt: c.occurredAt.toISOString() })), () => null) : null,
          ]);
          return {
            record,
            complaints,
            handovers,
            encounters,
            doses,
            consults: consults.filter((c) => c.patientId === id).map((c) => ({ id: c.id, triage: c.triage, reason: c.reason, at: c.at })),
            access: auditLog.filter((a) => a.target === record.fullName),
          };
        }),
      );
      res.json({ sub: session.sub, expiresAt: session.exp, patients: patients.filter((p): p is PatientHistory => p !== null) });
    } catch (e) {
      console.error("[patient]", e instanceof Error ? e.message : String(e));
      res.status(503).json({ error: "Your record could not be reached just now." });
    }
  });

  return r;
}
