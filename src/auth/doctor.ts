/**
 * Doctor sign-in for the portal.
 *
 * Two gates, in order:
 *   1. Google. The browser signs in with Google Identity Services and sends the ID token
 *      here. We verify it with Google's tokeninfo endpoint and require our client id as
 *      the audience and a verified email.
 *   2. One-time verification. The doctor enters their medical registration number and the
 *      clinic invite code. Both must match the clinic allowlist. This binds the Google
 *      email to the doctor record.
 *
 * The result is a signed doctor session (same HMAC scheme as consent tokens) that the
 * browser keeps. On later visits the session is re-validated after the Google step, so
 * verification happens once per doctor, not every time.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface DoctorRecord {
  registrationNo: string;
  name: string;
  specialty: string;
  clinic: string;
}

/** Clinic allowlist. Override with DOCTOR_ALLOWLIST (JSON array) in production. */
export const DEFAULT_DOCTORS: DoctorRecord[] = [
  { registrationNo: "HPR-KA-2019-44817", name: "Dr. Ananya Rao", specialty: "General Physician", clinic: "Nirog Rural Care Network" },
  { registrationNo: "HPR-UP-2015-10233", name: "Dr. Imran Sheikh", specialty: "Orthopaedics", clinic: "Nirog Rural Care Network" },
  { registrationNo: "HPR-KL-2020-77810", name: "Dr. Kavya Menon", specialty: "Internal Medicine", clinic: "Nirog Rural Care Network" },
];

export function loadAllowlist(): DoctorRecord[] {
  const raw = process.env.DOCTOR_ALLOWLIST;
  if (!raw) return DEFAULT_DOCTORS;
  try {
    const parsed = JSON.parse(raw) as DoctorRecord[];
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_DOCTORS;
  } catch {
    return DEFAULT_DOCTORS;
  }
}

export const normalizeReg = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");

export function findDoctor(registrationNo: string, list = loadAllowlist()): DoctorRecord | null {
  const key = normalizeReg(registrationNo);
  return list.find((d) => normalizeReg(d.registrationNo) === key) ?? null;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export class GoogleAuthError extends Error {}

/**
 * Verify a Google ID token. Uses Google's tokeninfo endpoint, which checks the signature
 * and expiry for us; we check the audience and that the email is verified.
 */
export async function verifyGoogleIdToken(idToken: string, clientId: string, fetchImpl: typeof fetch = fetch): Promise<GoogleIdentity> {
  const res = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) throw new GoogleAuthError("Google did not accept that sign-in. Try again.");
  const info = (await res.json()) as Record<string, string>;
  if (info.aud !== clientId) throw new GoogleAuthError("That sign-in was for a different app.");
  if (info.email_verified !== "true") throw new GoogleAuthError("Your Google email is not verified.");
  return { sub: info.sub, email: info.email, name: info.name ?? info.email, picture: info.picture };
}

/* ── Doctor sessions ──────────────────────────────────────────────────────── */

export interface DoctorSession {
  kind: "doctor";
  email: string;
  googleSub: string;
  registrationNo: string;
  name: string;
  specialty: string;
  clinic: string;
  picture?: string;
  verifiedAt: number;
  exp: number;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const sign = (payload: string, secret: string) => b64(createHmac("sha256", secret).update(payload).digest());

export function mintDoctorSession(s: Omit<DoctorSession, "kind" | "exp">, secret: string, days = 30): string {
  const payload = b64(JSON.stringify({ ...s, kind: "doctor", exp: Math.floor(Date.now() / 1000) + days * 86_400 } satisfies DoctorSession));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyDoctorSession(token: string, secret: string, now = Date.now()): DoctorSession | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(payload, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DoctorSession;
    if (s.kind !== "doctor" || s.exp * 1000 < now) return null;
    return s;
  } catch {
    return null;
  }
}

/** The signing secret: NIROG_TOKEN_SECRET, or a per-process random one in open dev mode. */
let ephemeral: string | undefined;
export function sessionSecret(): string {
  if (process.env.NIROG_TOKEN_SECRET) return process.env.NIROG_TOKEN_SECRET;
  ephemeral ??= randomBytes(32).toString("hex");
  return ephemeral;
}

export function inviteCodeMatches(code: string): boolean {
  const want = (process.env.CLINIC_INVITE_CODE ?? "NIROG-2026").trim().toUpperCase();
  return code.trim().toUpperCase() === want;
}
