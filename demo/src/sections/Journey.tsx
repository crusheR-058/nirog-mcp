import { Database, Eye, FileText, Lock, Microphone, Package, ShieldCheck, Stethoscope, VideoCamera, Warning } from "@phosphor-icons/react";

/** The care loop and the trust architecture, from the Nirog landing page. */
const STEPS = [
  { icon: Microphone, title: "Intake", body: "ARIA listens in the patient's own language and structures the story. No forms, no typing.", chip: "Breathlessness · 2d" },
  { icon: Stethoscope, title: "Review", body: "The doctor sees the summary, vitals and deterministic red flags before the call connects.", chip: "1 red flag · Urgent" },
  { icon: VideoCamera, title: "Consult", body: "Video when the network allows, audio when it doesn't, chat when it must. And it resumes.", chip: "Graceful downgrade" },
  { icon: FileText, title: "Care plan", body: "Notes, prescription and tests, filed under the doctor's registration, fully audited.", chip: "Amlodipine 5mg · OD" },
  { icon: Package, title: "Fulfil", body: "Medicines and tests reach the village. Two-day rural delivery, tracked in the patient app.", chip: "Order placed · ₹86" },
];

const TRUST = [
  { icon: Eye, title: "Who, what and why", body: "An immutable trail behind every record read." },
  { icon: Lock, title: "The patient grants", body: "The server enforces consent. No clinic-wide search." },
  { icon: ShieldCheck, title: "The public API returns nothing", body: "Every read is scoped to a care relationship." },
  { icon: Database, title: "Consent, ABHA and FHIR", body: "Shaped in from the start, not bolted on." },
];

export function Journey() {
  return (
    <section className="journey" id="journey" aria-label="The care loop">
      <header className="section-head">
        <p className="eyebrow">Every step of care, engineered</p>
        <h2>Healthcare that never stops.</h2>
        <p className="lede">A patient describes what is wrong, in their own words. ARIA asks the follow-up questions a nurse would, then writes it up for a doctor. If you said something like this six weeks ago, she brings it up before you do.</p>
      </header>
      <ol className="loop">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className="glass card step">
              <span className="step-n">{String(i + 1).padStart(2, "0")}</span>
              <span className="tile-icon"><Icon size={18} weight="duotone" /></span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <span className="pill">{s.chip}</span>
            </li>
          );
        })}
      </ol>
      <div className="trust">
        <div className="trust-head">
          <p className="eyebrow"><ShieldCheck size={14} weight="duotone" /> Trust architecture</p>
          <h3>The client requests. The server decides.</h3>
        </div>
        <ul className="trust-grid">
          {TRUST.map((t) => {
            const Icon = t.icon;
            return (
              <li key={t.title} className="glass card">
                <span className="tile-icon"><Icon size={18} weight="duotone" /></span>
                <b>{t.title}</b>
                <span>{t.body}</span>
              </li>
            );
          })}
        </ul>
        <p className="muted small trust-note"><Warning size={14} weight="duotone" /> Break-glass access without consent is possible but always explained, and always logged.</p>
      </div>
    </section>
  );
}
