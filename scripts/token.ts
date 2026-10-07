/**
 * Mint a household consent token.
 *
 *   pnpm consent-token pat_rahul,pat_aarav --sub yadav-household --days 30
 *
 * Requires NIROG_TOKEN_SECRET in .env (the same value the server runs with).
 */
import { mintToken } from "../src/auth/tokens.js";

const args = process.argv.slice(2);
const patients = (args[0] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const secret = process.env.NIROG_TOKEN_SECRET;
if (!secret) {
  console.error("NIROG_TOKEN_SECRET is not set in .env");
  process.exit(1);
}
if (!patients.length) {
  console.error("usage: pnpm consent-token <patient_id,...> [--sub household] [--days 30]");
  process.exit(1);
}
const days = Number(opt("days", "30"));
const token = mintToken({ sub: opt("sub", "household"), patients, exp: Math.floor(Date.now() / 1000) + days * 86_400 }, secret);
console.log(token);
