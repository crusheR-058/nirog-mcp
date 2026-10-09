# AWS in Nirog for Alexa+

For the AWS Builder mini challenge. What we use, where it is in the code, and what we measured.

## Summary

| Service | What it does here | Where |
|---|---|---|
| **Amazon Bedrock**, GPT-OSS 120B | ARIA's intake conversation: the next question, in English or Hindi, returned through a forced tool call | [`src/ai/converse.ts`](../src/ai/converse.ts), [`src/ai/aria.ts`](../src/ai/aria.ts) |
| **Amazon Bedrock**, Titan Text Embeddings V2 | Clinical memory: finding earlier complaints that meant the same thing in different words | [`src/memory/embed.ts`](../src/memory/embed.ts), [`src/memory/recall.ts`](../src/memory/recall.ts) |
| **Amazon ECR** | Holds the server image | [`Dockerfile`](../Dockerfile), [`deploy/apprunner.sh`](../deploy/apprunner.sh) |
| **AWS App Runner** | Runs the MCP server behind HTTPS | [`deploy/apprunner.sh`](../deploy/apprunner.sh) |
| **AWS IAM** | A task role that may invoke Bedrock and nothing else | [`deploy/iam.sh`](../deploy/iam.sh) |

Everything runs in **`ap-south-1` (Mumbai)**. The patients are in Uttar Pradesh; the model should be too.

## Amazon Bedrock: the conversation

ARIA is the intake nurse. She is the only place a generative model touches a patient, and her job is narrow:
ask the next question, and say when there is enough to hand over. She does not write the handover. Code does,
from the patient's exact words.

- **Model:** `openai.gpt-oss-120b-1:0`, called through the **Converse API** with `reasoning_effort: low`. GPT-OSS
  emits its reasoning as separate content blocks; the server keeps only the text blocks, so deliberation never
  reaches the patient.
- **Structured output through a forced tool call.** The request carries a `toolConfig` with one tool, `answer`
  (`reply`, `complete`, `redFlag`, `flags`), and a `toolChoice` that forces it. The server reads the tool input
  and validates it with a zod schema. We began with "reply with only JSON" in the prompt. It worked until the
  transcript held a long plain-prose assistant turn, and then the model answered in prose too. A tool call is a
  contract; a sentence in a prompt is a request.
- **Failure is spoken, not hidden.** If the model cannot be reached or its answer does not validate, the patient
  hears "I could not reach the intake assistant, but your complaint is recorded and a doctor will see it."
  Never a crash, and never an invented answer.
- **Limits enforced in code.** The model may not hand over before two questions unless it raises a red flag. If
  it tries, it is asked once more, and if it insists the server uses a built-in question instead.
- **What the model is given:** the patient's conditions, allergies and medicines, the body region, the recall
  sentence, and the recurrence flag. All of those are computed by deterministic code first.
- **What the model is not allowed to do:** diagnose, prescribe, decide triage, or write the record. It may
  *raise* a concern (`redFlag: true`), which can lift a routine case to urgent. It cannot lower anything the
  rules decided. On an early dry run, when it still wrote the handover, it told the doctor the patient "seeks
  relief with rest or medication." The patient had not said that. The handover is now built by code from
  verbatim quotes, the region, the pattern and the triage level.
- **Credentials:** the default AWS credential chain. Locally that is your CLI profile; on App Runner it is the
  instance role. There are no keys in the code or the image.

**Measured, 9 October 2026, from a laptop in India to `ap-south-1`.** Twelve complete intakes, six in English
and six in Hindi, 42 tool calls in all:

| | |
|---|---|
| Whole MCP tool call, including recall and the model | 419 ms best, 632 ms median, 1,113 ms worst |
| Calls where the model returned a valid tool call | 42 of 42 |
| Spoken lines with more than one question mark | 0 |
| Spoken lines with two questions joined by "and" or "or" | 1 of 38 written by the model |
| Handovers before two questions, or after more than three | 0 |

