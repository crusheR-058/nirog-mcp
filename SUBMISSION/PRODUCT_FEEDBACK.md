# Product feedback

Feedback on each Amazon and AWS tool we used while building Nirog for Alexa+, 7 to 9 October 2026. Everything
here happened to us; the raw notes are in [FRICTION_LOG.md](../FRICTION_LOG.md). Where we did not get as far as
using something, we say so rather than guess.

## Alexa+ track: MCP and Agent Skills

**What worked**

- Building on open standards was the right call. We wrote one MCP server and it works with the MCP SDK client,
  MCP Inspector, and our own web client without a line of Alexa-specific code. We expect it to work with
  Alexa+ for the same reason.
- Streamable HTTP in stateless mode suits a serverless deployment: one transport per request, no session
  affinity to configure.
- The Agent Skill format is a good fit for clinical guardrails. "A symptom always comes first" and "never lower
  a triage level" are instructions for the agent, not code, and a skill is the natural place for them.

**What got in the way**

1. **There was nothing to test against.** The resources page gives two links for this track, the Agent Skills
   standard and the MCP transport spec. There is no sandbox, simulator, or device access. We never saw Alexa+
   call our server. Everything below is therefore a question we could not answer.
2. **Identity.** How does Alexa+ tell an MCP server *who is speaking*? A household has several patients, and a
   clinical tool must not read a mother's record to her son. We designed our own bearer token scoped to
   specific patients, on the assumption that Alexa+ can hold a credential per linked server. We do not know if
   that is right, or whether Alexa voice profiles are available to a server at all.
3. **Language.** We do not know whether Alexa+ tells a tool what language the user is speaking. We added a
   `language` parameter to every tool and rely on the agent to fill it in.
4. **Conversation boundaries.** Our intake tool needs the earlier turns of *this intake*, and nothing else. In
   our own client, sending a dose-log exchange along with them made the server treat a new complaint as a
   follow-up. We do not know what Alexa+ passes to a tool as context, or whether a server can ask for a scoped
   slice of it.
5. **Voice constraints.** No guidance on reply length, whether a tool result may be spoken verbatim, or how an
   interruption reaches the server. We return a `spoken` field and keep it to two sentences, by our own
   judgement.
6. **Urgency.** A health tool sometimes needs to say something *now* ("call 108"). We do not know whether
   Alexa+ will speak a tool result immediately or first reason about it.

**What would help most**

- A hosted test harness: paste an MCP endpoint, speak or type an utterance, see which tool Alexa+ calls with
  which arguments and what it says back. Even without a real device this would have replaced most of our
  guessing.
- One page on identity: what a server can learn about the speaker and the household, and the supported way to
  authenticate a linked server.
- A reference Agent Skill for a voice-first, safety-sensitive domain.

## Amazon Devices Builder Tools (MCP server and Agent Skills)

**What worked**

- `init-context --agent claude-code-cli --force` installed non-interactively on the first try, registered the
  MCP server, and reported clearly what it had written and where.
- `check-status` and `clean-context` exist. An installer that can verify and undo itself is rarer than it
  should be.

**What got in the way**

1. **It is a Fire TV tool presented as an Amazon Devices tool.** The hackathon's "Start here" section recommends
   it for every track. For an Alexa+ project it adds 19 Vega skills and nothing else. There is no Alexa+, MCP,
   Bee or Ring content.
2. **The steering file takes over the workspace.** It writes a `CLAUDE.md` that tells the coding agent to print a
   welcome message at the start of every session and to run a six-step platform-detection routine before doing
   anything, ending in a mandatory question, "Which platform are you developing for?", with only Vega and Fire
   OS as answers. In an Alexa+ repository none of those answers is true. We kept the file in the parent folder
   and worked around it.
3. **`exec --list` fails inside a pnpm project.** In a folder whose `package.json` pins pnpm under `devEngines`,
   the command dies with `EBADDEVENGINES` because it runs under npm. It works from any other folder.

**What would help most**

- Ask which track the developer is on during `init-context`, and install only that content. For tracks with no
  content yet, say so and install nothing.
- Make the steering opt-in per repository, or scope it to repositories that actually contain Vega or Fire OS
  indicators. The detection logic already exists; use it to stay quiet.

## Amazon Bedrock

**What worked**

