# Friction log

Rough edges hit while building on Amazon tools during the hackathon. Each entry: date, tool,
what we tried, what happened, what would have helped.

## 2026-10-07
- **Alexa+ track, resources page.** No Alexa+ sandbox or device simulator is listed, so there is no way
  to test a real MCP connection from Alexa+. We are building a simulated web experience as the rules allow.
  A hosted "connect your MCP endpoint" test harness would remove the guesswork.
- **Amazon Devices Builder Tools, `init-context --agent claude-code-cli`.** Installed fine non-interactively,
  but everything it adds is Vega OS / Fire TV: 19 Vega skills and a steering CLAUDE.md that injects Vega
  session-setup rules into every Claude Code session in the workspace. For an Alexa+ MCP project it offers
  nothing, and the always-on steering doc gets in the way. A track-aware install (or an Alexa+/MCP skill
  pack) would help. `exec --list` from a folder whose package.json pins pnpm fails with EBADDEVENGINES
  because the tool runs under npm.
- **Amazon Bedrock, model IDs.** Calling `anthropic.claude-haiku-4-5-...` by raw model ID fails with
  "on-demand throughput isn't supported"; you must use an inference profile such as
  `global.anthropic.claude-haiku-4-5-20251001-v1:0`. The `apac.` prefix shown in some docs is rejected
  as invalid in ap-south-1. The error message does not say which profile IDs exist.
