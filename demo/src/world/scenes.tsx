import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Edges, Float, Line, Sparkles, Text } from "@react-three/drei";
import * as THREE from "three";
import { MEMORY_CARDS } from "../copy";
import { useDemo } from "../store";

export const C = {
  cyan: "#35c1e8",
  cyan2: "#8fe3ff",
  turmeric: "#e0a526",
  green: "#2ed3a3",
  red: "#ff5a5f",
  wall: "#1a3340",
  wallDark: "#122834",
  ink: "#e9f1ef",
  glass: "#173646",
};

// Served from demo/public at the Vite base (/demo/). troika needs ttf/woff, not woff2.
const FONT_DISPLAY = `${import.meta.env.BASE_URL}fonts/bricolage-600.ttf`;
const FONT_MONO = `${import.meta.env.BASE_URL}fonts/plexmono-500.ttf`;

/* ── The voice ring: the one object that recurs in every scene ───────── */
export function VoiceRing({ position, scale = 1, live = false, color = C.cyan }: { position: [number, number, number]; scale?: number; live?: boolean; color?: string }) {
  const ring = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const phase = useDemo((s) => s.phase);
  const level = useDemo((s) => s.level);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const active = live && phase !== "idle";
    const speed = phase === "listening" ? 6 : phase === "thinking" ? 10 : phase === "speaking" ? 4 : 1.2;
    const amp = active ? 0.14 : 0.04;
    const s = 1 + Math.sin(t * speed) * amp;
    if (ring.current) ring.current.scale.setScalar(s);
    if (glow.current) {
      glow.current.scale.setScalar(s * 1.15 + (active ? 0.12 : 0));
      (glow.current.material as THREE.MeshBasicMaterial).opacity = active ? 0.22 : 0.08;
    }
  });
  const c = live && level === "emergency" ? C.red : live && level === "urgent" ? C.turmeric : color;
  return (
    <group position={position} scale={scale}>
      {/* the speaker body */}
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.32, 0.34, 0.5, 48]} />
        <meshStandardMaterial color="#0e2430" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh ref={ring} position={[0, 0.52, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.3, 0.035, 16, 96]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={3.2} toneMapped={false} />
      </mesh>
      <mesh ref={glow} position={[0, 0.52, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.26, 0.42, 64]} />
        <meshBasicMaterial color={c} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <pointLight position={[0, 0.8, 0]} color={c} intensity={live ? 6 : 2.5} distance={6} decay={2} />
    </group>
  );
}

/* ── Scene 1: a home at night ─────────────────────────────────────────── */
export function Home({ position }: { position: THREE.Vector3 }) {
  return (
    <group position={position}>
      {/* floor slab */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[7, 0.1, 6]} />
        <meshStandardMaterial color={C.wallDark} roughness={0.95} />
      </mesh>
      {/* three walls, open to the camera */}
      <mesh position={[0, 1.4, -3]}>
        <boxGeometry args={[7, 2.8, 0.12]} />
        <meshStandardMaterial color={C.wall} roughness={0.9} />
      </mesh>
      <mesh position={[-3.5, 1.4, 0]}>
        <boxGeometry args={[0.12, 2.8, 6]} />
        <meshStandardMaterial color={C.wall} roughness={0.9} />
      </mesh>
      {/* window with warm light */}
      <mesh position={[1.6, 1.6, -2.93]}>
        <planeGeometry args={[1.3, 1]} />
        <meshStandardMaterial color="#ffb45c" emissive="#ff9a2e" emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
      <pointLight position={[1.6, 1.6, -2.4]} color="#ffb45c" intensity={3} distance={7} decay={2} />
      {/* a charpai (cot) */}
      <mesh position={[-1.8, 0.35, -1]}>
        <boxGeometry args={[1.9, 0.08, 0.9]} />
        <meshStandardMaterial color="#5a3b1d" roughness={0.9} />
      </mesh>
      {[-0.85, 0.85].flatMap((x) => [-0.4, 0.4].map((z) => (
        <mesh key={`${x}${z}`} position={[-1.8 + x, 0.16, -1 + z]}>
          <cylinderGeometry args={[0.04, 0.04, 0.32, 8]} />
          <meshStandardMaterial color="#3a2512" />
        </mesh>
      )))}
      {/* shelf with the Echo */}
      <mesh position={[0.4, 1.05, -2.6]}>
        <boxGeometry args={[2.2, 0.06, 0.5]} />
        <meshStandardMaterial color="#2a4350" />
      </mesh>
      <VoiceRing position={[0.2, 1.08, -2.55]} scale={0.7} />
      {/* fireflies */}
      <Sparkles count={40} scale={[8, 3, 7]} position={[0, 1.5, 0]} size={2.2} speed={0.25} color={C.cyan2} opacity={0.5} />
    </group>
  );
}

