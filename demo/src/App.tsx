import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Brain, ChatCircleDots, FolderOpen, GithubLogo, Monitor, Path, Siren, SquaresFour, Stethoscope, User, UsersThree, Waveform } from "@phosphor-icons/react";
import { SECTIONS } from "./copy";
import { CaseFile } from "./sections/CaseFile";
import { Deck } from "./sections/Deck";
import { Doctors } from "./sections/Doctors";
import { Handover } from "./sections/Handover";
import { Hero } from "./sections/Hero";
import { Journey } from "./sections/Journey";
import { MemoryGraph } from "./sections/MemoryGraph";
import { Portal } from "./sections/Portal";
import { RedFlag } from "./sections/RedFlag";
import { Talk } from "./sections/Talk";
import { refreshLive, useDemo } from "./store";
import { useConversation } from "./voice/useConversation";
import { VoiceBar } from "./voice/VoiceBar";
import { StoryPlayer, useStory } from "./tour/StoryPlayer";

const Background = lazy(() => import("./bg/Background").then((m) => ({ default: m.Background })));
const DoctorPage = lazy(() => import("./doctor/DoctorPage").then((m) => ({ default: m.DoctorPage })));
const PatientPage = lazy(() => import("./patient/PatientPage").then((m) => ({ default: m.PatientPage })));

const useHashRoute = () => {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
};

const ICONS = [Waveform, Path, SquaresFour, Brain, FolderOpen, UsersThree, Stethoscope, Siren, Monitor, ChatCircleDots];

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

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const go = (i: number) => document.getElementById(SECTIONS[i].id)?.scrollIntoView({ behavior: "smooth", block: "start" });
const goTo = (id: (typeof SECTIONS)[number]["id"]) => go(SECTIONS.findIndex((s) => s.id === id));

export default function App() {
  const hash = useHashRoute();
  const setRoute = useDemo((s) => s.setRoute);
  const isDoctor = hash.startsWith("#/doctor");
  const isPatient = hash.startsWith("#/patient");
  // The 3D field keeps out of the way on both portals.
  useEffect(() => setRoute(isDoctor || isPatient ? "doctor" : "deck"), [isDoctor, isPatient, setRoute]);
  // The portal reads what the MCP tools wrote. Poll gently; a tool call also refreshes at once.
  useEffect(() => {
    if (isPatient) return;
    void refreshLive();
    const t = setInterval(() => void refreshLive(), 5000);
    return () => clearInterval(t);
  }, [isDoctor, isPatient]);
  if (isDoctor || isPatient) {
    return (
      <div className="app">
        <Suspense fallback={<div className="bg" aria-hidden="true" />}><Background /></Suspense>
        <Suspense fallback={null}>{isDoctor ? <DoctorPage onBack={() => { location.hash = ""; }} /> : <PatientPage onBack={() => { location.hash = ""; }} />}</Suspense>
      </div>
    );
  }
  return <Deck3 />;
}

function Deck3() {
  const convo = useConversation();
  const section = useDemo((s) => s.section);
  const setSection = useDemo((s) => s.setSection);
  const level = useDemo((s) => s.level);
  const { story, play, stop } = useStory();

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => Boolean(el));
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best) setSection(els.indexOf(best.target as HTMLElement));
      },
      { threshold: [0.25, 0.5] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [setSection]);

  return (
    <div className={`app level-${level}`}>
      <a className="skip" href="#talk">Skip to the live demo</a>
      <Suspense fallback={<div className="bg" aria-hidden="true" />}>
        <Background />
      </Suspense>

      <header className="topbar glass">
        <div className="brand">
          <span className="mark"><Waveform size={16} weight="bold" /></span>
          <div><b>Nirog</b><small>for Alexa+ · {greeting()}, Rahul</small></div>
        </div>
        <div className="topbar-right">
          <span className="clock"><Clock /><small>Sultanpur, UP</small></span>
          <a className="btn doctor-cta" href="#/patient"><User size={16} weight="bold" /> <span>I'm a Patient</span></a>
          <a className="btn doctor-cta ghost-cta" href="#/doctor"><Stethoscope size={16} weight="bold" /> <span>I'm a Doctor</span></a>
          <a className="icon-btn" href="https://github.com/crusheR-058/nirog-mcp" target="_blank" rel="noreferrer" aria-label="nirog-mcp on GitHub"><GithubLogo size={18} weight="bold" /></a>
        </div>
      </header>

      <nav className="rail glass" aria-label="Sections">
        {SECTIONS.map((s, i) => {
          const Icon = ICONS[i];
          return (
            <button key={s.id} onClick={() => go(i)} aria-current={i === section} aria-label={s.label} title={s.label}>
              <Icon size={19} weight={i === section ? "fill" : "regular"} />
              <span className="tip">{s.label}</span>
            </button>
          );
        })}
      </nav>

      <main className="page">
        <Hero onNext={() => go(1)} onPlay={play} />
        <Journey />
        <Deck />
        <MemoryGraph />
        <CaseFile onTalk={() => goTo("talk")} onDoctors={() => goTo("doctors")} />
        <Doctors />
        <Handover />
        <RedFlag />
        <Portal />
        <Talk convo={convo} />
        <footer className="foot">
          <span>Built for the Build, Ship, Shape: Amazon Developer Hackathon · Alexa+ track</span>
          <span>MCP · Streamable HTTP · Amazon Bedrock · pgvector</span>
        </footer>
      </main>

      <VoiceBar convo={convo} />
      <StoryPlayer story={story} onStop={stop} onReplay={play} />
    </div>
  );
}
