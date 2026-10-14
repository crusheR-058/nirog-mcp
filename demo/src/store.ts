import { create } from "zustand";
import { buildQueue, DOCTOR, DOCTORS, ENCOUNTERS, HANDOVERS, PATIENTS, seedAudit, toneFor, type AuditEvent, type Doctor, type Encounter, type Handover, type Patient, type QueueItem } from "./clinic/data";
import { demoAccess } from "./mcp";

export type Phase = "idle" | "listening" | "thinking" | "speaking";
export type Level = "routine" | "urgent" | "emergency";
export type PortalTab = "dashboard" | "patients" | "chart" | "consult" | "trust" | "settings";

export interface Turn {
  id: number;
  role: "user" | "assistant";
  text: string;
  level?: Level;
}

export interface Trace {
  id: number;
  tool: string;
  args: Record<string, unknown>;
  ms?: number;
  summary?: string[];
  error?: string;
}

interface DemoState {
  phase: Phase;
  level: Level;
  turns: Turn[];
  traces: Trace[];
  complete: boolean;
  /** Index of the page section in view. Drives the rail and the 3D field. */
  section: number;
  /** "deck" for the main page, "doctor" for the dedicated doctor page. The field keeps out of the way on the latter. */
  route: "deck" | "doctor";
  lastReply: { text: string; level: Level; at: number } | null;
  consults: number;
  alerts: number;
  /** True once the server reports memory as degraded; the case file says so. */
  memoryDegraded: boolean;
  /** True while /api/clinic/live answers. Then the trust log and Alexa+ consults come from the server, not this tab. */
  live: boolean;
  serverAudit: AuditEvent[];

  /* clinic: the built-in demo until the server's own clinic arrives, then the server's */
  /** True once /api/clinic/live carries the whole clinic (a server with a database). Then every write goes to the server. */
  clinicLive: boolean;
  patients: Patient[];
  handovers: Handover[];
  doctors: Doctor[];
  queue: QueueItem[];
  audit: AuditEvent[];
  encounters: Encounter[];
  onCall: boolean;
  portalTab: PortalTab;
  activePatientId: string;
  consultQueueId: string | null;
  callDoctorId: string | null;
  /** The signed-in doctor on the dedicated page, or null for the embedded demo window. */
  doctor: { name: string; email: string; specialty: string; picture?: string; registrationNo: string } | null;

  setPhase: (p: Phase) => void;
  setLevel: (l: Level) => void;
  setSection: (s: number) => void;
  setRoute: (r: "deck" | "doctor") => void;
  addTurn: (t: Omit<Turn, "id">) => void;
  addTrace: (t: Omit<Trace, "id">) => number;
  finishTrace: (id: number, patch: Partial<Trace>) => void;
  setComplete: (c: boolean) => void;
  bump: (k: "consults" | "alerts") => void;
  setMemoryDegraded: (d: boolean) => void;
  addQueue: (q: QueueItem) => void;
  setQueueState: (id: string, state: QueueItem["state"]) => void;
  addAudit: (e: Omit<AuditEvent, "id" | "at">) => void;
  /** File a consultation. Returns an error message, or null once it is on record. */
  submitEncounter: (e: EncounterInput) => Promise<string | null>;
  setOnCall: (v: boolean) => void;
  setPortalTab: (t: PortalTab) => void;
  openChart: (patientId: string) => void;
  startConsult: (queueId: string) => void;
  endConsult: () => void;
  setCallDoctor: (id: string | null) => void;
  setDoctor: (d: DemoState["doctor"]) => void;
  applyLive: (feed: LiveFeed) => void;
  reset: () => void;
}

export interface LiveFeed {
  consults: Array<{ id: string; patientId: string; triage: Level; reason: string; at: string }>;
  audit: AuditEvent[];
  clinic?: { patients: Array<Omit<Patient, "tone">>; doctors: Doctor[]; handovers: Handover[]; queue: QueueItem[]; encounters: Encounter[] } | null;
}

export interface EncounterInput {
  consultId: string | null;
  patientId: string;
  chiefComplaint: string;
  assessment: string;
  notes: string;
  prescriptions: Encounter["prescriptions"];
  labs: Encounter["labs"];
  followUp: Encounter["followUp"];
  ariaAccepted: boolean;
}

