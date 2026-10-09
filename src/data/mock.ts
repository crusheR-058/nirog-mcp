import { randomUUID } from "node:crypto";
import type { AuditRecord, ConsultRecord, ConsultRequest, DoseRecord, EncounterRecord, NirogData, PatientRecord } from "./types.js";

/** Demo fixtures mirroring the Nirog doctor portal seed, so demos work with no database. */
export const MOCK_PATIENTS: PatientRecord[] = [
  { id: "pat_rahul", fullName: "Rahul Yadav", preferredLanguage: "Hindi", allergies: [], conditions: ["Hypertension"], currentMedications: ["Amlodipine 5mg OD"] },
  { id: "pat_sunita", fullName: "Sunita Devi", preferredLanguage: "Hindi", allergies: ["Sulfa drugs"], conditions: ["Type 2 Diabetes"], currentMedications: ["Metformin 500mg BD"] },
  { id: "pat_meena", fullName: "Meena Singh", preferredLanguage: "Hindi", allergies: [], conditions: [], currentMedications: [] },
  { id: "pat_aarav", fullName: "Aarav Yadav", preferredLanguage: "Hindi", allergies: [], conditions: [], currentMedications: [] },
  { id: "pat_imran", fullName: "Imran Khan", preferredLanguage: "Hindi", allergies: ["Penicillin"], conditions: ["Asthma"], currentMedications: ["Salbutamol inhaler PRN"] },
  { id: "pat_lakshmi", fullName: "Lakshmi Bai", preferredLanguage: "Hindi", allergies: [], conditions: ["Osteoarthritis", "Hypertension"], currentMedications: ["Telmisartan 40mg OD"] },
];

export const MOCK_ENCOUNTERS: EncounterRecord[] = [
  {
    id: "enc_rahul_prev",
    patientId: "pat_rahul",
    startedAt: "2026-09-12T06:00:00.000Z",
    endedAt: "2026-09-12T06:14:00.000Z",
    chiefComplaint: "Hypertension review",
    assessment: "Stable hypertension. BP 150/92. Continue current therapy.",
    clinicalNotes: "Advised salt reduction and home BP monitoring. Amlodipine continued. Review in 3 months or earlier if symptomatic.",
    prescriptions: [{ id: "rx_prev_1", drug: "Amlodipine", strength: "5mg", form: "Tablet", dose: "1 tablet", frequency: "Once daily", durationDays: 90 }],
    labRequests: [],
    followUp: { inDays: 90, channel: "video", instructions: "Routine BP review" },
  },
  {
    id: "enc_sunita_prev",
    patientId: "pat_sunita",
    startedAt: "2026-09-20T05:30:00.000Z",
    endedAt: "2026-09-20T05:47:00.000Z",
    chiefComplaint: "Diabetes review",
    assessment: "HbA1c 7.8%. Suboptimal control. Reinforced diet and adherence.",
    clinicalNotes: "Discussed carbohydrate portions and foot care. Continued Metformin. Ordered HbA1c and lipid profile.",
    prescriptions: [{ id: "rx_prev_2", drug: "Metformin", strength: "500mg", form: "Tablet", dose: "1 tablet", frequency: "Twice daily", durationDays: 60 }],
    labRequests: [
      { id: "lab_prev_1", test: "HbA1c", priority: "routine" },
      { id: "lab_prev_2", test: "Fasting lipid profile", priority: "routine" },
    ],
    followUp: { inDays: 60, channel: "video", instructions: "Review labs" },
  },
  {
    id: "enc_lakshmi_prev",
    patientId: "pat_lakshmi",
    startedAt: "2026-10-01T04:00:00.000Z",
    endedAt: "2026-10-01T04:12:00.000Z",
    chiefComplaint: "Joint pain review",
    assessment: "Osteoarthritis, knees. Pain controlled. BP 136/84.",
    clinicalNotes: "Continue Telmisartan. Physiotherapy exercises reviewed.",
    prescriptions: [
      { id: "rx_prev_3", drug: "Telmisartan", strength: "40mg", form: "Tablet", dose: "1 tablet", frequency: "Once daily", durationDays: 60 },
      { id: "rx_prev_4", drug: "Paracetamol", strength: "500mg", form: "Tablet", dose: "1 tablet", frequency: "Twice daily", durationDays: 30 },
    ],
    labRequests: [],
    followUp: { inDays: 56, channel: "video" },
  },
];

export class MockData implements NirogData {
  /** Consults requested through this source, for tests, the demo log and the clinic API. */
  consults: Array<ConsultRequest & { id: string }> = [];
  alerts: Array<{ patientId: string; message: string }> = [];
  audit: AuditRecord[] = [];
  doses: DoseRecord[] = [];

  constructor(
    private patients: PatientRecord[] = MOCK_PATIENTS,
    private encounters: EncounterRecord[] = MOCK_ENCOUNTERS,
  ) {}

  async getPatient(patientId: string) {
    return this.patients.find((p) => p.id === patientId) ?? null;
  }

  async listPatients() {
    return this.patients;
  }

  async getLatestEncounter(patientId: string) {
    return (
      this.encounters
        .filter((e) => e.patientId === patientId && e.endedAt)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null
    );
  }

  async requestConsult(req: ConsultRequest) {
    const id = `q_${randomUUID().slice(0, 8)}`;
    this.consults.push({ ...req, id });
    return id;
  }

  async listConsults(): Promise<ConsultRecord[]> {
    return [...this.consults].reverse().map((c) => ({ id: c.id, patientId: c.patientId, triage: c.triage, reason: c.reason, at: c.now.toISOString() }));
  }

  async alertCaregiver(req: { patientId: string; level: "emergency" | "urgent"; message: string }) {
    // Demo: every patient has a family contact on the account's phone. Real SMS is out of scope.
    this.alerts.push({ patientId: req.patientId, message: req.message });
    return "family contact on the registered phone (SMS stub)";
  }

  async recordAudit(e: { actorName: string; action: string; target: string; reason?: string }) {
    this.audit.unshift({ ...e, id: `a_${randomUUID().slice(0, 8)}`, at: new Date().toISOString() });
    if (this.audit.length > 500) this.audit.length = 500;
  }

  async listAudit(limit: number) {
    return this.audit.slice(0, limit);
  }

  async logDose(d: { patientId: string; drug: string; slot: string; takenAt: Date }) {
    const id = `d_${randomUUID().slice(0, 8)}`;
    this.doses.push({ id, patientId: d.patientId, drug: d.drug, slot: d.slot, takenAt: d.takenAt.toISOString() });
    return id;
  }

  async listDoses(patientId: string, since: Date) {
    return this.doses.filter((d) => d.patientId === patientId && new Date(d.takenAt) >= since);
  }
}
