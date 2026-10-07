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
