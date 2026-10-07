/** Shapes mirrored from the Nirog doctor portal schema (Prisma models Patient + Encounter). */

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

/** Read-side contract the MCP tools depend on. Implemented by mock and Supabase sources. */
export interface NirogData {
  getPatient(patientId: string): Promise<PatientRecord | null>;
  /** Most recent completed encounter, which is the active care plan. */
  getLatestEncounter(patientId: string): Promise<EncounterRecord | null>;
}
