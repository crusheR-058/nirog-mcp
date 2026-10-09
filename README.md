# nirog-mcp

Nirog for Alexa+ turns an Echo into the front door of a rural clinic.

A patient says what hurts, in their own words, in Hindi or English. The server records it, recalls what they
said months ago however differently they worded it, asks the two or three questions a nurse would, and hands a
doctor a real history. If it sounds dangerous, a fixed table of rules, not a model, tells them to call an
ambulance and puts them at the top of the on-call doctor's queue.

It is a self-hosted **MCP server** (Streamable HTTP) plus an **Agent Skill**, built for the Alexa+ track of the
Build, Ship, Shape: Amazon Developer Hackathon. It also ships a web page that simulates the Alexa+ experience
against the real server, and the doctor's side of the same consultation.

```
Alexa+ ──MCP / Streamable HTTP──▶ nirog-mcp ──▶ clinical memory (in-process | Postgres + pgvector)
                                      │      ──▶ Amazon Bedrock (GPT-OSS 120B for questions, Titan Embed v2 for recall)
                                      │      ──▶ care data (built-in demo set | Supabase)
Doctor portal ──/api/clinic──────────┘          one trust log, written by every tool call
```

## Run it

Needs Node 22.9 or newer and pnpm. No database and no cloud account are required for the default setup.

```bash
pnpm install
pnpm build:demo     # builds the web page into dist/demo
pnpm dev            # server on http://127.0.0.1:3333
```

Open http://127.0.0.1:3333/demo/. Scroll to **Talk** and click any of the five things to try, or use the bar at
the bottom. Switch the bar to हिं to do the same in Hindi.

With no `.env` the server runs in open development mode: built-in demo patients, in-process memory seeded with a
demo history, an offline embedder, and ARIA's questions from Amazon Bedrock if your AWS credentials can reach it
(set `ARIA_MODEL=off` to use the built-in fallback questions instead).

```bash
pnpm test           # 74 tests, offline, about a second
pnpm typecheck
```

## The tools

| Tool | What it does |
|---|---|
| `start_intake` | Records the complaint unedited, recalls earlier complaints that meant the same thing, resolves the body region (inheriting it from memory when the sentence names none), runs the recurrence rule and the triage rules, and returns ARIA's next question or a handover summary. |
| `report_red_flag` | Rules-based triage. On an emergency: speaks the 108 ambulance advice, queues a consult for the on-call doctor, alerts the family contact. |
| `get_care_plan` | Active medicines with times of day, pending tests, when the follow-up is due. |
| `log_dose_taken` | Records a dose and refuses a double dose: once today's scheduled doses are on record it says so. Days are counted in the clinic's time zone. |
| `get_family_summary` | A caregiver's view of the last few days: complaint counts by body region, whether a pattern is forming, doses recorded against doses expected. Counts only, never the patient's words. |
| `ping` | Health check. |

Every tool takes `language` (`en` or `hi`) and returns a `spoken` line in it. Every call is written to the trust
log with who, what and why.

Try them without the page:

```bash
npx @modelcontextprotocol/inspector     # transport: Streamable HTTP, URL: http://127.0.0.1:3333/mcp
```

## What decides what

The split between code and model is the design, so it is worth stating exactly.

| Decision | Made by | Why |
|---|---|---|
| Which body region a complaint is about | A lexicon, then memory if the lexicon finds nothing | "The ache is back again" names no body part. Memory supplies one, but only from a close match; otherwise it stays unknown. |
| Whether a pattern is worth a doctor's attention | Arithmetic: 3 visits, one region, 90 days | A doctor can check it on paper in ten seconds. |
| Whether this is an emergency | 15 table-driven rules, negation-aware, condition-aware, in English and Hindi | Wheezing is an emergency for a patient with asthma and routine for anyone else. A model may raise a level, never lower one. |
| Which earlier complaints mean the same thing | Embeddings (Titan Embed v2, or an offline lexical embedder) | This is the one job that needs meaning rather than words. |
| What to ask next | GPT-OSS 120B on Amazon Bedrock, through a forced tool call | It conducts the conversation. It never writes the chart. Code holds it to at least two questions. |
| What the doctor reads | Code: the patient's verbatim words, the region, the pattern, the triage level | An early version let the model write this, and it invented a symptom. Now nothing reaches the doctor that the patient did not say or a rule did not find. |

