import { lazy, Suspense, useEffect, useRef } from "react";
import { Brain, ChatCircleDots, GithubLogo, Siren, SquaresFour, Stethoscope, Waveform } from "@phosphor-icons/react";
import { SECTIONS } from "./copy";
import { Deck } from "./sections/Deck";
import { Handover } from "./sections/Handover";
import { Hero } from "./sections/Hero";
import { MemoryGraph } from "./sections/MemoryGraph";
import { RedFlag } from "./sections/RedFlag";
import { Talk } from "./sections/Talk";
import { useDemo } from "./store";
import { useConversation } from "./voice/useConversation";
import { VoiceBar } from "./voice/VoiceBar";

const Background = lazy(() => import("./bg/Background").then((m) => ({ default: m.Background })));

const ICONS = [Waveform, SquaresFour, Brain, Stethoscope, Siren, ChatCircleDots];

function Clock() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const tick = () => {
      if (ref.current) ref.current.textContent = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, []);
  return <span ref={ref} />;
}

export default function App() {
  const convo = useConversation();
  const section = useDemo((s) => s.section);
  const setSection = useDemo((s) => s.setSection);
  const level = useDemo((s) => s.level);

  // Which section is in view drives the rail and the 3D field.
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => Boolean(el));
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best) setSection(els.indexOf(best.target as HTMLElement));
      },
      { threshold: [0.35, 0.6] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [setSection]);

  const go = (i: number) => document.getElementById(SECTIONS[i].id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className={`app level-${level}`}>
      <a className="skip" href="#talk">Skip to the live demo</a>
      <Suspense fallback={<div className="bg" aria-hidden="true" />}>
        <Background />
      </Suspense>

      <header className="topbar glass">
        <div className="brand">
          <span className="mark"><Waveform size={16} weight="bold" /></span>
          <div><b>Nirog</b><small>for Alexa+ · Good evening, Rahul</small></div>
        </div>
        <div className="topbar-right">
          <span className="clock"><Clock /><small>Sultanpur, UP</small></span>
          <a className="icon-btn" href="https://github.com/crusheR-058/nirog-mcp" target="_blank" rel="noreferrer" aria-label="nirog-mcp on GitHub"><GithubLogo size={18} weight="bold" /></a>
        </div>
      </header>

      <nav className="rail glass" aria-label="Sections">
        {SECTIONS.map((s, i) => {
          const Icon = ICONS[i];
          return (
            <button key={s.id} onClick={() => go(i)} aria-current={i === section} aria-label={s.label} title={s.label}>
              <Icon size={20} weight={i === section ? "fill" : "regular"} />
              <span className="tip">{s.label}</span>
            </button>
          );
        })}
      </nav>

      <main className="page">
        <Hero onNext={() => go(1)} />
        <Deck />
        <MemoryGraph />
        <Handover />
        <RedFlag />
        <Talk convo={convo} />
        <footer className="foot">
          <span>Built for the Build, Ship, Shape: Amazon Developer Hackathon · Alexa+ track</span>
          <span>MCP · Streamable HTTP · Amazon Bedrock · pgvector</span>
        </footer>
      </main>

      <VoiceBar convo={convo} />
    </div>
  );
}
