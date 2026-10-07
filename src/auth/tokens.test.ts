import { describe, expect, it } from "vitest";
import { consentDenial, scopeFromAuth } from "./consent.js";
import { consentVerifier, mintToken, verifyToken } from "./tokens.js";

const SECRET = "test-secret";
const future = Math.floor(Date.now() / 1000) + 3600;

describe("consent tokens", () => {
  it("round-trips", () => {
    const t = mintToken({ sub: "yadav-household", patients: ["pat_rahul", "pat_aarav"], exp: future }, SECRET);
    expect(verifyToken(t, SECRET)).toMatchObject({ sub: "yadav-household", patients: ["pat_rahul", "pat_aarav"] });
  });

  it("rejects tampering, wrong secret, and expiry", () => {
    const t = mintToken({ sub: "x", patients: ["pat_rahul"], exp: future }, SECRET);
    const [payload, sig] = t.split(".");
    const tampered = Buffer.from(JSON.stringify({ sub: "x", patients: ["pat_sunita"], exp: future, iat: 0 })).toString("base64url");
    expect(() => verifyToken(`${tampered}.${sig}`, SECRET)).toThrow(/signature/);
    expect(() => verifyToken(t, "other")).toThrow(/signature/);
    expect(() => verifyToken(mintToken({ sub: "x", patients: [], exp: 1 }, SECRET), SECRET)).toThrow(/expired/);
    expect(() => verifyToken(payload, SECRET)).toThrow(/malformed/);
  });

  it("maps to scopes the tools check", async () => {
    const t = mintToken({ sub: "yadav-household", patients: ["pat_rahul"], exp: future }, SECRET);
    const auth = await consentVerifier(SECRET).verifyAccessToken(t);
    expect(auth.scopes).toEqual(["patient:pat_rahul"]);
    const scope = scopeFromAuth(auth);
    expect(consentDenial(scope, "pat_rahul")).toBeNull();
    expect(consentDenial(scope, "pat_sunita")).toMatch(/consent/);
    expect(consentDenial(scopeFromAuth(undefined), "anyone")).toBeNull();
  });
});
