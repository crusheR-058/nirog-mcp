import { useCallback, useEffect, useRef, useState } from "react";
import { patientById } from "../clinic/data";
import { callTool, loadSettings, saveSettings, type Settings } from "../mcp";
import { canListen, listenOnce, speak, stopSpeaking } from "../speech";
import { refreshLive, useDemo, type Level } from "../store";

/* Which tool does this sentence want? A real Alexa+ agent decides this from the tool descriptions; the demo page uses plain patterns. */
const SYMPTOM = /pain|ache|hurt|fever|cough|dizzy|bleed|breath|vomit|sweat|faint|दर्द|बुखार|सांस|साँस|खांसी|खाँसी|चक्कर|उल्टी|पसीना|बेहोश|तकलीफ़|तकलीफ/i;
const DOSE = /\b(took|taken|had my|just had|have had)\b.*\b(medicines?|tablets?|pills?|dose|dawai|dawa|goli)\b|\b(dawai|dawa|goli)\b.*\b(le li|kha li|le liya|kha liya)\b|(दवा|दवाई|गोली)\s*(ले|खा)\s*(ली|लिया)/i;
const SUMMARY = /\b(this week|past week|last week|summary)\b|\bhow (is|has|was|have) .{1,30}(doing|been)\b|इस हफ्ते|इस हफ़्ते|कैसे हैं|कैसी हैं|हाल कैसा/i;
const CARE_PLAN = /\b(medicines?|tablets?|dawai|dose|pills?|tests?|follow[- ]?up|next visit|doctor next|what do i take)\b|कौन सी दवा|कौन-सी दवा|दवा कब|जाँच|जांच/i;

export function route(text: string): "start_intake" | "log_dose_taken" | "get_family_summary" | "get_care_plan" {
  // A symptom always wins: "I took my tablet but my chest still hurts" must reach triage, not the dose log.
  if (SYMPTOM.test(text)) return "start_intake";
  if (DOSE.test(text)) return "log_dose_taken";
  if (SUMMARY.test(text)) return "get_family_summary";
  if (CARE_PLAN.test(text)) return "get_care_plan";
  return "start_intake";
}

/** Name a medicine only when the patient actually said one of theirs. The server asks rather than guesses otherwise. */
function namedMedicine(text: string, patientId: string): string | undefined {
  const meds = patientById(patientId)?.medications ?? [];
  return meds.map((m) => m.split(" ")[0]).find((name) => text.toLowerCase().includes(name.toLowerCase()));
}

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
    const a = o.aria as { model?: string; complete?: boolean; redFlag?: boolean; error?: string; summary?: string | null };
    if (a?.error) out.push(`aria: ${a.error}`);
    else if (a) out.push(`aria: ${a.model}${a.complete ? " · handover" : ""}${a.redFlag ? " · red flag" : ""}`);
    if (a?.summary) out.push(`summary for the doctor: ${a.summary}`);
    const mem = o.memory as { degraded: boolean; embedProvider: string; latencyMs: number };
    if (mem) out.push(`memory: ${mem.degraded ? "DEGRADED" : mem.embedProvider} · ${mem.latencyMs} ms`);
  } else if (tool === "report_red_flag") {
    out.push(`level: ${o.level}`);
    for (const a of (o.actions as Array<{ type: string; detail: string }>) ?? []) out.push(`${a.type}: ${a.detail}`);
  } else if (tool === "get_care_plan") {
    for (const m of (o.medications as Array<{ drug: string; strength?: string; timesOfDay: string[]; status: string }>) ?? []) out.push(`${m.drug} ${m.strength ?? ""} · ${m.timesOfDay.join(", ")} · ${m.status}`);
    const fu = o.followUp as { status: string; daysUntil: number } | null;
    if (fu) out.push(`follow-up: ${fu.status} (${fu.daysUntil} days)`);
  } else if (tool === "log_dose_taken") {
    out.push(o.logged ? `logged: ${o.drug} · ${o.slot}` : `not logged: ${o.reason}`);
    const today = o.today as { expected: number; taken: number } | null;
    if (today) out.push(`today: ${today.taken} of ${today.expected} doses`);
    const left = (o.remainingToday as string[]) ?? [];
    if (left.length) out.push(`still to take: ${left.join(", ")}`);
  } else if (tool === "get_family_summary") {
    out.push(`complaints: ${o.complaints} in ${o.days} days`);
    const regions = Object.entries((o.regions as Record<string, number>) ?? {});
    if (regions.length) out.push(`regions: ${regions.map(([k, v]) => `${k} ${v}`).join(", ")}`);
    const f = o.recurrence as { level: string; region: string; visitCount: number; spanDays: number } | null;
    if (f) out.push(`pattern: ${f.level}, ${f.region}, ${f.visitCount} visits in ${f.spanDays} days`);
    const med = o.medicines as { expected: number; taken: number; adherencePct: number | null };
    if (med?.expected) out.push(`doses: ${med.taken} of ${med.expected} (${med.adherencePct}%)`);
    out.push(`privacy: counts only, no quotes`);
  }
  return out;
}

