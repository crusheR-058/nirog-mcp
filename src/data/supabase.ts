import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuditRecord, ConsultRecord, ConsultRequest, DoseRecord, EncounterRecord, NirogData, PatientRecord } from "./types.js";

const PATIENT_COLS = "id, full_name, preferred_language, allergies, conditions, current_medications";

interface PatientRow {
  id: string;
  full_name: string;
  preferred_language: string;
  allergies: string[];
  conditions: string[];
  current_medications: string[];
}

const toPatient = (r: PatientRow): PatientRecord => ({
  id: r.id,
  fullName: r.full_name,
  preferredLanguage: r.preferred_language,
  allergies: r.allergies,
  conditions: r.conditions,
  currentMedications: r.current_medications,
});

/**
 * Reads and writes the nirog-alexa Supabase project (schema: supabase/migrations/0001_clinic.sql).
 * Uses the service key, which bypasses row-level security; consent is enforced one layer up,
 * per request, by the household token.
 */
export class SupabaseData implements NirogData {
  private client: SupabaseClient;

  constructor(url: string, key: string) {
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }

  async getPatient(patientId: string): Promise<PatientRecord | null> {
    const { data, error } = await this.client.from("patient").select(PATIENT_COLS).eq("id", patientId).maybeSingle();
    if (error) throw new Error(`Patient lookup failed: ${error.message}`);
    return data ? toPatient(data as PatientRow) : null;
  }

  async listPatients(): Promise<PatientRecord[]> {
    const { data, error } = await this.client.from("patient").select(PATIENT_COLS).order("full_name");
    if (error) throw new Error(`Patient list failed: ${error.message}`);
    return ((data as PatientRow[]) ?? []).map(toPatient);
  }

  async getLatestEncounter(patientId: string): Promise<EncounterRecord | null> {
    const { data, error } = await this.client
      .from("encounter")
      .select("id, patient_id, started_at, ended_at, chief_complaint, assessment, clinical_notes, prescriptions, lab_requests, follow_up")
      .eq("patient_id", patientId)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Encounter lookup failed: ${error.message}`);
    if (!data) return null;
    return {
      id: data.id,
      patientId: data.patient_id,
      startedAt: data.started_at,
      endedAt: data.ended_at,
      chiefComplaint: data.chief_complaint,
      assessment: data.assessment,
      clinicalNotes: data.clinical_notes,
      prescriptions: data.prescriptions ?? [],
      labRequests: data.lab_requests ?? [],
      followUp: data.follow_up ?? null,
    };
  }

  /** Inserts an unassigned consult (doctor_id null) that any on-call doctor can claim. */
  async requestConsult(req: ConsultRequest): Promise<string> {
    const { data, error } = await this.client
      .from("consult")
      .insert({
        patient_id: req.patientId,
        doctor_id: null,
        kind: req.triage === "emergency" ? "emergency" : "new",
        triage: req.triage,
        state: "waiting",
        channel: "audio",
        source: "alexa",
        reason: req.reason.slice(0, 500),
        red_flag_count: req.triage === "routine" ? 0 : 1,
        checked_in_at: req.now.toISOString(),
        scheduled_for: req.now.toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(`Consult request failed: ${error.message}`);
    return data.id;
  }

  async listConsults(): Promise<ConsultRecord[]> {
    const { data, error } = await this.client
      .from("consult")
      .select("id, patient_id, triage, reason, checked_in_at")
      .is("doctor_id", null)
      .eq("state", "waiting")
      .order("checked_in_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(`Consult list failed: ${error.message}`);
    return (data ?? []).map((r) => ({ id: r.id, patientId: r.patient_id, triage: r.triage, reason: r.reason, at: r.checked_in_at }));
  }

  /** Names the household's family contact. The calling tool writes the trust-log line. SMS delivery is not wired yet. */
  async alertCaregiver(req: { patientId: string; level: "emergency" | "urgent"; message: string }): Promise<string | null> {
    const { data, error } = await this.client
      .from("patient")
      .select("household:household_id (caregiver_name, caregiver_phone)")
      .eq("id", req.patientId)
      .maybeSingle();
    if (error) throw new Error(`Caregiver lookup failed: ${error.message}`);
    const hh = (data?.household ?? null) as { caregiver_name: string | null; caregiver_phone: string | null } | null;
    if (!hh?.caregiver_name) return null;
    const tail = hh.caregiver_phone ? ` on the phone ending ${hh.caregiver_phone.slice(-2)}` : "";
    return `${hh.caregiver_name}, the family contact${tail} (SMS pending)`;
  }

  async recordAudit(e: { actorName: string; action: string; target: string; reason?: string }): Promise<void> {
    const { error } = await this.client.from("audit_event").insert({
      actor_name: e.actorName,
      action: e.action,
      target: e.target,
      reason: e.reason?.slice(0, 500) ?? null,
    });
    if (error) throw new Error(`Audit write failed: ${error.message}`);
  }

  async listAudit(limit: number): Promise<AuditRecord[]> {
    const { data, error } = await this.client
      .from("audit_event")
      .select("id, actor_name, action, target, reason, at")
      .order("at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Audit list failed: ${error.message}`);
    return (data ?? []).map((r) => ({ id: r.id, actorName: r.actor_name, action: r.action, target: r.target, reason: r.reason ?? undefined, at: r.at }));
  }

  async logDose(d: { patientId: string; drug: string; slot: string; takenAt: Date }): Promise<string> {
    const { data, error } = await this.client
      .from("dose")
      .insert({ patient_id: d.patientId, drug: d.drug, slot: d.slot, taken_at: d.takenAt.toISOString() })
      .select("id")
      .single();
    if (error) throw new Error(`Dose log failed: ${error.message}`);
    return data.id;
  }

  async listDoses(patientId: string, since: Date): Promise<DoseRecord[]> {
    const { data, error } = await this.client
      .from("dose")
      .select("id, patient_id, drug, slot, taken_at")
      .eq("patient_id", patientId)
      .gte("taken_at", since.toISOString())
      .order("taken_at", { ascending: true });
    if (error) throw new Error(`Dose list failed: ${error.message}`);
    return (data ?? []).map((r) => ({ id: r.id, patientId: r.patient_id, drug: r.drug, slot: r.slot, takenAt: r.taken_at }));
  }
}
