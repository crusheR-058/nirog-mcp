/**
 * Self-contained Three.js scene for the home-screen nurse "ARIA".
 *
 * Renders a realistic human avatar in a bright, minimal "clinical glass"
 * portrait — blown-out daylight, soft studio lighting, hairline HUD — in the
 * spirit of the Detroit: Become Human main menu.
 *
 * AVATAR: the bundled `chloe_avatar.glb` (~20 MB) — a rigged Chloe with 11
 * ARKit-style facial morph targets and a looping body `Idle` clip. The face is
 * driven LIVE via morphs (the GLB has no baked talking clip on purpose), so we
 * build a real face controller:
 *   - lip-sync: a text-driven viseme engine maps each word's vowels onto
 *     jawOpen / mouthWide / mouthPucker / upperLipUp (Web Speech can't be tapped
 *     for true audio analysis, so we drive plausible mouth shapes synced to the
 *     speech estimate + word-boundary events).
 *   - "alive" layer: randomised blinks, eye saccades, sentiment-driven brows +
 *     smile, and subtle head motion — the part that actually sells presence.
 *
 * CRITICAL GLB gotchas (verified by parsing the file):
 *   1. Morphs are SPLIT across meshes: head carries all 11; the eyebrow mesh
 *      carries browInnerUp/browDown; the eyelashes mesh carries
 *      eyeWide/eyeBlink/eyeSquint. They MUST be driven by NAME across every mesh
 *      that has them (the face controller builds a name -> [{mesh,index}] map).
 *   2. This DBH source ships pastel COLOR_0/COLOR_1 vertex colours that three.js
 *      MULTIPLIES into the textures (green hair / red specks). Blender ignores
 *      them so it looks clean there — we strip them at load.
 *
 * Loading strategy (resilient, always shows something live):
 *   1. Load the bundled GLB (window.NIROG_MODEL_URL — file:// copy). Play `Idle`,
 *      auto-frame the face, drive the morphs live.
 *   2. Fall back to a procedurally-built porcelain nurse (no network needed).
 *
 * Bridge:
 *   RN -> web:  window.nirog.speak(text), window.nirog.setMood(name)
 *   web -> RN:  postMessage {type:'ready'|'speaking'|'idle'|'caption'|'log', ...}
 */
export const NURSE_HTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  /* The GL canvas is OPAQUE (WebGLRenderer alpha:false) and fills the viewport, so
     nothing painted here can ever be seen. This used to be a six-layer aurora
     gradient stack, which forced the compositor to alpha-blend the whole animating
     3D layer over it on every frame for a backdrop that was never once visible.
     Flat fill, matching the scene's clear colour, purely as a safety net. */
  html,body { width:100%; height:100%; overflow:hidden; touch-action:none; background:#DBE7F9; }
  #c { display:block; width:100%; height:100%; touch-action:none; }

  /* HUD overlay — Quiet Glass: no brackets, no tags; only hints (the caption lives in the dock) */
  .hud { position:fixed; inset:0; pointer-events:none;
    font-family:-apple-system,'Segoe UI',Roboto,sans-serif; color:#6E6E73; }
  .grain { display:none; }

  /* legacy HUD chrome — removed in Quiet Glass (elements kept for JS refs) */
  .tag, .corner, .name { display:none; }

  .status { display:none; }
  .dot { width:7px; height:7px; border-radius:50%; background:#34C759; }
  .dot.talk { background:#0A84FF; animation:pulse 0.6s infinite alternate; }
  @keyframes pulse { from{transform:scale(0.7);opacity:0.6;} to{transform:scale(1.25);opacity:1;} }

  /* The caption is NOT drawn in here any more. The scene used to paint the whole reply at once in a
     four-line block, which — stacked above the dock's own "You said" box — meant two paragraphs of
     text covering Chloe. The dock now renders ONE rolling line for both sides of the conversation;
     this scene only streams it the words as they are spoken (see tickCaption). */

  .loading { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); text-align:center;
    font-size:11px; letter-spacing:0.02em; color:#AEAEB2; }
  .bar { width:120px; height:2px; background:rgba(29,29,31,0.08); margin:12px auto 0; overflow:hidden; border-radius:2px; }
  .bar i { display:block; height:100%; width:40%; background:#0A84FF;
    animation:slide 1.1s infinite; }
  @keyframes slide { from{transform:translateX(-100%);} to{transform:translateX(320%);} }

  /* "tap to start" — shown until she first speaks (mobile WebViews gate audio
     behind a user gesture; the tap unlocks it and triggers the greeting). */
  .startHint { position:absolute; left:50%; bottom:260px; transform:translateX(-50%);
    font-size:12.5px; font-weight:600; letter-spacing:-0.01em; color:#0A84FF;
    background:rgba(255,255,255,0.72); padding:9px 18px; border:1px solid rgba(255,255,255,0.6);
    border-radius:999px; box-shadow:0 6px 18px rgba(80,140,245,0.18);
    opacity:0; transition:opacity 0.3s; pointer-events:none; }
  .startHint.show { opacity:1; animation:hintpulse 1.3s infinite alternate; }
  @keyframes hintpulse { from{box-shadow:0 6px 18px rgba(80,140,245,0.12);} to{box-shadow:0 6px 26px rgba(80,140,245,0.42);} }

  /* on-screen diagnostics — hidden while everything works; revealed only when the
     realistic avatar fails to load (procedural fallback), so the exact reason is
     visible/screenshot-able on a device with no debugger attached. */
  #dbg { position:absolute; left:8px; right:8px; bottom:118px; display:none;
    font-family:ui-monospace,Menlo,Consolas,monospace; font-size:9px; line-height:1.45;
    color:#9a1322; white-space:pre-wrap; word-break:break-word; z-index:20;
    background:rgba(255,255,255,0.92); border:1px solid rgba(154,19,34,0.35);
    border-radius:8px; padding:8px 9px; max-height:42%; overflow:hidden; pointer-events:none; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div class="hud">
  <div class="grain"></div>
  <div class="corner c-tl"></div><div class="corner c-tr"></div>
  <div class="corner c-bl"></div><div class="corner c-br"></div>
  <div class="tag tl">NIROG • CARE UNIT<br/>MODEL CHLOE-1</div>
  <div class="tag tr">RT&nbsp;RENDER<br/>SECURE&nbsp;LINK&nbsp;●</div>
  <div class="name"><b>CHLOE</b><span>NIROG AI CARE ASSISTANT</span></div>
  <div class="status"><span id="dot" class="dot"></span><span id="st">ONLINE</span></div>
  <div id="startHint" class="startHint">Tap&nbsp;to&nbsp;start</div>
  <div id="loading" class="loading">Starting ARIA…<div class="bar"><i></i></div></div>
  <div id="dbg"></div>
</div>

<script type="importmap">
{ "imports": {
  "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
  "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
}}
</script>

<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const RN = (m) => { try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch(e){} };
const $ = (id) => document.getElementById(id);
// Keep the last few log lines so we can paint them on-screen if the realistic
// avatar fails (the only way to read the cause on a friend's device).
const _dbg = [];
const LOG = (msg) => {
  RN({type:'log', msg:String(msg)});
  try { _dbg.push(String(msg)); if (_dbg.length > 12) _dbg.shift(); const el = $('dbg'); if (el) el.textContent = _dbg.join('\n'); } catch(e){}
};
function showDbg(){ try { const el = $('dbg'); if (el) el.style.display = 'block'; } catch(e){} }

window.addEventListener('error', (e)=>{ LOG('JS-ERR: ' + (e.message || (e.error && e.error.message) || '?')); showDbg(); });
window.addEventListener('unhandledrejection', (e)=>{ LOG('REJECT: ' + ((e.reason && e.reason.message) || e.reason || '?')); showDbg(); });
LOG('boot · MODEL_URL=' + String(window.NIROG_MODEL_URL));

/* ----------------------------- renderer / scene ----------------------------- */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
// OPAQUE background — same colour as the fog, so the rendered image is unchanged.
// A transparent canvas (alpha:true + background null) made the browser alpha-blend
// this full-screen, 60fps 3D layer over the page on every single frame, and bought
// nothing: the fogged backdrop already filled the frame, so the page behind it was
// never visible. Keep these two colours equal.
scene.background = new THREE.Color(0xdbe7f9);
scene.fog = new THREE.Fog(0xdbe7f9, 6, 12);

const camera = new THREE.PerspectiveCamera(30, window.innerWidth/window.innerHeight, 0.05, 100);
camera.position.set(0, 1.5, 2.2);

let camTarget = new THREE.Vector3(0, 1.45, 0);
let camDist = 1.6, camBaseX = 0, swayAmp = 0.05;

// Sit her this many CSS px above where the framing would otherwise put her. This
// shifts the projection window, not the scene: raising the model would lift her
// off the floor, and raising camTarget would drag the orbit pivot off her face.
// A +y view offset means the camera renders a window lower down the image, so
// everything in it lands higher on screen — an exact pixel count at any size.
const LIFT_PX = 40;
function applyLift(){
  const w = window.innerWidth, h = window.innerHeight;
  camera.setViewOffset(w, h, 0, LIFT_PX, w, h); // also updates the projection matrix
}
applyLift();

/* ----------------------------- interactive controls ----------------------------- */
// Drag to orbit around her face, pinch to zoom. Panning is disabled so she stays
// centred; polar/zoom limits keep the view sensible.
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.enablePan = false;
controls.rotateSpeed = 0.5;
controls.zoomSpeed = 0.7;
controls.minPolarAngle = Math.PI * 0.18;
controls.maxPolarAngle = Math.PI * 0.62;
controls.target.copy(camTarget);

/* ----------------------------- soft studio lighting ----------------------------- */
scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe7f0, 1.05));
const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(2.2, 3.4, 3.2); scene.add(key);
const fill = new THREE.DirectionalLight(0xeaf2ff, 0.8); fill.position.set(-3, 1.6, 2); scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 1.4); rim.position.set(-1.5, 3, -3.5); scene.add(rim);
const faceFill = new THREE.PointLight(0xfff4ec, 0.6, 8); faceFill.position.set(0, 1.6, 1.6); scene.add(faceFill);

/* ----------------------------- floor ----------------------------- */
// The 30x18 "window light" backdrop plane that used to sit at z=-4 is gone. frameAvatar()
// puts the camera ~5.2 away from it and sets fog.far to ~4.5, so at every reachable orbit
// and zoom it sat beyond fog.far and rendered as a flat fill of exactly the fog colour —
// a full-screen opaque quad, redrawn every frame, pixel-identical to the clear colour the
// scene background already gives us for free. The floor stays: orbit the camera up and
// over her and it comes into view well inside the fog range.
const floorMat = new THREE.MeshStandardMaterial({ color:0xffffff, roughness:0.95, metalness:0 });
const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), floorMat);
floor.rotation.x = -Math.PI/2; floor.position.y = 0; scene.add(floor);

