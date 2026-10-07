/** Clinic fixtures, mirrored from the Nirog doctor portal seed (github.com/Shivang-creator/nirog). */

export type Triage = "emergency" | "urgent" | "routine";
export type Channel = "video" | "audio" | "chat";
export type Kind = "new" | "follow_up" | "pediatrics" | "chronic" | "emergency";
export type Quality = "good" | "fair" | "poor";
export type Tone = "red" | "amber" | "green" | "indigo" | "blue" | "aria";

export interface Patient {
  id: string;
  fullName: string;
  sex: "male" | "female";
  dateOfBirth: string;
  village: string;
  district: string;
  language: string;
  abha: boolean;
  relationship: string;
  allergies: string[];
  conditions: string[];
  medications: string[];
  tone: Tone;
  consent: "active" | "pending";
}

export const DOCTOR = {
  id: "doc_ananya",
  name: "Dr. Ananya Rao",
  specialty: "General Physician",
  registrationNo: "HPR-KA-2019-44817",
  languages: ["Hindi", "English", "Kannada"],
  clinic: "Nirog Rural Care Network",
};

export const PATIENTS: Patient[] = [
  { id: "pat_rahul", fullName: "Rahul Yadav", sex: "male", dateOfBirth: "1976-03-14", village: "Sultanpur", district: "Barabanki, UP", language: "Hindi", abha: true, relationship: "self", allergies: [], conditions: ["Hypertension"], medications: ["Amlodipine 5mg OD"], tone: "red", consent: "active" },
  { id: "pat_sunita", fullName: "Sunita Devi", sex: "female", dateOfBirth: "1968-11-02", village: "Sultanpur", district: "Barabanki, UP", language: "Hindi", abha: true, relationship: "self", allergies: ["Sulfa drugs"], conditions: ["Type 2 Diabetes"], medications: ["Metformin 500mg BD"], tone: "amber", consent: "active" },
  { id: "pat_aarav", fullName: "Aarav Yadav", sex: "male", dateOfBirth: "2018-06-21", village: "Sultanpur", district: "Barabanki, UP", language: "Hindi", abha: false, relationship: "child", allergies: [], conditions: [], medications: [], tone: "green", consent: "active" },
  { id: "pat_meena", fullName: "Meena Singh", sex: "female", dateOfBirth: "1995-01-30", village: "Haidergarh", district: "Barabanki, UP", language: "Hindi", abha: false, relationship: "self", allergies: [], conditions: [], medications: [], tone: "indigo", consent: "pending" },
  { id: "pat_imran", fullName: "Imran Khan", sex: "male", dateOfBirth: "1989-09-09", village: "Ramnagar", district: "Barabanki, UP", language: "Hindi", abha: true, relationship: "self", allergies: ["Penicillin"], conditions: ["Asthma"], medications: ["Salbutamol inhaler PRN"], tone: "aria", consent: "active" },
  { id: "pat_lakshmi", fullName: "Lakshmi Bai", sex: "female", dateOfBirth: "1951-07-18", village: "Sultanpur", district: "Barabanki, UP", language: "Hindi", abha: true, relationship: "parent", allergies: [], conditions: ["Osteoarthritis", "Hypertension"], medications: ["Telmisartan 40mg OD"], tone: "green", consent: "active" },
];

export const patientById = (id: string) => PATIENTS.find((p) => p.id === id);
export const ageOf = (p: Patient, now = new Date()) => Math.floor((now.getTime() - new Date(p.dateOfBirth).getTime()) / (365.25 * 86_400_000));
export const initials = (name: string) => name.split(" ").map((w) => w[0]).slice(0, 2).join("");

export interface Handover {
  id: string;
  patientId: string;
  createdAt: string;
  chiefComplaint: string;
  narrative: string;
  durationText: string;
  symptoms: string[];
  redFlags: string[];
  vitals: Record<string, number>;
  aiConfidence: number;
  suggestedTriage: Triage;
  language: string;
}

