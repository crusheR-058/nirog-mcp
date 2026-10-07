/**
 * Red-flag triage. A table of rules, not a model.
 *
 * This is the one place the system decides that a patient needs a doctor now,
 * so it has to be checkable by hand: each rule is a pattern, a level, and the
 * advice to speak. The model's own red-flag opinion (aria.redFlag) is advisory
 * and can only ever raise the level to "urgent", never lower it.
 */

export type TriageLevel = "emergency" | "urgent" | "routine";

export interface TriageRule {
  id: string;
  level: Exclude<TriageLevel, "routine">;
  label: string;
  /** Every pattern must match (AND). Each pattern is a regex over the lowercased text. */
  all: RegExp[];
  /** Applies only when the patient has one of these conditions (case-insensitive substring). */
  requiresCondition?: string[];
  advice: string;
}

const EMERGENCY_ADVICE = "This could be serious. Please call 108 for an ambulance or go to the nearest hospital right now.";

export const TRIAGE_RULES: TriageRule[] = [
  { id: "chest_pain_acs", level: "emergency", label: "Chest pain with sweating, breathlessness, or arm or jaw pain",
    all: [/chest (pain|tight|press|heav)/, /(sweat|breath|arm|jaw|nause)/], advice: EMERGENCY_ADVICE },
  { id: "stroke", level: "emergency", label: "Possible stroke",
    all: [/(face|mouth) (droop|hanging|crooked)|slurred|can.?t speak|one side (weak|numb)|(arm|leg) (suddenly )?(weak|numb)|sudden (confusion|weakness)/], advice: EMERGENCY_ADVICE },
  { id: "breathing", level: "emergency", label: "Severe difficulty breathing",
    all: [/(can.?t|cannot|hard to|struggling to|difficult(y)? (to )?) breath|gasping|lips (are )?(blue|turning blue)/], advice: EMERGENCY_ADVICE },
  { id: "asthma_attack", level: "emergency", label: "Breathlessness in a patient with asthma",
    all: [/(breathless|short of breath|wheez|inhaler (not|isn.?t) (working|helping))/], requiresCondition: ["asthma"], advice: EMERGENCY_ADVICE },
  { id: "unconscious", level: "emergency", label: "Loss of consciousness or seizure",
    all: [/(unconscious|passed out|fainted|collapsed|fit|seizure|convuls|not waking|won.?t wake)/], advice: EMERGENCY_ADVICE },
  { id: "bleeding", level: "emergency", label: "Severe or uncontrolled bleeding",
    all: [/(bleeding (a lot|heavily|won.?t stop|that won.?t stop)|vomit(ing)? blood|coughing (up )?blood|blood in (my )?(vomit|stool)|black (tarry )?stool)/], advice: EMERGENCY_ADVICE },
  { id: "anaphylaxis", level: "emergency", label: "Possible severe allergic reaction",
    all: [/(lips|tongue|throat|face) (is |are )?(swell|swollen)|throat (closing|tight)/], advice: EMERGENCY_ADVICE },
  { id: "self_harm", level: "emergency", label: "Thoughts of self-harm",
    all: [/(kill myself|end my life|suicid|want to die|hurt myself)/],
    advice: "I am really glad you told me. You are not alone. Please call the Tele-MANAS helpline on 14416 now, it is free and open all day. I am also alerting your doctor." },
  { id: "infant_fever", level: "emergency", label: "Fever in a very young infant",
    all: [/(baby|infant|newborn)/, /(fever|hot|temperature)/, /(week|month)s? old/], advice: EMERGENCY_ADVICE },
  { id: "pregnancy_bleeding", level: "emergency", label: "Bleeding in pregnancy",
    all: [/pregnan/, /bleed/], advice: EMERGENCY_ADVICE },
  { id: "diabetic_confusion", level: "emergency", label: "Confusion or drowsiness in a patient with diabetes",
    all: [/(confus|drowsy|very sleepy|not making sense|shaking and sweat)/], requiresCondition: ["diabetes"], advice: EMERGENCY_ADVICE },
  { id: "high_fever_days", level: "urgent", label: "Fever lasting several days",
    all: [/fever/, /(three|3|four|4|five|5|six|6|seven|7|\d+) days|a week|weeks/],
    advice: "A fever that lasts this long needs a doctor today. I am booking you an urgent consultation." },
  { id: "severe_pain", level: "urgent", label: "Severe pain",
    all: [/(unbearable|worst pain|severe pain|can.?t (stand|bear|move)|(9|10) out of (10|ten))/],
    advice: "That sounds like a lot of pain. I am booking you an urgent consultation with the doctor." },
  { id: "dehydration", level: "urgent", label: "Persistent vomiting or diarrhoea",
    all: [/(vomit|diarrh|loose motion)/, /(all day|can.?t keep|keep(s)? coming|many times|(\d+|several) times)/],
    advice: "Keep taking small sips of ORS or clean water. I am booking you an urgent consultation with the doctor." },
  { id: "urine_blood", level: "urgent", label: "Blood in urine",
    all: [/blood in (my |the )?urine|urine (is )?(red|pink|bloody)/],
    advice: "That needs checking today. I am booking you an urgent consultation with the doctor." },
];

const NEGATIONS = ["no ", "not ", "never ", "without ", "denies ", "don't have ", "do not have ", "haven't ", "isn't ", "not any "];

/** Is the match preceded within 20 characters by a negation? ("no chest pain" must not fire.) */
function negated(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 20), index);
  return NEGATIONS.some((n) => before.includes(n));
}

export interface TriageResult {
  level: TriageLevel;
  matched: Array<{ id: string; label: string; level: TriageLevel; advice: string }>;
  /** Advice for the highest-level matched rule, or null when routine. */
  advice: string | null;
}

export function triage(text: string, patientConditions: string[] = []): TriageResult {
  const t = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const conditions = patientConditions.map((c) => c.toLowerCase());
  const matched: TriageResult["matched"] = [];

  for (const rule of TRIAGE_RULES) {
    if (rule.requiresCondition && !rule.requiresCondition.some((rc) => conditions.some((c) => c.includes(rc)))) continue;
    const hits = rule.all.map((re) => {
      const m = re.exec(t);
      return m && !negated(t, m.index) ? m : null;
    });
    if (hits.every(Boolean)) matched.push({ id: rule.id, label: rule.label, level: rule.level, advice: rule.advice });
  }

  const order: TriageLevel[] = ["emergency", "urgent", "routine"];
  matched.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  const top = matched[0];
  return { level: top?.level ?? "routine", matched, advice: top?.advice ?? null };
}