/* ===================================================================
 *  AVATAR  — load bundled Chloe GLB; else procedural porcelain nurse
 * =================================================================== */
let mixer = null;          // skeletal idle clip
let head = null;           // Bip_Head bone (subtle nod / look)
let headBaseQuat = null;
let eyeL = null, eyeR = null, eyeLBase = null, eyeRBase = null; // saccades
let avatarRoot = null;

// Jaw bone — the jawOpen MORPH only parts the lips (and distorts a little); the
// lower teeth/tongue (mesh 40_mouth/40_teeth) are weighted to Bip_GoiterEnd, NOT
// to the morph. So a believable open mouth = morph (lips) + rotating this bone
// (drops teeth/tongue, revealing the cavity). Verified via Blender renders.
let goiterEnd = null, goiterRest = null;
const goiterAxis = new THREE.Vector3(1, 0, 0); // world ear-to-ear, in bone-local space
let goiterCur = 0, goiterTarget = 0;
// Flip to -1 if her jaw CLENCHES instead of opening when she talks.
const JAW_OPEN_SIGN = 1;
const JAW_OPEN_MAX = 0.26;  // radians (~15deg) at full speech volume
let proc = null;           // procedural rig handle (fallback)

let idleAction = null;     // base idle AnimationAction
let gestureActions = {};   // name -> AnimationAction (extra Mixamo clips)
let bodyState = 'idle';    // current dominant body clip

// This Chloe export's geometry faces -Z (verified by world-space centroids: the
// eyes/mouth/brows/eyelashes sit on -Z, the hair on +Z) while frameAvatar() frames
// her from +Z — so rotate her 180° to face the camera. Set to 0 if a future
// re-export already faces +Z.
const FACE_YAW = Math.PI;

/* ----------------------------- face controller -----------------------------
 * Drive any morph BY NAME across every mesh that carries it (head + eyebrow +
 * eyelashes), smoothed per-frame for natural co-articulation. set() each frame;
 * update() eases current -> target and writes morphTargetInfluences. */
function createFaceController(){
  let map = {};            // name -> [{mesh,index}]
  const target = {};       // name -> 0..1 desired
  const current = {};      // name -> 0..1 actual
  const speed = {};        // name -> smoothing speed (default 16)
  return {
    bind(m){ map = m; for (const k in m){ target[k] = 0; current[k] = 0; } },
    names(){ return Object.keys(map); },
    has(name){ return name in map; },
    setSpeed(name, s){ speed[name] = s; },
    set(name, v){ if (name in target){ target[name] = v < 0 ? 0 : (v > 1 ? 1 : v); } },
    get(name){ return current[name] || 0; },
    update(dt){
      for (const name in target){
        const k = 1 - Math.exp(-dt * (speed[name] || 16));
        current[name] += (target[name] - current[name]) * k;
        const arr = map[name]; if (!arr) continue;
        const cv = current[name];
        for (let i = 0; i < arr.length; i++){
          const t = arr[i];
          if (t.mesh.morphTargetInfluences) t.mesh.morphTargetInfluences[t.index] = cv;
        }
      }
    },
  };
}
const face = createFaceController();

const MODEL_URLS = (typeof window !== 'undefined' && Array.isArray(window.NIROG_MODEL_URLS) && window.NIROG_MODEL_URLS.length)
  ? window.NIROG_MODEL_URLS
  : ((typeof window !== 'undefined' && window.NIROG_MODEL_URL) ? [window.NIROG_MODEL_URL] : []);

function frameAvatar(root){
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const h = Math.max(size.y, 0.5);

  // Horizontally centre on the head bone when we have it (arms/props can skew
  // the full-body bbox centre); otherwise use the bbox centre.
  let faceX = center.x, faceZ = box.max.z;
  if (head){
    const hp = new THREE.Vector3(); head.getWorldPosition(hp);
    faceX = hp.x;
  }

  // Aim at the face — roughly the eye line, a touch below the crown — and frame
  // a head-and-shoulders portrait so the idle animation still reads.
  const targetY = box.max.y - h * 0.07;
  camTarget.set(faceX, targetY, center.z);
  camDist = h * 0.62;
  camBaseX = faceX;
  swayAmp = camDist * 0.03;
  camera.position.set(faceX, targetY, faceZ + camDist);
  camera.lookAt(camTarget);
  scene.fog.near = camDist + h * 0.5;
  scene.fog.far = camDist + h * 2.0;
  // hand the framing to the controls
  controls.target.copy(camTarget);
  controls.minDistance = camDist * 0.55;
  controls.maxDistance = camDist * 1.9;
  controls.update();
}

async function tryLoadAvatar(){
  if (!MODEL_URLS.length) { LOG('ABORT: no model url'); return false; }
  let GLTFLoader;
  try { ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')); LOG('GLTFLoader import OK'); }
  catch(e){ LOG('loader import FAILED: ' + (e && e.message)); return false; }
  const loader = new GLTFLoader();
  for (let i=0;i<MODEL_URLS.length;i++){
    const url = MODEL_URLS[i];
    LOG('load attempt ' + i + '…');
    const ok = await loadOne(loader, url);
    if (ok) return true;
  }
  return false;
}

// Read a URL into an ArrayBuffer with XMLHttpRequest. Unlike the Fetch API, XHR
// CAN read file:// URLs inside an Android System WebView when allowFileAccess
// (+FromFileURLs / UniversalAccess) is enabled. three.js' loaders use fetch()
// internally, which throws "Failed to fetch" on a file:// URL in a release WebView
// (there is no Metro http server) — so we read the bytes here and hand them to
// loader.parse(). NOTE: a successful file:// read reports xhr.status === 0 (no HTTP
// status line), not 200, so treat 0 as success.
function xhrArrayBuffer(url){
  return new Promise((resolve, reject)=>{
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      let pl = false;
      xhr.onprogress = (p)=>{ if (p && p.total && !pl){ pl = true; LOG('GLB reading ~' + Math.round(p.total/1048576) + 'MB'); } };
      xhr.onload = ()=>{
        const ok = (xhr.status === 0) || (xhr.status >= 200 && xhr.status < 300);
        const buf = xhr.response;
        if (ok && buf && buf.byteLength) resolve(buf);
        else reject(new Error('xhr status=' + xhr.status + ' len=' + (buf ? buf.byteLength : 0)));
      };
      xhr.onerror = ()=> reject(new Error('xhr could not read ' + String(url).slice(0,52)));
      xhr.ontimeout = ()=> reject(new Error('xhr timeout'));
      xhr.send();
    } catch(e){ reject(e); }
  });
}

