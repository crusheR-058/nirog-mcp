/* Browser speech: recognition for the patient, synthesis for the assistant. English (India) and Hindi. */

import type { Language } from "./copy";

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

export function speak(text: string, onEnd?: () => void, language: Language = "en") {
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
  u.rate = 0.98;
  u.onend = finish;
  u.onerror = finish;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
