import * as THREE from "three";

/** Where each beat lives in the world and where the camera sits to see it. */
export interface Stop {
  id: string;
  /** Scene origin. */
  at: THREE.Vector3;
  /** Camera position for this beat. */
  cam: THREE.Vector3;
  /** What the camera looks at. */
  look: THREE.Vector3;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const STOPS: Stop[] = [
  // Copy alternates left, right, left, right; each look target is nudged so the scene sits on the other side.
  { id: "home", at: v(0, 0, 0), cam: v(3.2, 1.9, 7.5), look: v(-1.2, 1.1, 0) },
  { id: "memory", at: v(-9, 0, -14), cam: v(-6.5, 2.9, -4.5), look: v(-6.3, 2.0, -14) },
  { id: "doctor", at: v(8, 0, -28), cam: v(2, 2.4, -21), look: v(5.5, 1.4, -28) },
  { id: "emergency", at: v(-2, 0, -42), cam: v(-2, 3.4, -35.5), look: v(1.8, 1.8, -42) },
  { id: "try", at: v(2, 0, -56), cam: v(2, 3.2, -50.5), look: v(2, 1.9, -56) },
];

/** Smooth flight through the camera positions, and a parallel curve for the gaze. */
export const CAM_CURVE = new THREE.CatmullRomCurve3(STOPS.map((s) => s.cam), false, "catmullrom", 0.35);
export const LOOK_CURVE = new THREE.CatmullRomCurve3(STOPS.map((s) => s.look), false, "catmullrom", 0.35);

/**
 * Scroll offset (0..1) to curve parameter with dwell: the camera settles at each stop
 * while the copy is readable, then moves briskly to the next. Seam frames untouched.
 */
export function dwell(offset: number, stops = STOPS.length, hold = 0.42): number {
  const segs = stops - 1;
  const x = Math.min(Math.max(offset, 0), 1) * segs;
  const i = Math.min(Math.floor(x), segs - 1);
  const f = x - i;
  // Hold at the start of each segment, then ease to the next.
  const t = f < hold ? 0 : (f - hold) / (1 - hold);
  const eased = t * t * (3 - 2 * t);
  return (i + eased) / segs;
}

export function nearestStop(offset: number): number {
  return Math.round(dwell(offset) * (STOPS.length - 1));
}
