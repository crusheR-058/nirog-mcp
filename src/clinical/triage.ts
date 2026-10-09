/**
 * Red-flag triage. A table of rules, not a model.
 *
 * This is the one place the system decides that a patient needs a doctor now,
 * so it has to be checkable by hand: each rule is a pattern, a level, and the
 * advice to speak. The model's own red-flag opinion (aria.redFlag) is advisory
 * and can only ever raise the level to "urgent", never lower it.
 *
 * Rules match English, Hindi in Devanagari, and common romanised Hindi. Hindi
 * patterns are written in the folded spelling from ./normalize.ts.
 */

import { EMERGENCY_ADVICE, SELF_HARM_ADVICE, URGENT_ADVICE, type Lang } from "../i18n.js";
import { normalize } from "./normalize.js";

export type TriageLevel = "emergency" | "urgent" | "routine";

export interface TriageRule {
  id: string;
  level: Exclude<TriageLevel, "routine">;
  label: string;
  /** Every pattern must match (AND). Each pattern is a regex over the normalised text. */
  all: RegExp[];
  /** Applies only when the patient has one of these conditions (case-insensitive substring). */
  requiresCondition?: string[];
  /** Rule-specific advice. Falls back to the level's generic advice in that language. */
  advice?: Partial<Record<Lang, string>>;
}

export const TRIAGE_RULES: TriageRule[] = [
  {
    id: "chest_pain_acs", level: "emergency", label: "Chest pain with sweating, breathlessness, or arm or jaw pain",
    all: [
      /chest (pain|tight|press|heav)|(सीने|सीना|छाती) में (दर्द|जकडन|भारीपन|दबाव)|(seene|seena|chhati|chati) (me|mein|main) (dard|jakdan)/,
      /(sweat|breath|arm|jaw|nause)|पसीना|पसीने|सांस|बांह|जबड|उल्टी|घबराहट|paseena|pasina|saans/,
    ],
  },
  {
    id: "stroke", level: "emergency", label: "Possible stroke",
    all: [/(face|mouth) (droop|hanging|crooked)|slurred|can.?t speak|one side (weak|numb)|(arm|leg) (suddenly )?(weak|numb)|sudden (confusion|weakness)|(मुंह|चेहरा) टेढा|जबान लडखडा|आधा शरीर सुन्न|बोल नहीं पा/],
  },
  {
    id: "breathing", level: "emergency", label: "Severe difficulty breathing",
    all: [/(can.?t|cannot|hard to|struggling to|difficult(y)? (to )?) breath|gasping|lips (are )?(blue|turning blue)|सांस (नहीं|नही) (ले|आ)|सांस लेने में (बहुत )?(तकलीफ|दिक्कत|परेशानी)|दम घुट|saans (nahi|nahin) (le|aa)|saans lene (me|mein) (bahut )?(takleef|taklif|dikkat)/],
  },
  {
    id: "asthma_attack", level: "emergency", label: "Breathlessness in a patient with asthma",
    all: [/(breathless|short of breath|wheez|inhaler (not|isn.?t) (working|helping))|सांस फूल|इनहेलर (काम नहीं|से आराम नहीं)|saans phool/],
    requiresCondition: ["asthma"],
  },
  {
    id: "unconscious", level: "emergency", label: "Loss of consciousness or seizure",
    all: [/(unconscious|passed out|fainted|collapsed|\bfits?\b|seizure|convuls|not waking|won.?t wake)|बेहोश|दौरा|दौरे|behosh/],
  },
  {
    id: "bleeding", level: "emergency", label: "Severe or uncontrolled bleeding",
    all: [/(bleeding (a lot|heavily|won.?t stop|that won.?t stop)|vomit(ing)? blood|coughing (up )?blood|blood in (my )?(vomit|stool)|black (tarry )?stool)|खून की उल्टी|खून (बंद|रुक) नहीं|बहुत खून|khoon ki ulti/],
  },
  {
    id: "anaphylaxis", level: "emergency", label: "Possible severe allergic reaction",
    all: [/(lips|tongue|throat|face) (is |are )?(swell|swollen)|throat (closing|tight)|(होंठ|जीभ|गला|चेहरा) (सूज|सूजन)|गला बंद/],
  },
  {
    id: "self_harm", level: "emergency", label: "Thoughts of self-harm",
    all: [/(kill myself|end my life|suicid|want to die|hurt myself)|मरना चाहत|जान दे (दूं|दूंगा|दूंगी)|आत्महत्या|खुदकुशी|जीना नहीं चाहत|marna chaht|jaan de d/],
    advice: SELF_HARM_ADVICE,
  },
  {
    id: "infant_fever", level: "emergency", label: "Fever in a very young infant",
    all: [/(baby|infant|newborn|बच्चा|बच्ची|बच्चे|शिशु)/, /(fever|hot|temperature|बुखार)/, /(week|month)s? old|(\d+|एक|दो|तीन) (हफ्ते|महीने) (का|की|के)/],
  },
  {
    id: "pregnancy_bleeding", level: "emergency", label: "Bleeding in pregnancy",
    all: [/pregnan|गर्भवती|गर्भ|पेट से/, /bleed|खून/],
  },
  {
    id: "diabetic_confusion", level: "emergency", label: "Confusion or drowsiness in a patient with diabetes",
    all: [/(confus|drowsy|very sleepy|not making sense|shaking and sweat)|बेसुध|बहुत नींद|बात समझ नहीं/],
    requiresCondition: ["diabetes"],
  },
  {
    id: "high_fever_days", level: "urgent", label: "Fever lasting several days",
    all: [/fever|बुखार|bukhaa?r/, /(three|3|four|4|five|5|six|6|seven|7|\d+) days|a week|weeks|(\d+|तीन|चार|पांच|छह|सात) दिन|हफ्ते|(\d+|teen|chaa?r|paanch) din/],
    advice: { en: "A fever that lasts this long needs a doctor today. I am booking you an urgent consultation." },
  },
  {
    id: "severe_pain", level: "urgent", label: "Severe pain",
    all: [/(unbearable|worst pain|severe pain|can.?t (stand|bear|move)|(9|10) out of (10|ten))|बर्दाश्त नहीं|बहुत तेज दर्द|असहनीय/],
    advice: { en: "That sounds like a lot of pain. I am booking you an urgent consultation with the doctor." },
  },
  {
    id: "dehydration", level: "urgent", label: "Persistent vomiting or diarrhoea",
    all: [/(vomit|diarrh|loose motion|उल्टी|दस्त)/, /(all day|can.?t keep|keep(s)? coming|many times|(\d+|several) times|बार-बार|बार बार|कई बार|\d+ बार|रुक नहीं)/],
    advice: {
      en: "Keep taking small sips of ORS or clean water. I am booking you an urgent consultation with the doctor.",
      hi: "थोड़ा-थोड़ा ओआरएस या साफ़ पानी पीते रहिए। मैं आपके लिए डॉक्टर से तुरंत बात का समय ले रही हूँ।",
    },
  },
  {
    id: "urine_blood", level: "urgent", label: "Blood in urine",
    all: [/blood in (my |the )?urine|urine (is )?(red|pink|bloody)|पेशाब में खून/],
    advice: { en: "That needs checking today. I am booking you an urgent consultation with the doctor." },
  },
];

