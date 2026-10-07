import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { ConsultRequest, EncounterRecord, NirogData, PatientRecord } from "./types.js";

/**
 * Reads the Nirog doctor-portal Supabase project. Table and column names come from the
 * Prisma schema (PascalCase tables, camelCase columns). Uses the service key for now;
 * Day 6 replaces this with a narrow `alexa` role plus consent checks.
 */
export class SupabaseData implements NirogData {
  private client: SupabaseClient;

  constructor(url: string, key: string) {
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }

  async getPatient(patientId: string): Promise<PatientRecord | null> {
    const { data, error } = await this.client
      .from("Patient")
      .select("id, fullName, preferredLanguage, allergies, conditions, currentMedications")
      .eq("id", patientId)
      .maybeSingle();
    if (error) throw new Error(`Patient lookup failed: ${error.message}`);
    return (data as PatientRecord | null) ?? null;
  }

  async getLatestEncounter(patientId: string): Promise<EncounterRecord | null> {
    const { data, error } = await this.client
      .from("Encounter")
      .select(
        "id, patientId, startedAt, endedAt, chiefComplaint, assessment, clinicalNotes, prescriptions, labRequests, followUp",
      )
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
    const id = `c${randomUUID().replace(/-/g, "").slice(0, 24)}`;
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

  async alertCaregiver(req: { patientId: string; level: "emergency" | "urgent"; message: string }): Promise<string | null> {
    // Writes an audit row so the alert is visible in the portal; SMS delivery is a follow-up.
    const { error } = await this.client.from("AuditEvent").insert({
      id: `a${randomUUID().replace(/-/g, "").slice(0, 24)}`,
      actorId: null,
      actorName: "Alexa+ (nirog-mcp)",
      action: `caregiver_alert_${req.level}`,
      target: req.patientId,
      reason: req.message.slice(0, 500),
      at: new Date().toISOString(),
    });
    if (error) throw new Error(`Caregiver alert failed: ${error.message}`);
    return "family contact (audit logged; SMS pending)";
  }
}
