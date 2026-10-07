/** Rahul's seeded history. Distances are the real offline-embedder values from the server. */
export const MEMORY_CARDS = [
  { id: "jul", when: "11 Jul", text: "my lower back has been aching for a few days, worse in the mornings", region: "Lower back", distance: 0.292, visit: 1 },
  { id: "jul2", when: "22 Jul", text: "blocked nose and a bit of a cough, think I caught something", region: "Chest", distance: null, visit: 2 },
  { id: "aug", when: "2 Aug", text: "I keep getting this pain when I stand up from my desk", region: "Lower back", distance: 0.506, visit: 3 },
  { id: "now", when: "Tonight", text: "the ache is back again, it's been three weeks now", region: "Lower back", distance: 0, visit: 4, inherited: true },
];

export const SECTIONS = [
  { id: "hero", label: "Voice" },
  { id: "deck", label: "Deck" },
  { id: "memory", label: "Memory" },
  { id: "handover", label: "Handover" },
  { id: "redflag", label: "Red flag" },
  { id: "talk", label: "Talk" },
] as const;

export const SUGGESTIONS = [
  { label: "the ache is back again", say: "the ache is back again, it's been three weeks now" },
  { label: "medicines tonight?", say: "what medicines do I take tonight" },
  { label: "chest pain, sweating", say: "I have chest pain and I'm sweating" },
];