const NEGATIONS = ["no ", "not ", "never ", "without ", "denies ", "don't have ", "do not have ", "haven't ", "isn't ", "not any "];
/** Hindi negates after the noun: "सीने में दर्द नहीं है". Only the plain "is not" form counts, so "पसीना नहीं रुक रहा" (sweating won't stop) still matches. */
const NEGATED_AFTER = /^\s*(बिल्कुल\s+|bilkul\s+)?(नहीं|नही|nahi|nahin)\s+(है|हैं|hai|hain|हो रहा|हो रही|ho raha|ho rahi)/;

/** Is the match negated? English negates before ("no chest pain"), Hindi after ("दर्द नहीं है"). */
function negated(text: string, index: number, length: number): boolean {
  const before = text.slice(Math.max(0, index - 20), index);
  if (NEGATIONS.some((n) => before.includes(n))) return true;
  return NEGATED_AFTER.test(text.slice(index + length));
}

export interface TriageResult {
  level: TriageLevel;
  matched: Array<{ id: string; label: string; level: TriageLevel; advice: string }>;
  /** Advice for the highest-level matched rule, or null when routine. */
  advice: string | null;
}

export function triage(text: string, patientConditions: string[] = [], lang: Lang = "en"): TriageResult {
  const t = ` ${normalize(text)} `;
  const conditions = patientConditions.map((c) => c.toLowerCase());
  const matched: TriageResult["matched"] = [];

  for (const rule of TRIAGE_RULES) {
    if (rule.requiresCondition && !rule.requiresCondition.some((rc) => conditions.some((c) => c.includes(rc)))) continue;
    const hits = rule.all.map((re) => {
      const m = re.exec(t);
      return m && !negated(t, m.index, m[0].length) ? m : null;
    });
    if (!hits.every(Boolean)) continue;
    const generic = rule.level === "emergency" ? EMERGENCY_ADVICE[lang] : URGENT_ADVICE[lang];
    matched.push({ id: rule.id, label: rule.label, level: rule.level, advice: rule.advice?.[lang] ?? generic });
  }

  const order: TriageLevel[] = ["emergency", "urgent", "routine"];
  matched.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  const top = matched[0];
  return { level: top?.level ?? "routine", matched, advice: top?.advice ?? null };
}
