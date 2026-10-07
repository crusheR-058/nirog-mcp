import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

/** Which patients the current caller may act for. `all` only when auth is disabled (local dev). */
export type ConsentScope = { kind: "all" } | { kind: "patients"; sub: string; patients: string[] };

export function scopeFromAuth(auth: AuthInfo | undefined): ConsentScope {
  if (!auth) return { kind: "all" };
  return {
    kind: "patients",
    sub: auth.clientId,
    patients: auth.scopes.filter((s) => s.startsWith("patient:")).map((s) => s.slice("patient:".length)),
  };
}

/** Null when allowed, otherwise the sentence to speak. Never reveals whether the patient exists. */
export function consentDenial(scope: ConsentScope, patientId: string): string | null {
  if (scope.kind === "all" || scope.patients.includes(patientId)) return null;
  return "I don't have consent to access that person's health record from this device. A family member can grant it in the Nirog app.";
}
