# The patient portal

`/demo/#/patient`, or the "I'm a Patient" button. A patient's own view of the same clinic record the doctor portal
and the Alexa+ tools work from: their words, the summaries written for the doctor, the doctor's care plans, their
medicines and the doses they logged, and every line of the trust log about them.

## Routes

| Route | Who | What |
|---|---|---|
| `/demo/#/` | anyone | the landing page and the public demo |
| `/demo/#/patient` | a patient | sign in, then the record |
| `/demo/#/doctor` | a doctor | the clinic portal (unchanged) |

Hash routes, so the server serves one static page and nothing changes in `src/http.ts`. Refreshing a protected
route shows the gate, then the record once the stored session is accepted by the server again. A session the
server no longer accepts (expired, or signed with a rotated secret) drops back to the gate with nothing shown.

## Who gets which record

Google says who holds the account. It does not say which clinic record is theirs, and a name or an email in a
request must never be enough. So:

1. The clinic hands the patient a **one-time link code**. The doctor sees it on the patient's chart under
   "Patient portal" until it is used.
2. On the first sign-in the patient enters the code. `POST /auth/patient/session` binds Google's stable subject
   (`sub`) to that one patient row, in one statement that also requires the row to be unclaimed, and clears the code.
   Two sign-ins racing for one code cannot both win.
3. After that, Google alone opens the record. The binding is written to the trust log.

The session is a **consent token**, the same signed, scoped grant the MCP tools and the Alexa+ agent check
(`src/auth/tokens.ts`). It names the patients it covers:

- the account holder (`relationship = self`) gets their whole household;
- a child or parent on someone else's account gets only themselves.

Because the portal, `/api/agent`, `/api/speak` and `/mcp` all verify the same token, the patient page can run the
real intake for its own patient and can never read or write anyone outside that household. No endpoint takes a
patient id from the request to decide access; `GET /api/patient/me` reads the ids out of the signed token.

Sessions last 30 days (6 hours on the public demo) and are kept in `localStorage` like the doctor session; signing
out removes them from the device. Patient and doctor sessions are different token kinds and neither can be used as
the other: a patient token has no `kind: "doctor"` and fails `verifyDoctorSession`; a doctor session is not a
consent token and fails `verifyToken`.

## Endpoints

| Endpoint | Auth | Returns |
|---|---|---|
| `POST /auth/patient/session` `{ idToken, linkCode? }` | Google ID token, verified server-side | `{ status: "linked", token, patient, household }` or `{ status: "needs-link", identity }` |
| `GET /api/patient/me` | `Authorization: Bearer <consent token>` | for each patient in the token: record, complaints (own words, from memory), handovers, encounters, doses (90 days), open consults, trust-log lines about them |

`complaints` is `null`, not `[]`, when the memory store could not be read. The page says "could not be read just
now" rather than "nothing recorded".

On the public demo (`PUBLIC_DEMO=1`) the gate offers the fictional patients' chairs instead of Google:
`{ demo: { patientId } }` is accepted only for the seeded ids and gives a six-hour token. On an open development
server (no `GOOGLE_CLIENT_ID`, no `NIROG_TOKEN_SECRET`) a labelled demo identity `{ demo: { email, name } }`
stands in for Google so the link-code flow can be walked through. Neither is possible on a server with a secret
and a Google client id.

## Schema

`supabase/migrations/0002_patient_account.sql` adds four nullable columns to `patient`: `account_sub` (unique),
`account_email`, `link_code` (unique) and `linked_at`, and sets the seeded patients' codes where none exist.
Non-destructive; `pnpm db:migrate` applies it. RLS stays on with no policies: the browser never talks to Supabase.

| Patient | Code |
|---|---|
| Rahul Yadav | RY-4821 |
| Sunita Devi | SD-7304 |
| Meena Singh | MS-1197 |
| Aarav Yadav | AY-6630 |
| Imran Khan | IK-2258 |
| Lakshmi Bai | LB-9045 |

## Google sign-in

One Web OAuth client serves both portals. In Google Cloud Console create an OAuth client of type Web, add the
origin (for example `https://j2fkpyar4b.ap-south-1.awsapprunner.com` and `http://127.0.0.1:3333`) under Authorized
JavaScript origins, and set `GOOGLE_CLIENT_ID` on the server. Until it is set, the gate says so and offers the
demo paths above. The ID token is verified at Google's tokeninfo endpoint (signature, expiry), and the server
checks the audience and that the email is verified (`src/auth/doctor.ts`).

## What the page shows

- **Today.** Greeting, conditions and allergies on record, the medicines still running from the newest care plan,
  the next follow-up date, the last consultation, the last thing the patient said, and how many trust-log lines
  mention them. A waiting consult is shown at the top, with the 108 line when it is an emergency.
- **My history.** One timeline, newest first. Each entry is labelled by source: *You said* (the sentence as stored,
  with the body region it was placed under), *Summary for the doctor* (rules-assembled handover), *The doctor*
  (assessment, notes, prescriptions, tests, follow-up), *Dose logged*. Filters by source and by body region.
- **Medicines.** The current plan with days left, "I took it" which calls the same `log_dose_taken` MCP tool as
  Alexa+ (and is refused the same way for a double dose), and the doses logged in the last 90 days.
- **Talk to Nirog.** The real conversation, pinned to the signed-in patient: Amazon Nova routes the words to the MCP
  tools, Polly speaks the reply, the record refreshes after each turn.
- **Me.** Every trust-log line about the patient, the record's identity fields (read-only; changed by the clinic),
  the household, and sign-out.

Nothing on the page is computed from a model. Where a value is missing the page says so; it never invents a
reading, an appointment or an adherence percentage.

## Tests

`src/patient/routes.test.ts`: the link code binds once and is refused for a second account; a child's token covers
only the child; expired, forged and missing tokens are 401; a token for Meena cannot read Rahul; the public demo
accepts only the seeded ids.

## Not done

- A patient cannot grant or revoke a doctor's access from the page; consent is set by the clinic.
- No documents, no appointment booking, no messaging. Nothing on the page pretends otherwise.
- The link code is shown to the doctor in the clear. A real clinic would print it once or send it over a verified
  channel; the mechanism is the same.