const SESSION_KEY = "nirog-doctor-session";
/** The signed-in doctor's session, or on the public demo the demo doctor's. */
async function authHeader(): Promise<Record<string, string>> {
  let t: string | null = null;
  try {
    t = localStorage.getItem(SESSION_KEY);
  } catch {
    /* private mode */
  }
  t ??= (await demoAccess())?.doctorSession ?? null;
  return t ? { authorization: `Bearer ${t}` } : {};
}

async function clinicPost(path: string, body: unknown): Promise<string | null> {
  try {
    const r = await fetch(`${location.origin}/api/clinic${path}`, { method: "POST", headers: { "content-type": "application/json", ...(await authHeader()) }, body: JSON.stringify(body) });
    if (r.ok) return null;
    return ((await r.json().catch(() => ({}))) as { error?: string }).error ?? `The server refused it (${r.status}).`;
  } catch {
    return "The clinic server cannot be reached. Nothing was saved.";
  } finally {
    void refreshLive();
  }
}

/** Lookups for components that already subscribe to the store, so they re-render when it changes. */
export const patientById = (id: string) => useDemo.getState().patients.find((p) => p.id === id);
/** The consult's own handover when it has one, otherwise the patient's latest. */
export function handoverFor(patientId: string, handoverId?: string): Handover | undefined {
  const all = useDemo.getState().handovers;
  return (handoverId ? all.find((h) => h.id === handoverId) : undefined) ?? all.find((h) => h.patientId === patientId);
}
const doctorName = () => useDemo.getState().doctor?.name ?? DOCTOR.name;

/** Pull the clinic's live state from the server. Falls back to this tab's own copy when it cannot. */
export async function refreshLive(): Promise<void> {
  try {
    const r = await fetch(`${location.origin}/api/clinic/live`, { headers: await authHeader() });
    if (!r.ok) throw new Error(String(r.status));
    useDemo.getState().applyLive((await r.json()) as LiveFeed);
  } catch {
    if (useDemo.getState().live) useDemo.setState({ live: false });
  }
}

async function postAudit(e: Omit<AuditEvent, "id" | "at">): Promise<void> {
  try {
    await fetch(`${location.origin}/api/clinic/audit`, { method: "POST", headers: { "content-type": "application/json", ...(await authHeader()) }, body: JSON.stringify(e) });
  } finally {
    void refreshLive();
  }
}

let seq = 1;
const now = new Date();

