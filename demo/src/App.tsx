import { lazy, memo, Suspense, useCallback, useEffect } from "react";
import { BEATS } from "./copy";
import { Demo } from "./Demo";
import { useDemo } from "./store";

const World = lazy(() => import("./world/World").then((m) => ({ default: m.World })));

function Logo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="#35c1e8" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" fill="#e0a526" />
    </svg>
  );
}

/** Patient quotes in the copy are set in turmeric, like the patient's words everywhere else. */
function Quoted({ text }: { text: string }) {
  const parts = text.split(/("[^"]+")/g);
  return <>{parts.map((p, i) => (p.startsWith('"') ? <q key={i}>{p.slice(1, -1)}</q> : p))}</>;
}

function Beats() {
  const current = useDemo((s) => s.current);
  return (
    <>
      {BEATS.slice(0, -1).map((b, i) => (
        <section key={b.id} className={`beat ${i % 2 === 1 ? "right" : ""}`} id={b.id} aria-hidden={current !== i}>
          <div className="card">
            <p className="eyebrow">{b.eyebrow}</p>
            <h2>{b.title}</h2>
            <p><Quoted text={b.body} /></p>
            {b.tags && <ul className="tags">{b.tags.map((t) => <li key={t}>{t}</li>)}</ul>}
          </div>
        </section>
      ))}
      <div id="try-it">
        <Demo active={current === BEATS.length - 1} />
      </div>
    </>
  );
}

/** Rendered once; its props never change, so React never re-renders the canvas tree from outside. */
const Flight = memo(function Flight() {
  return (
    <Suspense fallback={null}>
      <World pages={BEATS.length} html={<Beats />} />
    </Suspense>
  );
});

export default function App() {
  const current = useDemo((s) => s.current);
  const atStart = useDemo((s) => s.atStart);
  const scrollEl = useDemo((s) => s.scrollEl);

  const scrollTo = useCallback(
    (i: number) => {
      if (!scrollEl) return;
      const top = (scrollEl.scrollHeight - scrollEl.clientHeight) * (i / (BEATS.length - 1));
      scrollEl.scrollTo({ top, behavior: "smooth" });
    },
    [scrollEl],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") scrollTo(Math.min(current + 1, BEATS.length - 1));
      if (e.key === "ArrowLeft" || e.key === "PageUp") scrollTo(Math.max(current - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, scrollTo]);

  return (
    <>
      <a className="skip" href="#try-it" onClick={(e) => { e.preventDefault(); scrollTo(BEATS.length - 1); }}>Skip to the live demo</a>
      <header className="topbar">
        <div className="brand"><Logo />Nirog for Alexa+</div>
        <a className="status" href="https://github.com/crusheR-058/nirog-mcp" target="_blank" rel="noreferrer">
          <span className="dot" style={{ background: "#35c1e8" }} /><span className="text">nirog-mcp on GitHub</span>
        </a>
      </header>

      <nav className="rail" aria-label="Scenes">
        {BEATS.map((b, i) => (
          <button key={b.id} onClick={() => scrollTo(i)} aria-current={i === current}>
            <span>{b.label}</span>
          </button>
        ))}
      </nav>

      <div className="hint" style={{ opacity: atStart ? 1 : 0 }} aria-hidden="true">
        <span className="line" />Scroll to fly
      </div>

      <Flight />
    </>
  );
}
