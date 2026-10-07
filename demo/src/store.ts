import { create } from "zustand";
import { buildQueue, ENCOUNTERS, seedAudit, type AuditEvent, type Encounter, type QueueItem } from "./clinic/data";

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
  lastReply: { text: string; level: Level; at: number } | null;
  consults: number;
  alerts: number;
  /** True once the server reports memory as degraded; the case file says so. */
  memoryDegraded: boolean;

  /* clinic */
  queue: QueueItem[];
  audit: AuditEvent[];
  encounters: Encounter[];
  onCall: boolean;
  portalTab: PortalTab;
  activePatientId: string;
  consultQueueId: string | null;
  callDoctorId: string | null;

  setPhase: (p: Phase) => void;
  setLevel: (l: Level) => void;
  setSection: (s: number) => void;
  addTurn: (t: Omit<Turn, "id">) => void;
  addTrace: (t: Omit<Trace, "id">) => number;
  finishTrace: (id: number, patch: Partial<Trace>) => void;
  setComplete: (c: boolean) => void;
  bump: (k: "consults" | "alerts") => void;
  setMemoryDegraded: (d: boolean) => void;
  addQueue: (q: QueueItem) => void;
  setQueueState: (id: string, state: QueueItem["state"]) => void;
  addAudit: (e: Omit<AuditEvent, "id" | "at">) => void;
  fileEncounter: (e: Encounter) => void;
  setOnCall: (v: boolean) => void;
  setPortalTab: (t: PortalTab) => void;
  openChart: (patientId: string) => void;
  startConsult: (queueId: string) => void;
  endConsult: () => void;
  setCallDoctor: (id: string | null) => void;
  reset: () => void;
}

let seq = 1;
const now = new Date();

export const useDemo = create<DemoState>((set) => ({
  phase: "idle",
  level: "routine",
  turns: [],
  traces: [],
  complete: false,
  section: 0,
  lastReply: null,
  consults: 0,
  alerts: 0,
  memoryDegraded: false,
  queue: buildQueue(now),
  audit: seedAudit(now),
  encounters: ENCOUNTERS,
  onCall: false,
  portalTab: "dashboard",
  activePatientId: "pat_rahul",
  consultQueueId: null,
  callDoctorId: null,

  setPhase: (phase) => set({ phase }),
  setLevel: (level) => set({ level }),
  setSection: (section) => set((s) => (s.section === section ? s : { section })),
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
  addAudit: (e) => set((s) => ({ audit: [{ ...e, id: `a${seq++}`, at: new Date().toISOString() }, ...s.audit].slice(0, 40) })),
  fileEncounter: (e) => set((s) => ({ encounters: [e, ...s.encounters] })),
  setOnCall: (onCall) => set({ onCall }),
  setPortalTab: (portalTab) => set({ portalTab }),
  openChart: (activePatientId) => set({ activePatientId, portalTab: "chart" }),
  startConsult: (consultQueueId) =>
    set((s) => ({
      consultQueueId,
      portalTab: "consult",
      activePatientId: s.queue.find((q) => q.id === consultQueueId)?.patientId ?? s.activePatientId,
      queue: s.queue.map((q) => (q.id === consultQueueId ? { ...q, state: "in_consult" } : q)),
    })),
  endConsult: () => set({ consultQueueId: null }),
  setCallDoctor: (callDoctorId) => set({ callDoctorId }),
  reset: () => set({ phase: "idle", level: "routine", turns: [], traces: [], complete: false, lastReply: null, consults: 0, alerts: 0, memoryDegraded: false }),
}));
