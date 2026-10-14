# Demo video script

Under 3 minutes. Public on YouTube, in English. The rules ask that it show the project working.

The story is one evening for one patient, told from both chairs: Rahul tells Alexa+ his back pain is back, the
doctor reads Alexa's handover and prescribes, and that night Alexa+ reads him the new plan and stops a double dose.

## Before you record

Record on the live deployment (the App Runner URL in DEVPOST.md) or locally:

```bash
cd nirog-mcp
pnpm db:reset -- --yes   # clean clinic: Rahul back to three earlier visits, no doses, today's queue
pnpm build:demo
pnpm dev                 # do NOT set ARIA_MODEL=off: you want the real Bedrock model answering
```

Open the page in Chrome, full screen, at 1920 x 1080.

- **Run `pnpm db:reset -- --yes` before every take.** Memory, doses, consults and prescriptions live in Supabase now,
  so restarting the server does not reset them. Without it, take two starts with a fourth back-pain visit, the
  Ibuprofen already prescribed, and doses already logged.
- Allow the microphone once beforehand so the permission prompt is not in the video.
- Record the browser tab with system audio, so the assistant's voice is captured.
- **Type or click instead of speaking if the room is noisy.** A typed line that works beats a misheard spoken one.

The times are a guide. If you run long, shorten beat 7 first, then beat 6.

---

## 1. The problem · 0:00 to 0:15

**On screen:** the top of the page. The headline beside the sphere.

**Say:**
> In a village four hours from a clinic, nobody has a laptop. But there is an Echo on the shelf. Nirog for Alexa+
> turns it into the clinic's front door.

## 2. It remembers · 0:15 to 0:45

**On screen:** jump to **Talk** with the chat icon in the left rail.

**Do:** click the chip **"the ache is back again"**.

**The assistant says, roughly:**
> You have mentioned your lower back 3 times in the last 38 days. 5 weeks ago you said "my lower back has been
> aching for a few days, worse in the mornings". Is this the same thing?

**Say, while the trace fills in:**
> "The ache is back again" names no body part. The server found what Rahul said in July, in completely different
> words, and took the body region from it. The recurrence flag is arithmetic: three visits, one region, ninety
> days. No model decided it.

## 3. It asks like a nurse, then hands over · 0:45 to 1:05

**Do:** type `yes, same thing. worse in the mornings and when I bend to lift water`. Answer the next question
(`about three weeks`), and if there is a third, `no, nothing else`.

When it hands over, the trace shows **handover saved for the doctor · urgent consult queued**.

**Say:**
> The questions come from GPT-OSS on Amazon Bedrock. The handover does not. Code builds it from Rahul's own words,
> so nothing reaches the doctor that he did not say. And it is already in the doctor's queue.

## 4. The doctor's chair · 1:05 to 1:40

**On screen:** jump to **Doctor portal**. Rahul is at the top of the queue with an **Alexa+** tag.

**Do:** click **Start**. The ARIA handover opens beside the form, marked *Rules-based*. Point at the prescription:
**Amlodipine is already on it**.

**Say:**
> The doctor sees the handover before saying hello. His blood-pressure tablet is carried forward, so a new
> prescription can't silently stop it.

**Do:** type an assessment (`Mechanical low back pain, recurrent. No red flags.`), add `Ibuprofen` `400mg`
`Twice daily`, click **File consultation**.

## 5. Back to Alexa, that night · 1:40 to 2:05

**On screen:** back to **Talk**.

**Do:** click **"medicines tonight?"**. Alexa+ reads both medicines: Amlodipine and the Ibuprofen just prescribed.

**Do:** type `I took my Ibuprofen`, then the same line again.

**The assistant refuses the second one**, in words that depend on the time of day: either "The night dose of
Ibuprofen 400mg is already recorded" or "Ibuprofen 400mg was recorded at 7:42 pm, less than four hours ago",
followed by "Please do not take another one now."

**Say:**
> The plan the doctor filed a minute ago is what Alexa reads tonight. And it won't let him take the same dose twice.

## 6. Hindi, and an emergency · 2:05 to 2:30

**Do:** click **हिं** in the bar, then the chip **"सीने में दर्द, पसीना"**.

**On screen:** the sphere and the bar turn red. The assistant answers in Hindi with the 108 advice.

**Say:**
> In Hindi: chest pain and sweating. This does not go to a model. Fifteen rules, in English and Hindi: call 108,
> an emergency consult with his words attached, and his family contact's number on it for the doctor.

## 7. How it is built · 2:30 to 2:50

**On screen:** the **Trust log** tab in the doctor portal, then the Care loop section.

**Say:**
> One stateless MCP server over Streamable HTTP, with an Agent Skill. Bedrock for the conversation and the
> memory. Supabase with row-level security, and a trust log the database itself will not let anyone edit. Every
> request carries a consent token scoped to the household. And it is open source.

## 8. Close · 2:50 to 3:00

**On screen:** the top of the page.

**Say:**
> Nirog for Alexa+. Say what hurts. The clinic remembers.

---

## If something goes wrong on camera

| What you see | Why | What to do |
|---|---|---|
| "I could not reach the intake assistant…" | Bedrock did not answer (credentials or network) | Check `aws sts get-caller-identity`. To record anyway, restart with `ARIA_MODEL=off`; the questions are then built-in ones. Do not say "GPT-OSS" in that take. |
| "3 times in the last 38 days" reads as 4 | A previous take added a visit | `pnpm db:reset -- --yes` |
| Ibuprofen is already on the plan, or a dose is refused on the first try | A previous take filed or logged it | `pnpm db:reset -- --yes` |
| The recall sentence is missing | This was not the first turn of an intake | Click **Start over** in Talk |
| No Alexa+ consult in the queue | The intake has not handed over yet, or the queue has not refreshed | Answer one more question; the queue refreshes every 5 seconds |
| No voice in Hindi | The computer has no Hindi speech voice | The text still appears. Install a Hindi voice in the OS settings, or narrate over it |
| "Too many requests" on the live site | The public demo's per-address limit | Wait ten minutes, or record locally |

## What not to claim

- Do not say it was tested on an Echo. It was not; there is no Alexa+ sandbox. Say "simulated Alexa+ experience."
- Do not say the triage rules are clinically validated. They are not.
- Do not say the family is told or texted. Their number goes on the consult; no message is sent.