/* ── Scene 2: the memory field ────────────────────────────────────────── */
function MemoryCard({ index, total, center }: { index: number; total: number; center: THREE.Vector3 }) {
  const card = MEMORY_CARDS[index];
  const linked = card.region.toLowerCase().includes("lower back");
  const angle = ((index - (total - 1) / 2) / total) * Math.PI * 0.62;
  const r = 3.3;
  const pos: [number, number, number] = [center.x + Math.sin(angle) * r, center.y + 2 + (index % 2) * 0.5, center.z + Math.cos(angle) * r * 0.45 - 1];
  const col = linked ? C.turmeric : C.ink;
  return (
    <Float speed={1.2} rotationIntensity={0.08} floatIntensity={0.4}>
      <group position={pos} rotation={[0, -angle * 0.6, 0]}>
        <mesh>
          <planeGeometry args={[2.6, 1.25]} />
          <meshStandardMaterial color={C.glass} transparent opacity={0.35} roughness={0.2} metalness={0.6} side={THREE.DoubleSide} />
          <Edges color={linked ? C.turmeric : C.cyan} threshold={15} />
        </mesh>
        <Text position={[-1.2, 0.42, 0.01]} anchorX="left" anchorY="middle" fontSize={0.11} color={C.cyan2} font={FONT_MONO}>
          {card.when.toUpperCase()}
        </Text>
        <Text position={[-1.2, 0.05, 0.01]} anchorX="left" anchorY="middle" fontSize={0.14} maxWidth={2.3} lineHeight={1.2} color={col} font={FONT_DISPLAY}>
          {`"${card.text}"`}
        </Text>
        <Text position={[-1.2, -0.45, 0.01]} anchorX="left" anchorY="middle" fontSize={0.1} color={linked ? C.green : "#6d8690"} font={FONT_MONO}>
          {card.distance === 0 ? card.region.toUpperCase() : card.distance === null ? "NO MATCH" : `${card.region.toUpperCase()}  ·  d = ${card.distance.toFixed(3)}`}
        </Text>
      </group>
    </Float>
  );
}

