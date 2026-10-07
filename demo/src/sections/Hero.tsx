import { ArrowDown, Brain, ShieldCheck, Waveform } from "@phosphor-icons/react";

export function Hero({ onNext }: { onNext: () => void }) {
  return (
    <section className="hero" id="hero" aria-label="Nirog for Alexa+">
      <div className="hero-copy">
        <p className="eyebrow"><Waveform size={14} weight="bold" /> Alexa+ · Model Context Protocol</p>
        <h1>
          Say what hurts.
          <br />
          <span className="dim">The clinic remembers.</span>
        </h1>
        <p className="lede">
          Nirog turns an Echo into the front door of a rural clinic. It records a complaint in the patient's own words, recalls what they said months ago however they worded it, and hands the doctor a real history. Nothing waits on a laptop.
        </p>
        <div className="hero-proof">
          <span><Brain size={16} weight="duotone" /> Memory across visits</span>
          <span><ShieldCheck size={16} weight="duotone" /> Rules-based red flags</span>
          <span>Hindi or English</span>
        </div>
        <button className="link-down" onClick={onNext}>
          <ArrowDown size={16} weight="bold" /> See the deck
        </button>
      </div>
    </section>
  );
}
