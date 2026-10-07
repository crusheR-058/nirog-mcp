import { useState } from "react";
import { MEMORY_CARDS } from "../copy";

/**
 * The memory graph. Rahul at the centre; each complaint is an orb; golden rays join
 * tonight's complaint to the earlier ones that meant the same thing. SVG, so every
 * label is crisp and every ray is a real line with a real distance on it.
 */
const W = 1000, H = 620;
const CENTER = { x: 400, y: 320 };
const NODES: Record<string, { x: number; y: number }> = {
  jul: { x: 150, y: 150 },
  jul2: { x: 160, y: 470 },
  aug: { x: 640, y: 120 },
  now: { x: 700, y: 400 },
};
const REGIONS = [
  { id: "lower_back", label: "Lower back", x: 870, y: 230, members: ["jul", "aug", "now"] },
  { id: "chest", label: "Chest", x: 330, y: 560, members: ["jul2"] },
];

export function MemoryGraph() {
  const [hover, setHover] = useState<string | null>("now");
  const now = NODES.now;
  const active = MEMORY_CARDS.find((c) => c.id === hover) ?? MEMORY_CARDS[3];

  return (
    <section className="memory" id="memory" aria-label="Memory">
      <header className="section-head">
        <p className="eyebrow">Memory · pgvector + Titan embeddings</p>
        <h2>Nobody describes the same ache the same way twice.</h2>
        <p className="lede">Three sentences with no shared words. Memory links them by meaning, and names the body region the last sentence never did.</p>
      </header>

      <div className="graph-wrap">
        <svg className="graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rahul's complaints linked by meaning">
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="glow-soft" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="14" />
            </filter>
            <linearGradient id="ray" x1="0" x2="1">
              <stop offset="0" stopColor="#e0a526" stopOpacity="0.1" />
              <stop offset="0.5" stopColor="#ffd37a" stopOpacity="0.9" />
              <stop offset="1" stopColor="#e0a526" stopOpacity="0.1" />
            </linearGradient>
            <radialGradient id="orb-gold"><stop offset="0" stopColor="#fff3cf" /><stop offset="0.45" stopColor="#e0a526" /><stop offset="1" stopColor="#7a4e05" /></radialGradient>
            <radialGradient id="orb-teal"><stop offset="0" stopColor="#e9fffb" /><stop offset="0.45" stopColor="#3dd6c3" /><stop offset="1" stopColor="#0d4f48" /></radialGradient>
            <radialGradient id="orb-core"><stop offset="0" stopColor="#ffffff" /><stop offset="0.5" stopColor="#bfe9f5" /><stop offset="1" stopColor="#2b6e7e" /></radialGradient>
          </defs>

          {/* faint spokes from the patient to every complaint */}
          {MEMORY_CARDS.map((c) => (
            <line key={`s-${c.id}`} x1={CENTER.x} y1={CENTER.y} x2={NODES[c.id].x} y2={NODES[c.id].y} className="spoke" />
          ))}
          {/* region clusters */}
          {REGIONS.map((r) => (
            <g key={r.id}>
              {r.members.map((m) => (
                <line key={m} x1={NODES[m].x} y1={NODES[m].y} x2={r.x} y2={r.y} className="cluster-line" />
              ))}
              <circle cx={r.x} cy={r.y} r={34} className="region-ring" />
              <text x={r.x} y={r.y + 4} className="region-label">{r.label}</text>
            </g>
          ))}
          {/* golden rays: tonight → what meant the same thing */}
          {MEMORY_CARDS.filter((c) => c.distance && c.distance > 0).map((c) => {
            const p = NODES[c.id];
            const mx = (p.x + now.x) / 2, my = (p.y + now.y) / 2;
            return (
              <g key={`r-${c.id}`} className="ray-group">
                <line x1={now.x} y1={now.y} x2={p.x} y2={p.y} className="ray-glow" filter="url(#glow-soft)" />
                <line x1={now.x} y1={now.y} x2={p.x} y2={p.y} className="ray" stroke="url(#ray)" />
                <g className="ray-label" transform={`translate(${mx} ${my})`}>
                  <rect x={-38} y={-13} width={76} height={26} rx={13} />
                  <text y={4}>d = {c.distance!.toFixed(3)}</text>
                </g>
              </g>
            );
          })}

          {/* patient */}
          <g className="patient" transform={`translate(${CENTER.x} ${CENTER.y})`}>
            <circle r={62} className="orbit" />
            <circle r={44} className="orbit slow" />
            <circle r={26} fill="url(#orb-core)" filter="url(#glow)" />
            <text y={92} className="node-name">Rahul Yadav</text>
            <text y={110} className="node-sub">50 · Sultanpur · 4 visits</text>
          </g>

          {/* complaints */}
          {MEMORY_CARDS.map((c) => {
            const p = NODES[c.id];
            const linked = c.region === "Lower back";
            const isNow = c.id === "now";
            return (
              <g key={c.id} className={`node ${hover === c.id ? "is-hover" : ""} ${linked ? "linked" : ""}`} transform={`translate(${p.x} ${p.y})`} onMouseEnter={() => setHover(c.id)} onFocus={() => setHover(c.id)} tabIndex={0} role="button" aria-label={`${c.when}: ${c.text}`}>
                <circle r={isNow ? 40 : 30} className="halo" />
                <circle r={isNow ? 17 : 12} fill={linked ? "url(#orb-gold)" : "url(#orb-teal)"} filter="url(#glow)" />
                <text y={isNow ? 44 : 36} className="node-name">{c.when}</text>
                <text y={isNow ? 62 : 54} className="node-sub">{c.inherited ? "region inherited" : c.region}</text>
              </g>
            );
          })}
        </svg>

        <aside className={`glass card graph-card ${active.region === "Lower back" ? "linked" : ""}`} aria-live="polite">
          <span className="eyebrow">{active.when} · {active.inherited ? "inherited: Lower back" : active.region}</span>
          <q>{active.text}</q>
          <dl>
            <div><dt>Match</dt><dd>{active.distance === 0 ? "query" : active.distance === null ? "none above threshold" : `cosine distance ${active.distance.toFixed(3)}`}</dd></div>
            <div><dt>Region source</dt><dd>{active.inherited ? "memory (no body part named)" : "lexicon"}</dd></div>
            <div><dt>Counts toward</dt><dd>{active.region === "Lower back" ? "recurrent: 3 visits in 38 days" : "nothing"}</dd></div>
          </dl>
          <p className="muted small">The flag is arithmetic a doctor can check on paper. The embeddings only decide which complaints are about the same thing.</p>
        </aside>
      </div>
    </section>
  );
}
