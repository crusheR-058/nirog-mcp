import { NURSE_HTML } from "./nurseHtml.js";

/**
 * ARIA's face: the 3D nurse scene from the Nirog mobile app, served for an iframe on the patient page.
 *
 * `nurseHtml.ts` is byte-identical to the app's `components/nurseHtml.ts`. It is already browser code (Three.js,
 * WebGL, Web Audio) and only expects three things from its host, which this shim provides before the module runs:
 *
 *   window.ReactNativeWebView.postMessage   every event the scene emits (ready, speaking, idle, caption, log),
 *                                           forwarded to the parent page
 *   window.NIROG_MODEL_URLS                 the avatar, served from the page's own static files
 *   window.NIROG_ARIA_API + '/speak'        her voice. The scene posts { text } and expects { audio: base64 }; this
 *                                           server's /api/speak takes { text, language } with the consent token and
 *                                           returns MP3 bytes. The fetch wrapper translates, so the scene needs no edit.
 *
 * The host sets window.NIROG_TOKEN on the frame once it has the patient's token (same origin). Without one the
 * server's Polly route refuses, and the scene falls back to the browser's voice on its own.
 */
const SHIM = `<script>
window.ReactNativeWebView = { postMessage: function (p) { try { window.parent.postMessage(p, window.location.origin); } catch (e) {} } };
window.NIROG_MODEL_URL = '/demo/aria/chloe.glb';
window.NIROG_MODEL_URLS = ['/demo/aria/chloe.glb'];
window.NIROG_ARIA_API = '/aria-api';
(function () {
  var realFetch = window.fetch.bind(window);
  window.fetch = async function (url, init) {
    if (typeof url === 'string' && url.indexOf('/aria-api/speak') === 0) {
      var text = JSON.parse((init && init.body) || '{}').text || '';
      var language = /[\\u0900-\\u097F]/.test(text) ? 'hi' : 'en';
      var headers = { 'content-type': 'application/json' };
      if (window.NIROG_TOKEN) headers.authorization = 'Bearer ' + window.NIROG_TOKEN;
      var r = await realFetch('/api/speak', { method: 'POST', headers: headers, body: JSON.stringify({ text: text, language: language }), signal: init && init.signal });
      if (!r.ok) return r;
      var bytes = new Uint8Array(await r.arrayBuffer()), bin = '';
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return new Response(JSON.stringify({ audio: btoa(bin) }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (typeof url === 'string' && url.indexOf('/aria-api/') === 0) return new Response('{"error":"not here"}', { status: 404 });
    return realFetch(url, init);
  };
})();
</script>`;

export const ARIA_SCENE_HTML = NURSE_HTML.replace("</head>", `${SHIM}\n</head>`);