export const HANDOVERS: Handover[] = [
  { id: "aria_rahul", patientId: "pat_rahul", createdAt: "2026-10-07T14:41:00.000Z", chiefComplaint: "Lower back pain, 3rd visit in 5 weeks", narrative: "Same ache as July, worse in the mornings and when bending to lift water. No numbness, no fever, no change in bladder or bowel. Adherent to Amlodipine. Memory linked three presentations with no shared wording.", durationText: "3 weeks, recurring since July", symptoms: ["Lower back ache", "Worse on bending", "Morning stiffness"], redFlags: ["Recurrent: 3 visits in 38 days"], vitals: { pulseBpm: 84, spo2: 97, systolic: 148, diastolic: 92 }, aiConfidence: 0.88, suggestedTriage: "urgent", language: "Hindi" },
  { id: "aria_sunita", patientId: "pat_sunita", createdAt: "2026-10-07T05:02:00.000Z", chiefComplaint: "Diabetes review + tingling feet", narrative: "Routine follow-up for Type 2 Diabetes. Reports occasional tingling in both feet over the last month. Home glucometer fasting readings around 150–170 mg/dL. Metformin adherent, no hypoglycaemic episodes.", durationText: "1 month", symptoms: ["Peripheral tingling", "Raised fasting glucose"], redFlags: [], vitals: { pulseBpm: 78, spo2: 98, systolic: 138, diastolic: 84 }, aiConfidence: 0.9, suggestedTriage: "routine", language: "Hindi" },
  { id: "aria_aarav", patientId: "pat_aarav", createdAt: "2026-10-07T05:20:00.000Z", chiefComplaint: "Fever and cough (child, 8y)", narrative: "Mother reports 3 days of fever up to 101°F and a dry cough. Eating less but drinking fluids, passing urine normally. No rash, no difficulty breathing reported. Attends school.", durationText: "3 days", symptoms: ["Fever", "Dry cough", "Reduced appetite"], redFlags: [], vitals: { tempC: 38.3, pulseBpm: 110, spo2: 97, respRate: 24 }, aiConfidence: 0.86, suggestedTriage: "routine", language: "Hindi" },
  { id: "aria_meena", patientId: "pat_meena", createdAt: "2026-10-07T05:33:00.000Z", chiefComplaint: "Headache for 5 days", narrative: "New patient. Dull bilateral headache for 5 days, worse in the afternoon, partially relieved by rest. No visual changes, no vomiting, no neck stiffness. Works long hours doing embroidery. Sleeps poorly.", durationText: "5 days", symptoms: ["Bilateral headache", "Poor sleep", "Eye strain"], redFlags: [], vitals: { pulseBpm: 82, spo2: 99, systolic: 122, diastolic: 78 }, aiConfidence: 0.79, suggestedTriage: "routine", language: "Hindi" },
  { id: "aria_imran", patientId: "pat_imran", createdAt: "2026-10-07T03:58:00.000Z", chiefComplaint: "Asthma flare after dust exposure", narrative: "Reports wheeze and cough since threshing work yesterday. Using inhaler more than usual (6+ times/day) with partial relief. Able to speak in full sentences. No cyanosis reported.", durationText: "1 day", symptoms: ["Wheeze", "Cough", "Increased inhaler use"], redFlags: ["Inhaler use >6×/day"], vitals: { pulseBpm: 96, spo2: 95, respRate: 20 }, aiConfidence: 0.84, suggestedTriage: "urgent", language: "Hindi" },
];

export const handoverFor = (patientId: string) => HANDOVERS.find((h) => h.patientId === patientId);

export interface QueueItem {
  id: string;
  patientId: string;
  kind: Kind;
  triage: Triage;
  state: "waiting" | "scheduled" | "in_consult" | "completed";
  checkedInAt: string;
  scheduledFor: string;
  channel: Channel;
  reason: string;
  handoverId?: string;
  quality: Quality;
  redFlagCount: number;
  /** Where the request came from. */
  source: "app" | "alexa";
}

export function buildQueue(now: Date): QueueItem[] {
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString();
  const at = (h: number, min: number) => { const d = new Date(now); d.setHours(h, min, 0, 0); return d.toISOString(); };
  return [
    { id: "q_rahul", patientId: "pat_rahul", kind: "chronic", triage: "urgent", state: "waiting", checkedInAt: minsAgo(13), scheduledFor: at(18, 15), channel: "video", reason: "Lower back pain — 3rd visit in 5 weeks", handoverId: "aria_rahul", quality: "fair", redFlagCount: 1, source: "app" },
    { id: "q_imran", patientId: "pat_imran", kind: "chronic", triage: "urgent", state: "waiting", checkedInAt: minsAgo(5), scheduledFor: at(18, 30), channel: "audio", reason: "Asthma flare", handoverId: "aria_imran", quality: "poor", redFlagCount: 1, source: "app" },
    { id: "q_sunita", patientId: "pat_sunita", kind: "follow_up", triage: "routine", state: "scheduled", checkedInAt: at(16, 0), scheduledFor: at(16, 0), channel: "video", reason: "Diabetes follow-up", handoverId: "aria_sunita", quality: "good", redFlagCount: 0, source: "app" },
    { id: "q_aarav", patientId: "pat_aarav", kind: "pediatrics", triage: "routine", state: "scheduled", checkedInAt: at(16, 30), scheduledFor: at(16, 30), channel: "video", reason: "Fever and cough", handoverId: "aria_aarav", quality: "good", redFlagCount: 0, source: "app" },
    { id: "q_meena", patientId: "pat_meena", kind: "new", triage: "routine", state: "scheduled", checkedInAt: at(17, 0), scheduledFor: at(17, 0), channel: "chat", reason: "Headache, new patient", handoverId: "aria_meena", quality: "good", redFlagCount: 0, source: "app" },
    { id: "q_lakshmi_done", patientId: "pat_lakshmi", kind: "follow_up", triage: "routine", state: "completed", checkedInAt: at(9, 30), scheduledFor: at(9, 30), channel: "video", reason: "Joint pain review", quality: "good", redFlagCount: 0, source: "app" },
  ];
}