export const useDemo = create<DemoState>((set, get) => ({
  phase: "idle",
  level: "routine",
  turns: [],
  traces: [],
  complete: false,
  section: 0,
  route: "deck",
  lastReply: null,
  consults: 0,
  alerts: 0,
  memoryDegraded: false,
  live: false,
  serverAudit: [],
  clinicLive: false,
  patients: PATIENTS,
  handovers: HANDOVERS,
  doctors: DOCTORS,
  queue: buildQueue(now),
  audit: seedAudit(now),
  encounters: ENCOUNTERS,
  onCall: false,
  portalTab: "dashboard",
  activePatientId: "pat_rahul",
  consultQueueId: null,
  callDoctorId: null,
  doctor: null,

  setPhase: (phase) => set({ phase }),
  setLevel: (level) => set({ level }),
  setSection: (section) => set((s) => (s.section === section ? s : { section })),
  setRoute: (route) => set((s) => (s.route === route ? s : { route })),
  addTurn: (t) =>
    set((s) => ({
      turns: [...s.turns, { ...t, id: seq++ }],
      lastReply: t.role === "assistant" ? { text: t.text, level: t.level ?? "routine", at: Date.now() } : s.lastReply,
    })),
  addTrace: (t) => {
    const id = seq++;
    set((s) => ({ traces: [{ ...t, id }, ...s.traces].slice(0, 16) }));
    return id;
  },
  finishTrace: (id, patch) => set((s) => ({ traces: s.traces.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  setComplete: (complete) => set({ complete }),
  bump: (k) => set((s) => ({ [k]: s[k] + 1 })),
  setMemoryDegraded: (memoryDegraded) => set({ memoryDegraded }),
  addQueue: (q) => set((s) => ({ queue: [q, ...s.queue] })),
  setQueueState: (id, state) => set((s) => ({ queue: s.queue.map((q) => (q.id === id ? { ...q, state } : q)) })),
  // With a live server the trust log lives there: post the line and read it back. Otherwise keep it in this tab.
  addAudit: (e) => {
    if (get().live) void postAudit(e);
    else set((s) => ({ audit: [{ ...e, id: `a${seq++}`, at: new Date().toISOString() }, ...s.audit].slice(0, 40) }));
  },
  submitEncounter: async (e) => {
    const p = patientById(e.patientId);
    if (get().clinicLive) return clinicPost("/encounters", e);
    // No database behind this page: the consultation is kept in this tab only.
    set((s) => ({
      encounters: [{ id: `enc_${Date.now()}`, patientId: e.patientId, startedAt: new Date().toISOString(), chiefComplaint: e.chiefComplaint, assessment: e.assessment, notes: e.notes, prescriptions: e.prescriptions, labs: e.labs, followUp: e.followUp, doctor: doctorName() }, ...s.encounters],
      queue: s.queue.map((q) => (q.id === e.consultId ? { ...q, state: "completed" } : q)),
    }));
    get().addAudit({ actorName: doctorName(), action: "Filed encounter", target: p?.fullName ?? e.patientId, reason: `${e.prescriptions.length} prescription${e.prescriptions.length === 1 ? "" : "s"} · ${e.ariaAccepted ? "ARIA handover accepted" : "ARIA handover not accepted"}` });
    return null;
  },
  setOnCall: (onCall) => set({ onCall }),
  setPortalTab: (portalTab) => set({ portalTab }),
  openChart: (activePatientId) => set({ activePatientId, portalTab: "chart" }),
  startConsult: (consultQueueId) => {
    const q = get().queue.find((x) => x.id === consultQueueId);
    const opening = q && q.state !== "in_consult";
    set((s) => ({
      consultQueueId,
      portalTab: "consult",
      activePatientId: q?.patientId ?? s.activePatientId,
      queue: s.queue.map((x) => (x.id === consultQueueId ? { ...x, state: "in_consult" } : x)),
    }));
    if (!q || !opening) return;
    const target = patientById(q.patientId)?.fullName ?? q.patientId;
    // With a database the server records it; otherwise the trust log in this tab (or the server's audit route) does.
    if (get().clinicLive) void clinicPost(`/consults/${encodeURIComponent(q.id)}/start`, { patientName: target, reason: q.reason });
    else get().addAudit({ actorName: doctorName(), action: "Started consult", target, reason: q.reason });
  },
  endConsult: () => set({ consultQueueId: null }),
  setCallDoctor: (callDoctorId) => set({ callDoctorId }),
  setDoctor: (doctor) => set({ doctor }),
  applyLive: (feed) =>
    set((s) => {
      if (feed.clinic) {
        const c = feed.clinic;
        return { live: true, clinicLive: true, serverAudit: feed.audit, patients: c.patients.map((p) => ({ ...p, tone: toneFor(p.id) })), doctors: c.doctors, handovers: c.handovers, queue: c.queue, encounters: c.encounters };
      }
      // Consults that Alexa+ queued through the MCP server join the doctor's queue once; their local state is kept after that.
      const known = new Set(s.queue.map((q) => q.id));
      const fresh: QueueItem[] = feed.consults
        .filter((c) => !known.has(c.id))
        .map((c) => ({ id: c.id, patientId: c.patientId, kind: c.triage === "emergency" ? "emergency" : "new", triage: c.triage, state: "waiting", checkedInAt: c.at, scheduledFor: c.at, channel: "audio", reason: `Alexa+ · ${c.reason}`, quality: "fair", redFlagCount: 1, source: "alexa" }));
      return { live: true, serverAudit: feed.audit, queue: fresh.length ? [...fresh, ...s.queue] : s.queue };
    }),
  reset: () => set({ phase: "idle", level: "routine", turns: [], traces: [], complete: false, lastReply: null, consults: 0, alerts: 0, memoryDegraded: false }),
}));
