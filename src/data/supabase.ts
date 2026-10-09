import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { AuditRecord, ConsultRecord, ConsultRequest, DoseRecord, EncounterRecord, NirogData, PatientRecord } from "./types.js";

const cuid = (prefix: string) => `${prefix}${randomUUID().replace(/-/g, "").slice(0, 24)}`;
const PATIENT_COLS = "id, fullName, preferredLanguage, allergies, conditions, currentMedications";
const DOSE_ACTION = "dose_taken";

/**
 * Reads and writes the Nirog doctor-portal Supabase project. Table and column names
 * come from the Prisma schema (PascalCase tables, camelCase columns). Uses the service
 * key; consent is enforced one layer up, per request, by the household token.
 *
 * The Nirog schema has no dose table, so doses are AuditEvent rows with action
 * "dose_taken" and a JSON reason. That keeps this server from needing a migration
 * on a database it does not own.
 */
export class SupabaseData implements NirogData {
  private client: SupabaseClient;

  constructor(url: string, key: string) {
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }

  async getPatient(patientId: string): Promise<PatientRecord | null> {
    const { data, error } = await this.client.from("Patient").select(PATIENT_COLS).eq("id", patientId).maybeSingle();
    if (error) throw new Error(`Patient lookup failed: ${error.message}`);
    return (data as PatientRecord | null) ?? null;
  }

  async listPatients(): Promise<PatientRecord[]> {
    const { data, error } = await this.client.from("Patient").select(PATIENT_COLS).order("fullName");
    if (error) throw new Error(`Patient list failed: ${error.message}`);
    return (data as PatientRecord[]) ?? [];
  }

  async getLatestEncounter(patientId: string): Promise<EncounterRecord | null> {
    const { data, error } = await this.client
      .from("Encounter")
      .select("id, patientId, startedAt, endedAt, chiefComplaint, assessment, clinicalNotes, prescriptions, labRequests, followUp")
      .eq("patientId", patientId)
      .not("endedAt", "is", null)
      .order("startedAt", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Encounter lookup failed: ${error.message}`);
    if (!data) return null;
    return {
      ...(data as Omit<EncounterRecord, "prescriptions" | "labRequests" | "followUp">),
      prescriptions: (data.prescriptions as EncounterRecord["prescriptions"]) ?? [],
      labRequests: (data.labRequests as EncounterRecord["labRequests"]) ?? [],
      followUp: (data.followUp as EncounterRecord["followUp"]) ?? null,
    };
  }

  /** Inserts an unassigned QueueEntry (doctorId null) that any on-call doctor can claim, as the portal does. */
  async requestConsult(req: ConsultRequest): Promise<string> {
    const id = cuid("c");
    const { error } = await this.client.from("QueueEntry").insert({
      id,
      patientId: req.patientId,
      doctorId: null,
      kind: req.triage === "emergency" ? "emergency" : "new",
      triage: req.triage,
      state: "waiting",
      checkedInAt: req.now.toISOString(),
      scheduledFor: req.now.toISOString(),
      channel: "audio",
      reason: req.reason.slice(0, 500),
    });
    if (error) throw new Error(`Consult request failed: ${error.message}`);
    return id;
  }

  async listConsults(): Promise<ConsultRecord[]> {
    const { data, error } = await this.client
      .from("QueueEntry")
      .select("id, patientId, triage, reason, checkedInAt")
      .is("doctorId", null)
      .eq("state", "waiting")
      .order("checkedInAt", { ascending: false })
      .limit(50);
    if (error) throw new Error(`Consult list failed: ${error.message}`);
    return (data ?? []).map((r) => ({ id: r.id, patientId: r.patientId, triage: r.triage, reason: r.reason, at: r.checkedInAt }));
  }

  async alertCaregiver(req: { patientId: string; level: "emergency" | "urgent"; message: string }): Promise<string | null> {
    // Writes an audit row so the alert is visible in the portal; SMS delivery is a follow-up.
    await this.recordAudit({ actorName: "Alexa+ (nirog-mcp)", action: `caregiver_alert_${req.level}`, target: req.patientId, reason: req.message });
    return "family contact (audit logged; SMS pending)";
  }

  async recordAudit(e: { actorName: string; action: string; target: string; reason?: string }): Promise<void> {
    const { error } = await this.client.from("AuditEvent").insert({
      id: cuid("a"),
      actorId: null,
      actorName: e.actorName,
      action: e.action,
      target: e.target,
      reason: e.reason?.slice(0, 500) ?? null,
      at: new Date().toISOString(),
    });
    if (error) throw new Error(`Audit write failed: ${error.message}`);
  }

  async listAudit(limit: number): Promise<AuditRecord[]> {
    const { data, error } = await this.client
      .from("AuditEvent")
      .select("id, actorName, action, target, reason, at")
      .neq("action", DOSE_ACTION)
      .order("at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Audit list failed: ${error.message}`);
    return (data ?? []).map((r) => ({ id: r.id, actorName: r.actorName, action: r.action, target: r.target, reason: r.reason ?? undefined, at: r.at }));
  }

  async logDose(d: { patientId: string; drug: string; slot: string; takenAt: Date }): Promise<string> {
    const id = cuid("a");
    const { error } = await this.client.from("AuditEvent").insert({
      id,
      actorId: null,
      actorName: "Alexa+ (nirog-mcp)",
      action: DOSE_ACTION,
      target: d.patientId,
      reason: JSON.stringify({ drug: d.drug, slot: d.slot }),
      at: d.takenAt.toISOString(),
    });
    if (error) throw new Error(`Dose log failed: ${error.message}`);
    return id;
  }

  async listDoses(patientId: string, since: Date): Promise<DoseRecord[]> {
    const { data, error } = await this.client
      .from("AuditEvent")
      .select("id, target, reason, at")
      .eq("action", DOSE_ACTION)
      .eq("target", patientId)
      .gte("at", since.toISOString())
      .order("at", { ascending: true });
    if (error) throw new Error(`Dose list failed: ${error.message}`);
    return (data ?? []).map((r) => {
      let drug = "", slot = "";
      try {
        ({ drug, slot } = JSON.parse(r.reason ?? "{}"));
      } catch {
        /* a malformed row is skipped below */
      }
      return { id: r.id, patientId: r.target, drug, slot, takenAt: r.at };
    }).filter((d) => d.drug);
  }
}
