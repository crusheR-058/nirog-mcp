/** Rahul's seeded history. Distances are the real offline-embedder values from the server. */
export const MEMORY_CARDS = [
  { id: "jul", when: "11 Jul", text: "my lower back has been aching for a few days, worse in the mornings", region: "Lower back", distance: 0.292, visit: 1 },
  { id: "jul2", when: "22 Jul", text: "blocked nose and a bit of a cough, think I caught something", region: "Chest", distance: null, visit: 2 },
  { id: "aug", when: "2 Aug", text: "I keep getting this pain when I stand up from my desk", region: "Lower back", distance: 0.506, visit: 3 },
  { id: "now", when: "Tonight", text: "the ache is back again, it's been three weeks now", region: "Lower back", distance: 0, visit: 4, inherited: true },
];

export const SECTIONS = [
  { id: "hero", label: "Voice" },
  { id: "journey", label: "Care loop" },
  { id: "deck", label: "Deck" },
  { id: "memory", label: "Memory" },
  { id: "case", label: "Case file" },
  { id: "doctors", label: "Doctors" },
  { id: "handover", label: "Handover" },
  { id: "redflag", label: "Red flag" },
  { id: "portal", label: "Portal" },
  { id: "talk", label: "Talk" },
] as const;

export type Language = "en" | "hi";

export interface Suggestion {
  label: string;
  say: string;
}

/** The three chips in the voice bar. */
export const SUGGESTIONS: Record<Language, Suggestion[]> = {
  en: [
    { label: "the ache is back again", say: "the ache is back again, it's been three weeks now" },
    { label: "medicines tonight?", say: "what medicines do I take tonight" },
    { label: "chest pain, sweating", say: "I have chest pain and I'm sweating" },
  ],
  hi: [
    { label: "कमर में फिर दर्द", say: "कमर में फिर से दर्द हो रहा है, तीन हफ़्ते हो गए" },
    { label: "आज कौन सी दवा?", say: "आज रात कौन सी दवा लेनी है" },
    { label: "सीने में दर्द, पसीना", say: "सीने में दर्द है और पसीना आ रहा है" },
  ],
};

/** Everything worth trying, shown in the Talk section. Each one reaches a different tool. */
export const TRIES: Record<Language, Array<Suggestion & { tool: string }>> = {
  en: [
    { tool: "start_intake", label: "Describe a symptom", say: "the ache is back again, it's been three weeks now" },
    { tool: "get_care_plan", label: "Ask about medicines", say: "what medicines do I take tonight" },
    { tool: "log_dose_taken", label: "Say you took a dose", say: "I took my BP tablet" },
    { tool: "get_family_summary", label: "Ask how the week went", say: "how has Papa been this week" },
    { tool: "report_red_flag", label: "Say something serious", say: "I have chest pain and I'm sweating" },
  ],
  hi: [
    { tool: "start_intake", label: "तकलीफ़ बताइए", say: "कमर में फिर से दर्द हो रहा है, तीन हफ़्ते हो गए" },
    { tool: "get_care_plan", label: "दवा के बारे में पूछिए", say: "आज रात कौन सी दवा लेनी है" },
    { tool: "log_dose_taken", label: "दवा ले ली, बताइए", say: "मैंने दवा ले ली" },
    { tool: "get_family_summary", label: "हफ़्ते का हाल पूछिए", say: "इस हफ़्ते पापा कैसे हैं" },
    { tool: "report_red_flag", label: "कुछ गंभीर बताइए", say: "सीने में दर्द है और पसीना आ रहा है" },
  ],
};
