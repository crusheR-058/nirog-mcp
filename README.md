# nirog-mcp

An MCP (Model Context Protocol) server and Agent Skill that turn Alexa+ into the front door of a
rural clinic. Patients describe symptoms in their own words; the server remembers what they said
months ago in different words, flags red-flag symptoms, and reads back care plans by voice.

Built for the Alexa+ track of the Build, Ship, Shape: Amazon Developer Hackathon.

## Run locally

```bash
pnpm install
pnpm dev
```

The server listens on `http://127.0.0.1:3333/mcp` (Streamable HTTP, stateless).
Health check: `GET /health`.

## Try it with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Choose transport "Streamable HTTP", URL `http://127.0.0.1:3333/mcp`, connect, and call `ping`.

## Data sources

`NIROG_DATA_SOURCE=mock` (default) uses built-in demo patients (`pat_rahul`, `pat_sunita`, `pat_meena`) so the
server runs with no database. `NIROG_DATA_SOURCE=supabase` reads the live Nirog doctor-portal project; copy
`.env.example` to `.env` and fill in `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.

## Clinical memory

`MEMORY_STORE=memory` (default) keeps complaints in process, seeded with the Nirog demo history for Rahul.
`MEMORY_STORE=pg` uses Postgres at `MEMORY_DATABASE_URL`: Supabase with pgvector (`MEMORY_PG_FLAVOUR=pgvector`)
or CockroachDB (`cockroach`). `EMBEDDER=bedrock` uses Titan Text Embeddings V2; the default is a deterministic
offline embedder so tests and demos need no cloud.

The lexicon, region inheritance, and recurrence rule are ported from the Nirog repo
(https://github.com/Shivang-creator/nirog, MIT). The one claim the system makes about a patient, the recurrence
flag, is arithmetic a doctor can check by hand. No model decides it.

## The deck (simulated Alexa+ experience)

`demo/` is a Vite + React page in the style of a liquid-glass control deck: a persistent Three.js field of
refractive crystals, drifting wireframe shards and a particle sphere that breathes with the conversation, with
frosted glass sections over it. Sections: Voice (hero), Deck (live tiles), Memory (an SVG node graph of
Rahul's complaints joined by golden rays with real cosine distances), Handover (the on-call queue card and a
presentations chart), Red flag (the escalation flow), and Talk (conversation plus a trace of every tool call).

The clinic from nirog-memory.vercel.app is ported in as well: the care loop and trust architecture, the
patient case file (recurrence verdict, SBAR handover, timeline in the patient's own words), the doctors
directory with a call room (real camera and microphone, mute and camera toggles), and the doctor portal as a
glass app window: dashboard with stat tiles, on-call switch and the triage-sorted queue, patients with consent
and ABHA badges, the chart with ARIA handover and care history, the consultation form (assessment, prescription,
tests, follow-up) that files an encounter, the trust log, and settings. Consults escalated by Alexa+ land in
the queue; every tool call is written to the trust log.

A glass voice bar follows the page. Everything it says is a tool result from this server over Streamable HTTP;
browser speech handles input and output, and the sphere turns red on an emergency.

```bash
pnpm dev          # MCP server on :3333
pnpm dev:demo     # Vite on :5173, proxies /mcp to the server
pnpm build:demo   # builds into dist/demo; the server then serves it at /demo
```

Phones get a lighter field (fewer particles, no refraction or post-processing) and a bottom rail.

## Consent

Every `/mcp` request carries a household consent token (`Authorization: Bearer ...`) scoped to specific
patients. Tools refuse any other patient id without revealing whether it exists. Mint a token with
`pnpm consent-token pat_rahul,pat_aarav --sub yadav-household --days 30` using the same `NIROG_TOKEN_SECRET`
the server runs with. Without the secret the server is open, for local development only.

## Agent Skill

`skills/nirog/SKILL.md` follows the open Agent Skills format and tells an agent how to run an intake with these
tools: identify the patient, call `start_intake` each turn, escalate on red flags, and never diagnose.

## Deploy (AWS App Runner, Mumbai)

```bash
bash deploy/iam.sh        # once, as an admin: two IAM roles (ECR pull, Bedrock invoke)
bash deploy/apprunner.sh  # build, push to ECR, create or update the service, print the HTTPS endpoint
```

## Tools

| Tool | Status |
|---|---|
| `ping` | done |
| `get_care_plan` | done: active medicines with times of day, pending tests, follow-up due date, plus a `spoken` summary |
| `start_intake` | done: records the complaint, recalls earlier complaints that meant the same thing in different words, flags recurrence, then ARIA (GPT-OSS 120B on Bedrock) asks the next question or hands over to a doctor with a summary. Pass `transcript` for later turns. Says so when memory is unreachable |
| `report_red_flag` | done: table-driven triage (chest pain with sweating, stroke signs, breathing difficulty, bleeding, self-harm, condition-aware rules), emergency advice, consult queued for the on-call doctor, family contact alerted. The model can raise routine to urgent, never lower |

## Licence

MIT
