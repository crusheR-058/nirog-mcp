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

## Tools

| Tool | Status |
|---|---|
| `ping` | done |
| `get_care_plan` | done: active medicines with times of day, pending tests, follow-up due date, plus a `spoken` summary |
| `start_intake` | planned |
| `report_red_flag` | planned |

## Licence

MIT