function loadOne(loader, url){
  return new Promise((resolve)=>{
    let settled = false;
    const finish = (v)=>{ if (!settled){ settled = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(()=>{ LOG('TIMEOUT loading model'); finish(false); }, 45000);

    const onParsed = (gltf)=>{
      LOG('GLB parsed OK');
      try {
        avatarRoot = gltf.scene;
        avatarRoot.rotation.y = FACE_YAW;
        const morphMap = {};
        avatarRoot.traverse((o)=>{
          if (o.isMesh){
            o.frustumCulled = false; o.castShadow = false;
            // The temple LED ships with a textureless backing "mask" mesh that
            // renders as a thin grey patch above the LED — hide it.
            if ((o.name||'').indexOf('led-mask') >= 0){ o.visible = false; }
            // Strip baked-in vertex colours — this DBH source ships pastel
            // COLOR_0/COLOR_1 that three.js MULTIPLIES into the base textures
            // (green hair / red specks). Blender's Principled ignores them so it
            // looks clean there; we must remove them here.
            if (o.geometry && o.geometry.attributes && o.geometry.attributes.color){
              o.geometry.deleteAttribute('color');
            }
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const mt of mats){ if (mt){ mt.vertexColors = false; mt.needsUpdate = true; } }
            // Index every morph BY NAME across all meshes that carry it.
            if (o.morphTargetDictionary && o.morphTargetInfluences){
              for (const name in o.morphTargetDictionary){
                const idx = o.morphTargetDictionary[name];
                (morphMap[name] || (morphMap[name] = [])).push({ mesh:o, index:idx });
              }
            }
          }
          // Control bones for the alive layer.
          if (o.isBone || o.type === 'Bone'){
            if (o.name === 'Bip_Head') head = o;
            else if (o.name === 'Bip_Eye_L') eyeL = o;
            else if (o.name === 'Bip_Eye_R') eyeR = o;
            else if (o.name === 'Bip_GoiterEnd') goiterEnd = o;
          }
        });
        // Fallbacks if the exact bone names ever change.
        if (!head){
          avatarRoot.traverse((o)=>{
            if (head) return;
            const nm = (o.name||'').toLowerCase();
            if ((o.isBone || o.type==='Bone') && nm.indexOf('head') >= 0 && nm.indexOf('end') < 0) head = o;
          });
        }
        face.bind(morphMap);
        face.setSpeed('eyeBlink', 55);   // blinks need to be crisp, not smoothed
        face.setSpeed('eyeWide', 22);
        LOG('morphs · ' + face.names().join(','));
        LOG('bones · head=' + (head?head.name:'-') + ' eyeL=' + (eyeL?'y':'-') + ' eyeR=' + (eyeR?'y':'-') + ' goiter=' + (goiterEnd?'y':'-'));
        if (head) headBaseQuat = head.quaternion.clone();
        if (eyeL) eyeLBase = eyeL.quaternion.clone();
        if (eyeR) eyeRBase = eyeR.quaternion.clone();
        scene.add(avatarRoot);
        frameAvatar(avatarRoot);
        // Capture the jaw bone's rest + the local-space axis that equals world-X
        // (ear-to-ear), so we can swing it open about that axis during speech.
        if (goiterEnd){
          goiterRest = goiterEnd.quaternion.clone();
          const _pwq = new THREE.Quaternion();
          if (goiterEnd.parent) goiterEnd.parent.getWorldQuaternion(_pwq);
          goiterAxis.set(1, 0, 0).applyQuaternion(_pwq.invert()).normalize();
        }
        mixer = new THREE.AnimationMixer(avatarRoot);
        if (gltf.animations && gltf.animations.length){
          // Prefer the purpose-built 'Idle' clip; ignore the leftover export clips.
          const idle = gltf.animations.find(a=>/^idle$/i.test(a.name))
                    || gltf.animations.find(a=>/idle/i.test(a.name))
                    || gltf.animations[0];
          // Strip root/hip translation so she idles IN PLACE (no walk-out drift).
          idle.tracks = idle.tracks.filter((tr)=> !/\.position$/.test(tr.name));
          idleAction = mixer.clipAction(idle); idleAction.reset().play();
          LOG('idle clip = ' + idle.name);
        }
        loadGestures();
        LOG('avatar ready · anims=' + ((gltf.animations||[]).length));
        finish(true);
      } catch(err){ LOG('parse/setup ERR: ' + (err && err.message)); finish(false); }
    };

    // Read the GLB bytes ourselves (XHR works on file://; the WebView's fetch() does
    // not), then parse from the ArrayBuffer. path='' because textures are embedded.
    xhrArrayBuffer(url).then((buf)=>{
      LOG('GLB bytes ' + buf.byteLength + ' · parsing');
      try { loader.parse(buf, '', onParsed, (e)=>{ LOG('GLB PARSE ERR: ' + (e && (e.message || e.type))); finish(false); }); }
      catch(e){ LOG('GLB parse threw: ' + (e && e.message)); finish(false); }
    }).catch((e)=>{ LOG('GLB LOAD ERR: ' + (e && e.message)); finish(false); });
  });
}

/* ----------------------------- gesture clips (retargeted) ----------------------------- */
// Optional extra body clips dropped into assets/animations/. Map a downloaded
// clip onto THIS model's bone names by matching node names.
function remapClip(clip, root){
  const map = {};
  root.traverse((o)=>{
    if (!o.name) return;
    map[o.name] = o.name;
    const base = o.name.replace(/_\d+$/, '');
    if (!(base in map)) map[base] = o.name;
  });
  for (const tr of clip.tracks){
    const dot = tr.name.lastIndexOf('.');
    const node = tr.name.slice(0, dot), prop = tr.name.slice(dot);
    let target = map[node] || map[node.replace(/_\d+$/, '')];
    if (target) tr.name = target + prop;
  }
  return clip;
}

async function loadGestures(){
  const list = (typeof window !== 'undefined' && Array.isArray(window.NIROG_GESTURES)) ? window.NIROG_GESTURES : [];
  if (!list.length || !mixer || !avatarRoot){ if (!list.length) LOG('no gesture clips configured'); return; }
  let GLTFLoader = null, FBXLoader = null;
  for (const g of list){
    try {
      const isFbx = /\.fbx(\?|$)/i.test(g.url);
      let anims;
      // Same file:// constraint as the avatar — read bytes via XHR, then parse.
      const buf = await xhrArrayBuffer(g.url);
      if (isFbx){
        if (!FBXLoader){ ({ FBXLoader } = await import('three/addons/loaders/FBXLoader.js')); }
        const o = new FBXLoader().parse(buf, ''); anims = o.animations;
      } else {
        if (!GLTFLoader){ ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')); }
        const o = await new Promise((res, rej)=> new GLTFLoader().parse(buf, '', res, rej)); anims = o.animations;
      }
      if (!anims || !anims.length){ LOG('gesture "' + g.name + '" has no clip'); continue; }
      const clip = anims[0];
      remapClip(clip, avatarRoot);
      clip.tracks = clip.tracks.filter((t)=> !/\.position$/.test(t.name));
      const act = mixer.clipAction(clip);
      act.enabled = true; act.setEffectiveWeight(0); act.play();
      if (g.loop === false){ act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; }
      gestureActions[g.name] = act;
      LOG('gesture loaded: ' + g.name);
    } catch(e){ LOG('gesture "' + g.name + '" ERR: ' + (e && e.message)); }
  }
}

function gotoBody(name){
  if (bodyState === name) return;
  const from = bodyState === 'talking' ? gestureActions.talking : idleAction;
  const to   = name === 'talking' ? gestureActions.talking : idleAction;
  if (!to){ return; } // requested clip not loaded — leave as-is
  to.reset(); to.enabled = true; to.play();
  if (from && from !== to) from.crossFadeTo(to, 0.5, false);
  else to.setEffectiveWeight(1);
  bodyState = name;
}

function playOneShot(name){
  const act = gestureActions[name];
  if (!act || !idleAction) return false;
  act.reset(); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = false;
  act.enabled = true; act.setEffectiveWeight(1); act.play();
  const base = bodyState === 'talking' ? gestureActions.talking : idleAction;
  if (base) base.crossFadeTo(act, 0.3, false);
  const onFinish = (e)=>{
    if (e.action !== act) return;
    mixer.removeEventListener('finished', onFinish);
    const back = bodyState === 'talking' ? gestureActions.talking : idleAction;
    if (back){ back.reset(); back.enabled = true; back.play(); act.crossFadeTo(back, 0.4, false); }
  };
  mixer.addEventListener('finished', onFinish);
  return true;
}

/* --------- procedural porcelain nurse (always available fallback) --------- */
function buildProceduralNurse(){
  const g = new THREE.Group(); g.position.y = 0; scene.add(g); proc = { group:g };

  const skin = new THREE.MeshStandardMaterial({ color:0xf1d9c9, roughness:0.55, metalness:0.0 });
  const scrub = new THREE.MeshStandardMaterial({ color:0xeef3f8, roughness:0.7, metalness:0.0 });
  const hair = new THREE.MeshStandardMaterial({ color:0xcaa46a, roughness:0.6, metalness:0.05 });

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.44,0.9,28), scrub);
  torso.position.y = 0.95; g.add(torso);
  const sh = new THREE.Mesh(new THREE.SphereGeometry(0.16,20,20), scrub);
  sh.scale.set(1.9,0.7,1); sh.position.y = 1.4; g.add(sh);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.085,0.11,0.16,20), skin); neck.position.y = 1.5; g.add(neck);

  const headG = new THREE.Group(); headG.position.y = 1.72; g.add(headG); proc.head = headG;
  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.23,40,40), skin); headM.scale.set(1,1.12,1.02); headG.add(headM);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.245,32,32,0,Math.PI*2,0,Math.PI/1.7), hair);
  hairCap.position.y = 0.02; headG.add(hairCap);
  const pony = new THREE.Mesh(new THREE.CapsuleGeometry(0.06,0.22,8,16), hair);
  pony.position.set(0,-0.02,-0.22); pony.rotation.x = 0.3; headG.add(pony);

  const white = new THREE.MeshStandardMaterial({ color:0xffffff, roughness:0.3 });
  const iris = new THREE.MeshStandardMaterial({ color:0x5b86a6, roughness:0.2, metalness:0.1 });
  for (const sx of [-1,1]){
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.034,16,16), white);
    eye.position.set(0.08*sx,0.02,0.2); eye.scale.set(1,0.8,0.6); headG.add(eye);
    const ir = new THREE.Mesh(new THREE.CircleGeometry(0.016,16), iris);
    ir.position.set(0.08*sx,0.02,0.232); headG.add(ir);
  }
  const browMat = new THREE.MeshStandardMaterial({ color:0xb98f55, roughness:0.7 });
  for (const sx of [-1,1]){
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.012,0.01), browMat);
    br.position.set(0.08*sx,0.075,0.215); headG.add(br);
  }
  const lipMat = new THREE.MeshStandardMaterial({ color:0xc9716b, roughness:0.5 });
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.07,0.018,0.02), lipMat);
  mouth.position.set(0,-0.085,0.212); headG.add(mouth); proc.mouth = mouth;

  head = headG;
  camTarget.set(0, 1.72, 0); camDist = 0.92; camBaseX = 0; swayAmp = 0.02;
  camera.position.set(0, 1.72, 0.92); camera.lookAt(camTarget);
  scene.fog.near = 2; scene.fog.far = 6;
  controls.target.copy(camTarget);
  controls.minDistance = camDist * 0.55;
  controls.maxDistance = camDist * 1.9;
  controls.update();
  return g;
}
function applyProcMouth(t){
  if (!proc || !proc.mouth) return;
  let m = 0;
  if (speaking){ m = 0.2 + (0.5 + 0.5*Math.sin(t*11.0)) * 0.5; }
  proc.mouth.scale.y = 1 + m*6; proc.mouth.position.y = -0.085 - m*0.018;
}

