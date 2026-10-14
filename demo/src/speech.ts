/* Browser speech: recognition for the patient, synthesis for the assistant. English (India) and Hindi. */

import type { Language } from "./copy";
import { consentHeader } from "./mcp";

/* The Web Speech recognition API has no lib.dom typings; this is the slice we use. */
interface RecognitionResultEvent { results: ArrayLike<ArrayLike<{ transcript: string }>> }
interface RecognitionErrorEvent { error: string }
interface SpeechRecognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => SpeechRecognition;
const Ctor: RecognitionCtor | undefined =
  (window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;

export const canListen = Boolean(Ctor);

const LOCALE: Record<Language, string> = { en: "en-IN", hi: "hi-IN" };

export function listenOnce(language: Language = "en"): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!Ctor) return reject(new Error("This browser can't hear you. Type instead."));
    const rec = new Ctor();
    rec.lang = LOCALE[language];
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let done = false;
    rec.onresult = (e) => {
      done = true;
      resolve(e.results[0][0].transcript);
    };
    rec.onerror = (e) => {
      done = true;
      reject(new Error(e.error === "no-speech" ? "I didn't catch that." : e.error === "not-allowed" ? "Microphone access was refused." : `Microphone: ${e.error}`));
    };
    rec.onend = () => {
      if (!done) resolve("");
    };
    rec.start();
  });
}

/** Voices load asynchronously in most browsers, so the choice is made at speak time, not at import time. */
function pickVoice(language: Language): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  if (language === "hi") return voices.find((v) => v.lang === "hi-IN") ?? voices.find((v) => v.lang.startsWith("hi"));
  return (
    voices.find((v) => v.lang === "en-IN" && /female|Heera|Neerja/i.test(v.name)) ??
    voices.find((v) => v.lang === "en-IN") ??
    voices.find((v) => v.lang.startsWith("en") && /female|Zira|Samantha|Google UK English Female/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith("en"))
  );
}
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => undefined; // prompts some browsers to load the list

/* The assistant's voice is Amazon Polly (Kajal, neural, Indian English and Hindi) from the server; the browser's own
   voice is the fallback, so a machine without a Hindi voice still hears Hindi. */
let ticket = 0;
/** Settles the line now playing, so an interrupted line still resolves whoever waits for it. */
let settle: (() => void) | null = null;
/** The story plays a little faster than conversation; anyone using the bar hears the natural pace. */
let rate = 1;
export const setSpeechRate = (r: number) => { rate = r; };
let playing: HTMLAudioElement | null = null;
let pollyDownUntil = 0;
const announce = (text: string, language: Language) => window.dispatchEvent(new CustomEvent("nirog:speak", { detail: { text, language, rate, at: Date.now() } }));

export function speak(text: string, onEnd?: () => void, language: Language = "en") {
  stopSpeaking();
  const mine = ticket;
  if (Date.now() < pollyDownUntil || text.length > 600) return browserSpeak(text, onEnd, language);
  void (async () => {
    let url = "";
    try {
      const r = await fetch(`${location.origin}/api/speak`, { method: "POST", headers: { "content-type": "application/json", ...(await consentHeader()) }, body: JSON.stringify({ text, language }) });
      if (!r.ok) throw new Error(`speak ${r.status}`);
      url = URL.createObjectURL(await r.blob());
    } catch {
      pollyDownUntil = Date.now() + 30_000; // use the browser's voice for a while rather than paying a failed request per line
      if (mine === ticket) browserSpeak(text, onEnd, language);
      return;
    }
    // Stopped while the audio was on its way: never start a line the patient already interrupted.
    if (mine !== ticket) {
      URL.revokeObjectURL(url);
      return onEnd?.();
    }
    const audio = new Audio(url);
    audio.playbackRate = rate;
    playing = audio;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      URL.revokeObjectURL(url);
      if (playing === audio) playing = null;
      if (settle === finish) settle = null;
      onEnd?.();
    };
    settle = finish;
    // A safety net for an "ended" event that never comes; once the real length is known, it is that plus a margin.
    let guard = setTimeout(finish, Math.max(4000, text.split(/\s+/).length * 600));
    audio.onloadedmetadata = () => {
      if (!Number.isFinite(audio.duration)) return;
      clearTimeout(guard);
      guard = setTimeout(finish, (audio.duration / rate) * 1000 + 1200);
    };
    // The demo recorder lays the same audio under the captured frames at this moment.
    audio.onplaying = () => announce(text, language);
    audio.onended = finish;
    audio.onerror = finish;
    // Autoplay can be refused (no gesture yet, headless): fall back to the browser voice for this line only.
    audio.play().catch(() => {
      // Interrupted while starting: the line is settled already and must not come back in another voice.
      if (done || mine !== ticket) return finish();
      done = true;
      clearTimeout(guard);
      URL.revokeObjectURL(url);
      browserSpeak(text, onEnd, language);
    });
  })();
}

function browserSpeak(text: string, onEnd?: () => void, language: Language = "en") {
  if (!("speechSynthesis" in window)) return onEnd?.();
  speechSynthesis.cancel();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(guard);
    onEnd?.();
  };
  // Some engines never fire onend (headless, muted tabs, no voice for the language). Give up after the time the words would take.
  const guard = setTimeout(finish, Math.max(2500, text.split(/\s+/).length * 420));
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(language);
  if (voice) u.voice = voice;
  u.lang = LOCALE[language];
  u.rate = 0.98 * rate;
  u.onend = finish;
  u.onerror = finish;
  announce(text, language);
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  ticket++;
  playing?.pause();
  playing = null;
  const s = settle;
  settle = null;
  s?.();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
