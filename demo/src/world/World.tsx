import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, Scroll, ScrollControls, Stars, useScroll } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { CAM_CURVE, LOOK_CURVE, STOPS, dwell, nearestStop } from "./path";
import { Doctor, Emergency, Home, LiveRing, MemoryField } from "./scenes";
import { useDemo } from "../store";

/** Phone-class or reduced-motion: lighter scene, no bloom. */
export function useQuality() {
  return useMemo(() => {
    const small = Math.min(window.innerWidth, window.innerHeight) <= 600;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return { low: small || reduced, reduced };
  }, []);
}

function CameraRig() {
  const scroll = useScroll();
  const { camera } = useThree();
  const setScrollEl = useDemo((s) => s.setScrollEl);
  const setFlight = useDemo((s) => s.setFlight);
  const pos = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());
  const target = useRef(LOOK_CURVE.getPoint(0));
  useEffect(() => {
    camera.position.copy(CAM_CURVE.getPoint(0));
    camera.lookAt(LOOK_CURVE.getPoint(0));
    setScrollEl(scroll.el);
  }, [camera, scroll.el, setScrollEl]);
  useFrame((_, dt) => {
    const t = dwell(scroll.offset);
    setFlight(nearestStop(scroll.offset), scroll.offset < 0.03);
    CAM_CURVE.getPoint(t, pos.current);
    LOOK_CURVE.getPoint(Math.min(t + 0.015, 1), look.current);
    const k = 1 - Math.pow(0.001, dt); // frame-rate independent ease
    camera.position.lerp(pos.current, k);
    target.current.lerp(look.current, k);
    camera.lookAt(target.current);
  });
  return null;
}

/** Only the current scene and its neighbours are drawn, so far scenes never bleed through the fog. */
function Gate({ index, children }: { index: number; children: ReactNode }) {
  const current = useDemo((s) => s.current);
  return <group visible={Math.abs(current - index) <= 1}>{children}</group>;
}

function Ground() {
  return (
    <Grid
      position={[0, -0.02, -28]}
      args={[160, 160]}
      cellSize={1}
      cellThickness={0.5}
      cellColor="#1a3a48"
      sectionSize={8}
      sectionThickness={1}
      sectionColor="#24596d"
      fadeDistance={34}
      fadeStrength={1.6}
      infiniteGrid
    />
  );
}

export function World({ pages, html }: { pages: number; html: ReactNode }) {
  const { low, reduced } = useQuality();
  return (
    <Canvas
      dpr={low ? [1, 1.25] : [1, 2]}
      camera={{ fov: 50, near: 0.1, far: 120 }}
      gl={{ antialias: !low, powerPreference: "high-performance", preserveDrawingBuffer: true }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        scene.fog = new THREE.FogExp2("#0b1c26", 0.042);
        scene.background = new THREE.Color("#0b1c26");
      }}
    >
      <ambientLight intensity={0.35} color="#4b7f93" />
      <hemisphereLight args={["#2b5f74", "#06141b", 0.5]} />
      <Suspense fallback={null}>
        <ScrollControls pages={pages} damping={reduced ? 0 : 0.18} distance={1}>
          <CameraRig />
          <Ground />
          {!low && <Stars radius={90} depth={40} count={1800} factor={3} saturation={0} fade speed={0.4} />}
          <Gate index={0}><Home position={STOPS[0].at} /></Gate>
          <Gate index={1}><MemoryField position={STOPS[1].at} /></Gate>
          <Gate index={2}><Doctor position={STOPS[2].at} /></Gate>
          <Gate index={3}><Emergency position={STOPS[3].at} /></Gate>
          <Gate index={4}><LiveRing position={STOPS[4].at} /></Gate>
          <Scroll html style={{ width: "100%" }}>
            {html}
          </Scroll>
        </ScrollControls>
        {!low && (
          <EffectComposer multisampling={0}>
            <Bloom luminanceThreshold={0.75} luminanceSmoothing={0.2} intensity={0.9} mipmapBlur />
            <Vignette eskil={false} offset={0.25} darkness={0.7} />
          </EffectComposer>
        )}
      </Suspense>
    </Canvas>
  );
}
