import { useEffect, useRef } from "react";
import { ArrowCounterClockwise, Terminal } from "@phosphor-icons/react";
import { PATIENTS } from "../clinic/data";
import { TRIES } from "../copy";
import { useDemo } from "../store";
import type { useConversation } from "../voice/useConversation";

export function Talk({ convo }: { convo: ReturnType<typeof useConversation> }) {
  const { turns, traces, complete, reset } = useDemo();
  const { settings, setSettings, health, stop, handle, phase } = convo;
  const busy = phase === "thinking" || phase === "listening";
  const convoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    convoRef.current?.scrollTo({ top: convoRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length]);

  return (
    <section className="talk" id="talk" aria-label="Talk to it">
      <header className="section-head">
        <p className="eyebrow">Live · against the real MCP server</p>
        <h2>Talk to it.</h2>
        <p className="lede">Use the bar below. Every reply is a tool result from nirog-mcp over Streamable HTTP. The right side is what the agent saw.</p>
      </header>
      <div className="talk-grid">
        <div className="glass card convo-card">
          <div className="card-head">
            <span className="eyebrow">Conversation · {settings.patientId}</span>
            <button className="ghost" onClick={() => { stop(); reset(); }}><ArrowCounterClockwise size={14} weight="bold" /> Start over</button>
          </div>
          <div className="convo" ref={convoRef} aria-live="polite">
            {turns.length === 0 && (
              <div className="tries" lang={settings.language}>
                <p className="muted small">Five things to try. Each one reaches a different tool.</p>
                {TRIES[settings.language].map((t) => (
                  <button key={t.tool} className="try" onClick={() => void handle(t.say)} disabled={busy}>
                    <span className="try-tool">{t.tool}</span>
                    <span className="try-say">{t.say}</span>
                  </button>
                ))}
              </div>
            )}
            {turns.map((t) => (
              <div key={t.id} className={`turn ${t.role} ${t.level ?? ""}`}>
                <span className="who">{t.role === "user" ? "Patient" : "Alexa+ · ARIA"}</span>
                <span className="what">{t.text}</span>
              </div>
            ))}
            {complete && <p className="muted small">Intake complete. The doctor sees the summary with the history.</p>}
          </div>
          <details className="settings">
            <summary>Connection</summary>
            <div className="fields">
              <label>Endpoint<input value={settings.endpoint} onChange={(e) => setSettings({ ...settings, endpoint: e.target.value })} /></label>
              <label>Consent token<input value={settings.token} onChange={(e) => setSettings({ ...settings, token: e.target.value })} placeholder="empty for an open local server" /></label>
              <label>Patient
                <select value={settings.patientId} onChange={(e) => setSettings({ ...settings, patientId: e.target.value })}>
                  {PATIENTS.map((p) => (
                    <option key={p.id} value={p.id}>{p.id} · {p.fullName}{p.conditions.length ? ` · ${p.conditions[0]}` : ""}</option>
                  ))}
                </select>
              </label>
            </div>
          </details>
        </div>
        <div className="glass card trace-card">
          <div className="card-head">
            <span className="eyebrow"><Terminal size={14} weight="duotone" /> Behind the voice</span>
            <span className={`status ${health}`}><i className="dot" />{health === "ok" ? "server up" : health === "bad" ? "no server" : "checking"}</span>
          </div>
          <div className="trace" aria-live="polite">
            {traces.length === 0 && <p className="muted">Every tool call appears here, with what it returned.</p>}
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
      </div>
    </section>
  );
}
