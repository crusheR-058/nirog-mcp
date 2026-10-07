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
