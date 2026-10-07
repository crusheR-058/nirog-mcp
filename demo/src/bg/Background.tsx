import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { useDemo } from "../store";

/** Phone-class or reduced-motion: fewer particles, no refraction, no post. */
function useQuality() {
  return useMemo(() => {
    const small = Math.min(window.innerWidth, window.innerHeight) <= 600;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return { low: small || reduced, reduced };
  }, []);
}

/* ── Pointer parallax shared by everything in the field ─────────────────── */
function usePointer() {
  const p = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      p.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      p.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return p;
}

/* ── The voice: a sphere of particles that breathes, listens, and scatters ─ */
const TEAL = new THREE.Color("#3dd6c3");
const VIOLET = new THREE.Color("#8b7cf6");
const GOLD = new THREE.Color("#e0a526");
const RED = new THREE.Color("#ff5a5f");

function ParticleSphere({ count }: { count: number }) {
  const points = useRef<THREE.Points>(null);
  const group = useRef<THREE.Group>(null);
  const pointer = usePointer();
  const phase = useDemo((s) => s.phase);
  const level = useDemo((s) => s.level);
  const section = useDemo((s) => s.section);
  const tint = useRef(new THREE.Color("#ffffff"));

  const { base, scatter, colors } = useMemo(() => {
    const base = new Float32Array(count * 3);
    const scatter = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // Fibonacci sphere: even spacing, no poles clumping.
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      base.set([x, y, z], i * 3);
      // Scatter target: a wide, flattened cloud.
      const sr = 1.6 + Math.random() * 2.4;
      scatter.set([x * sr * 1.4, y * sr * 0.6, z * sr * 1.4], i * 3);
      // Colour drifts around the sphere: teal, violet, gold.
      const t = (Math.atan2(z, x) / Math.PI + 1) / 2;
      c.copy(TEAL).lerp(VIOLET, THREE.MathUtils.smoothstep(t, 0.15, 0.5)).lerp(GOLD, THREE.MathUtils.smoothstep(t, 0.6, 0.95));
      c.lerp(TEAL, Math.max(0, (y + 1) / 2 - 0.5));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    return { base, scatter, colors };
  }, [count]);

  const positions = useMemo(() => new Float32Array(base), [base]);
  const spread = useRef(0);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const geo = points.current?.geometry;
    if (!geo) return;
    // How dispersed the cloud is: tight sphere on the hero, dispersed in the data sections, tight again for Talk.
    const target = section === 0 || section === 5 ? 0 : section === 2 ? 0.55 : 0.85;
    spread.current += (target - spread.current) * (1 - Math.pow(0.02, dt));
    const s = spread.current;
    const amp = phase === "listening" ? 0.16 : phase === "speaking" ? 0.11 : phase === "thinking" ? 0.06 : 0.035;
    const speed = phase === "thinking" ? 9 : phase === "speaking" ? 5 : 2.2;
    const arr = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const j = i * 3;
      const bx = base[j], by = base[j + 1], bz = base[j + 2];
      // Breathing + a travelling wave across latitude.
      const wave = Math.sin(t * speed + by * 6 + bx * 2) * amp + Math.sin(t * 0.9 + i * 0.013) * 0.02;
      const r = 1 + wave;
      arr[j] = THREE.MathUtils.lerp(bx * r, scatter[j] + Math.sin(t * 0.3 + i) * 0.05, s);
      arr[j + 1] = THREE.MathUtils.lerp(by * r, scatter[j + 1] + Math.cos(t * 0.25 + i * 0.7) * 0.05, s);
      arr[j + 2] = THREE.MathUtils.lerp(bz * r, scatter[j + 2], s);
    }
    geo.attributes.position.needsUpdate = true;
    if (group.current) {
      group.current.rotation.y += dt * (phase === "thinking" ? 0.9 : 0.12);
      group.current.rotation.x += (pointer.current.y * 0.35 - group.current.rotation.x) * 0.04;
      group.current.rotation.z += (-pointer.current.x * 0.25 - group.current.rotation.z) * 0.04;
    }
    const mat = points.current?.material as THREE.PointsMaterial;
    const want = level === "emergency" ? RED : level === "urgent" ? GOLD : new THREE.Color("#ffffff");
    tint.current.lerp(want, 0.05);
    mat.color.copy(tint.current);
    mat.size = THREE.MathUtils.lerp(0.03, 0.014, s) * (phase === "listening" ? 1.4 : 1);
    mat.opacity = THREE.MathUtils.lerp(0.95, 0.45, s);
  });

  return (
    <group ref={group} position={[0, 0.2, 0]} scale={1.55}>
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.03} vertexColors transparent opacity={0.95} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </points>
    </group>
  );
}

function Rig() {
  const { camera } = useThree();
  const pointer = usePointer();
  const section = useDemo((s) => s.section);
  useFrame(() => {
    // The sphere sits centre on the hero and Talk sections, and slides aside behind the data sections.
    // Hero: sphere right of the copy. Talk: sphere above the cards. Data sections: the cloud drifts aside.
    const tx = section === 0 ? -3.1 : section === 5 ? 0 : 2.6;
    const ty = section === 5 ? -2.3 : 0;
    camera.position.x += (tx + pointer.current.x * 0.25 - camera.position.x) * 0.03;
    camera.position.y += (ty + pointer.current.y * 0.15 - camera.position.y) * 0.03;
    camera.lookAt(0, 0.1, 0);
  });
  return null;
}

export function Background() {
  const { low } = useQuality();
  return (
    <div className="bg" aria-hidden="true">
      <Canvas
        dpr={low ? [1, 1.25] : [1, 1.75]}
        camera={{ fov: 45, position: [-3.1, 0, 7.5], near: 0.1, far: 60 }}
        gl={{ antialias: !low, powerPreference: "high-performance", preserveDrawingBuffer: true, alpha: false }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          scene.background = new THREE.Color("#070b12");
          scene.fog = new THREE.FogExp2("#070b12", 0.045);
        }}
      >
        <ambientLight intensity={0.25} color="#5b8da0" />
        <directionalLight position={[4, 6, 5]} intensity={1.2} color="#cfe9f0" />
        <pointLight position={[-5, -2, 2]} intensity={2.5} color="#3dd6c3" distance={14} />
        <pointLight position={[5, 3, -2]} intensity={1.6} color="#8b7cf6" distance={14} />
        <Suspense fallback={null}>
          <Rig />
          <ParticleSphere count={low ? 3500 : 11000} />
          {!low && (
            <EffectComposer multisampling={0}>
              <Bloom luminanceThreshold={0.55} luminanceSmoothing={0.3} intensity={0.9} mipmapBlur radius={0.7} />
              <Noise opacity={0.03} blendFunction={BlendFunction.OVERLAY} />
              <Vignette eskil={false} offset={0.2} darkness={0.8} />
            </EffectComposer>
          )}
        </Suspense>
      </Canvas>
    </div>
  );
}