/* ===================================================================
 *  TALKING — text-driven visemes + sentiment + alive layer
 * =================================================================== */
let speaking = false, speakUntil = 0, hardStopAt = 0;
let visSeq = [], speakStart = 0, speakDur = 1, currentText = '';
let currentUtter = null;   // identity guard so a stale utterance can't clobber timing
let mood = 'neutral';
let speakToken = 0;        // bumped per speak(); guards stale async audio / fallbacks
let awaitingAudio = false; // true while fetching ElevenLabs and no audio has begun yet

// Live subtitle: the words of the current line, the word each viseme step belongs to, and how far
// the voice has actually got through them. See tickCaption.
let capWords = [], visWord = [], capCursor = -1;

// Map a single word to an ordered list of mouth poses from its vowels.
function wordToVisemes(word){
  const w = word.toLowerCase();
  const out = [];
  for (let i=0;i<w.length;i++){
    const c = w[i];
    if (c === 'a')                 out.push({jaw:0.5,  wide:0.08, pucker:0,    lip:0});
    else if (c === 'e')            out.push({jaw:0.22, wide:0.5,  pucker:0,    lip:0});
    else if (c === 'i' || c==='y') out.push({jaw:0.16, wide:0.6,  pucker:0,    lip:0});
    else if (c === 'o')            out.push({jaw:0.3,  wide:0,    pucker:0.5,  lip:0});
    else if (c === 'u')            out.push({jaw:0.18, wide:0,    pucker:0.62, lip:0});
    else if (c === 'w')            out.push({jaw:0.12, wide:0,    pucker:0.5,  lip:0});
    else if (c === 'f' || c==='v') out.push({jaw:0.1,  wide:0.1,  pucker:0,    lip:0.45});
    else if (c === 'm' || c==='b' || c==='p') out.push({jaw:0, wide:0, pucker:0.05, lip:0, gap:true}); // bilabial close
    // other consonants ride their neighbouring vowels
  }
  if (!out.length) out.push({jaw:0.2, wide:0.12, pucker:0, lip:0}); // neutral tick for all-consonant tokens
  return out;
}
// Also fills visWord — the word index behind every viseme step — so the subtitle can name the word
// the mouth is forming at this instant. Built in the same pass to keep the two arrays in lockstep.
function buildVisemes(text){
  const words = (text||'').split(/\s+/).filter(Boolean);
  let seq = [];
  visWord = [];
  for (let w=0; w<words.length; w++){
    const vs = wordToVisemes(words[w]);
    for (let i=0;i<vs.length;i++){ seq.push(vs[i]); visWord.push(w); }
    seq.push({jaw:0, wide:0, pucker:0, lip:0, gap:true}); // brief close between words
    visWord.push(w);
  }
  if (!seq.length){ seq = [{jaw:0,wide:0,pucker:0,lip:0}]; visWord = [0]; }
  return seq;
}
// lvl: live audio loudness 0..1 from the ElevenLabs analyser, or -1 when there is
// no real audio (Web-Speech fallback) and we must drive from the time estimate.
function applyViseme(t, lvl){
  if (!visSeq.length){ relaxMouth(); return; }
  const prog = Math.max(0, Math.min(0.999, (performance.now() - speakStart) / speakDur));
  const v = visSeq[Math.floor(prog * visSeq.length)] || visSeq[visSeq.length-1];

  let jaw, shape;
  if (lvl >= 0){
    // REAL audio: the jaw tracks ACTUAL loudness, so the mouth opens exactly when
    // sound is produced and shuts in the gaps. The text visemes still pick the
    // lateral shape (wide/pucker), a small shimmer keeps it from looking robotic.
    const loud = lvl;                                    // already gated/scaled 0..1
    jaw   = loud * 0.5 * (0.9 + 0.1*Math.sin(t*22.0));   // map into the old 0..~0.5 band
    shape = Math.min(1, loud * 1.25);
  } else {
    // ESTIMATE (Web-Speech fallback): original time-driven viseme behaviour.
    const open = v.gap ? 0.0 : 1.0;
    // syllable oscillator -> the mouth pulses within a held pose for liveliness.
    const puls = 0.64 + 0.36*Math.sin(t*12.0);
    const amp  = 0.7 + 0.3*Math.sin(t*2.1);
    jaw   = v.jaw * puls * amp * open;                   // 0 .. ~0.5
    shape = (0.5 + 0.5*puls) * open;
  }
  // The morph parts the lips; the Bip_GoiterEnd bone (driven below) drops the
  // teeth/tongue so the mouth actually reads as open. Morph kept moderate so the
  // lip-eversion artifact stays subtle.
  face.set('jawOpen',     jaw * 0.8);
  goiterTarget = Math.min(1, jaw / 0.45);
  face.set('mouthWide',   v.wide   * shape);
  face.set('mouthPucker', v.pucker * shape);
  face.set('upperLipUp',  v.lip    * (lvl >= 0 ? Math.min(1, lvl*2) : (v.gap ? 0 : 1)));
}
function relaxMouth(){
  face.set('jawOpen',0); face.set('mouthWide',0); face.set('mouthPucker',0); face.set('upperLipUp',0);
  goiterTarget = 0;
}

// --- sentiment -> brows + smile (set as targets; controller eases them) ---
function classifyMood(text){
  const s = ' ' + (text||'').toLowerCase() + ' ';
  if (/(sorry|pain|hurt|worry|worried|serious|careful|unfortunately|concern|risk|emergency|severe|fever|dengue|monitor)/.test(s)) return 'concerned';
  if (/(great|glad|good morning|welcome|happy|wonderful|of course|excellent|healthy|improving|sure|right away)/.test(s)) return 'happy';
  if (/(wow|really|oh\b|amazing|surprising|incredible)/.test(s)) return 'surprised';
  return 'neutral';
}
function applyEmotion(speakingNow){
  // Keep a strong warm smile even while talking — only lightly softened so the
  // visemes still read (mw stays high so she doesn't go deadpan mid-sentence).
  const mw = speakingNow ? 0.82 : 1.0;
  if (mood === 'happy'){
    face.set('mouthSmile', 0.98*mw); face.set('eyeSquint', 0.36);
    face.set('browInnerUp', 0.06); face.set('mouthFrown', 0); face.set('browDown', 0); face.set('eyeWide', 0);
  } else if (mood === 'concerned'){
    // caring, not glum — keep a gentle reassuring smile under the empathetic brows.
    face.set('browInnerUp', 0.45); face.set('mouthFrown', 0.04*mw); face.set('browDown', 0.05);
    face.set('mouthSmile', 0.4*mw); face.set('eyeSquint', 0.12); face.set('eyeWide', 0);
  } else if (mood === 'surprised'){
    face.set('eyeWide', 0.4); face.set('browInnerUp', 0.45); face.set('mouthSmile', 0.55*mw);
    face.set('mouthFrown', 0); face.set('browDown', 0); face.set('eyeSquint', 0.06);
  } else {
    // pleasant default — a clear, friendly resting smile rather than a neutral line
    face.set('mouthSmile', 0.66*mw); face.set('eyeSquint', 0.2);
    face.set('browInnerUp', 0); face.set('mouthFrown', 0); face.set('browDown', 0); face.set('eyeWide', 0);
  }
}

// --- natural randomised blinking (idle + during speech, with the odd double) ---
let blinkStart = -1, nextBlinkAt = 1.2, blinkAgain = false;
const BLINK_DUR = 0.12;
function updateBlink(t){
  if (blinkStart < 0 && t > nextBlinkAt) blinkStart = t;
  let v = 0;
  if (blinkStart >= 0){
    const p = (t - blinkStart) / BLINK_DUR;
    if (p >= 1){
      blinkStart = -1; v = 0;
      if (blinkAgain){ blinkAgain = false; nextBlinkAt = t + 0.14; }
      else { nextBlinkAt = t + 2.4 + Math.random()*3.6; blinkAgain = Math.random() < 0.18; }
    } else v = Math.sin(p * Math.PI); // 0 -> 1 -> 0
  }
  face.set('eyeBlink', v);
}

// --- eye saccades — tiny darts on the eye bones so the gaze isn't a dead stare ---
let nextSaccadeAt = 0.8, sacX = 0, sacY = 0, sacTX = 0, sacTY = 0;
const _se = new THREE.Euler(), _sq = new THREE.Quaternion();
function updateEyes(t, dt){
  if (!eyeL && !eyeR) return;
  if (t > nextSaccadeAt){
    sacTX = (Math.random()-0.5) * 0.10;   // yaw  (~+-0.05 rad)
    sacTY = (Math.random()-0.5) * 0.06;   // pitch
    nextSaccadeAt = t + 0.7 + Math.random()*2.0;
  }
  const ke = Math.min(1, dt*14);          // saccades are fast
  sacX += (sacTX - sacX) * ke;
  sacY += (sacTY - sacY) * ke;
  const tremor = Math.sin(t*23.0) * 0.004;
  _se.set(sacY, sacX + tremor, 0); _sq.setFromEuler(_se);
  if (eyeL && eyeLBase) eyeL.quaternion.copy(eyeLBase).multiply(_sq);
  if (eyeR && eyeRBase) eyeR.quaternion.copy(eyeRBase).multiply(_sq);
}

