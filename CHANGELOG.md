# Changelog

All work in this repository was created during the Build, Ship, Shape: Amazon Developer Hackathon
submission window (31 Aug to 23 Oct 2026). Nirog's doctor portal and patient app pre-date the
hackathon; this MCP server and Agent Skill are new.

## 2026-10-07
- Scaffolded `nirog-mcp`: TypeScript, Express, MCP SDK with stateless Streamable HTTP transport.
- Added `ping` tool and `/health` endpoint.
- Verified Bedrock access from the AWS account: Claude Haiku 4.5 via global inference profile and
  Titan Embed v2 (1024 dims) both invoke successfully in ap-south-1. Recorded in `.env.example`.
- Published repo at https://github.com/crusheR-058/nirog-mcp.

## 2026-10-08 (Day 2, done early)
- Data layer: `NirogData` contract with a mock source (demo patients) and a Supabase source reading the
  Nirog doctor-portal schema (`Patient`, `Encounter`).
- `get_care_plan` tool: medicines with times of day derived from doctor shorthand (OD/BD/TDS/PRN), days
  remaining, pending tests, follow-up due date with overdue detection, and a `spoken` sentence for voice.
- Unit tests for the plan builder; live HTTP smoke test passes for found, empty, and unknown patients.

## 2026-10-08 (Day 3, done early)
- Discovered the live Nirog memory API is down: its CockroachDB cluster hit the monthly Request Unit limit.
  The MCP server now owns its memory layer instead of calling that API.
- Ported Nirog's body-region lexicon, region inheritance, recurrence rule, and offline/Titan embedder
  (src/clinical, src/memory). Patient ids are the portal ids, so no UUID mapping is needed.
- `MemoryStore` contract with an in-memory store (seeded demo history) and a Postgres store whose recall query
  runs unchanged on Supabase pgvector and CockroachDB.
- `start_intake` tool. Rahul's demo line "the ache is back again" recalls the July complaint at distance 0.292,
  inherits the lower-back region, and raises the recurrent flag, matching the figures in the Nirog README.
- Chose Supabase pgvector for live memory. Added `pnpm db:migrate` (creates tables, seeds the demo history,
  idempotent) and `pnpm verify` (connectivity plus a live recall check).

## 2026-10-10 (Day 4, done 7 Oct)
- ARIA on Bedrock (src/ai): GPT-OSS 120B asks the next intake question with the record, recall line, and
  recurrence flag as context, three-question budget, then hands over with a plain-language summary.
  Prompt adapted from Nirog's /api/aria/chat. Deterministic offline fallback for tests (ARIA_MODEL=off).
- `start_intake` accepts `transcript` for multi-turn intakes and returns `aria` with reply, complete, summary,
  and advisory red flags. Live turns took 0.7 to 1.9 s; the chest-pain-with-sweating probe was flagged.

## 2026-10-11 (Day 5, done 7 Oct)
- Triage rules (src/clinical/triage.ts): 15 table-driven red-flag rules with negation handling and
  condition-aware rules (asthma, diabetes). Pure, unit-tested, no model involved.
- `report_red_flag` tool: emergency advice (108), queues an unassigned QueueEntry for the on-call doctor,
  alerts the family contact (audit row; SMS stub). `start_intake` now runs triage on every complaint and
  an emergency overrides the spoken line.
- Data contract gained `requestConsult` and `alertCaregiver` for mock and Supabase.
