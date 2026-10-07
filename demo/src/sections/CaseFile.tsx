import { useMemo, useState } from "react";
import { Check, Copy, Stethoscope, Waveform } from "@phosphor-icons/react";
import { buildSbar, detectFlags, rahulComplaints, renderSbar } from "../clinic/sbar";
import { useDemo } from "../store";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function CaseFile({ onTalk, onDoctors }: { onTalk: () => void; onDoctors: () => void }) {
  const degraded = useDemo((s) => s.memoryDegraded);
  const [copied, setCopied] = useState(false);
  const now = useMemo(() => new Date(), []);
  const complaints = useMemo(() => rahulComplaints(now), [now]);
  const flags = useMemo(() => detectFlags(complaints, now), [complaints, now]);
  const flag = flags[0] ?? null;
  const sbar = useMemo(() => buildSbar({ age: 50, sex: "male", familyHistory: "Father, lumbar disc surgery at 40", complaints, flags, now, degraded }), [complaints, flags, now, degraded]);
  const inherited = complaints.filter((c) => c.inherited);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(renderSbar(sbar));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <section className="casefile" id="case" aria-label="Your case file">
      <header className="section-head wide">
        <div>
          <p className="eyebrow">Patient app · case file</p>
          <h2>Your case file.</h2>
          <p className="lede">Everything you have told ARIA, and what she made of it. Your own words are kept exactly as you said them.</p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={onTalk}><Waveform size={16} weight="bold" /> Talk to ARIA</button>
          <button className="btn" onClick={onDoctors}><Stethoscope size={16} weight="bold" /> See a doctor</button>
        </div>
      </header>

      {degraded && (
        <div className="glass card notice-degraded">
          <p className="eyebrow red">Records unreachable</p>
          <p>This patient's history could not be reached, so nobody has checked it. Treat what follows as a first presentation that has not been verified. No recurrence flag appears below because none was looked for.</p>
        </div>
      )}

      <div className="case-grid">
        <div className="case-main">
          {flag && !degraded && (
            <div className={`glass card verdict ${flag.level}`}>
              <div className="card-head">
                <span className="eyebrow">{flag.level === "recurrent" ? "This keeps coming back" : "You have raised this before"}</span>
                <span className="muted small">{flag.visitCount} visits over {flag.spanDays} days</span>
              </div>
              <h3 className="verdict-region">{flag.region}</h3>
              <p>You described this {flag.visitCount} separate times without ever using the same words twice. Searching your notes would not have connected them.</p>
              {inherited.length > 0 && <p className="muted small rule">“{inherited[0].text}” named no body part. Memory filed it under {flag.region.toLowerCase()} from what you said in July.</p>}
            </div>
          )}

          <div className="glass card sbar">
            <div className="card-head">
              <span className="eyebrow">SBAR handover · what the doctor reads</span>
              <button className="ghost" onClick={copy}>{copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="bold" />} {copied ? "Copied" : "Copy"}</button>
            </div>
            <dl className="sbar-list">
              <div><dt>S</dt><dd>{sbar.situation}</dd></div>
              <div><dt>B</dt><dd>{sbar.background.map((l, i) => <span key={i} className={l.startsWith("  ") ? "quote" : ""}>{l.trim()}</span>)}</dd></div>
              <div><dt>A</dt><dd>{sbar.assessment.map((l, i) => <span key={i}>{l}</span>)}</dd></div>
              <div><dt>R</dt><dd>{sbar.recommendation.map((l, i) => <span key={i}>{l}</span>)}</dd></div>
            </dl>
            <ul className="provenance">{sbar.provenance.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        </div>

        <aside className="glass card timeline">
          <div className="card-head"><span className="eyebrow">Timeline · your words</span><span className="muted small">{complaints.length} entries</span></div>
          <ol>
            {[...complaints].reverse().map((c) => (
              <li key={c.id} className={c.region === "Lower back" ? "linked" : ""}>
                <span className="when">{fmt(c.occurredAt)}</span>
                <q>{c.text}</q>
                <span className="meta">{c.inherited ? `region inherited: ${c.region}` : c.region}{c.distance ? ` · d = ${c.distance.toFixed(3)}` : ""}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </section>
  );
}