// --- subtle head motion (nod while speaking, gentle sway when idle) ---
const _he = new THREE.Euler(), _hq = new THREE.Quaternion();
function updateHead(t, dt, speakingNow){
  if (!head) return;
  if (headBaseQuat){
    const nodX = speakingNow ? (Math.sin(t*3.0)*0.020 + Math.sin(t*1.3)*0.010) : Math.sin(t*0.6)*0.012;
    const nodY = speakingNow ? Math.sin(t*1.5)*0.028 : Math.sin(t*0.35)*0.022;
    const tiltZ = Math.sin(t*0.5)*0.010;
    _he.set(nodX, nodY, tiltZ); _hq.setFromEuler(_he);
    head.quaternion.copy(headBaseQuat).multiply(_hq);
  } else {
    // procedural fallback head group
    head.rotation.y = Math.sin(t*0.5)*0.1 + (speakingNow ? Math.sin(t*1.5)*0.03 : 0);
    head.rotation.x = (speakingNow ? Math.sin(t*3.0)*0.02 : Math.sin(t*0.8)*0.025);
  }
}

// --- jaw bone — swing Bip_GoiterEnd open so teeth/tongue drop with the lip morph ---
const _jq = new THREE.Quaternion();
function updateJaw(dt){
  if (!goiterEnd || !goiterRest) return;
  goiterCur += (goiterTarget - goiterCur) * (1 - Math.exp(-dt * 20));
  _jq.setFromAxisAngle(goiterAxis, JAW_OPEN_SIGN * goiterCur * JAW_OPEN_MAX);
  goiterEnd.quaternion.copy(goiterRest).multiply(_jq);
}

/* ===================================================================
 *  VOICE — ElevenLabs (demo) with REAL audio-driven lip-sync, and an
 *  automatic fall back to the device Web-Speech TTS.
 *
 *  We fetch the TTS MP3 inside the WebView, decode it with the Web Audio API,
 *  and read its live amplitude every frame — so the jaw tracks the ACTUAL voice
 *  instead of a word-count estimate. The key/voice/model are injected from the
 *  RN .env (EXPO_PUBLIC_ELEVENLABS_*). DEMO ONLY: the key ships in the bundle.
 * =================================================================== */
/* ARIA's backend. When set, Chloe's voice comes from Amazon Polly via POST /speak — no client-side
 * API key, and the same AWS account that answers the patient also speaks to them. */
const ARIA_API = (typeof window!=='undefined' && window.NIROG_ARIA_API) || '';

const ELEVEN = {
  key:   (typeof window!=='undefined' && window.NIROG_ELEVEN_KEY)   || '',
  voice: (typeof window!=='undefined' && window.NIROG_ELEVEN_VOICE) || '',
  model: (typeof window!=='undefined' && window.NIROG_ELEVEN_MODEL) || 'eleven_flash_v2_5',
};
let audioCtx = null, currentSource = null, speechAnalyser = null, sampleBuf = null;
const AUDIO_GATE = 0.02;   // RMS below this counts as silence -> mouth fully closed
const AUDIO_GAIN = 6.5;    // maps speech RMS into a 0..1 openness

function getAudioCtx(){
  if (!audioCtx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { audioCtx = new AC(); } catch(e){ return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
  return audioCtx;
}
// Some WebViews start the AudioContext suspended until the first interaction —
// resume on any touch so a later line is guaranteed to be audible.
['touchstart','pointerdown','mousedown'].forEach((ev)=>{
  window.addEventListener(ev, ()=>{ if (audioCtx && audioCtx.state==='suspended') audioCtx.resume().catch(()=>{}); }, { passive:true });
});

// decodeAudioData supports both promise and callback forms across WebViews.
function decodeAudio(ctx, buf){
  return new Promise((resolve, reject)=>{
    let done = false;
    const ok = (b)=>{ if(!done){ done=true; resolve(b); } };
    const no = (e)=>{ if(!done){ done=true; reject(e || new Error('decode failed')); } };
    try { const p = ctx.decodeAudioData(buf, ok, no); if (p && p.then) p.then(ok, no); }
    catch(e){ no(e); }
  });
}

// Live loudness 0..1 from the playing ElevenLabs audio, or -1 when there is none.
function readAudioLevel(){
  if (!speechAnalyser || !sampleBuf) return -1;
  speechAnalyser.getByteTimeDomainData(sampleBuf);
  let sum = 0;
  for (let i=0;i<sampleBuf.length;i++){ const d = (sampleBuf[i]-128)/128; sum += d*d; }
  const rms = Math.sqrt(sum / sampleBuf.length);
  if (rms < AUDIO_GATE) return 0;
  return Math.min(1, (rms - AUDIO_GATE) * AUDIO_GAIN);
}

function stopAudio(){
  if (currentSource){ try { currentSource.onended = null; currentSource.stop(); } catch(e){} }
  currentSource = null; speechAnalyser = null;
}

/* Play a fetched MP3 and drive the lip-sync from its REAL waveform (an analyser on the
 * source node), rather than a guessed word-count timeline. Shared by every cloud voice. */
async function playSpokenAudio(ctx, bytes, token, label){
  if (token !== speakToken) return;                 // a newer line superseded us
  const audioBuf = await decodeAudio(ctx, bytes.slice(0));
  if (token !== speakToken) return;

  // Exact duration known — re-anchor the lip-sync timeline to the real audio so
  // the mouth stops precisely when she does.
  stopAudio();
  speakDur   = Math.max(300, audioBuf.duration * 1000);
  speakStart = performance.now();
  speakUntil = speakStart + speakDur;
  hardStopAt = speakStart + speakDur + 1200;

  const src = ctx.createBufferSource(); src.buffer = audioBuf;
  const an  = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.6;
  sampleBuf = new Uint8Array(an.fftSize);
  src.connect(an); an.connect(ctx.destination);
  currentSource = src; speechAnalyser = an; awaitingAudio = false;
  src.onended = ()=>{
    if (token !== speakToken) return;
    speakUntil = performance.now();
    if (currentSource === src){ currentSource = null; speechAnalyser = null; }
  };
  try { src.start(); } catch(e){ awaitingAudio = false; throw e; }
  LOG(label + ' · ' + audioBuf.duration.toFixed(1) + 's');
}

/* Ready the audio context, or explain why we can't. */
async function readyAudioCtx(){
  const ctx = getAudioCtx();
  if (!ctx) throw new Error('no AudioContext');
  if (ctx.state === 'suspended'){ try { await ctx.resume(); } catch(e){} }
  // If the WebView still won't start audio (autoplay blocked before any touch), bail to the
  // device voice so the line is at least heard; the cloud voice resumes on the next line once
  // the user has interacted with the screen.
  if (ctx.state === 'suspended') throw new Error('audio suspended (autoplay blocked)');
  return ctx;
}

/* ARIA's own voice — Amazon Polly, served by the same backend that does the thinking.
 * This is the PRIMARY voice: the ElevenLabs account this app shipped with is blocked
 * (401 detected_unusual_activity), which had silently demoted Chloe to the flat robotic
 * browser voice. Polly needs no client-side key at all. */
async function speakAria(text, token){
  if (!ARIA_API) throw new Error('no ARIA api');
  const ctx = await readyAudioCtx();

  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const killer = ctrl ? setTimeout(()=>{ try { ctrl.abort(); } catch(e){} }, 15000) : null;
  let res;
  try {
    res = await fetch(ARIA_API + '/speak', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ text }),
      signal: ctrl ? ctrl.signal : undefined,
    });
  } finally { if (killer) clearTimeout(killer); }

  if (!res.ok){
    let d=''; try { d = await res.text(); } catch(e){}
    throw new Error('HTTP ' + res.status + (d ? ' · ' + d.slice(0,90) : ''));
  }
  const json = await res.json();
  if (!json.audio) throw new Error('no audio in /speak response');

  // base64 -> ArrayBuffer
  const bin = atob(json.audio);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);

  await playSpokenAudio(ctx, bytes.buffer, token, 'polly');
}

async function speakEleven(text, token){
  if (!ELEVEN.key || !ELEVEN.voice) throw new Error('no eleven config');
  const ctx = await readyAudioCtx();

  // Abort a hung request so we still fall back to the device voice.
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const killer = ctrl ? setTimeout(()=>{ try { ctrl.abort(); } catch(e){} }, 12000) : null;
  let res;
  try {
    res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(ELEVEN.voice), {
      method:'POST',
      headers:{ 'xi-api-key': ELEVEN.key, 'Content-Type':'application/json', 'Accept':'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: ELEVEN.model,
        voice_settings: { stability:0.45, similarity_boost:0.8, style:0.0, use_speaker_boost:true },
      }),
      signal: ctrl ? ctrl.signal : undefined,
    });
  } finally { if (killer) clearTimeout(killer); }

  if (!res.ok){
    let d=''; try { d = await res.text(); } catch(e){}
    throw new Error('HTTP ' + res.status + (d ? ' · ' + d.slice(0,120) : ''));
  }
  const bytes = await res.arrayBuffer();
  await playSpokenAudio(ctx, bytes, token, 'eleven @ ' + ELEVEN.model);
}

