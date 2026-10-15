# Platform evolution: landing page, patient portal, doctor portal, the 3D avatar

Started 15 October 2026. Nirog began as a patient mobile app and a doctor web app. This repository's web page is
becoming the whole product: a public landing page, a patient portal, the doctor portal, and the assistant.

## What was found (audit, 15 Oct)

- **Routing.** One Vite page served at `/demo`, hash-routed: `#/` is the deck (landing plus live demo), `#/doctor`
  the doctor page. The server (`src/http.ts`) serves static files and three APIs: `/mcp`, `/api/agent` and
  `/api/speak` (consent token), `/api/clinic` (doctor session).
- **Sign-in.** Google Identity Services in the browser, the ID token verified server-side at Google's tokeninfo
  endpoint; doctors then verify once with a registration number and invite code and get a signed 30-day session.
- **Identity.** Consent tokens name the patients a caller may act for. The MCP tools and the agent check them; the
  doctor API checks the doctor session. There was no patient-side session and no account-to-record link.
- **Records.** Supabase: `patient`, `household`, `handover`, `consult`, `encounter`, `dose`, `audit_event`
  (append-only). Complaints in the patient's own words live in the memory store (`complaint`, `visit`) with
  embeddings. `NirogData` (`src/data/types.ts`) is the one contract, with mock and Supabase implementations.
- **3D.** The page has a Three.js particle field (React Three Fiber). The mobile app's model is
  `chloe_avatar.glb` (14.9 MB): a rigged nurse avatar with facial morph targets and an idle clip, driven by a
  1,636-line self-contained scene (`components/nurseHtml.ts` in the Expo app). It is an avatar, not an anatomical
  body. It is outside this repository, in `C:\Projects\Nirog Mobile App\assets`.
- **Baseline.** 97 tests green; typecheck and build green; the live service at App Runner.

## Decisions

1. **Keep hash routes.** No server change, nothing breaks, `#/doctor` keeps working. Add `#/patient`.
2. **Keep the landing page.** The deck is the landing page; it gains "I'm a Patient" and "I'm a Doctor" doors. A
   separate marketing redesign is not what wins here; a working connected product is.
3. **One authorization path.** A patient session *is* a consent token. The portal, the agent, the voice and the MCP
   tools verify the same signed grant, so there is one place access is decided. See `docs/PATIENT_PORTAL.md`.
4. **Account-to-record binding by one-time clinic code**, bound to Google's stable subject in one atomic statement.
   Never by name or email.
5. **History as the centre.** The patient page is a labelled timeline of their own words, the summaries, the doctor's
   plans and their doses, with provenance visible. Nothing is model-written on that page.
6. **The avatar, not a body map.** Chloe is a nurse: she becomes ARIA's face on "Talk to Nirog", loaded only there,
   from a compressed copy of the GLB, driven by the unmodified scene in an iframe with a small host shim (the
   approach that already worked once in the Nirog web app). "Where it hurt" uses the server's own body regions as a
   2D map. Rebuilding the avatar in React Three Fiber was rejected: 1,600 working lines for no gain.

## Phases

| Phase | Status |
|---|---|
| 1. Audit and plan | done, this document |
| 2. Routes and doors (`#/patient`, landing buttons) | done |
| 3. Server: patient accounts, link codes, `/auth/patient/session`, `/api/patient/me`, migration 0002, tests | done |
| 4. Patient page: gate, Today, My history, Medicines, Talk, Me | done |
| 5. Doctor chart shows the patient's portal status and link code | done |
| 6. Chloe on "Talk to Nirog": compressed GLB, iframe scene, Polly voice, fallback | done (`docs/3D_MODEL_MIGRATION.md`) |
| 7. "Where it hurt": filter by the server's body regions on the history | done as chips; a drawn silhouette is optional polish |
| 8. End-to-end story: patient speaks, doctor files, patient sees the plan | next |

## Risks

- The 14.9 MB avatar must not slow the patient page: it loads only on the Talk tab, after the page, and the page
  works without it.
- The link code is a shared secret shown to the doctor; it is one-time and bound to one row, but a clinic must
  hand it over in person or by a verified channel.
- `localStorage` sessions, as the doctor page already uses. A cookie session would need the server to issue and
  check CSRF tokens on every API; not done in this window.
