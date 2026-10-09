import type { NirogData } from "./data/types.js";

export const ALEXA_ACTOR = "Alexa+ (nirog-mcp)";

/**
 * Write one line to the trust log. Failures are logged and swallowed: losing an
 * audit row is bad, failing a patient's request because the audit write timed out
 * is worse.
 */
export async function audit(data: NirogData, action: string, target: string, reason?: string, actorName: string = ALEXA_ACTOR): Promise<void> {
  try {
    await data.recordAudit({ actorName, action, target, reason });
  } catch (err) {
    console.error("[audit] write failed:", err instanceof Error ? err.message : err);
  }
}
