import pg from "pg";
import type { ComplaintRecord, MemoryStore, NewComplaint, RecallMatch } from "./types.js";
import type { Region } from "../clinical/regions.js";

/**
 * Postgres-backed memory. The recall query (`embedding <=> $vector`) is identical
 * on Supabase pgvector and CockroachDB; only the DDL differs, so `migrate()` takes
 * a flavour. Patient ids are TEXT so the portal's ids (pat_rahul) are used directly.
 */
export type PgFlavour = "pgvector" | "cockroach";

const DDL_COMMON = `
CREATE TABLE IF NOT EXISTS visit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel     TEXT NOT NULL DEFAULT 'alexa'
);
CREATE INDEX IF NOT EXISTS visit_patient_time_idx ON visit (patient_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS complaint (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    TEXT NOT NULL,
  visit_id      UUID NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
  raw_text      TEXT NOT NULL,
  body_region   TEXT NOT NULL,
  region_source TEXT NOT NULL DEFAULT 'lexicon',
  region_inherited_from UUID,
  embedding     VECTOR(1024),
  embed_model   TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS complaint_patient_time_idx ON complaint (patient_id, occurred_at DESC);
`;

const DDL_INDEX: Record<PgFlavour, string> = {
  pgvector: `CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX IF NOT EXISTS complaint_embedding_idx ON complaint USING hnsw (embedding vector_cosine_ops);`,
  cockroach: `CREATE VECTOR INDEX IF NOT EXISTS complaint_embedding_idx ON complaint (patient_id, embedding vector_cosine_ops);`,
};

interface Row {
  id: string;
  visit_id: string;
  patient_id: string;
  raw_text: string;
  body_region: string;
  occurred_at: Date;
  distance?: string | number | null;
}

function toRecord(r: Row): ComplaintRecord {
  return {
    id: r.id,
    visitId: r.visit_id,
    patientId: r.patient_id,
    rawText: r.raw_text,
    bodyRegion: r.body_region as Region,
    occurredAt: new Date(r.occurred_at),
  };
}

export class PgStore implements MemoryStore {
  private pool: pg.Pool;

  constructor(connectionString: string, private flavour: PgFlavour = "pgvector") {
    this.pool = new pg.Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000 });
    this.pool.on("error", (err) => console.error("[memory] idle client error:", err.message));
  }

  async migrate(): Promise<void> {
    const ext = this.flavour === "pgvector" ? "CREATE EXTENSION IF NOT EXISTS vector;\n" : "";
    await this.pool.query(ext + DDL_COMMON + DDL_INDEX[this.flavour]);
  }

  async currentVisit(patientId: string, now: Date): Promise<string> {
    const open = await this.pool.query<{ id: string }>(
      `SELECT id FROM visit WHERE patient_id = $1 AND occurred_at > $2::timestamptz - INTERVAL '2 hours'
       ORDER BY occurred_at DESC LIMIT 1`,
      [patientId, now],
    );
    if (open.rows[0]) return open.rows[0].id;
    const created = await this.pool.query<{ id: string }>(
      `INSERT INTO visit (patient_id, occurred_at) VALUES ($1, $2) RETURNING id`,
      [patientId, now],
    );
    return created.rows[0].id;
  }

  async insertComplaint(c: NewComplaint): Promise<string> {
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO complaint (patient_id, visit_id, raw_text, body_region, region_source, region_inherited_from, embedding, embed_model, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        c.patientId, c.visitId, c.rawText, c.bodyRegion, c.regionSource, c.regionInheritedFrom,
        c.embedding ? `[${c.embedding.join(",")}]` : null, c.embedModel, c.occurredAt,
      ],
    );
    return res.rows[0].id;
  }

  async search(opts: { patientId: string; embedding: number[]; limit: number; threshold: number; before?: Date }): Promise<RecallMatch[]> {
    const res = await this.pool.query<Row>(
      `SELECT id, visit_id, patient_id, raw_text, body_region, occurred_at, embedding <=> $2 AS distance
         FROM complaint
        WHERE patient_id = $1 AND ($3::timestamptz IS NULL OR occurred_at < $3::timestamptz)
        ORDER BY embedding <=> $2
        LIMIT $4`,
      [opts.patientId, `[${opts.embedding.join(",")}]`, opts.before ?? null, opts.limit],
    );
    return res.rows
      .map((r) => ({ ...toRecord(r), distance: r.distance == null ? Infinity : Number(r.distance) }))
      .filter((m) => Number.isFinite(m.distance) && m.distance <= opts.threshold);
  }

  async history(patientId: string): Promise<ComplaintRecord[]> {
    const res = await this.pool.query<Row>(
      `SELECT id, visit_id, patient_id, raw_text, body_region, occurred_at FROM complaint WHERE patient_id = $1 ORDER BY occurred_at ASC`,
      [patientId],
    );
    return res.rows.map(toRecord);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
