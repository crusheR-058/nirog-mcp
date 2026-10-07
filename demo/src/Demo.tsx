import { useEffect, useRef, useState } from "react";
import { callTool, loadSettings, saveSettings, type Settings } from "./mcp";
import { canListen, listenOnce, speak, stopSpeaking } from "./speech";
import { useDemo } from "./store";

const CARE_PLAN = /\b(medicine|medicines|tablet|tablets|dawai|dose|pills?|tests?|follow[- ]?up|next visit|doctor next|what do i take)\b/i;

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function summarize(tool: string, r: unknown): string[] {
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

export function Demo({ active }: { active: boolean }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [health, setHealth] = useState<"unknown" | "ok" | "bad">("unknown");
  const { phase, turns, traces, complete, setPhase, setLevel, addTurn, addTrace, finishTrace, setComplete, reset } = useDemo();
  const convoRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => {
    const url = settings.endpoint.replace(/\/mcp\/?$/, "/health");
    fetch(url).then((r) => setHealth(r.ok ? "ok" : "bad")).catch(() => setHealth("bad"));
  }, [settings.endpoint]);
  useEffect(() => {
    convoRef.current?.scrollTo({ top: convoRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length]);
  useEffect(() => {
    if (!active) stopSpeaking();
  }, [active]);

  const say = (text: string, level?: "routine" | "urgent" | "emergency") =>
    new Promise<void>((resolve) => {
      addTurn({ role: "assistant", text, level });
      setPhase("speaking");
      speak(text, () => {
        setPhase("idle");
        resolve();
      });
    });

  async function handle(utterance: string) {
    const text = utterance.trim();
    if (!text || phase === "thinking") return;
    setNotice(null);
    addTurn({ role: "user", text });
    setPhase("thinking");

    const transcript = turns.map((t) => ({ role: t.role, text: t.text }));
    const tool = CARE_PLAN.test(text) && !/pain|ache|hurt|fever|cough/i.test(text) ? "get_care_plan" : "start_intake";
    const args = tool === "get_care_plan" ? { patient_id: settings.patientId } : { patient_id: settings.patientId, complaint: text, transcript };
    const id = addTrace({ tool, args });
    const r = await callTool(settings, tool, args);
    finishTrace(id, { ms: r.ms, error: r.error, summary: summarize(tool, r.result) });

    if (r.error) {
      setPhase("idle");
      setNotice({ text: r.error, error: true });
      return;
    }
    const res = r.result as Record<string, unknown>;
    const triage = res.triage as { level: "routine" | "urgent" | "emergency" } | undefined;
    const aria = res.aria as { complete?: boolean; redFlag?: boolean } | undefined;
    const level = triage?.level ?? "routine";
    setLevel(level);

    // An emergency goes straight to escalation, which speaks the advice itself; everything else is spoken here.
    if (level !== "emergency") await say(String(res.spoken ?? ""), level);

    if (tool === "start_intake" && (level !== "routine" || aria?.redFlag)) {
      const rid = addTrace({ tool: "report_red_flag", args: { patient_id: settings.patientId, symptoms: text, model_red_flag: Boolean(aria?.redFlag) } });
      setPhase("thinking");
      const rr = await callTool(settings, "report_red_flag", { patient_id: settings.patientId, symptoms: text, model_red_flag: Boolean(aria?.redFlag) });
      finishTrace(rid, { ms: rr.ms, error: rr.error, summary: summarize("report_red_flag", rr.result) });
      if (!rr.error) {
        const rf = rr.result as { level: "routine" | "urgent" | "emergency"; spoken: string };
        setLevel(rf.level);
        await say(rf.spoken, rf.level);
      } else setPhase("idle");
    }
    if (aria?.complete) setComplete(true);
  }

  async function onTalk() {
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
  }

  const busy = phase === "thinking" || phase === "listening";

  return (
    <section className="demo" aria-label="Live demo">
      <div className="panel">
        <h3>
          <span>Conversation · {settings.patientId}</span>
          <button className="ghost" onClick={() => { stopSpeaking(); reset(); setNotice(null); }} style={{ minHeight: 32, padding: "0 10px", fontSize: 12 }}>
            Start over
          </button>
        </h3>
        <div className="convo" ref={convoRef} aria-live="polite">
          {turns.length === 0 && (
            <p className="empty">
              Try: <q>the ache is back again, it's been three weeks now</q> · <q>what medicines do I take tonight</q> · <q>I have chest pain and I'm sweating</q>
            </p>
          )}
          {turns.map((t) => (
            <div key={t.id} className={`turn ${t.role} ${t.level === "emergency" ? "emergency" : ""}`}>
              <span className="who">{t.role === "user" ? "Patient" : "Alexa+ · ARIA"}</span>
              <span className="what">{t.text}</span>
            </div>
          ))}
        </div>
        <div className="controls">
          <button className={`talk ${phase === "listening" ? "listening" : ""}`} onClick={onTalk} disabled={busy && phase !== "listening"} aria-label={canListen ? "Talk" : "Microphone unavailable"} title={canListen ? "Talk" : "Microphone unavailable in this browser"}>
            <MicIcon />
            {phase === "listening" ? "Listening…" : phase === "thinking" ? "Thinking…" : phase === "speaking" ? "Speaking…" : "Talk"}
          </button>
          <form className="typebox" onSubmit={(e) => { e.preventDefault(); const t = typed; setTyped(""); void handle(t); }}>
            <label htmlFor="typed" className="sr-only" style={{ position: "absolute", left: -9999 }}>Or type what the patient says</label>
            <input id="typed" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type what the patient says" disabled={busy} autoComplete="off" />
            <button className="ghost" type="submit" disabled={busy || !typed.trim()}>Send</button>
          </form>
        </div>
        {notice && <p className={`notice ${notice.error ? "error" : ""}`} role="status">{notice.text}</p>}
        {complete && !notice && <p className="notice" role="status">Intake complete. The doctor will see the summary with the history.</p>}
        <details>
          <summary>Connection</summary>
          <div className="settings">
            <label>Endpoint<input value={settings.endpoint} onChange={(e) => setSettings({ ...settings, endpoint: e.target.value })} /></label>
            <label>Consent token<input value={settings.token} onChange={(e) => setSettings({ ...settings, token: e.target.value })} placeholder="leave empty for an open local server" /></label>
            <label>Patient
              <select value={settings.patientId} onChange={(e) => setSettings({ ...settings, patientId: e.target.value })}>
                <option value="pat_rahul">pat_rahul · Rahul Yadav</option>
                <option value="pat_sunita">pat_sunita · Sunita Devi</option>
                <option value="pat_meena">pat_meena · Meena Singh</option>
              </select>
            </label>
          </div>
        </details>
      </div>

      <div className="panel">
        <h3>
          <span>Behind the voice</span>
          <span className={`status ${health}`} style={{ padding: "4px 8px" }}><span className="dot" />{health === "ok" ? "server up" : health === "bad" ? "no server" : "checking"}</span>
        </h3>
        <div className="trace" aria-live="polite">
          {traces.length === 0 && <p className="empty">Every tool call the agent makes appears here, with what it saw.</p>}
          {traces.map((t) => (
            <div key={t.id} className={`call ${t.error ? "err" : ""}`}>
              <div className="head"><span>{t.tool}</span><span className="ms">{t.ms != null ? `${t.ms} ms` : "…"}</span></div>
              <div className="args">{JSON.stringify(Object.fromEntries(Object.entries(t.args).filter(([k]) => k !== "transcript")))}</div>
              {t.error && <ul><li>{t.error}</li></ul>}
              {t.summary && t.summary.length > 0 && (
                <ul>
                  {t.summary.map((s, i) => {
                    const [k, ...rest] = s.split(": ");
                    return <li key={i}><b>{k}</b>{rest.length ? `: ${rest.join(": ")}` : ""}</li>;
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
