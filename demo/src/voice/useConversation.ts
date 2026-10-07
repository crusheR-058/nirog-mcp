import { useCallback, useEffect, useState } from "react";
import { callTool, loadSettings, saveSettings, type Settings } from "../mcp";
import { canListen, listenOnce, speak, stopSpeaking } from "../speech";
import { useDemo, type Level } from "../store";
import { patientById } from "../clinic/data";

const CARE_PLAN = /\b(medicine|medicines|tablet|tablets|dawai|dose|pills?|tests?|follow[- ]?up|next visit|doctor next|what do i take)\b/i;
const SYMPTOM = /pain|ache|hurt|fever|cough|dizzy|bleed|breath|vomit|sweat/i;

export function summarize(tool: string, r: unknown): string[] {
  if (!r || typeof r !== "object") return [];
  const o = r as Record<string, unknown>;
  const out: string[] = [];
  if (tool === "start_intake") {
    const rec = o.recorded as { region?: string; regionSource?: string; inheritedFrom?: string | null } | undefined;
    if (rec) out.push(`region: ${rec.region} (${rec.regionSource}${rec.inheritedFrom ? `, from "${rec.inheritedFrom}"` : ""})`);
    for (const m of (o.recall as Array<{ text: string; when: string; distance: number }>) ?? []) out.push(`recall d=${m.distance.toFixed(3)} · ${m.when}: "${m.text}"`);
    const f = o.recurrence as { level: string; visitCount: number; spanDays: number } | null;
    if (f) out.push(`recurrence: ${f.level}, ${f.visitCount} visits in ${f.spanDays} days`);
    const t = o.triage as { level: string; matched: string[] };
    if (t) out.push(`triage: ${t.level}${t.matched.length ? ` (${t.matched.join(", ")})` : ""}`);
    const a = o.aria as { model?: string; complete?: boolean; redFlag?: boolean; error?: string };
    if (a?.error) out.push(`aria: ${a.error}`);
    else if (a) out.push(`aria: ${a.model}${a.complete ? " · handover" : ""}${a.redFlag ? " · red flag" : ""}`);
    const mem = o.memory as { degraded: boolean; embedProvider: string; latencyMs: number };
    if (mem) out.push(`memory: ${mem.degraded ? "DEGRADED" : mem.embedProvider} · ${mem.latencyMs} ms`);
  } else if (tool === "report_red_flag") {
    out.push(`level: ${o.level}`);
    for (const a of (o.actions as Array<{ type: string; detail: string }>) ?? []) out.push(`${a.type}: ${a.detail}`);
  } else if (tool === "get_care_plan") {
    for (const m of (o.medications as Array<{ drug: string; strength?: string; timesOfDay: string[]; status: string }>) ?? []) out.push(`${m.drug} ${m.strength ?? ""} · ${m.timesOfDay.join(", ")} · ${m.status}`);
    const fu = o.followUp as { status: string; daysUntil: number } | null;
    if (fu) out.push(`follow-up: ${fu.status} (${fu.daysUntil} days)`);
  }
  return out;
}

