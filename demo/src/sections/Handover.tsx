import { CheckCircle, Stethoscope } from "@phosphor-icons/react";

const VISITS = [
  { when: "11 Jul", h: 52 },
  { when: "22 Jul", h: 18, other: true },
  { when: "2 Aug", h: 70 },
  { when: "Tonight", h: 100 },
];

export function Handover() {
  return (
    <section className="handover" id="handover" aria-label="Handover">
      <header className="section-head">
        <p className="eyebrow">Handover · on-call queue</p>
        <h2>The doctor opens a history, not a stranger.</h2>
      </header>
      <div className="handover-grid">
        <div className="glass card queue">
          <div className="card-head">
            <span className="eyebrow"><Stethoscope size={14} weight="duotone" /> Queue · waiting</span>
            <span className="pill gold">Recurrent</span>
          </div>
          <h3>Rahul Yadav <span className="muted">50 · Sultanpur, Barabanki</span></h3>
          <dl className="kv">
            <div><dt>Region</dt><dd>Lower back</dd></div>
            <div><dt>Visits</dt><dd>3 in 38 days</dd></div>
            <div><dt>Rule</dt><dd>3 or more visits, one region, 90 days</dd></div>
            <div><dt>ARIA</dt><dd>Same ache as July. Worse in the mornings and when bending to lift water. No numbness, no fever.</dd></div>
            <div><dt>Conditions</dt><dd>Hypertension · Amlodipine 5 mg OD</dd></div>
          </dl>
          <ul className="checks">
            <li><CheckCircle size={16} weight="fill" /> Region inherited from memory, not guessed</li>
            <li><CheckCircle size={16} weight="fill" /> Negation-aware, condition-aware triage: routine</li>
            <li><CheckCircle size={16} weight="fill" /> Summary written by the model, flag written by the rule</li>
          </ul>
        </div>
        <div className="glass card chart">
          <div className="card-head"><span className="eyebrow">Lower back · presentations</span><span className="muted small">90-day window</span></div>
          <div className="bars" role="img" aria-label="Four visits; three about the lower back within 38 days">
            {VISITS.map((v) => (
              <div key={v.when} className={`bar ${v.other ? "other" : ""}`}>
                <span className="fill" style={{ height: `${v.h}%` }} />
                <span className="lbl">{v.when}</span>
              </div>
            ))}
          </div>
          <p className="muted small">Three distinct visits in one region inside the window. Two in thirty days would read as "watch".</p>
        </div>
      </div>
    </section>
  );
}
