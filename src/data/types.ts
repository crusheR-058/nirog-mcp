/** Clinic data shapes. The Supabase schema is supabase/migrations/0001_clinic.sql. */

/** A write the clinic refuses because of the record's state (wrong patient, already filed, already taken). HTTP 409. */
export class ClinicConflict extends Error {}

export interface PatientRecord {
  id: string;
  fullName: string;
  preferredLanguage: string;
  allergies: string[];
  conditions: string[];
  currentMedications: string[];
}

export interface PrescribedItem {
  id: string;
  drug: string;
  strength?: string;
  form?: string;
  dose?: string;
  frequency?: string;
  durationDays?: number;
}

export interface LabRequest {
  id: string;
  test: string;
  priority: "routine" | "urgent";
}

export interface FollowUp {
  inDays: number;
  channel: "video" | "audio" | "chat";
  instructions?: string;
}

export interface EncounterRecord {
  id: string;
  patientId: string;
  startedAt: string; // ISO
  endedAt: string | null;
  chiefComplaint: string;
  assessment: string;
  clinicalNotes: string;
  prescriptions: PrescribedItem[];
  labRequests: LabRequest[];
  followUp: FollowUp | null;
}

export interface ConsultRequest {
  patientId: string;
  triage: "emergency" | "urgent" | "routine";
  reason: string;
  now: Date;
  /** The handover the doctor reads before this consult. */
  handoverId?: string;
}

/** What the doctor reads before a consult. Every field is a quote or a rule's output; nothing is model-written. */
export interface NewHandover {
  patientId: string;
  chiefComplaint: string;
  narrative: string;
  symptoms: string[];
  redFlags: string[];
  triage: "emergency" | "urgent" | "routine";
  language: string;
  now: Date;
}

/** A consultation the doctor files from the portal. It becomes the patient's care plan. */
export interface NewEncounter {
  patientId: string;
  consultId: string | null;
  /** Registration number of the signed-in doctor, or null in open development mode. */
  doctorRegistrationNo: string | null;
  chiefComplaint: string;
  assessment: string;
  clinicalNotes: string;
  prescriptions: PrescribedItem[];
  labRequests: LabRequest[];
  followUp: FollowUp | null;
  now: Date;
}

/** Everything the doctor portal shows, in the portal's own shapes (demo/src/clinic/data.ts). */
export interface ClinicSnapshot {
  patients: Array<{
    id: string; fullName: string; sex: string; dateOfBirth: string; village: string; district: string; language: string;
    abha: boolean; relationship: string; allergies: string[]; conditions: string[]; medications: string[]; consent: "active" | "pending";
  }>;
  doctors: Array<{ id: string; name: string; spec: string; exp: number; rating: number; fee: number; online: boolean; langs: string }>;
  handovers: Array<{
    id: string; patientId: string; createdAt: string; chiefComplaint: string; narrative: string; durationText: string;
    symptoms: string[]; redFlags: string[]; vitals: Record<string, number>; aiConfidence: number | null;
    suggestedTriage: "emergency" | "urgent" | "routine"; language: string;
  }>;
  queue: Array<{
    id: string; patientId: string; kind: "new" | "follow_up" | "pediatrics" | "chronic" | "emergency"; triage: "emergency" | "urgent" | "routine";
    state: "waiting" | "scheduled" | "in_consult" | "completed"; checkedInAt: string; scheduledFor: string; channel: "video" | "audio" | "chat";
    reason: string; handoverId?: string; quality: "good" | "fair" | "poor"; redFlagCount: number; source: "app" | "alexa";
  }>;
  encounters: Array<{
    id: string; patientId: string; startedAt: string; chiefComplaint: string; assessment: string; notes: string;
    prescriptions: PrescribedItem[]; labs: LabRequest[]; followUp: FollowUp | null; doctor: string;
  }>;
}

/** A consult waiting in the on-call pool, as the doctor portal reads it. */
export interface ConsultRecord {
  id: string;
  patientId: string;
  triage: "emergency" | "urgent" | "routine";
  reason: string;
  at: string; // ISO
}

/** One line of the trust log: who did what to whom, and why. */
export interface AuditRecord {
  id: string;
  actorName: string;
  action: string;
  target: string;
  reason?: string;
  at: string; // ISO
}

export interface DoseRecord {
  id: string;
  patientId: string;
  drug: string;
  slot: string;
  takenAt: string; // ISO
}

/** Contract the MCP tools and the clinic API depend on. Implemented by mock and Supabase sources. */
export interface NirogData {
  getPatient(patientId: string): Promise<PatientRecord | null>;
  listPatients(): Promise<PatientRecord[]>;
  /** Most recent completed encounter, which is the active care plan. */
  getLatestEncounter(patientId: string): Promise<EncounterRecord | null>;
  /** Put the patient in the on-call doctor's queue. Returns the queue entry id. */
  requestConsult(req: ConsultRequest): Promise<string>;
  /** Consults waiting in the on-call pool, newest first. */
  listConsults(): Promise<ConsultRecord[]>;
  /** Notify the patient's family contact. Returns a description of who was told, or null if nobody is on file. */
  alertCaregiver(req: { patientId: string; level: "emergency" | "urgent"; message: string }): Promise<string | null>;
  /** Append to the trust log. Never edited, never deleted. */
  recordAudit(e: { actorName: string; action: string; target: string; reason?: string }): Promise<void>;
  listAudit(limit: number): Promise<AuditRecord[]>;
  /** Record that a dose was taken. Returns the record id. */
  logDose(d: { patientId: string; drug: string; slot: string; takenAt: Date }): Promise<string>;
  listDoses(patientId: string, since: Date): Promise<DoseRecord[]>;
  /** Store a handover for the doctor. Returns its id. */
  saveHandover(h: NewHandover): Promise<string>;
  /** The whole clinic for the portal, or null when this source has none (the portal then shows its built-in demo). */
  clinicSnapshot(): Promise<ClinicSnapshot | null>;
  /** A doctor opens a waiting or scheduled consult. Returns its patient id, or null if it is not open to start. */
  startConsult(consultId: string, doctorRegistrationNo: string | null): Promise<string | null>;
  /** File a completed encounter and close its consult. Returns the encounter id. Throws ClinicConflict if the
   *  consult belongs to another patient or was already filed. */
  fileEncounter(e: NewEncounter): Promise<string>;
}
