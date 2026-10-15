/** Browser side of the patient sign-in: Google (shared with the doctor page), then /auth/patient/session. */
import { base } from "../doctor/auth";

export interface PatientRecord {
  id: string;
  fullName: string;
  householdId: string | null;
  relationship: string;
  preferredLanguage: string;
  allergies: string[];
  conditions: string[];
  currentMedications: string[];
}
export interface Prescription { id: string; drug: string; strength?: string; form?: string; dose?: string; frequency?: string; durationDays?: number }
export interface Encounter {
  id: string; patientId: string; startedAt: string; endedAt: string | null; chiefComplaint: string; assessment: string; clinicalNotes: string;
  prescriptions: Prescription[]; labRequests: Array<{ id: string; test: string; priority: "routine" | "urgent" }>;
  followUp: { inDays: number; channel: "video" | "audio" | "chat"; instructions?: string } | null;
}
export interface Handover { id: string; patientId: string; createdAt: string; chiefComplaint: string; narrative: string; symptoms: string[]; redFlags: string[]; triage: "emergency" | "urgent" | "routine"; language: string }
export interface Dose { id: string; patientId: string; drug: string; slot: string; takenAt: string }
export interface Complaint { id: string; rawText: string; bodyRegion: string; occurredAt: string }
export interface AccessLine { id: string; actorName: string; action: string; target: string; reason?: string; at: string }
export interface PatientHistory {
  record: PatientRecord;
  complaints: Complaint[] | null;
  handovers: Handover[];
  encounters: Encounter[];
  doses: Dose[];
  consults: Array<{ id: string; triage: string; reason: string; at: string }>;
  access: AccessLine[];
}
export interface Me { sub: string; expiresAt: number; patients: PatientHistory[] }

export interface PatientSession { token: string; patientId: string; name: string; picture?: string }

const KEY = "nirog-patient-session";

export function loadPatientSession(): PatientSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PatientSession) : null;
  } catch {
    return null;
  }
}
export function savePatientSession(s: PatientSession | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

type Identity = { idToken?: string; demo?: { patientId?: string; email?: string; name?: string } };
export type SessionReply =
  | { status: "linked"; token: string; patient: PatientRecord; household: PatientRecord[]; identity: { email: string; name: string; picture?: string } }
  | { status: "needs-link"; identity: { email: string; name: string; picture?: string } };

export async function patientSession(identity: Identity, linkCode?: string): Promise<SessionReply> {
  const r = await fetch(`${base()}/auth/patient/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...identity, linkCode }) });
  const data = (await r.json().catch(() => ({}))) as SessionReply & { error?: string };
  if (!r.ok) throw new Error(data.error ?? `Sign-in failed (${r.status}).`);
  return data;
}

/** The signed-in patient's own record. Null when the session is no longer accepted. */
export async function fetchMe(token: string): Promise<Me | null> {
  const r = await fetch(`${base()}/api/patient/me`, { headers: { authorization: `Bearer ${token}` } });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error("Your record could not be reached just now.");
  return r.json();
}

/** Is this the public demo (fictional patients to pick from) or an open development server (demo identity plus link code)? */
export async function serverMode(): Promise<"public-demo" | "open" | "google"> {
  const [health, config] = await Promise.all([
    fetch(`${base()}/health`).then((r) => (r.ok ? (r.json() as Promise<{ auth?: string }>) : null)).catch(() => null),
    fetch(`${base()}/auth/config`).then((r) => (r.ok ? (r.json() as Promise<{ demoSignIn: boolean; googleClientId: string | null }>) : null)).catch(() => null),
  ]);
  if (config?.demoSignIn) return health?.auth === "consent-token" ? "public-demo" : "open";
  return "google";
}
