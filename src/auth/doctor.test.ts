import { describe, expect, it } from "vitest";
import { findDoctor, inviteCodeMatches, mintDoctorSession, verifyDoctorSession, verifyGoogleIdToken } from "./doctor.js";

const SECRET = "test";

describe("doctor sign-in", () => {
  it("finds doctors on the allowlist regardless of spacing and case", () => {
    expect(findDoctor(" hpr-ka-2019-44817 ")?.name).toBe("Dr. Ananya Rao");
    expect(findDoctor("HPR-XX-0000-00000")).toBeNull();
  });

  it("checks the invite code", () => {
    expect(inviteCodeMatches("nirog-2026")).toBe(true);
    expect(inviteCodeMatches("wrong")).toBe(false);
  });

  it("mints and verifies a session, rejecting tampering and expiry", () => {
    const base = { email: "a@x.in", googleSub: "1", registrationNo: "HPR-KA-2019-44817", name: "Dr. Ananya Rao", specialty: "GP", clinic: "C", verifiedAt: 1 };
    const t = mintDoctorSession(base, SECRET);
    expect(verifyDoctorSession(t, SECRET)?.email).toBe("a@x.in");
    expect(verifyDoctorSession(t, "other")).toBeNull();
    expect(verifyDoctorSession(mintDoctorSession(base, SECRET, -1), SECRET)).toBeNull();
  });

  it("verifies Google tokens by audience and verified email", async () => {
    const ok = async () => new Response(JSON.stringify({ aud: "cid", email: "d@x.in", email_verified: "true", sub: "9", name: "D" }), { status: 200 });
    await expect(verifyGoogleIdToken("t", "cid", ok as typeof fetch)).resolves.toMatchObject({ email: "d@x.in", sub: "9" });
    const wrongAud = async () => new Response(JSON.stringify({ aud: "other", email: "d@x.in", email_verified: "true", sub: "9" }), { status: 200 });
    await expect(verifyGoogleIdToken("t", "cid", wrongAud as typeof fetch)).rejects.toThrow(/different app/);
    const bad = async () => new Response("nope", { status: 400 });
    await expect(verifyGoogleIdToken("t", "cid", bad as typeof fetch)).rejects.toThrow(/did not accept/);
  });
});
