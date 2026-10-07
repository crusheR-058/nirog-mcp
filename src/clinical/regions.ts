/**
 * Body-region classification, by lexicon.
 *
 * This is deliberately not a model. The recurrence rule downstream counts
 * complaints per region, so if this step were probabilistic the flag would
 * inherit that uncertainty and stop being checkable by hand. A doctor asking
 * "why did you group these three?" deserves an answer that is a list of matched
 * words, not a similarity score.
 *
 * The embedding layer handles the hard semantic work of *finding* related
 * complaints. This only has to decide which bucket a complaint counts toward,
 * and buckets should be boring.
 */

export const REGIONS = [
  "lower_back",
  "upper_back",
  "head",
  "neck",
  "chest",
  "abdomen",
  "pelvis",
  "arm",
  "leg",
  "skin",
  "systemic",
  "unknown",
] as const;

export type Region = (typeof REGIONS)[number];

export const REGION_LABELS: Record<Region, string> = {
  lower_back: "Lower back",
  upper_back: "Upper back",
  head: "Head",
  neck: "Neck",
  chest: "Chest",
  abdomen: "Abdomen",
  pelvis: "Pelvis",
  arm: "Arm",
  leg: "Leg",
  skin: "Skin",
  systemic: "Systemic",
  unknown: "Unclassified",
};

/**
 * Ordered most-specific first. "lower back" must be tested before "back",
 * otherwise every lumbar complaint lands in the generic bucket and the whole
 * recurrence count is wrong.
 */
const LEXICON: ReadonlyArray<{ region: Region; terms: readonly string[] }> = [
  {
    region: "lower_back",
    terms: [
      "lower back", "low back", "lumbar", "small of my back", "small of the back",
      "base of my spine", "base of the spine", "lower spine", "sacroiliac",
      "kamar", // Hindi/Urdu — patients code-switch mid-sentence and the chart should not lose it
      "pain when i stand", "pain when standing", "ache when i stand",
      "hurts when i stand up", "sore when i get up",
    ],
  },
  {
    region: "upper_back",
    terms: [
      "upper back", "shoulder blade", "shoulder blades", "between my shoulders",
      "thoracic", "mid back", "middle of my back",
    ],
  },
  {
    region: "neck",
    terms: ["neck", "nape", "cervical", "stiff neck", "crick in my neck"],
  },
  {
    region: "head",
    terms: [
      "head", "headache", "migraine", "temple", "temples", "forehead",
      "behind my eyes", "sinus", "skull", "dizzy", "dizziness", "lightheaded",
      "sar dard", // Hindi
    ],
  },
  {
    region: "chest",
    terms: [
      "chest", "heart", "palpitation", "palpitations", "breathless",
      "short of breath", "shortness of breath", "wheeze", "wheezing",
      "cough", "coughing", "lungs", "ribs", "sternum",
    ],
  },
  {
    region: "abdomen",
    terms: [
      "stomach", "abdomen", "abdominal", "belly", "tummy", "gut",
      "nausea", "nauseous", "vomit", "vomiting", "diarrhoea", "diarrhea",
      "constipated", "constipation", "bloated", "bloating", "indigestion",
      "acidity", "heartburn", "pet dard", // Hindi
    ],
  },
  {
    region: "pelvis",
    terms: [
      "pelvis", "pelvic", "groin", "bladder", "urinating", "urination",
      "period", "periods", "menstrual", "cramps", "uterus", "ovary", "ovarian",
    ],
  },
  {
    region: "arm",
    terms: [
      "arm", "arms", "elbow", "wrist", "hand", "hands", "finger", "fingers",
      "shoulder", "forearm", "thumb",
    ],
  },
  {
    region: "leg",
    terms: [
      "leg", "legs", "knee", "knees", "ankle", "foot", "feet", "toe", "toes",
      "thigh", "calf", "calves", "shin", "hip", "hips", "sciatica",
      "down my leg", "into my leg",
    ],
  },
  {
    region: "skin",
    terms: [
      "rash", "itch", "itchy", "itching", "hives", "eczema", "acne", "spot",
      "spots", "skin", "boil", "blister", "mole",
    ],
  },
  {
    region: "systemic",
    terms: [
      "fever", "tired", "tiredness", "fatigue", "exhausted", "weak", "weakness",
      "weight loss", "losing weight", "night sweats", "chills", "appetite",
      "sleep", "sleeping", "insomnia", "bukhar", // Hindi
    ],
  },
  // Generic back terms last — anything that reached here didn't match a specific
  // back region above.
  {
    region: "lower_back",
    terms: ["back pain", "backache", "back ache", "my back", "the back", "back is"],
  },
];

/**
 * Phrases that mean the patient is *denying* a symptom. "no chest pain" must not
 * count as a chest complaint, or a thorough negative history would light up the
 * chart like a Christmas tree.
 */
const NEGATIONS = [
  "no ", "not ", "never ", "without ", "denies ", "denied ",
  "free of ", "clear of ", "ruled out ", "nothing in my ", "no more ",
];

const NEGATION_WINDOW = 24; // characters before the match

function isNegated(haystack: string, matchIndex: number): boolean {
  const start = Math.max(0, matchIndex - NEGATION_WINDOW);
  const before = haystack.slice(start, matchIndex);
  return NEGATIONS.some((n) => before.includes(n));
}

export interface Classification {
  region: Region;
  /** The lexicon terms that fired. Shown in the UI so the grouping is inspectable. */
  matchedTerms: string[];
}

/**
 * Find every whole-word occurrence of `term` in the padded haystack.
 *
 * Whole-word matters more than it looks. Substring matching puts "itchy rash on
 * my forearm" in the *arm* bucket, because "arm" appears inside "forearm" — and
 * a rash is a skin complaint wherever it happens to be. Requiring a word
 * boundary is what keeps a location word from hijacking a symptom word.
 */
function findWholeWord(hay: string, term: string): number[] {
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const idx = hay.indexOf(term, from);
    if (idx === -1) return out;
    const before = hay[idx - 1];
    const after = hay[idx + term.length];
    if (before === " " && after === " ") out.push(idx);
    from = idx + 1;
  }
}

/**
 * Classify a complaint into exactly one body region.
 *
 * Exactly one, not many: the recurrence rule counts per region, and letting one
 * complaint count toward three regions would let a single verbose sentence
 * manufacture a recurrence on its own.
 */
export function classify(text: string): Classification {
  const hay = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ")} `;

  let best: { region: Region; terms: string[]; score: number } | null = null;

  for (const { region, terms } of LEXICON) {
    const hits: string[] = [];
    for (const term of terms) {
      const positions = findWholeWord(hay, term);
      if (!positions.length) continue;
      // A term counts only if at least one occurrence is not negated.
      if (positions.every((idx) => isNegated(hay, idx))) continue;
      hits.push(term);
    }
    if (!hits.length) continue;

    // Two signals, in order of importance.
    //
    // How many distinct terms fired: "itchy rash" is two pieces of dermatological
    // evidence, "forearm" is one piece of locational evidence, and two beats one.
    //
    // Then how long the longest was: "lower back" beating "back" is the whole
    // reason the lexicon is ordered specific-first.
    const score = hits.length * 1000 + Math.max(...hits.map((h) => h.length));
    if (!best || score > best.score) best = { region, terms: hits, score };
  }

  if (!best) return { region: "unknown", matchedTerms: [] };
  return { region: best.region, matchedTerms: best.terms.sort() };
}
