import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { authRoutes } from "../auth/routes.js";
import { sessionSecret } from "../auth/doctor.js";
import { mintToken, verifyToken } from "../auth/tokens.js";
import { patientRoutes } from "./routes.js";
import type { PatientHistory } from "./routes.js";

async function serve(): Promise<{ base: string; close: () => void }> {
  const app = express();
  app.use("/auth", authRoutes());
  app.use("/api/patient", patientRoutes());
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() }));
  });
}

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const me = async (base: string, token?: string) => fetch(`${base}/api/patient/me`, token ? { headers: { authorization: `Bearer ${token}` } } : {});

afterEach(() => {
  delete process.env.PUBLIC_DEMO;
  delete process.env.NIROG_TOKEN_SECRET;
});

describe("patient sign-in and record access", () => {
  it("binds a Google account to one record with the clinic's link code, once", async () => {
    // Open development server: a labelled demo identity stands in for Google, so the link flow can be walked through.
    const { base, close } = await serve();
    try {
      const first = await post(`${base}/auth/patient/session`, { demo: { email: "rahul@example.in", name: "Rahul" } });
      expect(((await first.json()) as { status: string }).status).toBe("needs-link");

      const wrong = await post(`${base}/auth/patient/session`, { demo: { email: "rahul@example.in", name: "Rahul" }, linkCode: "ZZ-0000" });
      expect(wrong.status).toBe(403);

      const linked = (await (await post(`${base}/auth/patient/session`, { demo: { email: "rahul@example.in", name: "Rahul" }, linkCode: "ry-4821" })).json()) as { status: string; token: string; patient: { id: string }; household: Array<{ id: string }> };
      expect(linked.status).toBe("linked");
      expect(linked.patient.id).toBe("pat_rahul");
      // Rahul holds the account, so he sees the family he cares for.
      expect(linked.household.map((p) => p.id).sort()).toEqual(["pat_aarav", "pat_lakshmi", "pat_rahul"]);
      expect(verifyToken(linked.token, sessionSecret()).patients).toContain("pat_lakshmi");

      // The code is spent: another account cannot take the record, and Rahul's account needs no code next time.
      const again = await post(`${base}/auth/patient/session`, { demo: { email: "someone@else.in", name: "X" }, linkCode: "RY-4821" });
      expect(again.status).toBe(403);
      const back = (await (await post(`${base}/auth/patient/session`, { demo: { email: "rahul@example.in", name: "Rahul" } })).json()) as { status: string; patient: { id: string } };
      expect(back).toMatchObject({ status: "linked", patient: { id: "pat_rahul" } });
    } finally {
      close();
    }
  });

  it("gives a child on a family account only their own record", async () => {
    const { base, close } = await serve();
    try {
      const r = (await (await post(`${base}/auth/patient/session`, { demo: { email: "aarav@example.in", name: "Aarav" }, linkCode: "AY-6630" })).json()) as { token: string; household: Array<{ id: string }> };
      expect(r.household.map((p) => p.id)).toEqual(["pat_aarav"]);
      const mine = (await (await me(base, r.token)).json()) as { patients: PatientHistory[] };
      expect(mine.patients.map((p) => p.record.id)).toEqual(["pat_aarav"]);
    } finally {
      close();
    }
  });

  it("reads only the patients inside the token, and refuses everything else", async () => {
    const { base, close } = await serve();
    try {
      expect((await me(base)).status).toBe(401);
      expect((await me(base, "forged.token")).status).toBe(401);
      expect((await me(base, mintToken({ sub: "x", patients: ["pat_rahul"], exp: 1 }, sessionSecret()))).status).toBe(401); // expired

      const token = mintToken({ sub: "patient:pat_meena", patients: ["pat_meena"], exp: Math.floor(Date.now() / 1000) + 60 }, sessionSecret());
      const mine = (await (await me(base, token)).json()) as { patients: PatientHistory[] };
      expect(mine.patients).toHaveLength(1);
      expect(mine.patients[0].record.fullName).toBe("Meena Singh");
      expect(mine.patients.some((p) => p.record.id === "pat_rahul")).toBe(false);

      const rahul = mintToken({ sub: "patient:pat_rahul", patients: ["pat_rahul"], exp: Math.floor(Date.now() / 1000) + 60 }, sessionSecret());
      const his = (await (await me(base, rahul)).json()) as { patients: PatientHistory[] };
      expect(his.patients[0].encounters.map((e) => e.id)).toContain("enc_rahul_prev");
      expect(his.patients[0].complaints?.map((c) => c.bodyRegion)).toContain("lower_back");
    } finally {
      close();
    }
  });

  it("lets a public-demo visitor sit in a fictional patient's chair, and nobody else's", async () => {
    process.env.PUBLIC_DEMO = "1";
    process.env.NIROG_TOKEN_SECRET = "demo-secret";
    const { base, close } = await serve();
    try {
      const r = (await (await post(`${base}/auth/patient/session`, { demo: { patientId: "pat_rahul" } })).json()) as { token: string; household: unknown[] };
      const payload = verifyToken(r.token, "demo-secret");
      expect(payload.sub).toBe("patient:pat_rahul");
      expect(payload.exp - Date.now() / 1000).toBeLessThanOrEqual(6 * 3600);
      expect(r.household).toHaveLength(3);
      expect((await post(`${base}/auth/patient/session`, { demo: { patientId: "pat_someone_real" } })).status).toBe(403);
    } finally {
      close();
    }
  });
});