// Device Web-Speech fallback (original behaviour) — when ElevenLabs is not
// configured or the request/decode fails.
function speakWebSpeech(text){
  awaitingAudio = false;
  // restore the estimated timeline (an attempted eleven line may have shrunk it).
  const words = (text.split(/\s+/).filter(Boolean).length) || 1;
  speakDur = Math.max(1400, words * 330);
  speakStart = performance.now();
  speakUntil = speakStart + speakDur;
  // Absolute ceiling — speech ALWAYS ends by here regardless of what the (flaky)
  // Web Speech API reports. Android System WebView can leave speechSynthesis.speaking
  // stuck true and never deliver onend, which would otherwise hang her 'speaking'.
  hardStopAt = speakStart + speakDur + 3500;
  try {
    const synth = window.speechSynthesis;
    if (synth && typeof SpeechSynthesisUtterance !== 'undefined'){
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.96; u.pitch = 1.1;
      const pick = () => {
        const vs = synth.getVoices();
        const v = vs.find(x=>/female|samantha|zira|google uk english female|aria/i.test(x.name))
               || vs.find(x=>/en-IN|india/i.test(x.lang))
               || vs.find(x=>/^en/i.test(x.lang)) || vs[0];
        if (v) u.voice = v;
      };
      pick(); if (!synth.getVoices().length) synth.onvoiceschanged = pick;
      // Only the CURRENT utterance may touch the shared timing globals, so a stale
      // utterance's end/error (incl. the one fired by cancel() below) can't abort
      // the new line. Re-anchor the viseme cursor to real speech as words are spoken.
      u.onboundary = (ev) => {
        if (u !== currentUtter) return;
        if (ev && typeof ev.charIndex === 'number' && currentText.length){
          const frac = Math.max(0, Math.min(1, ev.charIndex / currentText.length));
          speakStart = performance.now() - frac * speakDur;
        }
      };
      u.onend = () => { if (u === currentUtter) speakUntil = performance.now(); };
      u.onerror = () => { if (u === currentUtter) speakUntil = performance.now(); };
      currentUtter = u;     // claim identity BEFORE cancel so the previous
      synth.cancel();       // utterance's cancel-fired onend/onerror no-ops.
      synth.speak(u);
    }
  } catch(e){ RN({type:'log', msg:'tts unavailable'}); }
}

/* ----- LOCAL voice — RN synthesizes a WAV on-device (Kokoro) and hands us its
 * file:// uri. Reuses the ElevenLabs analyser pipeline so the jaw tracks the real
 * waveform. fetch() can't read file:// in Android WebViews — XHR with
 * responseType=arraybuffer works and reports status 0 on success (same trick as
 * the GLB loader). ----- */
function loadLocalWav(url){
  return new Promise((resolve, reject)=>{
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = ()=>{
        const ok = xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300);
        if (ok && xhr.response && xhr.response.byteLength) resolve(xhr.response);
        else reject(new Error('wav xhr status ' + xhr.status));
      };
      xhr.onerror = ()=> reject(new Error('wav xhr error'));
      xhr.send();
    } catch(e){ reject(e); }
  });
}
async function speakLocalAudio(text, url, token){
  const ctx = getAudioCtx();
  if (!ctx) throw new Error('no AudioContext');
  if (ctx.state === 'suspended'){ try { await ctx.resume(); } catch(e){} }
  if (ctx.state === 'suspended') throw new Error('audio suspended (autoplay blocked)');
  const bytes = await loadLocalWav(url);
  if (token !== speakToken) return;
  const audioBuf = await decodeAudio(ctx, bytes);
  if (token !== speakToken) return;

  stopAudio();
  speakDur   = Math.max(300, audioBuf.duration * 1000);
  speakStart = performance.now();
  speakUntil = speakStart + speakDur;
  hardStopAt = speakStart + speakDur + 1200;

  const src = ctx.createBufferSource(); src.buffer = audioBuf;
  const an  = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.6;
  src.connect(an); an.connect(ctx.destination);
  currentSource = src; speechAnalyser = an; awaitingAudio = false;
  src.onended = ()=>{
    if (token !== speakToken) return;
    speakUntil = performance.now();
    if (currentSource === src){ currentSource = null; speechAnalyser = null; }
  };
  try { src.start(); } catch(e){ awaitingAudio = false; throw e; }
  LOG('local wav · ' + audioBuf.duration.toFixed(1) + 's');
}
// Mirrors speak(), but the voice is the pre-synthesized local WAV; Web-Speech is
// still the fallback if the WAV can't be loaded/decoded.
function speakWithAudio(text, url){
  if (!text) return;
  const token = ++speakToken;
  currentText = text;
  mood = classifyMood(text);
  visSeq = buildVisemes(text);
  beginCaption(text);
  const words = text.split(/\s+/).filter(Boolean).length;
  speakDur = Math.max(1400, words * 330);
  speakStart = performance.now();
  speakUntil = speakStart + speakDur;
  hardStopAt = speakStart + speakDur + 3500;
  awaitingAudio = true;
  startTalk();

  stopAudio();
  speakLocalAudio(text, url, token).catch((e)=>{
    if (token !== speakToken) return;
    LOG('local voice fallback (' + (e && e.message) + ')');
    speakWebSpeech(text);
  });
}

/* ----------------------------- speech ----------------------------- */
function startTalk(){
  micAbort();   // she must never hear herself — an open mic here would transcribe her own voice
  speaking = true; { const sh=$('startHint'); if(sh) sh.className='startHint'; }
  $('dot').className='dot talk'; $('st').textContent='SPEAKING'; gotoBody('talking'); RN({type:'speaking'});
}
function stopTalk(){
  speaking = false; visSeq = []; visWord = []; awaitingAudio = false; stopAudio();
  $('dot').className='dot'; $('st').textContent='ONLINE'; gotoBody('idle');
  RN({type:'idle'});
  endCaption();
  setTimeout(()=>{ if (!speaking) pumpQueue(); }, 800);   // chain the next queued line
}

/* ----- live subtitle -----
 *
 * The dock shows ONE line, so we can't hand it the whole reply and let it wrap: we stream the words
 * as they are actually spoken. The cursor rides the very same timeline as the visemes — which
 * playSpokenAudio re-anchors to the true audio duration, and which onboundary re-anchors to real
 * word boundaries in the Web-Speech fallback — so the caption tracks her voice rather than guessing
 * at it. Older words roll off the front once the line is full, like a live caption feed.
 *
 * We post only when the cursor moves to a new word (a few times a second), not every frame, because
 * the RN bridge is not something to hammer at 60fps.
 */
const CAP_CHARS = 58;   // about one line in the dock

function beginCaption(text){
  capWords = (text||'').split(/\s+/).filter(Boolean);
  capCursor = -1;
  RN({type:'caption', text:''});   // she has the floor, but has not said anything yet
}
function tickCaption(){
  if (!capWords.length || !visSeq.length) return;
  const prog = Math.max(0, Math.min(0.999, (performance.now() - speakStart) / speakDur));
  const wi = visWord[Math.floor(prog * visSeq.length)];
  if (wi == null || wi === capCursor) return;
  capCursor = wi;

  // Walk back from the word being spoken and keep as much history as one line holds.
  let out = '';
  for (let i=wi; i>=0; i--){
    const next = out ? capWords[i] + ' ' + out : capWords[i];
    if (out && next.length > CAP_CHARS) break;
    out = next;
  }
  RN({type:'caption', text: out});
}
function endCaption(){
  capWords = []; capCursor = -1;
  RN({type:'caption', text:''});
}

function speak(text){
  if (!text) return;
  const token = ++speakToken;
  speakingFiller = false;
  currentText = text;
  mood = classifyMood(text);
  visSeq = buildVisemes(text);
  beginCaption(text);
  const words = text.split(/\s+/).filter(Boolean).length;
  // Provisional timeline — replaced by the real audio duration once it arrives.
  // While awaitingAudio is true the loop holds her mouth closed (a natural beat)
  // and never times out, so a slow fetch can't end the line early.
  speakDur = Math.max(1400, words * 330);
  speakStart = performance.now();
  speakUntil = speakStart + speakDur;
  hardStopAt = speakStart + speakDur + 3500;
  awaitingAudio = !!(ARIA_API || (ELEVEN.key && ELEVEN.voice));
  startTalk();

  stopAudio();

  // Voice priority: ARIA's own backend (Amazon Polly) -> ElevenLabs -> the device's robotic voice.
  // Polly leads because it needs no client key and cannot be rate-limited or flagged mid-demo,
  // which is exactly what happened to the ElevenLabs account this app shipped with.
  const cloudVoice =
    ARIA_API                       ? () => speakAria(text, token)
    : (ELEVEN.key && ELEVEN.voice) ? () => speakEleven(text, token)
    : null;

  if (cloudVoice){
    cloudVoice().catch((e)=>{
      if (token !== speakToken) return;     // superseded by a newer line
      LOG('voice fallback (' + (e && e.message) + ')');
      // If Polly failed but an ElevenLabs key exists, give it a shot before the robot voice.
      if (ARIA_API && ELEVEN.key && ELEVEN.voice){
        speakEleven(text, token).catch((e2)=>{
          if (token !== speakToken) return;
          LOG('voice fallback 2 (' + (e2 && e2.message) + ')');
          speakWebSpeech(text);
        });
      } else {
        speakWebSpeech(text);
      }
    });
  } else {
    speakWebSpeech(text);
  }
}

/* ----- speech queue — chains demo lines AND streamed AI sentences. Items are
 * plain strings (speak) or {text, url} (speakWithAudio, local WAV). ----- */
let speechQueue = [];
function queueLines(lines){ speechQueue = (lines || []).slice(); pumpQueue(); }
function pumpQueue(){
  if (speaking || !speechQueue.length) return;
  const item = speechQueue.shift();
  if (typeof item === 'string') speak(item);
  else speakWithAudio(item.text, item.url);
}

