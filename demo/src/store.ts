import { create } from "zustand";

export type Phase = "idle" | "listening" | "thinking" | "speaking";

export interface Turn {
  id: number;
  role: "user" | "assistant";
  text: string;
  level?: "routine" | "urgent" | "emergency";
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
  level: "routine" | "urgent" | "emergency";
  turns: Turn[];
  traces: Trace[];
  complete: boolean;
  /** drei's scroll container, so chrome outside the canvas can drive the flight. */
  scrollEl: HTMLElement | null;
  setScrollEl: (el: HTMLElement | null) => void;
  /** Nearest scene to the camera, and whether we are still at the very start. Set by the camera rig. */
  current: number;
  atStart: boolean;
  setFlight: (current: number, atStart: boolean) => void;
  setPhase: (p: Phase) => void;
  setLevel: (l: DemoState["level"]) => void;
  addTurn: (t: Omit<Turn, "id">) => void;
  addTrace: (t: Omit<Trace, "id">) => number;
  finishTrace: (id: number, patch: Partial<Trace>) => void;
  setComplete: (c: boolean) => void;
  reset: () => void;
}

let seq = 1;

/** Shared between the HTML panel and the 3D ring, so the ring breathes with the conversation. */
export const useDemo = create<DemoState>((set) => ({
  phase: "idle",
  level: "routine",
  turns: [],
  traces: [],
  complete: false,
  scrollEl: null,
  setScrollEl: (scrollEl) => set({ scrollEl }),
  current: 0,
  atStart: true,
  setFlight: (current, atStart) => set((s) => (s.current === current && s.atStart === atStart ? s : { current, atStart })),
  setPhase: (phase) => set({ phase }),
  setLevel: (level) => set({ level }),
  addTurn: (t) => set((s) => ({ turns: [...s.turns, { ...t, id: seq++ }] })),
  addTrace: (t) => {
    const id = seq++;
    set((s) => ({ traces: [{ ...t, id }, ...s.traces].slice(0, 12) }));
    return id;
  },
  finishTrace: (id, patch) => set((s) => ({ traces: s.traces.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  setComplete: (complete) => set({ complete }),
  reset: () => set({ phase: "idle", level: "routine", turns: [], traces: [], complete: false }),
}));
