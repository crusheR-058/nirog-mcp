import { Ambulance, Siren, Stethoscope, UsersThree } from "@phosphor-icons/react";

export function RedFlag() {
  return (
    <section className="redflag" id="redflag" aria-label="Red flag">
      <header className="section-head">
        <p className="eyebrow red">Red flag · rules, not weights</p>
        <h2>"And I have chest pain." Nothing waits for a model.</h2>
        <p className="lede">Fifteen rules, negation-aware and condition-aware. The model can raise a level. It can never lower one.</p>
      </header>
      <div className="flow">
        <div className="glass card src red">
          <span className="eyebrow red"><Siren size={14} weight="fill" /> chest_pain_acs</span>
          <q>I have chest pain and I'm sweating a lot</q>
          <p className="muted small">chest pain + sweating · emergency · 80 ms</p>
          <span className="pulse" aria-hidden="true" />
        </div>
        <div className="flow-lines" aria-hidden="true"><span /><span /><span /></div>
        <ul className="targets">
          <li className="glass card"><Ambulance size={20} weight="duotone" /><b>108 ambulance</b><span>Spoken in the same breath, once, calmly.</span></li>
          <li className="glass card"><Stethoscope size={20} weight="duotone" /><b>On-call doctor</b><span>Emergency consult queued, claimable by any doctor.</span></li>
          <li className="glass card"><UsersThree size={20} weight="duotone" /><b>Family contact</b><span>Alerted on the registered phone. Audit row written.</span></li>
        </ul>
      </div>
    </section>
  );
}