/* ---------------------- filler lines: covering the model's thinking time ----------------------
 *
 * gpt-oss takes 2-8 seconds to answer. In a text chat that is a spinner; from a person standing in
 * front of you it is a dead stare, and it breaks the illusion instantly.
 *
 * So the moment the patient stops speaking, Chloe says something human — "Mm-hm." / "I hear you." /
 * "That sounds rough." — while the model thinks behind it.
 *
 * These MUST be instant, which means they cannot be fetched on demand: a /speak round-trip is
 * several hundred milliseconds, which is the very gap we are trying to hide. So they are synthesised
 * ONCE at boot and held as MP3 bytes in memory. Playing one is then just a decode.
 */
const fillerCache = [];   // [{ text, bytes: ArrayBuffer }]
let lastFiller = -1;
let speakingFiller = false;

async function primeFillers(lines){
  if (!ARIA_API || !lines || !lines.length) return;
  for (const text of lines){
    try {
      const res = await fetch(ARIA_API + '/speak', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (!json.audio) continue;
      const bin = atob(json.audio);
      const bytes = new Uint8Array(bin.length);
      for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
      fillerCache.push({ text: text, bytes: bytes.buffer });
    } catch(e){ /* a missing filler is not worth failing the app over */ }
  }
  LOG('fillers ready · ' + fillerCache.length);
}

/** Say something human while the model thinks. No-op if she is already talking. */
async function speakFiller(){
  if (!fillerCache.length || speaking) return;

  let i = Math.floor(Math.random() * fillerCache.length);
  if (fillerCache.length > 1 && i === lastFiller) i = (i + 1) % fillerCache.length;  // never twice running
  lastFiller = i;
  const item = fillerCache[i];

  const token = ++speakToken;
  speakingFiller = true;
  currentText = item.text;
  mood = classifyMood(item.text);
  visSeq = buildVisemes(item.text);
  beginCaption(item.text);
  const words = item.text.split(/\s+/).filter(Boolean).length;
  speakDur = Math.max(900, words * 330);
  speakStart = performance.now();
  speakUntil = speakStart + speakDur;
  hardStopAt = speakStart + speakDur + 2500;
  awaitingAudio = true;
  startTalk();
  stopAudio();

  try {
    const ctx = await readyAudioCtx();
    // slice(0) because decodeAudioData detaches the buffer it is handed — the cache must survive.
    await playSpokenAudio(ctx, item.bytes.slice(0), token, 'filler');
  } catch(e){
    if (token === speakToken) LOG('filler failed · ' + (e && e.message));
  }
}

/* ---------------------- WAV, so ARIA can hear the patient ----------------------
 *
 * Voxtral on Bedrock is backed by libsndfile: it opens WAV/FLAC/OGG and flatly refuses AAC. The
 * microphone below hands us raw PCM, so we resample to 16 kHz mono (plenty for speech, and it keeps
 * the upload small) and write a plain RIFF header around 16-bit PCM.
 */
function encodeWav(channel, sampleRate){
  const n = channel.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buf);
  const str = (off, s) => { for (let i=0;i<s.length;i++) view.setUint8(off+i, s.charCodeAt(i)); };

  str(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);        // PCM chunk size
  view.setUint16(20, 1, true);         // format = PCM
  view.setUint16(22, 1, true);         // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);  // byte rate
  view.setUint16(32, 2, true);         // block align
  view.setUint16(34, 16, true);        // bits per sample
  str(36, 'data');
  view.setUint32(40, n * 2, true);

  let off = 44;
  for (let i=0;i<n;i++){
    const s = Math.max(-1, Math.min(1, channel[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    off += 2;
  }
  return buf;
}

function abToBase64(ab){
  const bytes = new Uint8Array(ab);
  let bin = '';
  // btoa chokes on very long argument lists, so feed it in chunks.
  const CH = 0x8000;
  for (let i=0;i<bytes.length;i+=CH){
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i+CH));
  }
  return btoa(bin);
}

/* ==================== LISTENING — the patient's words, as they say them ====================
 *
 * The transcript has to appear WHILE they are speaking. The old path could not do that even in
 * principle: expo-audio recorded an .m4a, and Android only writes that container's index on stop(),
 * so a half-written file does not decode. There was nothing transcribable until they had already
 * finished — which is why the whole sentence used to land in one lump at the end.
 *
 * So the microphone moved in here. A WebView is a browser: getUserMedia gives a CONTINUOUS PCM
 * stream (react-native-webview grants RESOURCE_AUDIO_CAPTURE on Android), so at any instant we hold
 * every sample spoken so far. Roughly once a second we re-transcribe the whole utterance to date and
 * push it up as a partial.
 *
 * Re-sending the entire prefix, rather than just the newest slice, is the point rather than waste:
 * Voxtral sees a complete phrase, so it punctuates properly and CORRECTS ITSELF as more context
 * arrives ("I have a head" becoming "I have a headache") instead of stitching together fragments
 * chopped mid-word. Only one request is ever in flight, so the cadence self-adjusts to however fast
 * Bedrock is answering instead of piling up a queue.
 *
 * WHY NOT A TRUE STREAMING RECOGNISER: Android's WebView does not expose the Web Speech API, and
 * every native RN speech module needs a custom dev build (this ships through Expo Go). Amazon
 * Transcribe streaming would give word-level partials and is the upgrade path — it needs a signed
 * WebSocket from the backend, which is a bigger change than this one.
 */
const MIC = {
  stream:null, src:null, node:null, mute:null,
  chunks:[], len:0, rate:16000,
  on:false, token:0, finishing:false,
  heard:false, silenceAt:0, startedAt:0,
  busy:false, lastAt:0, lastText:'',
};

const MIC_SPEECH_RMS  = 0.015;   // louder than this is speech, not room noise
const MIC_SILENCE_MS  = 1300;    // stop this long after they go quiet — survives a mid-sentence breath
const MIC_NOSPEECH_MS = 7000;    // nobody said anything at all
const MIC_MAX_MS      = 30000;   // hard ceiling on one answer
const MIC_PARTIAL_MS  = 900;     // never fire partials faster than this
const MIC_MIN_MS      = 700;     // too short to be worth transcribing
const OUT_RATE        = 16000;

async function micStart(){
  if (MIC.on) return;
  const token = ++MIC.token;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no getUserMedia');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true, channelCount:1 },
    });
    if (token !== MIC.token){ stream.getTracks().forEach((t)=>t.stop()); return; }   // superseded

    const ctx = getAudioCtx();
    if (!ctx) throw new Error('no AudioContext');
    if (ctx.state === 'suspended'){ try { await ctx.resume(); } catch(e){} }

    const src  = ctx.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated in favour of AudioWorklet, but it is the one thing every Android
    // WebView actually has, and it needs no separate module file.
    const node = ctx.createScriptProcessor(4096, 1, 1);
    // A ScriptProcessor only runs if its output reaches the destination — route it through a muted
    // gain so we get the callback without piping the patient's own voice back out of the speaker.
    const mute = ctx.createGain(); mute.gain.value = 0;

    MIC.stream = stream; MIC.src = src; MIC.node = node; MIC.mute = mute;
    MIC.chunks = []; MIC.len = 0; MIC.rate = ctx.sampleRate;
    MIC.on = true; MIC.finishing = false; MIC.heard = false; MIC.silenceAt = 0;
    MIC.startedAt = performance.now();
    MIC.busy = false; MIC.lastAt = 0; MIC.lastText = '';

    node.onaudioprocess = (ev)=>{
      if (!MIC.on || token !== MIC.token) return;
      const inp = ev.inputBuffer.getChannelData(0);
      const copy = new Float32Array(inp.length);   // the event's buffer is recycled — keep our own
      copy.set(inp);
      MIC.chunks.push(copy);
      MIC.len += copy.length;

      let sum = 0;
      for (let i=0;i<copy.length;i++) sum += copy[i]*copy[i];
      const rms = Math.sqrt(sum / copy.length);
      RN({type:'level', v: Math.min(1, rms * 9)});   // drives the dots in the dock

      const now = performance.now();
      if (rms > MIC_SPEECH_RMS){ MIC.heard = true; MIC.silenceAt = 0; }
      else if (MIC.heard){
        if (!MIC.silenceAt) MIC.silenceAt = now;
        else if (now - MIC.silenceAt > MIC_SILENCE_MS){ micFinish(); return; }
      }
      if (!MIC.heard && now - MIC.startedAt > MIC_NOSPEECH_MS){ micFinish(); return; }
      if (now - MIC.startedAt > MIC_MAX_MS){ micFinish(); return; }

      micMaybePartial(token);
    };

    src.connect(node); node.connect(mute); mute.connect(ctx.destination);
    RN({type:'listening', on:true});
    LOG('mic open · ' + MIC.rate + 'Hz');
  } catch(e){
    micTeardown();
    RN({type:'listening', on:false});
    RN({type:'sttError', error: String((e && e.message) || e)});
  }
}

/** Fire a partial if one isn't already running and enough has been said since the last. */
function micMaybePartial(token){
  if (MIC.busy || MIC.finishing || !MIC.heard) return;
  const now = performance.now();
  if (now - MIC.lastAt < MIC_PARTIAL_MS) return;
  if ((MIC.len / MIC.rate) * 1000 < MIC_MIN_MS) return;
  MIC.lastAt = now;
  MIC.busy = true;
  micTranscribe(token, false)
    .catch((e)=>{ LOG('partial failed · ' + (e && e.message)); })
    .then(()=>{ if (token === MIC.token) MIC.busy = false; });
}

