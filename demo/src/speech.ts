/* Browser speech: recognition for the patient, synthesis for the assistant. */

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

export function listenOnce(lang = "en-IN"): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!Ctor) return reject(new Error("This browser can't hear you. Type instead."));
    const rec = new Ctor();
    rec.lang = lang;
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

let voice: SpeechSynthesisVoice | undefined;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  voice =
    voices.find((v) => v.lang === "en-IN" && /female|Heera|Neerja/i.test(v.name)) ??
    voices.find((v) => v.lang === "en-IN") ??
    voices.find((v) => v.lang.startsWith("en") && /female|Zira|Samantha|Google UK English Female/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith("en"));
}
if ("speechSynthesis" in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

export function speak(text: string, onEnd?: () => void) {
  if (!("speechSynthesis" in window)) return onEnd?.();
  speechSynthesis.cancel();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(guard);
    onEnd?.();
  };
  // Some engines never fire onend (headless, muted tabs). Give up after the time the words would take.
  const guard = setTimeout(finish, Math.max(2500, text.split(/\s+/).length * 420));
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.rate = 0.98;
  u.onend = finish;
  u.onerror = finish;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