The run before this one had 1 call of 44 with no usable model answer. The server spoke its built-in question
instead. We did not find the cause.

**Why GPT-OSS 120B.** It is available in Mumbai by plain model ID, it is quick enough for a spoken turn, its
Hindi is natural, and an open-weight model keeps a rural clinic from depending on one vendor's pricing. A
third-party price tracker listed it at $0.15 per million input tokens and $0.60 per million output tokens when
we chose it; check the Bedrock pricing page for the current figure. An intake is roughly two thousand tokens, so
the cost of a conversation is a small fraction of a cent.

## Amazon Bedrock: the memory

A complaint is embedded when it is stored, and the embedding lives in the same row. Recall is one query:
`ORDER BY embedding <=> $vector` scoped to one patient.

- **Model:** `amazon.titan-embed-text-v2:0`, 1024 dimensions, `normalize: true`, via `InvokeModel`.
- **Honest fallback:** if Bedrock is unreachable the server falls back to a deterministic offline embedder, and
  records which one produced each vector. Nobody has to guess later whether a recall was backed by a real model.
- **Thresholds are per embedding space.** Titan compresses short sentences, so it gets its own cut-offs: 0.85 to
  surface a match, 0.68 to *act* on one by inheriting its body region. The bar for acting is higher than the
  bar for showing.

**Measured on Titan Embed v2**, distance from *"my lower back has been aching for a few days, worse in the
mornings"*:

| Complaint | Distance | Inside 0.85? |
|---|---|---|
| "the ache is back again, it's been three weeks now" | 0.652 | yes |
| "I keep getting this pain when I stand up from my desk" | 0.760 | yes |
| "blocked nose and a bit of a cough, think I caught something" | 1.000 | no |
| "कमर में फिर से दर्द हो रहा है, तीन हफ़्ते हो गए" (same problem, Hindi) | 0.781 | yes |
| "तीन दिन से बुखार और खांसी है" (unrelated, Hindi) | 0.815 | **yes, wrongly** |
| "kamar mein phir se dard ho raha hai" (same problem, romanised) | 0.944 | **no, wrongly** |

The English rows are what the product depends on, and they hold: the full path on Titan inherits the lumbar
region at 0.652, raises the recurrent flag, and completes in 371 ms including three seeded visits.

The last two rows are a limit, and we state it in the README. Cross-language recall is not reliable at this
threshold. It does not affect the recurrence flag, which counts by body region from a lexicon that reads Hindi
directly, and it cannot cause a wrong inheritance, because 0.815 is outside the 0.68 cut-off.

## Amazon ECR, App Runner and IAM

The server is one stateless container: a multi-stage build on `node:24-alpine`, running as a non-root user,
about 68 MB compressed before the web page was added.

```bash
bash deploy/iam.sh         # once, as an admin
bash deploy/apprunner.sh   # build, push to ECR, create or update the service, wait, print the URL
```

- **Stateless Streamable HTTP** means App Runner can add instances with no session affinity.
- **Least privilege:** the instance role's only policy allows `bedrock:InvokeModel`, `bedrock:Converse` and their
  streaming forms. It cannot read S3, cannot touch IAM, cannot do anything else.
- **Refuses to deploy open:** the script exits unless `NIROG_TOKEN_SECRET` is set, so a deployed server always
  requires consent tokens.
- **Health check** on `/health`, which also reports whether auth is on.

**Status, honestly:** the image is built and pushed to ECR in `ap-south-1`. The App Runner service has not been
created yet, because creating its two IAM roles needs an account administrator. The scripts are written and
reviewed but `apprunner.sh` has not been run end to end.

## What we would add next

- **Amazon Polly** (neural, `Kajal`) for ARIA's voice in the web page, in place of the browser's speech engine.
- **Amazon SNS** to deliver the family alert by SMS; today it is recorded in the trust log but not sent.
- **Amazon Bedrock Guardrails** as a second, independent check that no reply names a diagnosis.
