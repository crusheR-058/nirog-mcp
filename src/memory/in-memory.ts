import { randomUUID } from "node:crypto";
import { cosineDistance } from "./embed.js";
import type { ComplaintRecord, MemoryStore, NewComplaint, RecallMatch } from "./types.js";

interface StoredComplaint extends ComplaintRecord {
  embedding: number[] | null;
}

interface Visit {
  id: string;
  patientId: string;
  occurredAt: Date;
}

const TWO_HOURS = 2 * 3_600_000;

/** Memory store for tests and the no-database demo. Same semantics as the Postgres store. */
export class InMemoryStore implements MemoryStore {
  private visits: Visit[] = [];
  private complaints: StoredComplaint[] = [];

  async currentVisit(patientId: string, now: Date): Promise<string> {
    const open = this.visits
      .filter((v) => v.patientId === patientId && now.getTime() - v.occurredAt.getTime() < TWO_HOURS)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
    if (open) return open.id;
    const id = randomUUID();
    this.visits.push({ id, patientId, occurredAt: now });
    return id;
  }

  async insertComplaint(c: NewComplaint): Promise<string> {
    const id = randomUUID();
    this.complaints.push({
      id,
      visitId: c.visitId,
      patientId: c.patientId,
      rawText: c.rawText,
      bodyRegion: c.bodyRegion,
      occurredAt: c.occurredAt,
      embedding: c.embedding,
    });
    return id;
  }

  async search(opts: { patientId: string; embedding: number[]; limit: number; threshold: number; before?: Date }): Promise<RecallMatch[]> {
    return this.complaints
      .filter((c) => c.patientId === opts.patientId && (!opts.before || c.occurredAt < opts.before))
      .map((c) => ({ ...c, distance: c.embedding ? cosineDistance(opts.embedding, c.embedding) : Infinity }))
      .filter((m) => Number.isFinite(m.distance) && m.distance <= opts.threshold)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, opts.limit)
      .map(({ embedding: _e, ...m }) => m);
  }

  async history(patientId: string): Promise<ComplaintRecord[]> {
    return this.complaints
      .filter((c) => c.patientId === patientId)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .map(({ embedding: _e, ...c }) => c);
  }
}
