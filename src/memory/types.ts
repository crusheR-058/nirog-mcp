import type { Region } from "../clinical/regions.js";

/** One thing a patient said, as stored. Mirrors Nirog's `complaint` row. */
export interface ComplaintRecord {
  id: string;
  visitId: string;
  patientId: string;
  rawText: string;
  bodyRegion: Region;
  occurredAt: Date;
}

export interface RecallMatch extends ComplaintRecord {
  /** Cosine distance from the query vector. Lower is closer. */
  distance: number;
}

export interface NewComplaint {
  patientId: string;
  visitId: string;
  rawText: string;
  bodyRegion: Region;
  regionSource: "lexicon" | "inherited" | "none";
  regionInheritedFrom: string | null;
  embedding: number[] | null;
  embedModel: string | null;
  occurredAt: Date;
}

/**
 * The memory store contract. Two implementations: an in-memory store for tests
 * and demos, and a Postgres store that runs on Supabase pgvector or CockroachDB.
 */
export interface MemoryStore {
  /** Open visit within the last two hours, or a new one. */
  currentVisit(patientId: string, now: Date): Promise<string>;
  insertComplaint(c: NewComplaint): Promise<string>;
  /** Nearest prior complaints for this patient, closest first, already thresholded. */
  search(opts: { patientId: string; embedding: number[]; limit: number; threshold: number; before?: Date }): Promise<RecallMatch[]>;
  /** Full history, oldest first. Input to the recurrence rule. */
  history(patientId: string): Promise<ComplaintRecord[]>;
}
