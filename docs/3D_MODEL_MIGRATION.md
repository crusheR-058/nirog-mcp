# The 3D avatar: from the mobile app to the web

## What the asset is

The Nirog mobile app (Expo, `C:\Projects\Nirog Mobile App`) ships `assets/chloe_avatar.glb`: a rigged human
nurse avatar, "Chloe", with 11 ARKit-style facial morph targets (jaw, mouth, lips, brows, eyes), an `Idle` body
clip, 17 meshes, about 52,000 triangles and 21 embedded PNG textures. 14.9 MB. She is ARIA's face: the app drives
her mouth live from the voice audio and layers blinks, saccades, brows and head motion on top, in a self-contained
1,636-line Three.js page (`components/nurseHtml.ts`) hosted in a WebView.

She is an avatar, **not an anatomical model**. There is no body segmentation to click on. A "where it hurt" body
map on her would be a forced fit, so that view uses the server's own body regions (`src/clinical/regions.ts`)
instead, and Chloe does what she was built for: she is the face of the conversation.

## Where she lives now

- `src/aria/nurseHtml.ts`: the scene, **byte-identical** to the app's copy. Nothing in it was edited, so a fix in
  either place still applies to both.
- `src/aria/scene.ts`: a shim injected into the document's head, giving the scene the host it expects:
  `window.ReactNativeWebView.postMessage` forwards her events to the parent page; `NIROG_MODEL_URLS` points at the
  web copy of the model; a `fetch` wrapper turns her `POST /speak { text }` (expecting `{ audio: base64 }`) into
  this server's `POST /api/speak { text, language }` with the patient's consent token, returning MP3 bytes.
  Devanagari in the line selects Hindi. Served at `GET /aria/scene`.
- `demo/src/patient/AriaScene.tsx`: the iframe on the patient page's "Talk to Nirog" tab. On her `ready` event it
  registers itself as the page's speaker (`setSpeaker` in `demo/src/speech.ts`), so the assistant's lines are said
  through her, lip-synced to the same Polly audio, and resolve on her `idle` event. On unmount it hands the voice
  back. She is not loaded under `prefers-reduced-motion`, without WebGL, or anywhere but that tab. If she has not
  reported ready after 60 seconds the panel goes away; the conversation never waited for her.
- `demo/public/aria/chloe.glb`: the web copy of the model, 6.3 MB.

## Conversion

One pass with glTF-Transform, no Blender, nothing destroyed:

```bash
npx -y @gltf-transform/cli@4 optimize chloe_avatar.glb chloe.glb --compress quantize --texture-compress webp --texture-size 1024
```

| | Before | After |
|---|---|---|
| Size | 14.9 MB | 6.3 MB |
| Geometry | float32 | quantized (`KHR_mesh_quantization`), morph targets kept |
| Textures | 21 PNG, up to 2048 | WebP (`EXT_texture_webp`), at most 1024 |

Both extensions are decoded by the scene's own `GLTFLoader` (three r160) with no extra decoder, which is why Draco
and Meshopt were not used: they would have needed the scene edited to wire a decoder in. Eleven meshes had texture
coordinates outside [0, 1] and kept float UVs, as the tool reports.

The scene loads `three` from unpkg at runtime, as the app does. Vendoring it is a one-line change in the
importmap if a deployment must be self-contained.

## What was not done

- No body map on the avatar (see above).
- The scene's microphone path (`/transcribe`) is not provided; the page's own speech recognition is used.
- The gesture clips the app's `assets/animations/README.md` describes were never added to the app either; the
  hook is still there (`NIROG_GESTURES`).
