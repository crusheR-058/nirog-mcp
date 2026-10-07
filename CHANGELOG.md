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

## 2026-10-12 (Day 6, done 7 Oct)
- Household consent tokens (HMAC, patient-scoped) verified by the MCP SDK's bearer middleware; every tool
  checks the caller's scope. `pnpm consent-token` mints them. Unauthenticated requests get 401.
- Agent Skill at skills/nirog/SKILL.md.

## 2026-10-13 (Day 7, in progress)
- Dockerfile (multi-stage, 68 MB compressed), image pushed to ECR in ap-south-1.
- deploy/iam.sh (two roles) and deploy/apprunner.sh (build, push, create/update, wait, health check).
  IAM role creation needs an admin to run iam.sh.

## 2026-10-15 to 17 (Days 9 to 11, done 7 Oct)
- Simulated Alexa+ experience as a Three.js scroll world (demo/): five scenes on a camera path with dwell,
  pinned copy per scene, a route rail, keyboard navigation, scene gating, bloom on desktop, reduced 3D on phones.
- Live last scene: browser speech in and out, the MCP SDK client over Streamable HTTP, consent token and patient
  selection, intent routing to the three tools, automatic escalation when triage is not routine, and a
  "Behind the voice" trace of every tool call. The 3D voice ring breathes with the conversation and turns red
  on an emergency.
- Server serves the built page at /demo; Dockerfile builds it.

## 2026-10-07 (demo redesign)
- Replaced the camera-flight demo with a liquid-glass deck after reviewing the reference folder: fixed 3D
  field (refractive crystals, particle sphere reacting to pointer and conversation phase, wireframe shards),
  glass bento tiles with live tallies, an SVG memory graph with real distances, handover and red-flag
  sections, a persistent voice bar with suggestion chips, left icon rail, Phosphor icons, Manrope/Inter type.

## 2026-10-07 (clinic features)
- Ported every surface of nirog-memory.vercel.app into the deck: care loop and trust principles, patient case
  file with a client-side SBAR builder and recurrence rule, doctors directory with a getUserMedia call room,
  and the doctor portal (dashboard, queue, patients, chart, consult form that files encounters, trust log,
  settings). Alexa+ escalations enqueue consults; MCP calls, consults and alerts are audited in the trust log.

## 2026-10-07 (doctor sign-in)
- Dedicated doctor page at #/doctor: Google Identity Services sign-in verified server-side, one-time doctor
  verification (registration number + clinic invite code against an allowlist), signed 30-day doctor session,
  remembered on the device, sign-out. /auth/config, /auth/doctor/session, /auth/doctor/verify routes.
  Portal window shows the signed-in doctor; verification and sign-in are written to the trust log.
