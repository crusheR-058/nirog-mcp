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

## 2026-10-09
- **Amazon Bedrock, Converse, structured output.** "Respond with ONLY a JSON object" in the system prompt worked
  in every early test with `openai.gpt-oss-120b-1:0`. On a dry run it failed three turns running with no JSON at
  all: once the transcript held a long plain-prose assistant turn, the model answered in prose and sometimes
  wrote several turns at once with inline `<reasoning>` tags. A forced `toolChoice` fixed it: in the last measured run 42 of 42
  calls returned a valid tool call (one of 44 failed in the run before; cause not found). The docs should say this outright.
- **Amazon Bedrock, GPT-OSS 120B, following counts.** "Ask at least 2 questions before handing over" was ignored
  (it handed over after one), "at most 3" was exceeded, and "one question at a time" produced two joined by
  "and". The minimum and the maximum are enforced in code now. The "and" still slips through about once in 40 lines.
- **Amazon Bedrock, GPT-OSS 120B, summaries.** Asked for a plain recap of an intake, it added "seeks relief with
  rest or medication", which the patient never said. We no longer let any model write the handover.
- **Amazon Bedrock, Titan Embed v2, mixed scripts.** Against an English back complaint: the same complaint in
  Hindi 0.781 (match), an unrelated Hindi complaint 0.815 (also a match, wrongly), the same complaint in
  romanised Hindi 0.944 (a miss, wrongly). Monolingual English separates cleanly (0.652 / 0.760 vs 1.000).
- **Alexa+ track.** Nothing says what conversation context Alexa+ passes to a tool. Our intake tool needs the
  earlier turns of this intake only; sending unrelated turns made the server skip the memory recall.
- **App Runner.** An image-based service needs two IAM roles created first (ECR access, instance role). Not
  offered by the create flow. We have not created the service yet.