export interface Encounter {
  id: string;
  patientId: string;
  startedAt: string;
  chiefComplaint: string;
  assessment: string;
  notes: string;
  prescriptions: Array<{ drug: string; strength?: string; dose?: string; frequency?: string; durationDays?: number }>;
  labs: Array<{ test: string; priority: "routine" | "urgent" }>;
  followUp: { inDays: number; channel: Channel; instructions?: string } | null;
  doctor: string;
}

export const ENCOUNTERS: Encounter[] = [
  { id: "enc_rahul_prev", patientId: "pat_rahul", startedAt: "2026-09-12T06:00:00.000Z", chiefComplaint: "Hypertension review", assessment: "Stable hypertension. BP 150/92. Continue current therapy.", notes: "Advised salt reduction and home BP monitoring. Amlodipine continued. Review in 3 months or earlier if symptomatic.", prescriptions: [{ drug: "Amlodipine", strength: "5mg", dose: "1 tablet", frequency: "Once daily", durationDays: 90 }], labs: [], followUp: { inDays: 90, channel: "video", instructions: "Routine BP review" }, doctor: DOCTOR.name },
  { id: "enc_sunita_prev", patientId: "pat_sunita", startedAt: "2026-09-20T05:30:00.000Z", chiefComplaint: "Diabetes review", assessment: "HbA1c 7.8%. Suboptimal control. Reinforced diet and adherence.", notes: "Discussed carbohydrate portions and foot care. Continued Metformin. Ordered HbA1c and lipid profile.", prescriptions: [{ drug: "Metformin", strength: "500mg", dose: "1 tablet", frequency: "Twice daily", durationDays: 60 }], labs: [{ test: "HbA1c", priority: "routine" }, { test: "Fasting lipid profile", priority: "routine" }], followUp: { inDays: 60, channel: "video", instructions: "Review labs" }, doctor: DOCTOR.name },
  { id: "enc_lakshmi_today", patientId: "pat_lakshmi", startedAt: "2026-10-07T04:00:00.000Z", chiefComplaint: "Joint pain review", assessment: "Osteoarthritis, knees. Pain controlled on paracetamol. BP 136/84.", notes: "Continue Telmisartan. Physiotherapy exercises reviewed. Review in 8 weeks.", prescriptions: [{ drug: "Paracetamol", strength: "500mg", dose: "1 tablet", frequency: "Twice daily", durationDays: 30 }], labs: [], followUp: { inDays: 56, channel: "video" }, doctor: DOCTOR.name },
];

export interface AuditEvent {
  id: string;
  actorName: string;
  action: string;
  target: string;
  reason?: string;
  at: string;
}

export function seedAudit(now: Date): AuditEvent[] {
  const ago = (m: number) => new Date(now.getTime() - m * 60000).toISOString();
  return [
    { id: "a1", actorName: DOCTOR.name, action: "Viewed chart", target: "Lakshmi Bai", reason: "Scheduled follow-up", at: ago(40) },
    { id: "a2", actorName: DOCTOR.name, action: "Signed in", target: "Doctor portal", reason: "Start of clinic", at: ago(42) },
  ];
}

export const DOCTORS = [
  { id: "doc_ananya", name: "Dr. Ananya Rao", spec: "General Physician", exp: 11, rating: 4.8, fee: 249, online: true, langs: "Hindi, English" },
  { id: "doc_imran", name: "Dr. Imran Sheikh", spec: "Orthopaedics", exp: 14, rating: 4.7, fee: 399, online: true, langs: "Hindi, Urdu, English" },
  { id: "doc_kavya", name: "Dr. Kavya Menon", spec: "Internal Medicine", exp: 8, rating: 4.9, fee: 299, online: false, langs: "Malayalam, English" },
];

export const KIND: Record<Kind, string> = { new: "New patient", follow_up: "Follow-up", pediatrics: "Pediatrics", chronic: "Chronic care", emergency: "Emergency" };
export const TRIAGE: Record<Triage, string> = { emergency: "Emergency", urgent: "Urgent", routine: "Routine" };
export const CHANNEL: Record<Channel, string> = { video: "Video", audio: "Audio", chat: "Chat" };
export const CONNECTION: Record<Quality, string> = { good: "Strong network", fair: "Fair network", poor: "Weak network" };

export const minutesSince = (iso: string, now = Date.now()) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
export const timeAgo = (iso: string) => { const m = minutesSince(iso); if (m < 1) return "just now"; if (m < 60) return `${m}m ago`; return `${Math.floor(m / 60)}h ago`; };
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
