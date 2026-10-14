import { ArrowDown, Brain, Play, ShieldCheck, Waveform } from "@phosphor-icons/react";

export function Hero({ onNext, onPlay }: { onNext: () => void; onPlay: () => void }) {
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
        <div className="hero-actions">
          <button className="btn primary" onClick={onPlay}>
            <Play size={16} weight="fill" /> Play the 3-minute story
          </button>
          <button className="link-down" onClick={onNext}>
            <ArrowDown size={16} weight="bold" /> See the deck
          </button>
        </div>
        <p className="muted small hero-note">One evening, both chairs, played live on this page: a real agent, real tool calls, a real clinic record. Sound on.</p>
      </div>
    </section>
  );
}
