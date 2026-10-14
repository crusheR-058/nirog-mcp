import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { sessionSecret, verifyDoctorSession } from "./doctor.js";
import { authRoutes } from "./routes.js";
import { verifyToken } from "./tokens.js";

async function serve(): Promise<{ base: string; close: () => void }> {
  const app = express();
  app.use("/auth", authRoutes());
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth`, close: () => server.close() }));
  });
}

afterEach(() => {
  delete process.env.PUBLIC_DEMO;
  delete process.env.NIROG_TOKEN_SECRET;
});

describe("/auth/demo", () => {
  it("hands a public-demo visitor a signed consent token for the demo patients and a one-day doctor session", async () => {
    process.env.PUBLIC_DEMO = "1";
    process.env.NIROG_TOKEN_SECRET = "demo-secret";
    const { base, close } = await serve();
    try {
      const r = (await (await fetch(`${base}/demo`)).json()) as { consentToken: string; doctorSession: string };
      const consent = verifyToken(r.consentToken, "demo-secret");
      expect(consent.sub).toBe("public-demo");
      expect(consent.patients).toContain("pat_rahul");
      expect(consent.exp - Date.now() / 1000).toBeLessThanOrEqual(6 * 3600);
      const doctor = verifyDoctorSession(r.doctorSession, sessionSecret());
      expect(doctor).toMatchObject({ name: "Dr. Ananya Rao", registrationNo: "HPR-KA-2019-44817" });
      expect(((await (await fetch(`${base}/config`)).json()) as { demoSignIn: boolean }).demoSignIn).toBe(true);
    } finally {
      close();
    }
  });

  it("does not exist on a server that is not a public demo", async () => {
    process.env.NIROG_TOKEN_SECRET = "prod-secret";
    const { base, close } = await serve();
    try {
      expect((await fetch(`${base}/demo`)).status).toBe(404);
      expect(((await (await fetch(`${base}/config`)).json()) as { demoSignIn: boolean }).demoSignIn).toBe(false);
    } finally {
      close();
    }
  });
});
