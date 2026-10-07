import { MockData } from "./mock.js";
import { SupabaseData } from "./supabase.js";
import type { NirogData } from "./types.js";

let cached: NirogData | undefined;

/** Picks the data source from NIROG_DATA_SOURCE (mock | supabase). Defaults to mock. */
export function getDataSource(): NirogData {
  if (cached) return cached;
  const kind = process.env.NIROG_DATA_SOURCE ?? "mock";
  if (kind === "supabase") {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required for the supabase source");
    cached = new SupabaseData(url, key);
  } else {
    cached = new MockData();
  }
  return cached;
}
