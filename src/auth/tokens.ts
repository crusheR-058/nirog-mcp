/**
 * Household consent tokens.
 *
 * A token says: this Alexa+ account may act for these patients until this date.
 * It is minted by the clinic (scripts/token.ts) when a household consents, and the
 * MCP server verifies it on every request without a database round trip.
 *
 * Format: base64url(payload).base64url(hmac-sha256(payload, secret)).
 * Scopes are "patient:<id>", which is what the tools check against.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

export interface ConsentPayload {
  /** Who consented, e.g. "yadav-household". */
  sub: string;
  patients: string[];
  /** Seconds since epoch. */
  exp: number;
  iat: number;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

function sign(payload: string, secret: string): string {
  return b64(createHmac("sha256", secret).update(payload).digest());
}

export function mintToken(p: Omit<ConsentPayload, "iat">, secret: string): string {
  const payload = b64(JSON.stringify({ ...p, iat: Math.floor(Date.now() / 1000) } satisfies ConsentPayload));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyToken(token: string, secret: string, now = Date.now()): ConsentPayload {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) throw new InvalidTokenError("malformed token");
  const expected = sign(payload, secret);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new InvalidTokenError("bad signature");
  let parsed: ConsentPayload;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new InvalidTokenError("malformed payload");
  }
  if (!Array.isArray(parsed.patients) || typeof parsed.sub !== "string") throw new InvalidTokenError("malformed payload");
  if (parsed.exp * 1000 < now) throw new InvalidTokenError("consent expired");
  return parsed;
}

export function toAuthInfo(token: string, p: ConsentPayload): AuthInfo {
  return { token, clientId: p.sub, scopes: p.patients.map((id) => `patient:${id}`), expiresAt: p.exp };
}

/** An OAuthTokenVerifier for the SDK's requireBearerAuth middleware. */
export function consentVerifier(secret: string) {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      return toAuthInfo(token, verifyToken(token, secret));
    },
  };
}