The lexicon, region inheritance, recurrence rule, embedders and SBAR handover are ported from the Nirog project
(https://github.com/Shivang-creator/nirog, MIT). See [CHANGELOG.md](CHANGELOG.md) for what was built during the
hackathon.

## Configuration

Copy `.env.example` to `.env`. Everything is optional.

| Variable | Default | Effect |
|---|---|---|
| `NIROG_TOKEN_SECRET` | unset (open dev mode) | Turns on consent tokens for `/mcp` and doctor sessions for `/api/clinic`. Required for any deployment. |
| `MEMORY_STORE` | `memory` | `pg` stores complaints in Postgres at `MEMORY_DATABASE_URL` (`MEMORY_PG_FLAVOUR`: `pgvector` for Supabase, `cockroach` for CockroachDB). |
| `EMBEDDER` | `offline` | `bedrock` uses Titan Text Embeddings V2 in `AWS_REGION`. |
| `ARIA_MODEL` | Bedrock | `off` uses built-in questions. `BEDROCK_CHAT_MODEL` picks the model. |
| `NIROG_DATA_SOURCE` | `mock` | `supabase` reads the Nirog doctor-portal schema (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`). |
| `GOOGLE_CLIENT_ID` | unset | Enables Google sign-in on the doctor page. |
| `CLINIC_INVITE_CODE`, `DOCTOR_ALLOWLIST` | demo values | One-time doctor verification. |
| `CLINIC_UTC_OFFSET_MINUTES` | `330` (IST) | The clock doses are counted on. |

For Postgres memory: `pnpm db:migrate` creates the tables and seeds the demo history, `pnpm verify` checks the
connection and runs a live recall.

## Consent and sign-in

**Households.** Every `/mcp` request carries a consent token scoped to specific patients. A tool asked about any
other patient refuses, and does not reveal whether that patient exists.

```bash
pnpm consent-token pat_rahul,pat_aarav --sub yadav-household --days 30
```

**Doctors.** The doctor page (`/demo/#/doctor`, or the "I'm a Doctor" button) has two gates: Google sign-in,
verified server-side, then a one-time check of the medical registration number and a clinic invite code against
an allowlist. The server issues a signed 30-day session, so later visits need only Google.

## The web page

`demo/` is a Vite + React page: glass panels over a Three.js particle sphere that reacts to the conversation.

- **Voice bar.** Follows the page. Microphone, typed input, suggestion chips, EN/हिं toggle. Every reply is a tool
  result from this server; the browser only does speech in and out.
- **Memory.** A node graph of one patient's complaints, joined by the real cosine distances.
- **Case file.** The recurrence verdict, the SBAR handover the doctor reads, a timeline in the patient's words.
- **Doctor portal.** Queue sorted by triage, patients, chart, a consultation form that files an encounter, the
  trust log, settings. It reads `/api/clinic`, so a consult escalated by voice in one browser appears in the
  doctor's queue in another.
- **Talk.** The conversation beside a trace of every tool call and what it returned.

```bash
pnpm dev:demo       # Vite on :5173 with hot reload, proxying to the server on :3333
```

## Deploy

AWS App Runner in `ap-south-1` (Mumbai), from an image in ECR.

```bash
bash deploy/iam.sh         # once, as an account admin: two roles (ECR pull; Bedrock invoke and nothing else)
bash deploy/apprunner.sh   # build, push, create or update the service, wait, print the HTTPS endpoint
```

The second script refuses to deploy without `NIROG_TOKEN_SECRET`.

## Known limits

Stated plainly, because a clinical tool that overstates itself is worse than one that does less.

- **Not tested against a real Alexa+ device.** No Alexa+ sandbox was available. The server follows the MCP
  Streamable HTTP spec and is exercised by the MCP SDK client and MCP Inspector.
- **The triage rules are not clinically validated.** They are a demonstration of the mechanism: a table a
  clinician can read and correct. They should be reviewed by one before any real use.
- **Recall across languages is unreliable.** Measured on Titan Embed v2: the same back problem said in Hindi
  matches its English version (distance 0.781, threshold 0.85), but an unrelated Hindi complaint also falls
  inside the threshold (0.815), and romanised Hindi misses entirely (0.944). Recurrence is unaffected, because
  it counts by body region from the lexicon, and region inheritance uses a stricter cut-off (0.68). But a
  Hindi speaker may be reminded of an unrelated English complaint. Fixing it needs a labelled Hindi battery
  like the one the Nirog project built for English.
- **The model sometimes asks two things at once.** The number of questions is enforced in code (two at least,
  three at most). Their wording is not: in our last run 1 of 38 model-written lines joined two questions with
  "and". One call in an earlier run of 44 returned no usable answer; the built-in question was spoken instead.
- **The Supabase data source has not been run against a live database.** It is written against the Nirog
  schema and typechecks. The built-in data source is what every test and demo uses.
- **Alerts are recorded, not sent.** The family-contact alert writes a trust-log entry. There is no SMS gateway.
- **The call room has no signalling server.** It captures your camera and microphone and shows the waiting
  state; there is no second peer.

## Licence

MIT
