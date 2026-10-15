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

## 2026-10-09
- Two new tools: `log_dose_taken` (with a double-dose guard counted on the clinic's clock) and
  `get_family_summary` (counts and patterns, never the patient's words). Six tools in all.
- Hindi: every spoken line in English and Hindi (`src/i18n.ts`); Devanagari and romanised terms in the lexicon;
  Hindi patterns in all the emergency rules, with post-noun negation; spelling folded before matching
  (`src/clinical/normalize.ts`). `language` parameter on every tool.
- Trust log on the server: every tool call, refusal, queued consult and alert is recorded with who, what, why.
- `/api/clinic`: the doctor portal reads the queue and the trust log from the server, guarded by the doctor
  session. A consult escalated by voice in one browser appears in the doctor's queue in another.
- Dry runs against the real model found and fixed four things:
  - the model wrote the doctor's summary and invented a symptom. The handover is now assembled by code from
    verbatim quotes, and the model's summary is discarded;
  - "reply with JSON" drifted into prose. ARIA now answers through a forced Bedrock tool call;
  - the model handed over after one question. The two-question minimum is enforced in code;
  - the handover took its region from the last sentence only ("no, nothing else" became "Unclassified"). It now
    uses the region of the visit. Complaints from the same visit are no longer recalled as memories;
  - the opening turn asked memory's question and the model's together. It now asks only memory's;
  - the model sometimes kept asking past three questions. The budget is enforced in code: after three, hand over.
- Measured: 12 intakes (6 English, 6 Hindi), 42 tool calls, 0 errors; 419 ms best, 632 ms median, 1,113 ms
  worst. Every intake handed over after 2 or 3 questions. One spoken line still joined two questions with
  "and". An earlier run of 44 calls had one turn with no usable model answer; the built-in question covered it
  and the cause was not found. Titan Embed v2 distances recorded, including the cross-language limit.
- Demo: EN/Hindi toggle, five things to try, live trust log and queue. README rewritten. SKILL.md covers all
  five clinical tools. `SUBMISSION/` holds the Devpost text, product feedback, AWS notes and the video script.

## 2026-10-14
- New Supabase project `nirog-alexa` (Mumbai, ap-south-1), created for the hackathon. The server no longer reads
  the old Nirog portal database.
- Clinic schema in `supabase/migrations/0001_clinic.sql`: households with a family contact, patients, doctors,
  ARIA handovers, the consult queue, encounters, doses (a real table, no longer audit rows) and the trust log.
  Row-level security is on for every table with no policies, so the public key reads nothing; only the server's
  service key gets in. The trust log is append-only in the database: updates, deletes and truncates raise.
- `supabase/seed.sql`: the demo clinic. Rerunning `pnpm db:migrate` resets the seeded queue to today.
- `src/data/supabase.ts` rewritten for the new schema. Caregiver alerts name the household's family contact.
- `pnpm verify` now also checks the clinic data, that the public key is blocked, and that the trust log refuses
  edits. Every tool was run over HTTP against the live database with Bedrock: intake recall (0.642 with Titan),
  care plan in English and Hindi, dose logging, red flag with consult and family contact, family summary.
- The care loop closes in the database. A finished `start_intake` saves a handover built from the patient's words
  and the rules, and queues the visit with it (urgent when the complaint recurs, and the handover says why).
  `report_red_flag` attaches a rules-only handover to every escalation; a failed save never blocks the escalation.
- Doctor portal on live data: patients, doctors, handovers, the queue and encounters come from `/api/clinic/live`.
  Starting a consult and filing an encounter write through (`POST /api/clinic/consults/:id/start`,
  `POST /api/clinic/encounters`, validated with zod). The filed encounter is the plan `get_care_plan` and
  `log_dose_taken` read next. Without a database the portal keeps its built-in clinic.
- Found in an end-to-end browser run: filing Ibuprofen for back pain dropped Rahul's Amlodipine from his plan, because
  the newest encounter is the plan. Medicines still running are now carried forward onto the consult form, with
  their remaining days, and the doctor removes what they stop.
- `log_dose_taken` refuses a second dose in the same part of the day. Before, "I took my Metformin" said twice at
  night recorded the second as the morning dose.
- Public demo mode (`PUBLIC_DEMO=1`) for the deployment: `/auth/demo` issues a signed 6-hour consent token for the
  fictional household and a one-day demo doctor session; `/mcp` is rate-limited per address behind App Runner's proxy.
- `pnpm db:reset -- --yes` clears what demo runs created and reseeds, for a clean recording.
- 79 tests. Verified in headless Chromium against Supabase and Bedrock: voice intake to handover to queue, the doctor
  files a prescription, Alexa+ reads back both the new and the carried-forward medicine.
- `log_dose_taken` also refuses two doses of the same medicine under four hours apart. In the afternoon a
  twice-daily medicine still had its night slot open, so "I took it" said twice a minute apart filled it.
- The demo page recognises a medicine the doctor prescribed tonight when the patient names it.
- `deploy/iam.sh` works under Git Bash on Windows (the AWS CLI could not open `/tmp` paths). IAM roles created and
  the service deployed to App Runner in ap-south-1 with the Supabase clinic and `PUBLIC_DEMO=1`.
- SUBMISSION: the demo script is rebuilt around the closed loop; the Devpost text, friction log and README updated.
- A code review of the day's work found and we fixed:
  - `report_red_flag` could lose the 108 advice if the clinic record threw. It now always returns the advice;
    a failed escalation is reported as such and the patient is told to call 108 themselves. If `start_intake`
    fails, the page (and the Agent Skill) escalates through `report_red_flag`, and if even that fails the page
    speaks a fixed "call 108" line.
  - Dose guards failed open for any frequency the parser did not recognise ("every 6 hours"); only an explicit
    "as needed" medicine is now unguarded. The four-hour window reads back across midnight. Drug names compare
    case-insensitively.
  - The voice said the family "has been alerted" when no message is sent. It now says the doctor has their number.
  - Filing an encounter checks the consult belongs to that patient and is not already filed (409), backed by a
    unique index; starting a consult only takes it from waiting or scheduled, so two doctors cannot both take it.
    The trust log names the patient from the record, not from the request.
  - The public-demo token covers only the six fictional patients; `PUBLIC_DEMO=1` without a secret refuses to start.
- 84 tests.

## 2026-10-15
- A real Alexa+ agent for the web page (`src/agent/alexa.ts`, `POST /api/agent`). Amazon Nova Lite on Bedrock reads
  the MCP tool descriptions through an in-process MCP client and routes the patient's words; its instructions are
  the Agent Skill. The patient hears the tools' spoken lines, never the model's prose; start_intake gets the exact
  words; a guard escalates whatever the triage rules flag. A model chain and a pattern router cover throttling and
  a model that tries to answer more than small talk itself (found on a test run: it told a patient not to take
  another dose without calling the dose tool). `pnpm agent:eval`: 26/26, 833 ms median.
- Amazon Polly (`POST /api/speak`, neural voice Kajal) is the assistant's voice, in Indian English and Hindi, with
  the browser's voice as fallback. The instance role may now call Polly.
- Writing the guard tests found that "my chest hurts" and "pain in my chest" did not trip the chest-pain emergency
  rule, which only knew "chest pain". It now hears the ways people say it, in English and Hindi.
- "Play the 3-minute story" plays one evening from both chairs on the live page, with captions, and
  `POST /auth/demo/reset` (public demo only, once a minute) puts the shared clinic back first.
- MCP tools carry annotations (read-only, idempotent) and return structured content.
- `pnpm demo:record` records the demo video from the live page: captured frames, the assistant's lines in Polly's
  voice at the moments they played, and narrated title and closing cards.
- 94 tests.
- A second code review, of the agent, the voice and the story, found and we fixed:
  - **An emergency spread over two turns was never escalated.** "My chest hurts", then "yes, I'm sweating" matched
    no rule, because each sentence was triaged alone. The rules now read the whole intake, in the agent's guard and
    in start_intake, and an emergency skips the model entirely.
  - The chest-pain rule missed filler words ("सीने में बहुत दर्द", "chest is very tight", "pressure on my chest");
    "arm" matched inside "pharmacy".
  - A made-up tool name let the model's own words through; consent was checked after patient data had been read;
    a failed escalation could leave the patient without the 108 line; raw AWS and database errors could reach the
    client or be spoken.
  - The demo reset needed no token; `/api/speak` was a cheap Polly proxy. Now: the reset needs the demo token and runs
    one at a time, every route has its own rate limit keyed by IPv4 or IPv6 /64, and Polly has a daily budget.
  - Stop and race bugs in the voice and the story.
- 97 tests; agent evaluation 26/26.
## 2026-10-15 (later)
- A patient portal at `#/patient`, with "I'm a Patient" beside "I'm a Doctor" on the landing page
  (`docs/PATIENT_PORTAL.md`, `docs/PLATFORM_EVOLUTION_PLAN.md`). Google sign-in binds an account to one clinic
  record with a one-time link code, in one atomic statement; the session is a consent token scoped to the patient
  and, for the account holder, their household, so the portal, the agent, the voice and the MCP tools all check the
  same grant. `GET /api/patient/me` reads the patient ids out of the signed token, never from the request.
- Migration `0002_patient_account.sql`: `account_sub`, `account_email`, `link_code`, `linked_at` on `patient`.
  `NirogData` gained `listHousehold`, `findPatientByAccount`, `linkPatientAccount`, `listEncounters`,
  `listHandovers`; `PatientRecord` carries `householdId` and `relationship`.
- The page: Today, My history (one timeline labelled *You said*, *Summary for the doctor*, *The doctor*, *Dose
  logged*, filtered by source and body region), Medicines ("I took it" calls `log_dose_taken` and is refused the
  same way as Alexa+), Talk to Nirog (the real agent, pinned to the signed-in patient), Me (every trust-log line
  about the patient). A missing memory read is shown as "could not be read", never as an empty history.
- The doctor's chart shows whether the patient has claimed their portal account, and the link code to give them.
- Tests for the link code (once, one account), the child-only scope, cross-patient reads, forged, expired and
  missing tokens, and the public-demo chairs. 202 tests.
- ARIA has a face. The mobile app's 3D nurse (Chloe: rigged, facial morph targets, idle clip) is on the patient
  page's "Talk to Nirog" tab. The scene is byte-identical to the app's (`src/aria/nurseHtml.ts`); a shim gives it
  the host it expects and turns its voice call into this server's Polly route with the patient's token
  (`src/aria/scene.ts`, `GET /aria/scene`). While she is on screen the assistant's lines are spoken through her,
  lip-synced to the real audio (`setSpeaker` in `demo/src/speech.ts`). The model was converted once with
  glTF-Transform (quantized meshes, WebP textures): 14.9 MB to 6.3 MB, loaded only on that tab, skipped under
  reduced motion or without WebGL. `docs/3D_MODEL_MIGRATION.md`.
- ARIA talks to the patient, not about them. When the session is the patient's own, the agent tells the tools
  `speaking_to: "patient"` and the care-plan and dose lines say "you" ("You have 2 active medicines: ...") instead of
  "Rahul Yadav has ..."; a family member asking about someone still hears the name. The agent's persona on the
  patient page is ARIA, the clinic's nurse, speaking warmly and briefly. 203 tests.
