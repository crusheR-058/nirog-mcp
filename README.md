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

## Tools

| Tool | Status |
|---|---|
| `ping` | done |
| `get_care_plan` | done: active medicines with times of day, pending tests, follow-up due date, plus a `spoken` summary |
| `start_intake` | done: records the complaint, recalls earlier complaints that meant the same thing in different words, flags recurrence, then ARIA (GPT-OSS 120B on Bedrock) asks the next question or hands over to a doctor with a summary. Pass `transcript` for later turns. Says so when memory is unreachable |
| `report_red_flag` | done: table-driven triage (chest pain with sweating, stroke signs, breathing difficulty, bleeding, self-harm, condition-aware rules), emergency advice, consult queued for the on-call doctor, family contact alerted. The model can raise routine to urgent, never lower |

## Licence

MIT
