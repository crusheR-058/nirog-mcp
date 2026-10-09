import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mintDoctorSession, sessionSecret } from "../auth/doctor.js";
import { getDataSource } from "../data/index.js";
import { runRedFlag } from "../tools/red-flag.js";
import { clinicRoutes } from "./routes.js";

let base = "";
let close: () => void = () => undefined;

beforeAll(async () => {
  const app = express();
  app.use("/api/clinic", clinicRoutes());
  await new Promise<void>((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/clinic`;
      close = () => server.close();
      resolve();
    });
  });
});
afterAll(() => close());

describe("/api/clinic", () => {
  it("shows the doctor a consult that Alexa+ queued through the MCP tool", async () => {
    await runRedFlag(getDataSource(), { patientId: "pat_rahul", symptoms: "chest pain and sweating" });
    const live = (await (await fetch(`${base}/live`)).json()) as { consults: Array<{ patientId: string; triage: string }>; audit: Array<{ action: string; actorName: string }>; patients: unknown[] };
    expect(live.consults[0]).toMatchObject({ patientId: "pat_rahul", triage: "emergency" });
    expect(live.audit.map((a) => a.action)).toEqual(expect.arrayContaining(["Queued consult", "Alerted family contact"]));
    expect(live.audit[0].actorName).toBe("Alexa+ (nirog-mcp)");
    expect(live.patients).toHaveLength(6);
  });

  it("records a doctor's action under the signed-in doctor's own name", async () => {
    const session = mintDoctorSession({ email: "a@x.in", googleSub: "1", registrationNo: "HPR-KA-2019-44817", name: "Dr. Ananya Rao", specialty: "GP", clinic: "C", verifiedAt: 1 }, sessionSecret());
    const r = await fetch(`${base}/audit`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session}` },
      body: JSON.stringify({ action: "Viewed chart", target: "Rahul Yadav", reason: "Queue", actorName: "Someone Else" }),
    });
    expect(r.status).toBe(200);
    const live = (await (await fetch(`${base}/live`)).json()) as { audit: Array<{ action: string; actorName: string }> };
    expect(live.audit[0]).toMatchObject({ action: "Viewed chart", actorName: "Dr. Ananya Rao" });
  });

  it("refuses everyone but a signed-in doctor once the server has a secret", async () => {
    process.env.NIROG_TOKEN_SECRET = "prod-secret";
    try {
      expect((await fetch(`${base}/live`)).status).toBe(401);
      expect((await fetch(`${base}/live`, { headers: { authorization: "Bearer forged.token" } })).status).toBe(401);
      const ok = mintDoctorSession({ email: "a@x.in", googleSub: "1", registrationNo: "R", name: "Dr. A", specialty: "GP", clinic: "C", verifiedAt: 1 }, "prod-secret");
      expect((await fetch(`${base}/live`, { headers: { authorization: `Bearer ${ok}` } })).status).toBe(200);
    } finally {
      delete process.env.NIROG_TOKEN_SECRET;
    }
  });

  it("rejects an audit line with no action", async () => {
    const r = await fetch(`${base}/audit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: "x" }) });
    expect(r.status).toBe(400);
  });
});
