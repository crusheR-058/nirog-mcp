import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ClinicConflict, type AuditRecord, type ClinicSnapshot, type ConsultRecord, type ConsultRequest, type DoseRecord, type EncounterRecord, type NewEncounter, type HandoverRecord, type NewHandover, type NirogData, type PatientRecord } from "./types.js";

const PATIENT_COLS = "id, full_name, household_id, relationship, preferred_language, allergies, conditions, current_medications";

interface PatientRow {
  id: string;
  full_name: string;
  household_id: string | null;
  relationship: string;
  preferred_language: string;
  allergies: string[];
  conditions: string[];
  current_medications: string[];
}

const toPatient = (r: PatientRow): PatientRecord => ({
  id: r.id,
  fullName: r.full_name,
  householdId: r.household_id,
  relationship: r.relationship,
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

  async listHousehold(patientId: string): Promise<PatientRecord[]> {
    const me = await this.getPatient(patientId);
    if (!me) return [];
    if (!me.householdId) return [me];
    const { data, error } = await this.client.from("patient").select(PATIENT_COLS).eq("household_id", me.householdId).order("full_name");
    if (error) throw new Error(`Household lookup failed: ${error.message}`);
    return ((data as PatientRow[]) ?? []).map(toPatient);
  }

  async findPatientByAccount(accountSub: string): Promise<PatientRecord | null> {
    const { data, error } = await this.client.from("patient").select(PATIENT_COLS).eq("account_sub", accountSub).maybeSingle();
    if (error) throw new Error(`Account lookup failed: ${error.message}`);
    return data ? toPatient(data as PatientRow) : null;
  }

  async linkPatientAccount(linkCode: string, accountSub: string, email: string | null): Promise<PatientRecord | null> {
    // One statement: the code must still be unclaimed when the account is written, so two sign-ins cannot both take it.
    const { data, error } = await this.client
      .from("patient")
      .update({ account_sub: accountSub, account_email: email, link_code: null, linked_at: new Date().toISOString() })
      .eq("link_code", linkCode.trim().toUpperCase())
      .is("account_sub", null)
      .select(PATIENT_COLS);
    if (error) throw new Error(`Linking the account failed: ${error.message}`);
    return data?.[0] ? toPatient(data[0] as PatientRow) : null;
  }

  async listEncounters(patientId: string): Promise<EncounterRecord[]> {
    const { data, error } = await this.client
      .from("encounter")
      .select("id, patient_id, started_at, ended_at, chief_complaint, assessment, clinical_notes, prescriptions, lab_requests, follow_up")
      .eq("patient_id", patientId)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(`Encounter list failed: ${error.message}`);
    return (data ?? []).map((e) => ({
      id: e.id, patientId: e.patient_id, startedAt: e.started_at, endedAt: e.ended_at, chiefComplaint: e.chief_complaint, assessment: e.assessment,
      clinicalNotes: e.clinical_notes, prescriptions: e.prescriptions ?? [], labRequests: e.lab_requests ?? [], followUp: e.follow_up ?? null,
    }));
  }

  async listHandovers(patientId: string): Promise<HandoverRecord[]> {
    const { data, error } = await this.client
      .from("handover")
      .select("id, patient_id, created_at, chief_complaint, narrative, symptoms, red_flags, suggested_triage, language")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(`Handover list failed: ${error.message}`);
    return (data ?? []).map((h) => ({
      id: h.id, patientId: h.patient_id, createdAt: h.created_at, chiefComplaint: h.chief_complaint, narrative: h.narrative,
      symptoms: h.symptoms, redFlags: h.red_flags, triage: h.suggested_triage, language: h.language,
    }));
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
        handover_id: req.handoverId ?? null,
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

  async saveHandover(h: NewHandover): Promise<string> {
    const { data, error } = await this.client
      .from("handover")
      .insert({
        patient_id: h.patientId,
        created_at: h.now.toISOString(),
        chief_complaint: h.chiefComplaint.slice(0, 200),
        narrative: h.narrative.slice(0, 2000),
        symptoms: h.symptoms.slice(0, 8),
        red_flags: h.redFlags.slice(0, 8),
        suggested_triage: h.triage,
        language: h.language,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Handover save failed: ${error.message}`);
    return data.id;
  }

  async clinicSnapshot(): Promise<ClinicSnapshot> {
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const [patients, doctors, handovers, queue, encounters] = await Promise.all([
      this.client.from("patient").select("*").order("full_name"),
      this.client.from("doctor").select("*").order("name"),
      this.client.from("handover").select("*").order("created_at", { ascending: false }).limit(100),
      // Today's clinic: everything still open, plus whatever closed in the last day.
      this.client.from("consult").select("*").or(`state.neq.completed,checked_in_at.gte.${dayAgo}`).order("checked_in_at", { ascending: false }).limit(100),
      this.client.from("encounter").select("*, doctor:doctor_id (name)").not("ended_at", "is", null).order("started_at", { ascending: false }).limit(200),
    ]);
    for (const r of [patients, doctors, handovers, queue, encounters]) if (r.error) throw new Error(`Clinic snapshot failed: ${r.error.message}`);
    return {
      patients: (patients.data ?? []).map((p) => ({
        id: p.id, fullName: p.full_name, sex: p.sex ?? "", dateOfBirth: p.date_of_birth ?? "", village: p.village ?? "", district: p.district ?? "",
        language: p.preferred_language, abha: p.abha_linked, relationship: p.relationship, allergies: p.allergies, conditions: p.conditions,
        medications: p.current_medications, consent: p.consent,
        portal: { linkCode: p.link_code ?? null, linked: Boolean(p.account_sub) },
      })),
      doctors: (doctors.data ?? []).map((d) => ({
        id: d.id, name: d.name, spec: d.specialty, exp: d.experience_years ?? 0, rating: Number(d.rating ?? 0), fee: d.fee_inr ?? 0, online: d.online, langs: d.languages.join(", "),
      })),
      handovers: (handovers.data ?? []).map((h) => ({
        id: h.id, patientId: h.patient_id, createdAt: h.created_at, chiefComplaint: h.chief_complaint, narrative: h.narrative, durationText: h.duration_text ?? "",
        symptoms: h.symptoms, redFlags: h.red_flags, vitals: h.vitals ?? {}, aiConfidence: h.ai_confidence == null ? null : Number(h.ai_confidence),
        suggestedTriage: h.suggested_triage, language: h.language,
      })),
      queue: (queue.data ?? []).map((q) => ({
        id: q.id, patientId: q.patient_id, kind: q.kind, triage: q.triage, state: q.state, checkedInAt: q.checked_in_at, scheduledFor: q.scheduled_for,
        channel: q.channel, reason: q.reason, handoverId: q.handover_id ?? undefined, quality: q.connection ?? "fair", redFlagCount: q.red_flag_count, source: q.source,
      })),
      encounters: (encounters.data ?? []).map((e) => ({
        id: e.id, patientId: e.patient_id, startedAt: e.started_at, chiefComplaint: e.chief_complaint, assessment: e.assessment, notes: e.clinical_notes,
        prescriptions: e.prescriptions ?? [], labs: e.lab_requests ?? [], followUp: e.follow_up ?? null,
        doctor: (e.doctor as { name: string } | null)?.name ?? "Unsigned (development mode)",
      })),
    };
  }

  private async doctorId(registrationNo: string | null): Promise<string | null> {
    if (!registrationNo) return null;
    const { data, error } = await this.client.from("doctor").select("id").eq("registration_no", registrationNo).maybeSingle();
    if (error) throw new Error(`Doctor lookup failed: ${error.message}`);
    return data?.id ?? null;
  }

  async startConsult(consultId: string, doctorRegistrationNo: string | null): Promise<string | null> {
    const doctorId = await this.doctorId(doctorRegistrationNo);
    // Only from waiting or scheduled, in one statement: two doctors clicking Start cannot both take it.
    const { data, error } = await this.client
      .from("consult")
      .update({ state: "in_consult", ...(doctorId ? { doctor_id: doctorId } : {}) })
      .eq("id", consultId)
      .in("state", ["waiting", "scheduled"])
      .select("patient_id");
    if (error) throw new Error(`Starting the consult failed: ${error.message}`);
    return data?.[0]?.patient_id ?? null;
  }

  async fileEncounter(e: NewEncounter): Promise<string> {
    const doctorId = await this.doctorId(e.doctorRegistrationNo);
    if (e.consultId) {
      const { data: c, error: ce } = await this.client.from("consult").select("patient_id, state").eq("id", e.consultId).maybeSingle();
      if (ce) throw new Error(`Consult lookup failed: ${ce.message}`);
      if (!c) throw new ClinicConflict("No such consult.");
      if (c.patient_id !== e.patientId) throw new ClinicConflict("That consult is for another patient.");
      if (c.state === "completed") throw new ClinicConflict("This consult has already been filed.");
    }
    const { data, error } = await this.client
      .from("encounter")
      .insert({
        patient_id: e.patientId,
        doctor_id: doctorId,
        consult_id: e.consultId,
        started_at: e.now.toISOString(),
        ended_at: e.now.toISOString(),
        chief_complaint: e.chiefComplaint,
        assessment: e.assessment,
        clinical_notes: e.clinicalNotes,
        prescriptions: e.prescriptions,
        lab_requests: e.labRequests,
        follow_up: e.followUp,
      })
      .select("id")
      .single();
    // The unique index on encounter.consult_id turns a retried request into a conflict, not a second record.
    if (error?.code === "23505") throw new ClinicConflict("This consult has already been filed.");
    if (error) throw new Error(`Filing the encounter failed: ${error.message}`);
    if (e.consultId) {
      const done = await this.client.from("consult").update({ state: "completed", ...(doctorId ? { doctor_id: doctorId } : {}) }).eq("id", e.consultId);
      // The encounter is the record; a consult left open is visible in the queue and can be closed again.
      if (done.error) console.error(`[clinic] encounter ${data.id} filed but consult ${e.consultId} not closed: ${done.error.message}`);
    }
    return data.id;
  }
}