- **GPT-OSS 120B in Mumbai, by plain model ID.** `openai.gpt-oss-120b-1:0` in `ap-south-1` worked on the first
  call with no inference profile and no access request. For a service whose users are in Uttar Pradesh, having
  the model in-region mattered.
- **It is fast enough for voice.** Over 42 tool calls in 12 intakes through the Converse API with
  `reasoning_effort: low`, the whole MCP tool call took 419 ms at best, 632 ms at the median and 1,113 ms at
  worst.
- **Tool use is reliable on it, though not perfect.** With a forced `toolChoice`, all 42 calls in that run came
  back as a well-formed tool call. In the run before it, 1 call of 44 did not, and we could not reproduce it. Our
  code falls back to a built-in question when that happens.
- **Its Hindi is natural.** Asked to reply "in simple everyday Hindi, the way a village nurse would speak," it
  did, in Devanagari.
- **Titan Text Embeddings V2** did what the recall path needs in English: a reworded complaint with no shared
  words landed at 0.760, an elliptical follow-up at 0.652, and an unrelated one at 1.000.

**What got in the way**

1. **Model IDs versus inference profiles.** Calling `anthropic.claude-haiku-4-5-20251001-v1:0` by model ID fails
   with "on-demand throughput isn't supported… retry with the ID or ARN of an inference profile." The error does
   not say which profiles exist. The `apac.` prefix we found in documentation is rejected as invalid in
   `ap-south-1`; `global.` works. Meanwhile GPT-OSS needs no profile at all. Two models in the same console
   follow different rules and the error message does not bridge the gap.
2. **"Reply with only JSON" is not a contract.** This is the one that cost us the most. Our prompt asked for a
   single JSON object, and it worked in every early test. It stopped working once the transcript contained a
   long plain-prose assistant turn: the model began answering in prose as well, and in some runs wrote out
   several turns of the conversation at once with inline `<reasoning>` tags. Switching to a forced tool call
   fixed it completely. The Converse documentation would save people a day by saying plainly: for structured
   output, force a tool; do not ask for JSON.
3. **Instructions about quantity were not followed.** "Ask at least 2 questions before handing over" was ignored
   in our first dry run, "at most 3" was exceeded (we saw five), and "one question at a time" produced two
   questions joined by "and." We now enforce both ends of the count in code: a retry and a built-in question
   below two, a handover after three. The tool schema describes `reply` as "at most ONE question." After that,
   every one of 12 intakes handed over after 2 or 3 questions. The joined question is rarer but not gone: 1 of
   38 model-written lines still asked two things at once.
4. **It invented a detail in a clinical summary.** We originally let the model write the handover for the
   doctor. On a dry run it wrote that the patient "seeks relief with rest or medication." The patient had said
   nothing of the kind. In Hindi it claimed severity details had been received when they had not. This is not
   specific to GPT-OSS and we do not hold it against the model, but it changed our design: the handover is now
   assembled by code from the patient's verbatim words, and the model's `summary` is discarded. We mention it
   here because a clinical example in the Bedrock documentation that shows this pattern, model for the
   conversation and code for the record, would steer people right.
5. **Titan across languages.** The same back complaint in Hindi matched its English version at 0.781, inside our
   0.85 threshold. But an *unrelated* Hindi complaint (fever and cough) scored 0.815 against the English back
   complaint, also inside it, and the same complaint in romanised Hindi scored 0.944, outside. Mixed-script
   input compresses the scale in a way monolingual input does not. We keep every safety decision on rules for
   this reason. Guidance on cross-lingual thresholds, or a note that romanised Indic text embeds poorly, would
   have saved us the experiment.

**What would help most**

- In the "on-demand throughput isn't supported" error, list the inference profile IDs that contain the model in
  the current region.
- A prominent line in the Converse docs: structured output means a forced tool call.
- A short cross-lingual note on the Titan Embeddings model card, with Indic scripts and romanised text called
  out.

## Amazon ECR and AWS App Runner

We built the container and pushed it to ECR in `ap-south-1` without trouble. **We have not yet created the App
Runner service**, so we have no feedback on running it. The one thing we can report is from writing the
deployment script: an image-based App Runner service needs two IAM roles created beforehand, an access role
for ECR and an instance role for Bedrock, and nothing in the create flow offers to make them. A
`--create-roles` option, or a single documented command, would turn a three-step deployment into one.