/** One conversation, shared by the voice bar and the Talk section. */
export function useConversation() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [health, setHealth] = useState<"unknown" | "ok" | "bad">("unknown");
  const { phase, turns, setPhase, setLevel, addTurn, addTrace, finishTrace, setComplete, bump, addAudit, addQueue, setMemoryDegraded } = useDemo();
  const language = settings.language;
  // Where the current intake began. A dose or a summary is not part of an intake, so it must not be sent as its transcript:
  // the server speaks the memory recall on an intake's opening turn, and stale turns would hide that it is one.
  const intakeFrom = useRef(0);
  const intakeOpen = useRef(false);

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
        }, language);
      }),
    [addTurn, setPhase, language],
  );

  const handle = useCallback(
    async (utterance: string) => {
      const text = utterance.trim();
      if (!text || phase === "thinking") return;
      setNotice(null);
      addTurn({ role: "user", text });
      setPhase("thinking");

      const pid = settings.patientId;
      const who = patientById(pid)?.fullName ?? pid;
      const tool = route(text);
      // Decided here, when the tool is chosen, and not after the reply is spoken: people interrupt.
      if (tool !== "start_intake") intakeOpen.current = false;
      else if (!intakeOpen.current) {
        intakeOpen.current = true;
        intakeFrom.current = turns.length;
      }
      const transcript = tool === "start_intake" ? turns.slice(Math.min(intakeFrom.current, turns.length)).map((t) => ({ role: t.role, text: t.text })) : [];
      const args: Record<string, unknown> =
        tool === "start_intake" ? { patient_id: pid, complaint: text, transcript, language }
        : tool === "log_dose_taken" ? { patient_id: pid, medicine: namedMedicine(text, pid), language }
        : tool === "get_family_summary" ? { patient_id: pid, days: 7, language }
        : { patient_id: pid, language };

      const id = addTrace({ tool, args });
      const r = await callTool(settings, tool, args);
      finishTrace(id, { ms: r.ms, error: r.error, summary: summarize(tool, r.result) });
      // The server writes its own trust log. The page only keeps a local copy when it cannot read the server's.
      const local = !useDemo.getState().live;
      if (local) addAudit({ actorName: "Alexa+ (nirog-mcp)", action: r.error ? `Refused ${tool}` : `Called ${tool}`, target: who, reason: r.error ? r.error.slice(0, 80) : undefined });
      if (r.error) {
        setPhase("idle");
        setNotice({ text: r.error, error: true });
        void refreshLive();
        return;
      }
      const res = r.result as Record<string, unknown>;
      const triage = res.triage as { level: Level } | undefined;
      const aria = res.aria as { complete?: boolean; redFlag?: boolean } | undefined;
      const level = triage?.level ?? "routine";
      setLevel(level);
      const mem = res.memory as { degraded?: boolean } | undefined;
      if (mem) setMemoryDegraded(Boolean(mem.degraded));
      // An emergency goes straight to escalation, which speaks the advice itself; everything else is spoken here.
      if (level !== "emergency") await say(String(res.spoken ?? ""), level);

      if (tool === "start_intake" && (level !== "routine" || aria?.redFlag)) {
        const rfArgs = { patient_id: pid, symptoms: text, model_red_flag: Boolean(aria?.redFlag), language };
        const rid = addTrace({ tool: "report_red_flag", args: rfArgs });
        setPhase("thinking");
        const rr = await callTool(settings, "report_red_flag", rfArgs);
        finishTrace(rid, { ms: rr.ms, error: rr.error, summary: summarize("report_red_flag", rr.result) });
        if (!rr.error) {
          const rf = rr.result as { level: Level; spoken: string; consultId: string | null; actions: Array<{ type: string }> };
          setLevel(rf.level);
          if (rf.consultId) {
            bump("consults");
            if (local) {
              addQueue({ id: rf.consultId, patientId: pid, kind: rf.level === "emergency" ? "emergency" : "new", triage: rf.level, state: "waiting", checkedInAt: new Date().toISOString(), scheduledFor: new Date().toISOString(), channel: "audio", reason: `Alexa+: "${text.slice(0, 60)}"`, quality: "fair", redFlagCount: 1, source: "alexa" });
              addAudit({ actorName: "Alexa+ (nirog-mcp)", action: "Queued consult", target: who, reason: `${rf.level} · rules-based triage` });
            }
          }
          if (rf.actions.some((a) => a.type === "caregiver_alerted")) {
            bump("alerts");
            if (local) addAudit({ actorName: "Alexa+ (nirog-mcp)", action: "Alerted family contact", target: who, reason: "Red flag escalation" });
          }
          await say(rf.spoken, rf.level);
        } else setPhase("idle");
      }
      if (aria?.complete) setComplete(true);
      // A finished or escalated intake is closed: the next symptom starts a fresh one.
      if (aria?.complete || level !== "routine") intakeOpen.current = false;
      void refreshLive();
    },
    [phase, turns, settings, language, addTurn, addTrace, finishTrace, say, setLevel, setPhase, setComplete, bump, addAudit, addQueue, setMemoryDegraded],
  );

  const talk = useCallback(async () => {
    if (phase === "listening") return;
    stopSpeaking();
    setNotice(null);
    setPhase("listening");
    try {
      const heard = await listenOnce(language);
      setPhase("idle");
      if (heard) await handle(heard);
      else setNotice({ text: language === "hi" ? "मैं सुन नहीं पाई।" : "I didn't catch that." });
    } catch (e) {
      setPhase("idle");
      setNotice({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  }, [phase, handle, setPhase, language]);

  return { settings, setSettings, notice, health, phase, canListen, handle, talk, stop: stopSpeaking };
}