/** Everything said so far -> 16 kHz mono WAV -> Voxtral -> up to the dock. */
async function micTranscribe(token, final){
  if (!ARIA_API) throw new Error('no ARIA api');
  if (!MIC.len) return '';

  const rate = MIC.rate;
  const pcm = new Float32Array(MIC.len);
  let o = 0;
  for (let i=0;i<MIC.chunks.length;i++){ pcm.set(MIC.chunks[i], o); o += MIC.chunks[i].length; }

  // Let the browser do the rate conversion — hand-rolled sample-dropping would alias.
  let mono = pcm;
  if (rate !== OUT_RATE){
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const frames = Math.max(1, Math.round(pcm.length * OUT_RATE / rate));
    const off = new OAC(1, frames, OUT_RATE);
    const ab = off.createBuffer(1, pcm.length, rate);
    if (ab.copyToChannel) ab.copyToChannel(pcm, 0); else ab.getChannelData(0).set(pcm);
    const s = off.createBufferSource(); s.buffer = ab; s.connect(off.destination); s.start();
    mono = (await off.startRendering()).getChannelData(0);
  }
  if (token !== MIC.token) return '';

  // A hung request would strand the dock waiting for a final that never comes, and the hands-free
  // loop would never reopen the mic. Bound it.
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const killer = ctrl ? setTimeout(()=>{ try { ctrl.abort(); } catch(e){} }, 20000) : null;
  let res;
  try {
    res = await fetch(ARIA_API + '/transcribe', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ audio: abToBase64(encodeWav(mono, OUT_RATE)), format:'wav' }),
      signal: ctrl ? ctrl.signal : undefined,
    });
  } finally { if (killer) clearTimeout(killer); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  const text = (json && json.text) ? String(json.text).trim() : '';
  if (token !== MIC.token) return '';

  if (final){
    RN({type:'stt', text, final:true});
  } else if (!MIC.finishing && text && text !== MIC.lastText){
    // A partial that lands after we've already finalised would overwrite the finished sentence.
    MIC.lastText = text;
    RN({type:'stt', text, final:false});
  }
  return text;
}

/** They stopped talking. Close the mic, then transcribe the whole answer once more — that pass is
 *  the only one that has heard every word, so it is the one the model gets. */
async function micFinish(){
  if (!MIC.on || MIC.finishing) return;
  const token = MIC.token;
  const heard = MIC.heard;
  MIC.finishing = true;
  MIC.on = false;
  micTeardown();
  RN({type:'listening', on:false});

  if (!heard || !MIC.len){ RN({type:'stt', text:'', final:true}); micReset(); return; }

  try {
    await micTranscribe(token, true);
  } catch(e){
    if (token === MIC.token){
      LOG('final failed · ' + (e && e.message));
      // The partials already on screen are the best we have — send the last one rather than nothing.
      RN({type:'stt', text: MIC.lastText, final:true});
    }
  }
  micReset();
}

function micTeardown(){
  try { if (MIC.node) MIC.node.onaudioprocess = null; } catch(e){}
  try { if (MIC.src)  MIC.src.disconnect(); } catch(e){}
  try { if (MIC.node) MIC.node.disconnect(); } catch(e){}
  try { if (MIC.mute) MIC.mute.disconnect(); } catch(e){}
  try { if (MIC.stream) MIC.stream.getTracks().forEach((t)=>t.stop()); } catch(e){}
  MIC.node = null; MIC.src = null; MIC.mute = null; MIC.stream = null;
  MIC.on = false;
}
function micReset(){
  MIC.chunks = []; MIC.len = 0; MIC.busy = false; MIC.finishing = false; MIC.lastText = '';
}

/** Drop the mic WITHOUT transcribing — she is about to speak and must not hear herself. */
function micAbort(){
  const was = MIC.on;
  MIC.token++;          // orphans anything still in flight
  micTeardown();
  micReset();
  // NOTE: no backticks anywhere in this file — the whole scene is one template literal, so a stray
  // backtick (even inside a comment) closes the string and the file stops compiling.
  //
  // "aborted" matters: a mic that closed to be transcribed is followed by a final result, and the
  // dock waits for it. One that was thrown away never sends anything, so the dock must not wait.
  if (was) RN({type:'listening', on:false, aborted:true});
}

window.nirog = {
  speak,
  queueLines,
  primeFillers,
  filler: speakFiller,
  listen: micStart,
  stopListen: micFinish,
  abortListen: micAbort,
  /**
   * A fresh AI reply.
   *
   * Unlike speak(), this clears the queue — otherwise a reply landing while the greeting is still
   * chaining would talk over the top of it.
   *
   * The one exception is a FILLER. If she is mid-"that sounds rough" when the model comes back,
   * cutting her off mid-word is worse than the half-second wait, so the reply queues behind it and
   * stopTalk() pumps it the moment she finishes.
   */
  say(text){
    if (speakingFiller && speaking){ speechQueue = [text]; return; }
    speechQueue = [];
    speak(text);
  },
  /**
   * Stop talking. Now.
   *
   * say() supersedes a line; this ENDS one, with nothing behind it — the queue is dropped, the token
   * is bumped so any voice still being fetched is orphaned on arrival, and both the cloud audio and
   * the device voice are cancelled. Pausing the consultation while she is mid-sentence has to
   * actually silence her, or the button is a lie.
   */
  hush(){
    speechQueue = [];
    speakToken++;
    speakingFiller = false;
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch(e){}
    micAbort();
    if (speaking) stopTalk(); else stopAudio();
  },
  // enqueue=true chains the sentence after what she is currently saying (streamed
  // AI replies); enqueue=false interrupts and clears the queue (a fresh reply).
  speakAudio(text, url, enqueue){
    if (enqueue && (speaking || speechQueue.length)) speechQueue.push({ text, url });
    else { speechQueue = []; speakWithAudio(text, url); }
  },
  setMood(m){ if (m) mood = m; },
};
window.addEventListener('message', (e)=>{ handle(e.data); });
document.addEventListener('message', (e)=>{ handle(e.data); });
function handle(raw){ try { const m = typeof raw==='string'?JSON.parse(raw):raw; if(m && m.type==='speak') speak(m.text); } catch(e){} }

/* ----------------------------- boot ----------------------------- */
(async function boot(){
  let loaded = false;
  try { loaded = await tryLoadAvatar(); } catch(e){ LOG('tryLoadAvatar threw: ' + (e && e.message)); loaded = false; }
  if (!loaded){ buildProceduralNurse(); LOG('using procedural nurse (realistic GLB did not load — see lines above)'); showDbg(); }
  $('loading').style.display = 'none';
  RN({type:'ready', realistic: loaded});
  try { getAudioCtx(); } catch(e){}   // warm the AudioContext before the greeting
  LOG('voice · ' + (ELEVEN.key && ELEVEN.voice ? ('ElevenLabs ' + ELEVEN.model) : 'Web-Speech (no eleven cfg)'));

  // --- the greeting Chloe speaks on start. Everything AFTER this comes from the model.
  // Keep it to one breath: the patient wants to talk, not be lectured at.
  const DEMO_LINES = [
    'Hi, I am ARIA. How can I help?',
  ];

  // Mobile WebViews block audio until the first user gesture. So we (a) auto-greet
  // when the device actually allows autoplay, and (b) guarantee it by greeting on
  // the first tap. greetOnce() runs at most once.
  let greeted = false;
  function greetOnce(){
    if (greeted) return; greeted = true;
    playOneShot('wave'); // no-op until a 'wave' clip is added
    queueLines(DEMO_LINES);
  }
  function unlockAndGreet(){
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(()=>{});
    try { window.speechSynthesis && window.speechSynthesis.resume(); } catch(e){}
    greetOnce();
  }
  ['touchstart','pointerdown','mousedown','click'].forEach((ev)=>{
    window.addEventListener(ev, unlockAndGreet, { passive:true });
  });

  // Prompt the tap up-front; it hides the moment she starts speaking.
  $('startHint').className = 'startHint show';
  setTimeout(()=>{
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'running') greetOnce();   // autoplay allowed -> greet now
  }, 900);
})();

/* ----------------------------- animation loop ----------------------------- */
const clock = new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt = clock.getDelta(); const t = clock.elapsedTime;
  if (mixer) mixer.update(dt);

  // lip-sync
  if (speaking){
    const now = performance.now();
    const lvl = readAudioLevel();   // 0..1 from real ElevenLabs audio, else -1
    // The hard ceiling always wins (covers a stuck speechSynthesis.speaking / a
    // never-delivered onend); otherwise end naturally once the time budget elapsed
    // AND the engine reports it's done speaking.
    const ended = now > hardStopAt ||
      (now > speakUntil && (!window.speechSynthesis || !window.speechSynthesis.speaking));
    if (awaitingAudio){
      // fetching the ElevenLabs voice — hold a closed, ready mouth; don't time out. The caption
      // stays empty too: the words must not run ahead of the voice that is still downloading.
      relaxMouth();
    } else if (ended){
      stopTalk(); relaxMouth();
    } else {
      applyViseme(t, lvl);
      tickCaption();
    }
  } else {
    relaxMouth();
  }

  // expressions + blinks (targets), then flush all morphs (smoothed)
  applyEmotion(speaking);
  updateBlink(t);
  face.update(dt);

  // alive bone layer — AFTER mixer so it overrides the clip's head/eye/jaw tracks
  updateHead(t, dt, speaking);
  updateEyes(t, dt);
  updateJaw(dt);
  if (proc){ applyProcMouth(t); proc.group.position.y = Math.sin(t*1.4)*0.008; }

  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth/window.innerHeight;
  applyLift(); // re-anchor the px offset to the new viewport, else the lift scales with it
  renderer.setSize(window.innerWidth, window.innerHeight);
});
</script>
</body>
</html>`;
