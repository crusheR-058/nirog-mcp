import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Float } from "@react-three/drei";
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

/* ── Crystals: slow, refractive, parallax with the pointer ────────────────── */
const CRYSTALS: Array<{ p: [number, number, number]; s: number; r: number; detail: 0 | 1 }> = [
  { p: [-4.6, 2.2, -2], s: 1.9, r: 0.2, detail: 0 },
  { p: [4.8, -1.6, -3], s: 2.4, r: 0.9, detail: 0 },
  { p: [-3.4, -2.6, -4], s: 1.3, r: 1.7, detail: 1 },
  { p: [3.6, 2.8, -6], s: 1.6, r: 2.5, detail: 0 },
  { p: [0.2, -3.4, -5], s: 1.1, r: 3.1, detail: 1 },
  { p: [-6.5, -0.4, -7], s: 2.2, r: 4.0, detail: 0 },
  { p: [6.8, 0.8, -8], s: 1.5, r: 5.2, detail: 1 },
];

function Crystals({ low }: { low: boolean }) {
  const groups = useRef<Array<THREE.Group | null>>([]);
  const pointer = usePointer();
  const section = useDemo((s) => s.section);
  const material = useMemo(
    () =>
      low
        ? new THREE.MeshStandardMaterial({ color: "#9fb7c4", transparent: true, opacity: 0.16, roughness: 0.2, metalness: 0.1, flatShading: true })
        : new THREE.MeshPhysicalMaterial({
            color: "#dfe9ee",
            transmission: 1,
            thickness: 1.4,
            roughness: 0.14,
            ior: 1.45,
            metalness: 0,
            envMapIntensity: 1.2,
            attenuationColor: new THREE.Color("#7fd6cd"),
            attenuationDistance: 2.5,
            flatShading: true,
          }),
    [low],
  );
  useFrame((_, dt) => {
    groups.current.forEach((g, i) => {
      if (!g) return;
      const c = CRYSTALS[i];
      g.rotation.x += dt * 0.08 * (i % 2 ? 1 : -1);
      g.rotation.y += dt * 0.06;
      // Parallax: deeper crystals move less.
      const depth = 1 / (1 + Math.abs(c.p[2]) * 0.25);
      const tx = c.p[0] + pointer.current.x * 0.9 * depth + (section > 0 ? (c.p[0] > 0 ? 1.2 : -1.2) : 0);
      const ty = c.p[1] + pointer.current.y * 0.6 * depth;
      g.position.x += (tx - g.position.x) * 0.03;
      g.position.y += (ty - g.position.y) * 0.03;
    });
  });
  return (
    <>
      {CRYSTALS.map((c, i) => (
        <Float key={i} speed={0.7 + i * 0.1} rotationIntensity={0} floatIntensity={0.6}>
          <group ref={(el) => { groups.current[i] = el; }} position={c.p} rotation={[c.r, c.r * 0.6, 0]} scale={c.s}>
            <mesh material={material}>
              <icosahedronGeometry args={[1, c.detail]} />
            </mesh>
            <mesh>
              <icosahedronGeometry args={[1.001, c.detail]} />
              <meshBasicMaterial color="#bfe9f5" wireframe transparent opacity={0.07} />
            </mesh>
          </group>
        </Float>
      ))}
    </>
  );
}

/* ── Wireframe tetrahedra drifting through the field ──────────────────────── */
function Shards({ count }: { count: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => Array.from({ length: count }, () => ({
    p: new THREE.Vector3((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 12, -2 - Math.random() * 12),
    r: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, 0),
    s: 0.12 + Math.random() * 0.3,
    v: 0.1 + Math.random() * 0.3,
  })), [count]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    seeds.forEach((s, i) => {
      dummy.position.set(s.p.x, s.p.y + Math.sin(t * s.v + i) * 0.4, s.p.z);
      dummy.rotation.set(s.r.x + t * s.v * 0.5, s.r.y + t * s.v * 0.3, 0);
      dummy.scale.setScalar(s.s);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <tetrahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color="#8fe3ff" wireframe transparent opacity={0.35} />
    </instancedMesh>
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
          {!low && <Environment preset="city" />}
          <Rig />
          <ParticleSphere count={low ? 3500 : 11000} />
          <Crystals low={low} />
          <Shards count={low ? 12 : 36} />
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
