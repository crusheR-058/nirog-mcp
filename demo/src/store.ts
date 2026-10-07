import { create } from "zustand";

export type Phase = "idle" | "listening" | "thinking" | "speaking";
export type Level = "routine" | "urgent" | "emergency";

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
  /** Which page section is in view (0 hero … 5 talk). Drives the 3D field. */
  section: number;
  /** The last assistant line, for the reply card above the voice bar. */
  lastReply: { text: string; level: Level; at: number } | null;
  /** Live tallies for the deck tiles. */
  consults: number;
  alerts: number;
  setPhase: (p: Phase) => void;
  setLevel: (l: Level) => void;
  setSection: (s: number) => void;
  addTurn: (t: Omit<Turn, "id">) => void;
  addTrace: (t: Omit<Trace, "id">) => number;
  finishTrace: (id: number, patch: Partial<Trace>) => void;
  setComplete: (c: boolean) => void;
  bump: (k: "consults" | "alerts") => void;
  reset: () => void;
}

let seq = 1;

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
  reset: () => set({ phase: "idle", level: "routine", turns: [], traces: [], complete: false, lastReply: null, consults: 0, alerts: 0 }),
}));
