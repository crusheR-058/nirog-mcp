import express, { type Request, type Response, type Router } from "express";
import { MOCK_PATIENTS } from "../data/mock.js";
import { findDoctor, GoogleAuthError, inviteCodeMatches, loadAllowlist, mintDoctorSession, sessionSecret, verifyDoctorSession, verifyGoogleIdToken } from "./doctor.js";
import { mintToken } from "./tokens.js";

/**
 * /auth routes for the doctor portal.
 *
 *   GET  /auth/config                  which Google client id the page should use
 *   POST /auth/doctor/session          { idToken, session? }   Google step; returns a session if this doctor was verified before
 *   POST /auth/doctor/verify           { idToken, registrationNo, inviteCode }   one-time verification; returns a new session
 *   POST /auth/doctor/signout          nothing to revoke server-side (sessions are signed), kept for symmetry
 *   GET  /auth/demo                    PUBLIC_DEMO only: a short-lived consent token for the demo household and a demo doctor session
 *
 * PUBLIC_DEMO=1 is for the hackathon deployment, where judges have no Alexa+ account and are not clinic doctors. Every
 * patient in it is fictional. Tokens are still signed and checked; the demo only hands them out. Never set it with real data.
 */
export function authRoutes(): Router {
  const r = express.Router();
  r.use(express.json({ limit: "32kb" }));
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const publicDemo = process.env.PUBLIC_DEMO === "1";
  // The labelled demo identity: on an open dev server, or on the public demo deployment.
  const demoIdentity = publicDemo || (!clientId && !process.env.NIROG_TOKEN_SECRET);

  r.get("/config", (_req: Request, res: Response) => {
    res.json({ googleClientId: clientId || null, inviteHint: process.env.CLINIC_INVITE_CODE && !publicDemo ? null : (process.env.CLINIC_INVITE_CODE ?? "NIROG-2026"), demoSignIn: demoIdentity });
  });

  const identify = async (req: Request) => {
    const { idToken, demo } = req.body as { idToken?: string; demo?: { email: string; name: string } };
    // Open dev mode without a Google client id: a labelled demo identity so the flow can be walked through.
    if (demoIdentity && demo?.email && !idToken) return { sub: `demo:${demo.email}`, email: demo.email, name: demo.name || demo.email, picture: undefined };
    if (!clientId) throw new GoogleAuthError("Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID.");
    if (!idToken) throw new GoogleAuthError("No Google sign-in received.");
    return verifyGoogleIdToken(idToken, clientId);
  };

  r.post("/doctor/session", async (req: Request, res: Response) => {
    try {
      const who = await identify(req);
      const { session } = req.body as { session?: string };
      const existing = session ? verifyDoctorSession(session, sessionSecret()) : null;
      if (existing && existing.email === who.email) {
        // Refresh the session so the 30-day window rolls forward.
        const { kind: _k, exp: _e, ...rest } = existing;
        return res.json({ status: "verified", session: mintDoctorSession({ ...rest, picture: who.picture ?? existing.picture }, sessionSecret()), doctor: rest });
      }
      return res.json({ status: "needs-verification", identity: { email: who.email, name: who.name, picture: who.picture } });
    } catch (e) {
      res.status(e instanceof GoogleAuthError ? 401 : 500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.post("/doctor/verify", async (req: Request, res: Response) => {
    try {
      const who = await identify(req);
      const { registrationNo, inviteCode } = req.body as { registrationNo?: string; inviteCode?: string };
      const doctor = findDoctor(registrationNo ?? "");
      if (!doctor) return res.status(403).json({ error: "That registration number is not on this clinic's list. Ask the clinic admin to add you." });
      if (!inviteCodeMatches(inviteCode ?? "")) return res.status(403).json({ error: "The clinic invite code is wrong." });
      const payload = { email: who.email, googleSub: who.sub, picture: who.picture, registrationNo: doctor.registrationNo, name: doctor.name, specialty: doctor.specialty, clinic: doctor.clinic, verifiedAt: Date.now() };
      res.json({ status: "verified", session: mintDoctorSession(payload, sessionSecret()), doctor: payload });
    } catch (e) {
      res.status(e instanceof GoogleAuthError ? 401 : 500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.post("/doctor/signout", (_req: Request, res: Response) => res.json({ ok: true }));

  r.get("/demo", async (_req: Request, res: Response) => {
    const secret = process.env.NIROG_TOKEN_SECRET;
    if (!publicDemo || !secret) return res.status(404).json({ error: "Not a public demo server." });
    try {
      // The fictional seeded household only, never whatever else the database might hold.
      const patients = MOCK_PATIENTS.map((p) => p.id);
      const doctor = loadAllowlist()[0];
      const exp = Math.floor(Date.now() / 1000) + 6 * 3600;
      res.json({
        consentToken: mintToken({ sub: "public-demo", patients, exp }, secret),
        doctorSession: mintDoctorSession(
          { email: "demo@nirog.health", googleSub: "demo", registrationNo: doctor.registrationNo, name: doctor.name, specialty: doctor.specialty, clinic: doctor.clinic, verifiedAt: Date.now() },
          sessionSecret(),
          1,
        ),
      });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  return r;
}
