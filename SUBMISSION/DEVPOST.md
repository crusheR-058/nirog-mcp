# Devpost submission text

> **Before you paste this:** fill in the three items marked `TODO`, and delete this note.
>
> - `TODO-VIDEO`: the YouTube link, once recorded (see DEMO_SCRIPT.md).
> - `TODO-LIVE`: the App Runner URL, once `deploy/apprunner.sh` has run. If it is not deployed, delete the
>   "Try it" line that uses it. The local instructions are enough.
> - `TODO-TEAM`: who built it.

---

## Project name

Nirog for Alexa+

## Tagline

Say what hurts. The clinic remembers.

## Track and mini challenges

- **Primary track:** Alexa+ (self-hosted MCP server over Streamable HTTP, plus an Agent Skill)
- **Mini challenge:** AWS Builder (Amazon Bedrock, ECR, App Runner; see AWS.md in the repository)
- **Mini challenge:** Open Source (new public repository, MIT: https://github.com/crusheR-058/nirog-mcp)

---

## Inspiration

In a village four hours from a clinic, the phone that could run a telehealth app is often shared, low on
storage, and in someone else's pocket. The Echo on the shelf is none of those things. It is already on, it
already understands the family, and it needs no reading.

But a voice assistant that forgets is not much use to a clinic. A patient says in July, "my lower back has been
aching." In August, to someone else, "I keep getting this pain when I stand up from my desk." Tonight: "the ache
is back again." Three presentations of one problem, and the first two share no words at all. The third names no
body part: "back" there means *returned*. Nobody searching the notes would connect them. The recurrence is the
diagnostic signal, and it is invisible precisely because people never repeat themselves word for word.

That is a memory problem, and Alexa+ with MCP is a natural place to solve it.

## What it does

Nirog for Alexa+ is an MCP server that gives Alexa+ five clinical tools and a memory.

**It listens and remembers.** `start_intake` stores what the patient said, unedited, and finds what they said
before that meant the same thing. Tonight's "the ache is back again" is matched to the July complaint, and the
body region the sentence never named is inherited from it. Alexa+ can then say: *"You have mentioned your lower
back three times in the last 38 days. Five weeks ago you said 'my lower back has been aching for a few days,
worse in the mornings.' Is this the same thing?"*

**It asks like a nurse, then hands over.** ARIA, running on GPT-OSS 120B through Amazon Bedrock, asks two or
three questions and never names a diagnosis. Then the doctor receives a handover with the recurrence flag on
top. The model does not write that handover. Code does, from the patient's exact words.

**It escalates on rules, not on a model's mood.** Fifteen table-driven rules catch emergencies in English and
Hindi. "I have chest pain and I'm sweating" gets the 108 ambulance advice in the same breath, an emergency
consult at the top of the on-call doctor's queue, and an alert to the family contact. The rules know the
patient: wheezing is an emergency for someone with asthma and routine for anyone else. A model may raise a
level. It can never lower one.

**It keeps track of medicines.** `get_care_plan` reads out tonight's medicines. `log_dose_taken` records a dose
and refuses a second one the same day: *"Amlodipine is already recorded for today. Please do not take an extra
dose."*

**It answers the family.** `get_family_summary` tells a daughter how her father's week went: how many complaints,
whether a pattern is forming, how many doses were taken. It gives counts, never his words.

**It speaks Hindi.** Every tool answers in Hindi or English. The lexicon and the triage rules read Devanagari
and romanised Hindi, including the fact that Hindi negates after the noun ("दर्द नहीं है") where English negates
before it.

**It shows its work.** Every tool call is written to a trust log: who, what, and why. The doctor's portal reads
that log and the consult queue from the same server, so a consult escalated by voice in one room appears on the
doctor's screen in another.

## How we built it

- **MCP server:** TypeScript, the official MCP SDK, stateless Streamable HTTP so it scales horizontally. Six
  tools with typed schemas. An Agent Skill (`skills/nirog/SKILL.md`) tells an agent how to run an intake with
  them.
- **Memory:** embeddings stored beside the complaint they describe. An in-process store for demos and tests,
  and a Postgres store whose recall query runs unchanged on Supabase pgvector and CockroachDB.
- **Amazon Bedrock:** GPT-OSS 120B via the Converse API, with a forced tool call for structured output, for
  ARIA's questions; Titan Text Embeddings V2 for recall. Both in `ap-south-1` (Mumbai), close to the patients.
  Over 42 real tool calls in 12 intakes the median took 632 ms.
- **The line between code and model** is the design. Region classification is a lexicon. Recurrence is
  arithmetic a doctor can check on paper. Triage is a table. The handover is assembled from verbatim quotes. The
  model only conducts the conversation and never writes the chart.
- **Consent:** every MCP request carries a household token scoped to specific patients. A tool asked about
  anyone else refuses without revealing whether that person exists. Doctors sign in with Google and verify
  their registration once.
- **A simulated Alexa+ experience,** which the rules allow, since there is no Alexa+ sandbox: a web page with
  speech in and out that is a real MCP client of the real server, beside a trace of every tool call.
- **74 automated tests,** all offline, covering the rules, the Hindi handling, the double-dose guard, consent,
  and the clinic API.

## What was built during the hackathon, and what was not

The Nirog project existed before this hackathon (https://github.com/Shivang-creator/nirog). From it we ported,
with attribution: the body-region lexicon, the region-inheritance logic, the recurrence rule, the offline and
Titan embedders, the SBAR handover builder, ARIA's intake prompt, and the demo patients.

Everything else in this repository was written during the submission window, and its history starts on
7 October 2026: the MCP server and all six tools, the Agent Skill, the triage rules, Hindi support, consent
tokens, doctor sign-in, the dose and family-summary logic, the trust log and clinic API, the Postgres memory
store, the deployment scripts, the tests, and the entire web page. CHANGELOG.md records it day by day.

## Challenges we ran into

- **No Alexa+ to test against.** With no sandbox, we could not connect a real device. We built to the MCP
  specification, tested with the SDK client and MCP Inspector, and built the simulated experience.
- **"The ache is back again."** A classifier that guessed "lumbar" from the letters b-a-c-k would be right by
  accident and wrong the moment someone says "the headache is back." The lexicon correctly gives up on that
  sentence; memory resolves it; and if memory has nothing close enough, it stays unknown. Not guessing mattered
  as much as guessing.
- **Hindi negation.** Our first negation check looked before the symptom, as English needs. Hindi puts it
  after. And "पसीना नहीं रुक रहा" (the sweating will not stop) contains "नहीं" but is the opposite of a denial.
  Treating it as one would have missed an emergency, so only the plain "is not" form counts.
- **Spelling.** "साँस" and "सांस" are the same word. So are "ज़" and "ज". Speech recognisers and keyboards
  disagree, so both are folded away before any rule runs.
- **The model invented a symptom.** We first let the model write the doctor's summary. On a dry run it wrote
  that the patient "seeks relief with rest or medication." He had said no such thing. A stricter prompt would
  have hidden the problem, not removed it, so we took the model out: the handover is now built by code from the
  patient's own sentences, and whatever the model offers as a summary is thrown away.
- **"Reply with only JSON" is a request, not a contract.** It held in every early test and broke on the dry run,
  when a long spoken reply in the transcript led the model to answer in prose. A forced tool call fixed it: 42
  calls out of 42 in our last measured run.
- **A bug the demo found.** The recall sentence went missing whenever an intake followed a dose log, because
  unrelated turns were being sent as the intake's transcript. We only saw it by interrupting the assistant
  mid-sentence in a test, which is exactly what real people do.
- **A model does not count.** "Ask two or three questions" produced one, and on other runs five. Both ends of
  that count are now enforced in code. One thing code cannot fully fix: about one line in forty still joins two
  questions with "and".

## Accomplishments that we're proud of

- A doctor can check every claim the system makes about a patient by hand.
- Nothing reaches the doctor that the patient did not say or a rule did not find.
- When memory is unreachable, the assistant says so. It never turns an outage into "no history found."
- The double-dose guard counts days on the clinic's clock, not the server's.
- The family summary answers the question a daughter is actually asking without repeating what her father said.

## What we learned

- Dry runs against the real model find what unit tests cannot. Ours found an invented symptom, a format that
  drifted, and a handover that called a back complaint "Unclassified" because the last thing the patient said
  was "no, nothing else."
- MCP's tool descriptions are the product. The same server behaves very differently depending on whether a
  description says *when* to call a tool or only *what* it does.
- Returning a ready-to-speak `spoken` field from every tool keeps the clinical wording in one reviewed place,
  instead of letting each agent rephrase it.
- Embeddings across languages are less reliable than they look. On Titan, the same complaint in Hindi matched
  its English version, but so did an unrelated Hindi complaint. We kept the safety-relevant decisions on rules
  for exactly this reason, and we say so in the README.

## What's next for Nirog for Alexa+

- Connect to a real Alexa+ device as soon as access exists, and map Alexa's household voice profiles to consent.
- Have a clinician review and extend the triage table.
- Build a labelled Hindi recall battery and tune the cross-language thresholds on real data.
- Send the family alert by SMS, and add more regional languages.

## Built with

`typescript` `node.js` `model-context-protocol` `alexa` `amazon-bedrock` `amazon-ecr` `aws-app-runner`
`postgresql` `pgvector` `supabase` `react` `three.js` `vite` `vitest`

## Try it

- **Repository:** https://github.com/crusheR-058/nirog-mcp
- **Video:** TODO-VIDEO
- **Live:** TODO-LIVE
- **Locally, in three commands:**

  ```bash
  pnpm install && pnpm build:demo && pnpm dev
  ```

  Then open http://127.0.0.1:3333/demo/ and scroll to **Talk**.

## Team

TODO-TEAM