/** One conversation, shared by the voice bar and the Talk section. */
export function useConversation() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [health, setHealth] = useState<"unknown" | "ok" | "bad">("unknown");
  const { phase, turns, setPhase, setLevel, addTurn, addTrace, finishTrace, setComplete, bump, addAudit, addQueue, setMemoryDegraded } = useDemo();

  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => {
    const url = settings.endpoint.replace(/\/mcp\/?$/, "/health");
    fetch(url).then((r) => setHealth(r.ok ? "ok" : "bad")).catch(() => setHealth("bad"));
  }, [settings.endpoint]);

  const say = useCallback(
    (text: string, level?: Level) =>
      new Promise<void>((resolve) => {
        addTurn({ role: "assistant", text, level });
        setPhase("speaking");
        speak(text, () => {
          setPhase("idle");
          resolve();
        });
      }),
    [addTurn, setPhase],
  );

  const handle = useCallback(
    async (utterance: string) => {
      const text = utterance.trim();
      if (!text || phase === "thinking") return;
      setNotice(null);
      addTurn({ role: "user", text });
      setPhase("thinking");

      const transcript = turns.map((t) => ({ role: t.role, text: t.text }));
      const tool = CARE_PLAN.test(text) && !SYMPTOM.test(text) ? "get_care_plan" : "start_intake";
      const args = tool === "get_care_plan" ? { patient_id: settings.patientId } : { patient_id: settings.patientId, complaint: text, transcript };
      const id = addTrace({ tool, args });
      const r = await callTool(settings, tool, args);
      finishTrace(id, { ms: r.ms, error: r.error, summary: summarize(tool, r.result) });
      const who = patientById(settings.patientId)?.fullName ?? settings.patientId;
      addAudit({ actorName: "Alexa+ (nirog-mcp)", action: r.error ? `Refused ${tool}` : `Called ${tool}`, target: who, reason: r.error ? r.error.slice(0, 80) : tool === "get_care_plan" ? "Patient asked about medicines" : "Patient described a symptom" });
      if (r.error) {
        setPhase("idle");
        setNotice({ text: r.error, error: true });
        return;
      }
      const res = r.result as Record<string, unknown>;
      const triage = res.triage as { level: Level } | undefined;
      const aria = res.aria as { complete?: boolean; redFlag?: boolean } | undefined;
      const level = triage?.level ?? "routine";
      setLevel(level);
      const mem = res.memory as { degraded?: boolean } | undefined;
      if (mem) setMemoryDegraded(Boolean(mem.degraded));
      if (level !== "emergency") await say(String(res.spoken ?? ""), level);

      if (tool === "start_intake" && (level !== "routine" || aria?.redFlag)) {
        const rfArgs = { patient_id: settings.patientId, symptoms: text, model_red_flag: Boolean(aria?.redFlag) };
        const rid = addTrace({ tool: "report_red_flag", args: rfArgs });
        setPhase("thinking");
        const rr = await callTool(settings, "report_red_flag", rfArgs);
        finishTrace(rid, { ms: rr.ms, error: rr.error, summary: summarize("report_red_flag", rr.result) });
        if (!rr.error) {
          const rf = rr.result as { level: Level; spoken: string; consultId: string | null; actions: Array<{ type: string }> };
          setLevel(rf.level);
          if (rf.consultId) {
            bump("consults");
            addQueue({ id: rf.consultId, patientId: settings.patientId, kind: rf.level === "emergency" ? "emergency" : "new", triage: rf.level, state: "waiting", checkedInAt: new Date().toISOString(), scheduledFor: new Date().toISOString(), channel: "audio", reason: `Alexa+: "${text.slice(0, 60)}"`, quality: "fair", redFlagCount: 1, source: "alexa" });
            addAudit({ actorName: "Alexa+ (nirog-mcp)", action: "Queued consult", target: who, reason: `${rf.level} · rules-based triage` });
          }
          if (rf.actions.some((a) => a.type === "caregiver_alerted")) {
            bump("alerts");
            addAudit({ actorName: "Alexa+ (nirog-mcp)", action: "Alerted family contact", target: who, reason: "Red flag escalation" });
          }
          await say(rf.spoken, rf.level);
        } else setPhase("idle");
      }
      if (aria?.complete) setComplete(true);
    },
    [phase, turns, settings, addTurn, addTrace, finishTrace, say, setLevel, setPhase, setComplete, bump, addAudit, addQueue, setMemoryDegraded],
  );

  const talk = useCallback(async () => {
    if (phase === "listening") return;
    stopSpeaking();
    setNotice(null);
    setPhase("listening");
    try {
      const heard = await listenOnce();
      setPhase("idle");
      if (heard) await handle(heard);
      else setNotice({ text: "I didn't catch that." });
    } catch (e) {
      setPhase("idle");
      setNotice({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  }, [phase, handle, setPhase]);

  return { settings, setSettings, notice, health, phase, canListen, handle, talk, stop: stopSpeaking };
}
