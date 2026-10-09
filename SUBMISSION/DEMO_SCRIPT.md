# Demo video script

Under 3 minutes. Public on YouTube, in English. The rules ask that it show the project working.

## Before you record

```bash
cd nirog-mcp
pnpm build:demo
pnpm dev                 # do NOT set ARIA_MODEL=off: you want the real Bedrock model answering
```

Open http://127.0.0.1:3333/demo/ in Chrome, full screen, at 1920 x 1080.

- **Restart the server right before each take.** Memory and the dose log live in the process, so a restart resets
  Rahul to exactly three earlier visits and no doses taken. Without it, take two starts with yesterday's doses
  and a fourth visit, and the numbers on screen will not match what you say.
- Click **Start over** in the Talk section if you only need to clear the conversation.
- Allow the microphone once beforehand so the permission prompt is not in the video.
- Record the browser tab with system audio, so the assistant's voice is captured.
- Have a second browser window open on the same URL, scrolled to **Doctor portal**. You will cut to it once.
- **Type or click instead of speaking if the room is noisy.** The chips and the "five things to try" send exactly
  the lines below. A typed line that works beats a spoken line that was misheard.

The times are a guide. If you run long, shorten beat 6 first, then beat 5.

---

## 1. The problem · 0:00 to 0:20

**On screen:** the top of the page. The headline "Say what hurts. The clinic remembers." beside the sphere.

**Say:**
> In a village four hours from a clinic, nobody has a laptop. But there is an Echo on the shelf. Nirog for
> Alexa+ turns it into the clinic's front door. It is an MCP server that gives Alexa five clinical tools and a
> memory.

## 2. It remembers · 0:20 to 1:00

**On screen:** click the brain icon in the left rail to jump to **Memory**. Pause two seconds on the graph. Then
click the chat icon to jump to **Talk**.

**Do:** click the chip **"the ache is back again"**.

**The assistant says, roughly:**
> You have mentioned your lower back 3 times in the last 38 days. 5 weeks ago you said "my lower back has been
> aching for a few days, worse in the mornings". Is this the same thing?

**Say, while the trace fills in on the right:**
> Rahul said "the ache is back again." That sentence names no body part. Back means returned. The server found
> what he said in July, in completely different words, and took the body region from it. On the right is exactly
> what Alexa saw: the match, the distance, and a recurrence flag. That flag is arithmetic. Three visits, one
> region, ninety days. No model decided it.

## 3. It asks like a nurse · 1:00 to 1:20

**Do:** type `yes, same thing. worse in the mornings and when I bend to lift water` and press Enter.

**Say:**
> The questions come from GPT-OSS on Amazon Bedrock, in Mumbai. It asks two or three and never names a
> diagnosis.

The model always asks a second question here. Answer it with `about three weeks`. It then hands over, and the
trace on the right shows a line beginning **summary for the doctor: Said today:** followed by Rahul's sentences
in quotes. Pause on it for two seconds.

**Say:**
> And this is what the doctor reads. Not the model's summary: Rahul's own words, the region, the pattern. Code
> writes it, so nothing can appear there that he did not say.

If the model asks a third question instead, answer `no, nothing else`.

## 4. Medicines · 1:20 to 1:40

**Do:** type `I took my BP tablet`. Then type it again.

**The assistant says:** first that the dose is recorded. The second time:
> Amlodipine 5mg is already recorded for today. Please do not take an extra dose.

**Say:**
> It keeps track of medicines, and it will not let him take the same dose twice.

## 5. Hindi, and an emergency · 1:40 to 2:20

**Do:** click **हिं** in the bar. Then click the chip **"सीने में दर्द, पसीना"**.

**On screen:** the sphere and the bar turn red. The assistant answers in Hindi with the 108 advice.

**Say:**
> Now in Hindi: chest pain, and sweating. This does not go to a model. Fifteen rules, in English and Hindi, and
> the answer is immediate: call 108. A model can raise a triage level here. It can never lower one.

**Cut to the second window, on the Doctor portal.**

**Say:**
> And this is another browser, the doctor's. The consult Alexa just raised is at the top of the queue, and the
> trust log shows every tool call: who, what, and why.

## 6. How it is built · 2:20 to 2:50

**On screen:** back to the first window, the **Care loop** section (second icon in the rail), then scroll slowly
to **Trust architecture**.

**Say:**
> It is one stateless MCP server over Streamable HTTP, with an Agent Skill. Bedrock for the conversation and for
> the embeddings. Every request carries a consent token scoped to specific patients. And it is open source.

## 7. Close · 2:50 to 3:00

**On screen:** the top of the page again.

**Say:**
> Nirog for Alexa+. Say what hurts. The clinic remembers.

---

## If something goes wrong on camera

| What you see | Why | What to do |
|---|---|---|
| "I could not reach the intake assistant…" | Bedrock did not answer (credentials or network) | Check `aws sts get-caller-identity`. To record anyway, restart with `ARIA_MODEL=off`; the questions are then built-in ones. Do not say "GPT-OSS" in that take. |
| The recall sentence is missing | The conversation was not cleared, so this was not the first turn of an intake | Click **Start over**, or restart the server |
| "3 times in the last 38 days" reads as 4 | A previous take already added a visit | Restart the server |
| The dose is refused on the first try | A previous take already logged it | Restart the server |
| No voice in Hindi | The computer has no Hindi speech voice installed | The text still appears. Either install a Hindi voice in the OS settings, or narrate over it |
| The doctor window shows "this tab only" | The server is not reachable from that window | Reload it |

## What not to claim

- Do not say it was tested on an Echo. It was not; there is no Alexa+ sandbox. Say "simulated Alexa+ experience."
- Do not say the triage rules are clinically validated. They are not.
- Do not say it is deployed unless `deploy/apprunner.sh` has run and the URL works.
