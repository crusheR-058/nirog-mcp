import { setSpeechRate } from "../speech";
import { refreshLive, useDemo } from "../store";

/**
 * "Play the story": one evening for one patient, from both chairs, played on the live page. It drives the page the way
 * a person would (types into the voice bar, presses the doctor's buttons), so every answer is a real tool call against
 * the real server and the same clinic record. It also drives the recorded demo video.
 */

export interface Beat {
  title: string;
  body: string;
}

export const BEATS: Beat[] = [
  { title: "Starting fresh", body: "Putting the shared demo clinic back to this morning, so what you see matches what we say." },
  { title: "Rahul tells Alexa+ his ache is back", body: "Amazon Nova reads the MCP tool descriptions and routes his words to start_intake. Memory finds July's complaint, though no words match." },
  { title: "ARIA asks like a nurse", body: "Two or three questions from GPT-OSS on Bedrock. Then code, not the model, writes the doctor's handover from his own words." },
  { title: "The handover lands in the doctor's queue", body: "Urgent, because the same complaint came back three times in 38 days. Arithmetic a doctor can check on paper." },
  { title: "The doctor opens it", body: "The handover sits beside the form, and his blood-pressure tablet is already on it, so a new prescription cannot silently stop it." },
  { title: "She prescribes Ibuprofen and files", body: "Saved to the clinic record in Supabase. That plan is now what Alexa+ reads." },
  { title: "That night, Alexa+ reads the new plan", body: "Both medicines, the old and the new, in Kajal's voice from Amazon Polly." },
  { title: "And refuses a double dose", body: "The second “I took my Ibuprofen” is refused by the dose tool, and the refusal goes in the trust log." },
  { title: "In Hindi: chest pain and sweating", body: "No model decides this. Table-driven rules escalate it: the 108 advice, an emergency consult, the family contact's number on it." },
  { title: "Everything is in the trust log", body: "Every tool call, with who, what and why. The database refuses to edit or delete a line." },
  { title: "One evening, both chairs", body: "The bar at the bottom is live. Say what hurts, in English or Hindi, and watch the trace." },
];

const ANSWERS = ["yes, the same pain as before", "it's worse in the mornings and when I bend to lift water", "no fever, nothing else", "no, that's all"];

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((ok, fail) => {
    if (signal.aborted) return fail(new DOMException("Stopped", "AbortError"));
    const t = setTimeout(ok, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); fail(new DOMException("Stopped", "AbortError")); }, { once: true });
  });
}

async function until(ready: () => boolean, signal: AbortSignal, ms = 90_000): Promise<void> {
  const end = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > end) throw new Error("The page did not answer in time. The demo server may be busy; try again in a minute.");
    await sleep(200, signal);
  }
}

const $ = <T extends Element>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const idle = () => useDemo.getState().phase === "idle" && !$<HTMLInputElement>("#ask")?.disabled;
const show = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

/** React listens for input events, so set the value through the native setter and announce it. */
function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string, event: "input" | "change" = "input") {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!.call(el, value);
  el.dispatchEvent(new Event(event, { bubbles: true }));
}

async function type(el: HTMLInputElement | HTMLTextAreaElement, text: string, signal: AbortSignal) {
  el.focus();
  for (let i = 1; i <= text.length; i++) {
    setValue(el, text.slice(0, i));
    await sleep(text.length > 50 ? 11 : 20, signal);
  }
}

async function ask(text: string, signal: AbortSignal) {
  await until(idle, signal);
  await type($<HTMLInputElement>("#ask")!, text, signal);
  await sleep(250, signal);
  $<HTMLButtonElement>("button.send")!.click();
  await sleep(400, signal);
  await until(idle, signal);
  await sleep(450, signal);
}

const language = (lang: "en" | "hi") => document.querySelectorAll<HTMLButtonElement>(".lang button")[lang === "en" ? 0 : 1]?.click();
const handedOver = () => useDemo.getState().traces.some((t) => t.summary?.some((s) => s.startsWith("handover saved for the doctor")));

export async function playStory(onBeat: (i: number) => void, signal: AbortSignal): Promise<void> {
  setSpeechRate(1.2);
  try {
    await play(onBeat, signal);
  } finally {
    setSpeechRate(1);
  }
}

async function play(onBeat: (i: number) => void, signal: AbortSignal): Promise<void> {
  const store = useDemo.getState;

  onBeat(0);
  // A reset in the last minute answers 429; the clinic is fresh either way. Off the public demo there is nothing to reset.
  await fetch(`${location.origin}/auth/demo/reset`, { method: "POST" }).catch(() => undefined);
  store().reset();
  language("en");
  const patient = $<HTMLSelectElement>("#talk select");
  if (patient && patient.value !== "pat_rahul") setValue(patient, "pat_rahul", "change");
  await refreshLive();
  await sleep(900, signal);

  onBeat(1);
  show("talk");
  await sleep(900, signal);
  await ask("the ache is back again, it's been three weeks now", signal);

  onBeat(2);
  for (const answer of ANSWERS) {
    if (handedOver()) break;
    await ask(answer, signal);
  }

  onBeat(3);
  show("portal");
  store().setPortalTab("dashboard");
  await refreshLive();
  await until(() => store().queue.some((q) => q.source === "alexa" && q.patientId === "pat_rahul" && q.state === "waiting"), signal, 20_000);
  await sleep(600, signal);
  const card = [...document.querySelectorAll<HTMLElement>("#portal .qcard")].find((el) => el.textContent?.includes("Alexa+") && el.textContent.includes("Rahul Yadav"));
  card?.scrollIntoView({ behavior: "smooth", block: "center" });
  card?.classList.add("story-focus");
  await sleep(2600, signal);

  onBeat(4);
  card?.classList.remove("story-focus");
  $<HTMLButtonElement>("button.btn.primary", card ?? document)?.click();
  await sleep(1200, signal);
  $("#portal .consult-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  await sleep(2800, signal);

  onBeat(5);
  await type($<HTMLTextAreaElement>("#portal textarea[placeholder^='Working diagnosis']")!, "Mechanical low back pain, recurrent. No red flags.", signal);
  const last = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)].at(-1)!;
  last<HTMLInputElement>("#portal input[placeholder^='Drug']").scrollIntoView({ behavior: "smooth", block: "center" });
  await sleep(500, signal);
  await type(last<HTMLInputElement>("#portal input[placeholder^='Drug']"), "Ibuprofen", signal);
  await type(last<HTMLInputElement>("#portal input[placeholder='Strength']"), "400mg", signal);
  await type(last<HTMLInputElement>("#portal input[placeholder='Frequency']"), "Twice daily", signal);
  await sleep(600, signal);
  [...document.querySelectorAll<HTMLButtonElement>("#portal button")].find((b) => b.textContent?.includes("File consultation"))?.click();
  await until(() => store().portalTab === "chart", signal, 20_000);
  $("#portal .win-main")?.scrollIntoView({ behavior: "smooth", block: "start" });
  await sleep(2600, signal);

  onBeat(6);
  show("talk");
  await sleep(900, signal);
  await ask("what medicines do I take tonight?", signal);

  onBeat(7);
  await ask("I took my Ibuprofen", signal);
  await ask("I took my Ibuprofen", signal);

  onBeat(8);
  language("hi");
  await sleep(500, signal);
  await ask("मुझे सीने में दर्द है और पसीना आ रहा है", signal);
  await sleep(1500, signal);

  onBeat(9);
  language("en");
  show("portal");
  store().setPortalTab("trust");
  await refreshLive();
  await sleep(4500, signal);

  onBeat(10);
}
