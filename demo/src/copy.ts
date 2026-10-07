/** The five beats of the flight. Order is the story: a home, its memory, the doctor, the worst case, then you. */
export interface Beat {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  body: string;
  tags?: string[];
}

export const BEATS: Beat[] = [
  {
    id: "home",
    label: "Home",
    eyebrow: "Sultanpur, Barabanki. 9:40 pm.",
    title: "The clinic is four hours away. The Echo is on the shelf.",
    body: "Rahul has no laptop and no patience for apps. He says what hurts, in his own words, to the thing that already plays his music. Nirog for Alexa+ turns that into a clinical intake.",
    tags: ["Voice only", "No app", "Hindi or English"],
  },
  {
    id: "memory",
    label: "Memory",
    eyebrow: "What he said, three ways",
    title: "Nobody describes the same ache the same way twice.",
    body: "In July it was \"my lower back has been aching\". In August, \"this pain when I stand up from my desk\". Tonight, \"the ache is back again\". No shared words. The memory layer links them at cosine distance 0.292 and names the region the last sentence never did.",
    tags: ["Titan embeddings", "pgvector", "No model decides the flag"],
  },
  {
    id: "doctor",
    label: "Doctor",
    eyebrow: "Handover",
    title: "The doctor opens a history, not a stranger.",
    body: "Three visits about the lower back in 38 days is a fixed arithmetic rule, checkable on paper. ARIA asks two questions, then files a plain-language summary into the on-call queue with the recurrence flag on top.",
    tags: ["3 visits / 90 days", "SBAR handover", "GPT-OSS on Bedrock"],
  },
  {
    id: "emergency",
    label: "Emergency",
    eyebrow: "Red flag",
    title: "\"And I have chest pain.\" Nothing waits for a model.",
    body: "Fifteen rules, negation-aware, condition-aware. Chest pain with sweating speaks the 108 ambulance advice in the same breath, queues an emergency consult, and alerts the family contact. A model can raise the level. It can never lower it.",
    tags: ["Rules, not weights", "108", "Caregiver alert"],
  },
  {
    id: "try",
    label: "Try it",
    eyebrow: "Live, against the real MCP server",
    title: "Talk to it.",
    body: "Hold the ring and speak, or type. Every reply you hear is a tool result from nirog-mcp over Streamable HTTP. The trace on the right is what the agent saw.",
    tags: ["MCP", "Streamable HTTP", "Consent-scoped"],
  },
];

/** Rahul's seeded history, shown in the memory field. Distances are the real offline-embedder values. */
export const MEMORY_CARDS = [
  { when: "11 Jul", text: "my lower back has been aching for a few days, worse in the mornings", region: "Lower back", distance: 0.292 },
  { when: "22 Jul", text: "blocked nose and a bit of a cough, think I caught something", region: "Chest", distance: null },
  { when: "2 Aug", text: "I keep getting this pain when I stand up from my desk", region: "Lower back", distance: 0.506 },
  { when: "Tonight", text: "the ache is back again, it's been three weeks now", region: "inherited: Lower back", distance: 0 },
];