export function MemoryField({ position }: { position: THREE.Vector3 }) {
  const total = MEMORY_CARDS.length;
  // links from "tonight" (last) to the two lumbar matches
  const points = useMemo(() => {
    const p = (i: number): [number, number, number] => {
      const angle = ((i - (total - 1) / 2) / total) * Math.PI * 0.62;
      const r = 3.3;
      return [position.x + Math.sin(angle) * r, position.y + 2 + (i % 2) * 0.5, position.z + Math.cos(angle) * r * 0.45 - 1];
    };
    return [[p(3), p(0)], [p(3), p(2)]] as [number, number, number][][];
  }, [position, total]);
  return (
    <group>
      <mesh position={[position.x, 0.01, position.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[6, 64]} />
        <meshBasicMaterial color={C.cyan} transparent opacity={0.04} />
      </mesh>
      {MEMORY_CARDS.map((_, i) => (
        <MemoryCard key={i} index={i} total={total} center={position} />
      ))}
      {points.map((pts, i) => (
        <Line key={i} points={pts} color={C.turmeric} lineWidth={1.5} transparent opacity={0.7} dashed dashSize={0.15} gapSize={0.1} />
      ))}
      <Sparkles count={90} scale={[10, 5, 8]} position={[position.x, position.y + 2.5, position.z]} size={1.6} speed={0.15} color={C.cyan2} opacity={0.35} />
      <VoiceRing position={[position.x, 0, position.z - 0.5]} scale={0.8} />
    </group>
  );
}

/* ── Scene 3: the doctor's desk ──────────────────────────────────────── */
export function Doctor({ position }: { position: THREE.Vector3 }) {
  const screen = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (screen.current) screen.current.position.y = position.y + 1.75 + Math.sin(clock.elapsedTime * 0.8) * 0.03;
  });
  const lines = [
    ["QUEUE · ON CALL", C.cyan2],
    ["Rahul Yadav, 50 · Sultanpur", C.ink],
    ["Lower back · recurrent", C.turmeric],
    ["3 visits in 38 days", C.turmeric],
    ["Worse mornings, bending to lift water", C.ink],
    ["Rule: 3+ visits, one region, 90 days", "#6d8690"],
  ] as const;
  return (
    <group position={position}>
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[3.2, 0.08, 1.4]} />
        <meshStandardMaterial color="#24404d" roughness={0.6} metalness={0.2} />
      </mesh>
      {[-1.4, 1.4].map((x) => (
        <mesh key={x} position={[x, 0.36, 0]}>
          <boxGeometry args={[0.08, 0.72, 1.2]} />
          <meshStandardMaterial color="#1b313c" />
        </mesh>
      ))}
      {/* holographic screen */}
      <mesh ref={screen} position={[0, 1.75, -0.3]}>
        <planeGeometry args={[3, 1.7]} />
        <meshStandardMaterial color={C.glass} transparent opacity={0.4} roughness={0.15} metalness={0.5} side={THREE.DoubleSide} />
        <Edges color={C.cyan} />
      </mesh>
      {lines.map(([t, c], i) => (
        <Text key={i} position={[-1.35, 2.42 - i * 0.29, -0.28]} anchorX="left" anchorY="middle" fontSize={i === 0 || i === 5 ? 0.09 : 0.13} color={c} font={i === 0 || i === 5 ? FONT_MONO : FONT_DISPLAY} maxWidth={2.7}>
          {t}
        </Text>
      ))}
      <pointLight position={[0, 2, 1]} color={C.cyan} intensity={3} distance={6} />
      <Sparkles count={30} scale={[5, 3, 4]} position={[0, 1.6, 0]} size={1.5} speed={0.2} color={C.cyan2} opacity={0.3} />
    </group>
  );
}

/* ── Scene 4: the red flag ───────────────────────────────────────────── */
export function Emergency({ position }: { position: THREE.Vector3 }) {
  const beacon = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const p = (Math.sin(clock.elapsedTime * 3) + 1) / 2;
    if (beacon.current) (beacon.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5 + p * 3;
    if (light.current) light.current.intensity = 2 + p * 6;
  });
  const spokes: Array<{ to: [number, number, number]; label: string }> = [
    { to: [-3.2, 1.2, -1.5], label: "108 ambulance" },
    { to: [3.2, 1.4, -1.5], label: "On-call doctor" },
    { to: [0, 2.6, -3], label: "Family contact" },
  ];
  return (
    <group position={position}>
      <VoiceRing position={[0, 0, 0]} scale={1.2} color={C.red} />
      <mesh ref={beacon} position={[0, 1.9, 0]}>
        <octahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color={C.red} emissive={C.red} emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 2, 0]} color={C.red} distance={9} decay={2} />
      {spokes.map((s) => (
        <group key={s.label}>
          <Line points={[[0, 1.9, 0], s.to]} color={C.red} lineWidth={1.2} transparent opacity={0.6} />
          <mesh position={s.to}>
            <sphereGeometry args={[0.09, 16, 16]} />
            <meshStandardMaterial color={C.red} emissive={C.red} emissiveIntensity={2} toneMapped={false} />
          </mesh>
          <Text position={[s.to[0], s.to[1] + 0.28, s.to[2]]} fontSize={0.14} color={C.ink} anchorX="center" font={FONT_DISPLAY}>
            {s.label}
          </Text>
        </group>
      ))}
      <Text position={[0.45, 1.9, 0]} fontSize={0.13} color={C.red} anchorX="left" letterSpacing={0.1} font={FONT_MONO}>
        chest_pain_acs · EMERGENCY
      </Text>
    </group>
  );
}

/* ── Scene 5: the live ring ──────────────────────────────────────────── */
export function LiveRing({ position }: { position: THREE.Vector3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.6, 1.62, 96]} />
        <meshBasicMaterial color={C.cyan} transparent opacity={0.35} />
      </mesh>
      <VoiceRing position={[0, 1.2, 0]} scale={1.6} live />
      <Sparkles count={60} scale={[6, 4, 6]} position={[0, 2.2, 0]} size={1.8} speed={0.3} color={C.cyan2} opacity={0.4} />
    </group>
  );
}
