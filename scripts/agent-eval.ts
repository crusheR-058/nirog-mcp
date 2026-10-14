/**
 * How well does a Bedrock model route a patient's words to the right Nirog tool?
 * Runs a labelled set of English, Hindi and romanised-Hindi utterances through the real agent (src/agent/alexa.ts)
 * against the built-in demo clinic, so nothing touches a database.
 *
 *   pnpm agent:eval                                   # the default model
 *   pnpm agent:eval apac.amazon.nova-lite-v1:0 ...    # compare models
 *
 * "routed" counts the model's own choice; "safe" counts whether the outcome was right once the guard had run.
 */
process.env.NIROG_DATA_SOURCE = "mock";
process.env.MEMORY_STORE = "memory";
process.env.EMBEDDER = "offline";
process.env.ARIA_MODEL = "off";

type Case = { text: string; lang: "en" | "hi"; ok: string[]; history?: Array<{ role: "user" | "assistant"; text: string }>; transcript?: boolean; patient?: string };
const CASES: Case[] = [
  { text: "the ache is back again, it's been three weeks now", lang: "en", ok: ["start_intake"] },
  { text: "I have chest pain and I am sweating a lot", lang: "en", ok: ["start_intake", "report_red_flag"] },
  { text: "what medicines do I take tonight?", lang: "en", ok: ["get_care_plan"] },
  { text: "when is my next follow-up with the doctor?", lang: "en", ok: ["get_care_plan"] },
  { text: "I took my BP tablet", lang: "en", ok: ["log_dose_taken"] },
  { text: "I just had my Amlodipine", lang: "en", ok: ["log_dose_taken"] },
  { text: "how has my father been this week?", lang: "en", ok: ["get_family_summary"] },
  { text: "I took my tablet but my chest still hurts", lang: "en", ok: ["start_intake", "report_red_flag"] },
  { text: "I can't breathe properly", lang: "en", ok: ["start_intake", "report_red_flag"] },
  { text: "about three weeks", lang: "en", ok: ["start_intake"], transcript: true, history: [{ role: "user", text: "my lower back hurts again" }, { role: "assistant", text: "How long has it been hurting this time?" }] },
  { text: "hello, good evening", lang: "en", ok: [] },
  { text: "thank you", lang: "en", ok: [] },
  { text: "सीने में दर्द है और बहुत पसीना आ रहा है", lang: "hi", ok: ["start_intake", "report_red_flag"] },
  { text: "मैंने अपनी दवा ले ली", lang: "hi", ok: ["log_dose_taken"] },
  { text: "आज रात कौन सी दवा लेनी है?", lang: "hi", ok: ["get_care_plan"] },
  { text: "इस हफ्ते पापा कैसे रहे?", lang: "hi", ok: ["get_family_summary"] },
  { text: "कमर में फिर से दर्द हो रहा है", lang: "hi", ok: ["start_intake"] },
  { text: "meri dawai ka time ho gaya kya?", lang: "hi", ok: ["get_care_plan"] },
  { text: "maine goli kha li", lang: "hi", ok: ["log_dose_taken"] },
  { text: "my lips are swelling after the new tablet", lang: "en", ok: ["start_intake", "report_red_flag"] },
  { text: "मैंने अपनी दवा ले ली", lang: "hi", ok: ["log_dose_taken"], patient: "pat_sunita" },
  { text: "अभी अभी गोली खाई है", lang: "hi", ok: ["log_dose_taken"] },
  { text: "dawai le li maine", lang: "hi", ok: ["log_dose_taken"] },
  { text: "मुझे चक्कर आ रहे हैं", lang: "hi", ok: ["start_intake", "report_red_flag"] },
  { text: "pet mein dard hai subah se", lang: "hi", ok: ["start_intake"] },
  { text: "is my blood test pending?", lang: "en", ok: ["get_care_plan"] },
];

const { runAgent, bedrockRoute } = await import("../src/agent/alexa.js");
const models = process.argv.slice(2);
if (models.length === 0) models.push(process.env.BEDROCK_AGENT_MODEL ?? "apac.amazon.nova-lite-v1:0");

const runs = Number(process.env.EVAL_RUNS ?? 1);
for (const model of models) for (let run = 1; run <= runs; run++) {
  process.env.BEDROCK_AGENT_MODEL = model;
  let routed = 0;
  let safe = 0;
  let unanswered = 0;
  const times: number[] = [];
  const misses: string[] = [];
  for (const c of CASES) {
    const r = await runAgent(
      { patientId: c.patient ?? "pat_rahul", language: c.lang, text: c.text, history: c.history ?? [], transcript: c.transcript ? (c.history ?? []) : [] },
      { scope: { kind: "all" }, route: bedrockRoute },
    );
    times.push(r.routeMs);
    if (r.router !== "model") unanswered++;
    // Turns in a conversation are seconds apart; firing them back to back measures the quota, not the model.
    await new Promise((ok) => setTimeout(ok, Number(process.env.EVAL_PAUSE_MS ?? 1500)));
    const chose = r.steps.filter((s) => s.by === "model").map((s) => s.tool);
    const all = r.steps.map((s) => s.tool);
    const right = (tools: string[]) => (c.ok.length === 0 ? tools.length === 0 : tools.some((t) => c.ok.includes(t)));
    if (right(chose)) routed++;
    else misses.push(`"${c.text}" -> [${chose.join(", ") || "no tool"}], want [${c.ok.join(" | ") || "no tool"}]`);
    if (right(all)) safe++;
  }
  times.sort((a, b) => a - b);
  console.log(`\n${model}`);
  console.log(`  routed by the model  ${routed}/${CASES.length}`);
  console.log(`  right after guard    ${safe}/${CASES.length}`);
  console.log(`  patterns stepped in  ${unanswered}/${CASES.length} (no model answer, or no tool for more than small talk)`);
  console.log(`  routing latency      median ${times[Math.floor(times.length / 2)]} ms, max ${times[times.length - 1]} ms`);
  for (const m of misses) console.log(`  miss: ${m}`);
}

