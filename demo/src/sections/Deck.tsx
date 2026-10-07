import { ArrowUpRight, Clock, FirstAidKit, Pill, Pulse, Users, Warning } from "@phosphor-icons/react";
import { useDemo } from "../store";

function Tile({ icon, value, unit, label, tone }: { icon: React.ReactNode; value: string | number; unit?: string; label: string; tone?: "gold" | "red" | "teal" }) {
  return (
    <div className={`glass tile ${tone ?? ""}`}>
      <span className="tile-icon">{icon}</span>
      <div className="tile-value">{value}<small>{unit}</small></div>
      <div className="tile-label">{label}</div>
    </div>
  );
}

export function Deck() {
  const consults = useDemo((s) => s.consults);
  const alerts = useDemo((s) => s.alerts);
  const traces = useDemo((s) => s.traces);
  const lastMs = traces.find((t) => t.ms != null)?.ms;
  return (
    <section className="deck" id="deck" aria-label="The deck">
      <header className="section-head">
        <p className="eyebrow">Tonight · Yadav household</p>
        <h2>One deck for a clinic that is four hours away.</h2>
      </header>
      <div className="bento">
        <Tile icon={<Users size={18} weight="duotone" />} value={3} label="Patients on this device" />
        <Tile icon={<Pulse size={18} weight="duotone" />} value={1} label="Recurrent flag" tone="gold" />
        <Tile icon={<FirstAidKit size={18} weight="duotone" />} value={consults} label="Consults queued tonight" tone={consults ? "red" : undefined} />
        <Tile icon={<Clock size={18} weight="duotone" />} value={lastMs ?? "—"} unit={lastMs != null ? "ms" : ""} label="Last tool call" tone="teal" />

        <div className="glass card span-2">
          <div className="card-head"><span className="eyebrow">Intake · ARIA</span><span className="pill gold">GPT-OSS 120B on Bedrock</span></div>
          <h3>Two questions, then a handover.</h3>
          <p>ARIA asks only what the record does not already know. The region, the recall and the recurrence flag come from deterministic code and are handed to the model as context. It never writes the chart.</p>
          <ul className="steps">
            <li><b>01</b> Record the words, unedited</li>
            <li><b>02</b> Recall what meant the same thing</li>
            <li><b>03</b> Ask, at most three times</li>
            <li><b>04</b> File the summary with the flag on top</li>
          </ul>
        </div>

        <div className="glass card">
          <div className="card-head"><span className="eyebrow"><Pill size={14} weight="duotone" /> Care plan</span></div>
          <h3>Amlodipine 5 mg</h3>
          <p className="muted">1 tablet · morning · 65 days left</p>
          <div className="meter"><span style={{ width: "28%" }} /></div>
          <p className="muted small">Follow-up in 65 days · routine BP review</p>
        </div>

        <div className="glass card">
          <div className="card-head"><span className="eyebrow"><Warning size={14} weight="duotone" /> Alerts</span></div>
          <div className="big">{alerts}</div>
          <p className="muted">Family contact alerted tonight</p>
          <p className="muted small">Rules, not weights. A model can raise a level, never lower it.</p>
        </div>

        <div className="glass card span-2 quiet">
          <div className="card-head"><span className="eyebrow">Why Alexa</span><a className="pill link" href="https://github.com/crusheR-058/nirog-mcp" target="_blank" rel="noreferrer">nirog-mcp <ArrowUpRight size={12} weight="bold" /></a></div>
          <p>The households that need telehealth most are the ones without a computer. Voice is the lowest-friction interface there is, and the Echo is already on the shelf.</p>
        </div>
      </div>
    </section>
  );
}
